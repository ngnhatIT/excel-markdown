/* IPC trợ lý AI (ai:*): cấu hình nhà cung cấp/model/API Key, hỏi đáp RAG có stream, hủy. */
import { ipcMain, safeStorage } from 'electron'
import type { AiAskRequest, AiAskResponse, AiProvider, AiSetConfigPayload } from '../../../../shared/types'
import { collectRagDocuments, RAG_MAX_FILES, RAG_MAX_LOOSE } from '../../../domain/rag/collect'
import { buildRagContext, type SemanticScore } from '../../../domain/rag/retriever'
import type { RagSection } from '../../../domain/rag/chunker'
import { canEmbed, cosine, embedTexts, EMBED_MAX_TEXTS } from '../../outbound/llm/embeddings'
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
import { redactApiKey, USER_ABORT_MSG } from '../../outbound/llm/shared'
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

/** Mở rộng truy vấn: BM25 chỉ khớp chữ, nên câu hỏi diễn đạt khác tài liệu (đồng nghĩa, khác ngôn ngữ) dễ trượt file.
 * Nhờ chính model đang dùng đổi câu hỏi thành từ khóa Nhật / Việt / Anh trước khi chấm điểm; chỉ gửi câu hỏi, không gửi tài liệu. */
const SEARCH_TERMS_SYSTEM =
  'You turn a question about software design documents (基本設計 / 詳細設計, written mostly in Japanese, sometimes Vietnamese or English) into search keywords. ' +
  'Output ONE line only: up to 15 keywords or short phrases separated by spaces — the Japanese design-document terms, plus Vietnamese and English synonyms, ' +
  'and every ID / table / column name from the question verbatim. No explanation, no punctuation, no Markdown.'
const SEARCH_TERMS_TIMEOUT_MS = 15_000

/** Câu trả lời của model -> một dòng từ khóa: bỏ xuống dòng / ký tự Markdown, tối đa 400 ký tự. */
export const searchTermsLine = (answer: string): string => answer.replace(/[\r\n*`#>|,、;:]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400)

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
        if (payload?.embeddings !== undefined) store['aiEmbeddings'] = payload.embeddings === true
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
      if (hit !== undefined) return { ok: true, data: { text: hit, terms } }
      const { system, question } = translatePrompt(text.trim(), target, terms)
      const res = await askLlm(provider, { apiKey: rawKey, model, question, contextText: '', history: [], availableCitations: [], signal: controller.signal, system })
      const out = res.answer.trim()
      if (translateCache.size >= 200) translateCache.delete(translateCache.keys().next().value as string)
      translateCache.set(key, out)
      return { ok: true, data: { text: out, terms } }
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

      const build = (query: string, semantic?: SemanticScore): ReturnType<typeof buildRagContext> =>
        buildRagContext(docs, query, {
          scope: req.scope,
          activeFilePath: req.activeFilePath ?? undefined,
          maxContextTokens: normalizeContextTokens(store['aiContextTokens']),
          semantic,
        })
      let ragCtx = build(question)
      // Thư mục lớn hơn mức ngữ cảnh: phải chọn file theo từ khóa -> mở rộng truy vấn trước. Lỗi / quá giờ thì dùng câu hỏi gốc.
      if (ragCtx.mode === 'parent-rag' && rawKey) {
        const terms = await askLlm(provider, {
          apiKey: rawKey,
          model,
          question,
          contextText: '',
          history: [],
          availableCitations: [],
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(SEARCH_TERMS_TIMEOUT_MS)]),
          system: SEARCH_TERMS_SYSTEM,
        }).then(
          (r) => searchTermsLine(r.answer),
          () => ''
        )
        if (controller.signal.aborted) throw new Error(USER_ABORT_MSG)
        const query = terms ? `${question}\n${terms}` : question
        // Tìm theo nghĩa (người dùng đã bật, nhà cung cấp có embedding): lỗi / thư mục quá lớn thì chỉ dùng từ khóa
        let semantic: SemanticScore | undefined
        const sections = docs.flatMap((d) => d.sections)
        if (store['aiEmbeddings'] === true && canEmbed(provider) && sections.length > 0 && sections.length <= EMBED_MAX_TEXTS) {
          try {
            const [q, ...vecs] = await embedTexts(provider, rawKey, [query, ...sections.map((x) => `${x.metaHeader}\n${x.sectionTitle}\n${x.content}`)], controller.signal)
            const score = new Map<RagSection, number>(sections.map((x, i) => [x, cosine(q, vecs[i])]))
            semantic = (x) => score.get(x)
          } catch (err) {
            if (controller.signal.aborted) throw err
            void logError('ai:embed', new Error(redactApiKey(errText(err), rawKey)))
          }
        }
        if (terms || semantic) ragCtx = build(query, semantic)
      }

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
