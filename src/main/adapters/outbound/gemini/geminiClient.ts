/* Client gọi Gemini API ở tiến trình main, kèm các hàm bảo mật API Key (redactApiKey, maskApiKey)
 * và trích xuất thẻ trích dẫn [[relPath | sectionTitle]].
 */
import { DEFAULT_AI_MODEL, type AiAskResponse, type AiChatTurn, type AiModelId, type RagCitation } from '../../../../types'

const MAX_HISTORY_MESSAGES = 12 // 6 lượt hỏi - đáp gần nhất

const SYSTEM_INSTRUCTION = `Bạn là Trợ lý Kỹ thuật & Nghiệp vụ (BA / BrSE) chuyên phân tích tài liệu thiết kế hệ thống (đặc biệt là tài liệu 基本設計 tiếng Nhật đã được chuyển sang Markdown).
Nguyên tắc trả lời:
1. Trả lời chính xác, đầy đủ và rõ ràng bằng tiếng Việt dựa trên dữ liệu trong khối <context>. Giữ nguyên các mã kỹ thuật, tên cột DB, mã màn hình và tên mục tiếng Nhật (như \`SC001\`, \`CUSTOMER_CD\`, \`【項目定義】\`) trong inline code hoặc ngoặc đơn để người dùng dễ đối chiếu.
2. Khi liệt kê trường dữ liệu, điều kiện kiểm tra (入力チェック) hoặc sự kiện (イベント), phải đọc kỹ toàn bộ bảng liên quan trong <context> để không bỏ sót dòng nào.
3. Cuối mỗi ý hoặc đoạn thông tin lấy từ tài liệu, hãy gắn thẻ trích dẫn nguồn theo đúng cú pháp: \`[[TênFile.md | TênMục]]\` (ví dụ \`[[SC001__顧客一覧.md | 【項目定義】]]\`) khớp với dòng tiêu đề \`=== TÀI LIỆU: ... | MỤC: ... ===\` trong <context>.
4. Nếu thông tin không có trong tài liệu được cung cấp, hãy nói rõ là tài liệu hiện tại chưa đề cập, không tự bịa đặt.`

/** Xóa sạch query param ?key=... và chuỗi API Key khỏi mọi thông báo lỗi/log trước khi lưu hoặc hiển thị. */
export function redactApiKey(text: string, apiKey?: string): string {
  let out = text.replace(/([?&]key=)[^&\s"')]+/gi, '$1***')
  out = out.replace(/AIza[0-9A-Za-z_-]{20,}/g, 'AIza***')
  const trimmedKey = (apiKey ?? '').trim()
  if (trimmedKey.length >= 6) {
    out = out.split(trimmedKey).join('***')
  }
  return out
}

/** Chỉ hiển thị 4 ký tự đầu và 4 ký tự cuối của API Key để người dùng nhận diện trên UI. */
export function maskApiKey(apiKey: string): string {
  const k = apiKey.trim()
  if (!k) return ''
  if (k.length <= 8) return '••••••••'
  return k.slice(0, 4) + '••••' + k.slice(-4)
}

/** Tạo payload JSON gửi tới Gemini generateContent API.
 * Chỉ giữ tối đa 12 message lịch sử gần nhất (không lặp lại khối <context> cũ). */
export function buildGeminiRequestBody(
  question: string,
  contextText: string,
  history: AiChatTurn[] = []
): Record<string, unknown> {
  const recentHistory = history
    .filter((h) => h.text.trim() !== '')
    .slice(-MAX_HISTORY_MESSAGES)
    .map((h) => ({
      role: h.role === 'model' ? 'model' : 'user',
      parts: [{ text: h.text }],
    }))

  const userPrompt = contextText.trim()
    ? `<context>\n${contextText}\n</context>\n\nCâu hỏi / Yêu cầu của người dùng:\n${question.trim()}`
    : question.trim()

  return {
    systemInstruction: {
      parts: [{ text: SYSTEM_INSTRUCTION }],
    },
    contents: [
      ...recentHistory,
      {
        role: 'user',
        parts: [{ text: userPrompt }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
    },
  }
}

/** Bóc tách các thẻ [[relPath | sectionTitle]] trong câu trả lời và đối chiếu với danh sách citations hợp lệ. */
export function extractCitationsFromAnswer(
  answer: string,
  available: RagCitation[]
): { cleanAnswer: string; citations: RagCitation[] } {
  const matched: RagCitation[] = []
  const seen = new Set<string>()
  const addCite = (c: RagCitation): void => {
    const key = `${c.filePath}::${c.sectionTitle}`
    if (!seen.has(key)) {
      seen.add(key)
      matched.push(c)
    }
  }

  const tagRe = /\[\[\s*([^\]|]+?)(?:\s*\|\s*([^\]]+?))?\s*\]\]/g
  let m: RegExpExecArray | null
  while ((m = tagRe.exec(answer)) !== null) {
    const rawFile = m[1].trim().toLowerCase()
    const rawSec = (m[2] ?? '').trim().toLowerCase()
    const found =
      available.find(
        (c) =>
          (c.relPath.toLowerCase() === rawFile || c.relPath.toLowerCase().endsWith(rawFile)) &&
          (!rawSec || c.sectionTitle.toLowerCase().includes(rawSec) || rawSec.includes(c.sectionTitle.toLowerCase()))
      ) ??
      available.find(
        (c) => c.relPath.toLowerCase() === rawFile || c.relPath.toLowerCase().includes(rawFile)
      )
    if (found) addCite(found)
  }

  // Làm gọn thẻ [[file | section]] trong văn bản hiển thị thành nhãn dễ đọc `[file › section]`
  const cleanAnswer = answer
    .replace(tagRe, (_full, f: string, s?: string) => {
      const fileLabel = f.trim()
      const secLabel = s?.trim()
      return secLabel ? `\`[${fileLabel} › ${secLabel}]\`` : `\`[${fileLabel}]\``
    })
    .trim()

  if (matched.length === 0 && available.length > 0) {
    // Nếu câu trả lời không gắn đúng cú pháp [[...]] hoặc đang hỏi trên 1 file duy nhất, lấy tối đa 4 nguồn đầu
    for (const c of available.slice(0, 4)) addCite(c)
  }

  return { cleanAnswer, citations: matched }
}

interface GeminiApiRawResponse {
  candidates?: {
    content?: {
      parts?: { text?: string }[]
    }
    finishReason?: string
  }[]
  promptFeedback?: {
    blockReason?: string
  }
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    totalTokenCount?: number
  }
  error?: {
    code?: number
    message?: string
  }
}

/** Chờ một khoảng thời gian, dừng ngay nếu người dùng huỷ yêu cầu. */
function delayWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Đã dừng yêu cầu AI'))
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      reject(new Error('Đã dừng yêu cầu AI'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** Gọi Gemini generateContent REST API bằng fetch của Node ở tiến trình main, kèm timeout và tự thử lại khi gặp lỗi tạm thời. */
export async function callGeminiApi(opts: {
  apiKey: string
  model: AiModelId
  question: string
  contextText: string
  history: AiChatTurn[]
  availableCitations: RagCitation[]
  signal?: AbortSignal
}): Promise<{ answer: string; citations: RagCitation[]; usage?: AiAskResponse['usage'] }> {
  const key = opts.apiKey.trim()
  if (!key) {
    throw new Error('Chưa cấu hình Gemini API Key. Hãy bấm nút "🔑 API Key" ở góc trên để nhập key.')
  }

  const body = buildGeminiRequestBody(opts.question, opts.contextText, opts.history)
  let activeModel = opts.model
  const maxAttempts = 3

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Key đi trong header (như listGeminiModels), không nằm trên URL nên không lọt vào log proxy/thông báo lỗi
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(activeModel)}:generateContent`

    const timeoutMs = 120_000
    const ctrl = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      ctrl.abort(new Error('TIMEOUT'))
    }, timeoutMs)

    const onUserAbort = (): void => ctrl.abort(new Error('USER_ABORT'))
    if (opts.signal) {
      if (opts.signal.aborted) {
        clearTimeout(timer)
        throw new Error('Đã dừng yêu cầu AI')
      }
      opts.signal.addEventListener('abort', onUserAbort, { once: true })
    }

    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      })
    } catch (err) {
      if (opts.signal?.aborted) {
        throw new Error('Đã dừng yêu cầu AI')
      }
      // Không thử lại khi quá giờ: câu trả lời chậm sẽ lại quá giờ, chỉ tốn thêm thời gian và token.
      if (timedOut) {
        throw new Error(`Quá thời gian chờ phản hồi từ Gemini API (${timeoutMs / 1000}s). Vui lòng thử lại.`)
      }
      if (attempt < maxAttempts - 1) {
        await delayWithSignal(1500 * (attempt + 1), opts.signal)
        continue
      }
      throw new Error('Không kết nối được tới Gemini API: ' + redactApiKey(String(err), key))
    } finally {
      clearTimeout(timer)
      if (opts.signal) {
        opts.signal.removeEventListener('abort', onUserAbort)
      }
    }

    let data: GeminiApiRawResponse = {}
    try {
      data = (await res.json()) as GeminiApiRawResponse
    } catch {
      /* phản hồi không phải JSON */
    }

    if (!res.ok) {
      // Tự động chuyển về model flash ổn định nếu model đã chọn bị khai tử hoặc trả 404
      if (res.status === 404 && activeModel !== DEFAULT_AI_MODEL) {
        activeModel = DEFAULT_AI_MODEL
        continue
      }
      // Lỗi tạm thời (rate limit 429 hoặc quá tải 500/502/503/504): thử lại có ngắt quãng
      if (
        (res.status === 429 || res.status === 500 || res.status === 502 || res.status === 503 || res.status === 504) &&
        attempt < maxAttempts - 1
      ) {
        await delayWithSignal(1500 * (attempt + 1), opts.signal)
        continue
      }
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        throw new Error(
          'Gemini API Key không hợp lệ hoặc không có quyền truy cập (' +
            res.status +
            '): ' +
            redactApiKey(data.error?.message ?? res.statusText, key)
        )
      }
      if (res.status === 429) {
        throw new Error('Đã vượt giới hạn quota Gemini API (429). Vui lòng chờ ít giây rồi thử lại.')
      }
      throw new Error(
        `Lỗi Gemini API (${res.status}): ` + redactApiKey(data.error?.message ?? res.statusText, key)
      )
    }

    const candidate = data.candidates?.[0]
    if (candidate?.finishReason === 'SAFETY') {
      throw new Error('Nội dung phản hồi bị bộ lọc an toàn của Gemini chặn (SAFETY). Vui lòng điều chỉnh lại câu hỏi.')
    }
    if (candidate?.finishReason === 'RECITATION') {
      throw new Error('Nội dung phản hồi bị bộ lọc bản quyền của Gemini chặn (RECITATION).')
    }
    if (data.promptFeedback?.blockReason) {
      throw new Error(`Yêu cầu bị chặn (${data.promptFeedback.blockReason}). Hãy thử đổi cách diễn đạt câu hỏi.`)
    }

    let rawText =
      candidate?.content?.parts
        ?.map((p) => p.text ?? '')
        .join('')
        .trim() ?? ''

    if (!rawText) {
      throw new Error('Gemini không trả về nội dung (có thể bị bộ lọc an toàn chặn hoặc tài liệu rỗng).')
    }

    if (candidate?.finishReason === 'MAX_TOKENS') {
      rawText += '\n\n*(Lưu ý: Câu trả lời đã đạt giới hạn độ dài tối đa của model)*'
    }
    if (activeModel !== opts.model) {
      rawText += `\n\n*(Lưu ý: model "${opts.model}" không còn dùng được, câu trả lời này do ${activeModel} tạo. Hãy chọn model khác.)*`
    }

    const { cleanAnswer, citations } = extractCitationsFromAnswer(rawText, opts.availableCitations)
    const um = data.usageMetadata
    const usage =
      um && typeof um.totalTokenCount === 'number'
        ? {
            promptTokens: um.promptTokenCount ?? 0,
            completionTokens: um.candidatesTokenCount ?? 0,
            totalTokens: um.totalTokenCount,
          }
        : undefined

    return { answer: cleanAnswer, citations, usage }
  }

  throw new Error('Không thể hoàn thành yêu cầu tới Gemini sau nhiều lần thử.')
}

/** Lọc & sắp xếp danh sách model từ `GET /v1beta/models`: chỉ giữ model `gemini-*` hỗ trợ
 * generateContent, bỏ biến thể không dùng để hỏi đáp văn bản (image/tts/embedding/live...). */
export function filterGeminiModels(
  raw: Array<{ name?: string; supportedGenerationMethods?: string[] }>
): string[] {
  const skip = /(image|tts|embedding|live|audio|robotics|computer-use|aqa|vision|imagen|veo|learnlm)/i
  const ids = new Set<string>()
  for (const m of raw) {
    const id = (m.name ?? '').replace(/^models\//, '')
    if (!/^gemini-[\w.-]+$/.test(id) || skip.test(id)) continue
    if (!m.supportedGenerationMethods?.includes('generateContent')) continue
    ids.add(id)
  }
  return Array.from(ids).sort((a, b) => b.localeCompare(a, 'en', { numeric: true }))
}

/** Hỏi Google những model mà API key này dùng được (không gửi key trên URL). */
export async function listGeminiModels(apiKey: string): Promise<string[]> {
  const key = apiKey.trim()
  if (!key) throw new Error('Chưa cấu hình Gemini API Key.')
  let res: Response
  try {
    res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
      headers: { 'x-goog-api-key': key },
    })
  } catch (err) {
    throw new Error('Không kết nối được tới Gemini API: ' + redactApiKey(String(err), key))
  }
  let data: { models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>; error?: { message?: string } } = {}
  try {
    data = await res.json()
  } catch {
    /* không phải JSON */
  }
  if (!res.ok) {
    throw new Error(`Không lấy được danh sách model (${res.status}): ` + redactApiKey(data.error?.message ?? res.statusText, key))
  }
  return filterGeminiModels(data.models ?? [])
}
