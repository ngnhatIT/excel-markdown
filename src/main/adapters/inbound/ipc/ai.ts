/* IPC trợ lý AI (ai:*): cấu hình nhà cung cấp/model/API Key, hỏi đáp RAG có stream, hủy. */
import { ipcMain, safeStorage } from 'electron'
import type { AiAskRequest, AiAskResponse, AiProvider, AiSetConfigPayload } from '../../../../shared/types'
import { collectRagDocuments, RAG_MAX_FILES, RAG_MAX_LOOSE } from '../../../domain/rag/collect'
import { buildRagContext } from '../../../domain/rag/retriever'
import {
  aiConfigInfo,
  decryptApiKey,
  encryptApiKey,
  keyField,
  modelField,
  normalizeAiModel,
  normalizeContextTokens,
  normalizeProvider,
} from '../../outbound/llm/aiConfig'
import { askLlm, listModels } from '../../outbound/llm/askLlm'
import { redactApiKey } from '../../outbound/llm/shared'
import { loadRagDocumentCached } from '../../outbound/ragDocCache'
import { errText } from '../../../domain/errors'
import { isTranslateLang, MAX_TRANSLATE_CHARS, MAX_PROMPT_TERMS, translatePrompt } from '../../../../shared/translate'
import { termsIn } from '../../../../shared/glossary'
import { projectGlossary } from '../../../domain/rag/glossary'
import { logError, readStore, updateStore } from '../../outbound/store'
import { mt } from '../../../i18nMain'

const MAX_QUESTION_CHARS = 20_000
const MAX_HISTORY_TURNS = 50
const MAX_TURN_CHARS = 50_000

/** Kiểm câu hỏi + lịch sử từ renderer (không tin cậy); trả mã lỗi hoặc null nếu hợp lệ. */
export function aiAskError(req: unknown): string | null {
  const r = req as Partial<AiAskRequest> | null
  if (!r || typeof r !== 'object' || typeof r.question !== 'string' || r.question.length > MAX_QUESTION_CHARS) return 'E_BAD_REQUEST'
  if (r.question.trim() === '') return 'E_AI_EMPTY_QUESTION'
  const h: unknown = r.history
  if (h === undefined) return null
  const turnOk = (t: unknown): boolean => {
    const x = t as { role?: unknown; text?: unknown } | null
    return !!x && (x.role === 'user' || x.role === 'model') && typeof x.text === 'string' && x.text.length <= MAX_TURN_CHARS
  }
  return Array.isArray(h) && h.length <= MAX_HISTORY_TURNS && h.every(turnOk) ? null : 'E_BAD_REQUEST'
}

export function registerAiIpc(): void {
  let aiAbort: AbortController | null = null

  ipcMain.handle('ai:listModels', async (_e, providerArg?: AiProvider) => {
    let rawKey = ''
    try {
      const store = await readStore()
      const provider = normalizeProvider(providerArg ?? store['aiProvider'])
      rawKey = decryptApiKey(store[keyField(provider)], safeStorage)
      return { ok: true, data: await listModels(provider, rawKey) }
    } catch (err) {
      return { ok: false, error: redactApiKey(errText(err), rawKey) }
    }
  })

  ipcMain.handle('ai:getConfig', async () => {
    try {
      return { ok: true, data: aiConfigInfo(await readStore(), safeStorage) }
    } catch (err) {
      return { ok: false, error: errText(err) }
    }
  })

  ipcMain.handle('ai:setConfig', async (_e, payload: AiSetConfigPayload) => {
    try {
      await updateStore((store) => {
        if (payload?.provider !== undefined) store['aiProvider'] = normalizeProvider(payload.provider)
        const provider = normalizeProvider(store['aiProvider'])
        if (typeof payload?.apiKey === 'string') store[keyField(provider)] = encryptApiKey(payload.apiKey, safeStorage)
        if (payload?.model) store[modelField(provider)] = normalizeAiModel(provider, payload.model)
        if (payload?.contextTokens !== undefined) store['aiContextTokens'] = normalizeContextTokens(payload.contextTokens)
      })
      return { ok: true, data: aiConfigInfo(await readStore(), safeStorage) }
    } catch (err) {
      return { ok: false, error: errText(err) }
    }
  })

  ipcMain.handle('ai:cancel', () => {
    aiAbort?.abort()
    aiAbort = null
    return { ok: true, data: null }
  })

  /* Dịch nhanh đoạn bôi đen: lệnh hủy riêng (không đụng câu hỏi đang chạy trong khung chat), cache theo
   * nhà cung cấp + model + đích + đoạn chữ để chọn lại cùng đoạn không tốn token. */
  let translateAbort: AbortController | null = null
  const translateCache = new Map<string, string>()
  ipcMain.handle('ai:translate', async (_e, text: unknown, target: unknown) => {
    let rawKey = ''
    // Kiểm đầu vào trước: yêu cầu sai không được hủy bản dịch hợp lệ đang chạy
    if (typeof text !== 'string' || text.trim() === '' || !isTranslateLang(target)) {
      return { ok: false, error: 'E_TR_INVALID' } // mã lỗi, renderer dịch
    }
    if (text.length > MAX_TRANSLATE_CHARS) return { ok: false, error: 'E_TR_TOO_LONG' }
    translateAbort?.abort()
    const controller = new AbortController()
    translateAbort = controller
    try {
      const store = await readStore()
      const provider = normalizeProvider(store['aiProvider'])
      rawKey = decryptApiKey(store[keyField(provider)], safeStorage)
      if (!rawKey) return { ok: false, error: 'NO_KEY' }
      const model = normalizeAiModel(provider, store[modelField(provider)])
      // 用語集 của thư mục đang mở ở Đọc Markdown (viewer.ts đặt khi mở thư mục); đổi 用語集 thì không dùng cache cũ
      const terms = termsIn(text, projectGlossary(), MAX_PROMPT_TERMS)
      const key = `${provider}|${model}|${target}|${JSON.stringify(terms)}|${text}`
      const hit = translateCache.get(key)
      if (hit !== undefined) return { ok: true, data: hit }
      const { system, question } = translatePrompt(text.trim(), target, terms)
      const res = await askLlm(provider, { apiKey: rawKey, model, question, contextText: '', history: [], availableCitations: [], signal: controller.signal, system })
      const out = res.answer.trim()
      if (translateCache.size >= 200) translateCache.delete(translateCache.keys().next().value as string)
      translateCache.set(key, out)
      return { ok: true, data: out }
    } catch (err) {
      const safeMsg = redactApiKey(errText(err), rawKey)
      if (!controller.signal.aborted) void logError('ai:translate', new Error(safeMsg))
      return { ok: false, error: safeMsg }
    } finally {
      if (translateAbort === controller) translateAbort = null
    }
  })

  ipcMain.handle('ai:ask', async (e, req: AiAskRequest) => {
    // Kiểm đầu vào trước: yêu cầu sai không được hủy câu hỏi đang chạy
    const bad = aiAskError(req)
    if (bad) return { ok: false, error: bad }
    let rawKey = ''
    aiAbort?.abort()
    const controller = new AbortController()
    aiAbort = controller
    try {
      const question = req.question.trim()

      const store = await readStore()
      const provider = normalizeProvider(req.provider ?? store['aiProvider'])
      rawKey = decryptApiKey(store[keyField(provider)], safeStorage)
      const model = normalizeAiModel(provider, req.model ?? store[modelField(provider)])

      const { docs, skippedFiles } = await collectRagDocuments(req, loadRagDocumentCached)
      if (docs.length === 0) {
        return { ok: false, error: 'E_AI_NO_DOCS' }
      }

      const ragCtx = buildRagContext(docs, question, {
        scope: req.scope,
        activeFilePath: req.activeFilePath ?? undefined,
        maxContextTokens: normalizeContextTokens(store['aiContextTokens']),
      })

      const apiRes = await askLlm(provider, {
        apiKey: rawKey,
        model,
        question,
        contextText: ragCtx.contextText,
        history: req.history ?? [],
        availableCitations: ragCtx.citations,
        signal: controller.signal,
        // Đẩy từng đoạn câu trả lời về renderer để hiện dần trong lúc model còn đang viết
        onDelta: (text) => {
          if (!e.sender.isDestroyed()) e.sender.send('ai:delta', text)
        },
      })

      const note =
        skippedFiles > 0 ? '\n\n' + mt('ai.skippedNote', { max: RAG_MAX_FILES, loose: RAG_MAX_LOOSE, n: skippedFiles }) : ''
      const out: AiAskResponse = {
        answer: apiRes.answer + note,
        citations: apiRes.citations,
        mode: ragCtx.mode,
        docCount: ragCtx.docCount,
        usage: apiRes.usage,
      }
      return { ok: true, data: out }
    } catch (err) {
      const safeMsg = redactApiKey(errText(err), rawKey)
      // Người dùng bấm Dừng (hoặc hỏi câu mới) không phải lỗi: không ghi log
      if (!controller.signal.aborted) void logError('ai:ask', new Error(safeMsg))
      return { ok: false, error: safeMsg }
    } finally {
      if (aiAbort === controller) aiAbort = null
    }
  })
}
