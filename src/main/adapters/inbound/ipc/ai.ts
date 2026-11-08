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
import { logError, readStore, updateStore } from '../../outbound/store'

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

  ipcMain.handle('ai:ask', async (e, req: AiAskRequest) => {
    let rawKey = ''
    aiAbort?.abort()
    const controller = new AbortController()
    aiAbort = controller
    try {
      const question = (req?.question ?? '').trim()
      if (!question) return { ok: false, error: 'Câu hỏi không được để trống.' }

      const store = await readStore()
      const provider = normalizeProvider(req.provider ?? store['aiProvider'])
      rawKey = decryptApiKey(store[keyField(provider)], safeStorage)
      const model = normalizeAiModel(provider, req.model ?? store[modelField(provider)])

      const { docs, skippedFiles } = await collectRagDocuments(req, loadRagDocumentCached)
      if (docs.length === 0) {
        return { ok: false, error: 'Chưa có file Markdown nào để tra cứu. Hãy mở thư mục hoặc chọn file Markdown trước.' }
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
        history: Array.isArray(req.history) ? req.history : [],
        availableCitations: ragCtx.citations,
        signal: controller.signal,
        // Đẩy từng đoạn câu trả lời về renderer để hiện dần trong lúc model còn đang viết
        onDelta: (text) => {
          if (!e.sender.isDestroyed()) e.sender.send('ai:delta', text)
        },
      })

      const note =
        skippedFiles > 0
          ? `\n\n*(Lưu ý: mỗi câu hỏi chỉ đọc tối đa ${RAG_MAX_FILES} file của thư mục và ${RAG_MAX_LOOSE} file mở lẻ; ${skippedFiles} file vượt giới hạn chưa được đọc. Hãy mở thư mục con hoặc chọn "Chỉ file đang xem" để hỏi về các file đó.)*`
          : ''
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
