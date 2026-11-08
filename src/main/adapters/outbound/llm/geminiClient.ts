/* Client gọi Gemini API ở tiến trình main (stream SSE). Phần dùng chung (prompt, che key, gọi HTTP) ở ./shared. */
import { DEFAULT_AI_MODEL, type AiChatTurn, type AiModelId, type AiUsage } from '../../../../shared/types'
import {
  errorMessageOf,
  postJsonWithRetry,
  readSse,
  redactApiKey,
  SYSTEM_INSTRUCTION,
  contextBlock,
  trimHistory,
} from './shared'

/** Tạo payload JSON gửi tới Gemini generateContent API.
 * Khối <context> nằm trong systemInstruction để Gemini tự cache phần đầu khi hỏi tiếp trên cùng tài liệu. */
export function buildGeminiRequestBody(
  question: string,
  contextText: string,
  history: AiChatTurn[] = [],
  system = SYSTEM_INSTRUCTION
): Record<string, unknown> {
  const ctx = contextBlock(contextText)
  return {
    systemInstruction: {
      parts: [{ text: system }, ...(ctx ? [{ text: ctx }] : [])],
    },
    contents: [
      ...trimHistory(history).map((h) => ({ role: h.role === 'model' ? 'model' : 'user', parts: [{ text: h.text }] })),
      { role: 'user', parts: [{ text: question.trim() }] },
    ],
    generationConfig: {
      temperature: 0.2,
    },
  }
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
    cachedContentTokenCount?: number
  }
  error?: {
    code?: number
    message?: string
  }
}

/** Gộp các chunk SSE của streamGenerateContent thành một phản hồi; phản hồi JSON thường thì đọc thẳng. */
async function readGeminiBody(res: Response, onDelta?: (text: string) => void, signal?: AbortSignal): Promise<GeminiApiRawResponse> {
  if (!(res.headers.get('content-type') ?? '').includes('text/event-stream')) {
    try {
      return (await res.json()) as GeminiApiRawResponse
    } catch {
      return {}
    }
  }
  let text = ''
  const out: GeminiApiRawResponse = {}
  await readSse(
    res,
    (data) => {
      const chunk = JSON.parse(data) as GeminiApiRawResponse
      if (chunk.error) throw new Error(chunk.error.message ?? 'Lỗi Gemini API')
      const cand = chunk.candidates?.[0]
      const piece = cand?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
      if (piece) {
        text += piece
        onDelta?.(piece)
      }
      if (cand?.finishReason) out.candidates = [{ finishReason: cand.finishReason }]
      if (chunk.promptFeedback) out.promptFeedback = chunk.promptFeedback
      if (chunk.usageMetadata) out.usageMetadata = chunk.usageMetadata
    },
    signal
  )
  out.candidates = [{ content: { parts: [{ text }] }, finishReason: out.candidates?.[0]?.finishReason }]
  return out
}

/** Gọi Gemini streamGenerateContent (SSE) bằng fetch của Node ở tiến trình main, kèm timeout và tự thử lại khi gặp lỗi tạm thời. */
export async function callGeminiApi(opts: {
  apiKey: string
  model: AiModelId
  question: string
  contextText: string
  history: AiChatTurn[]
  signal?: AbortSignal
  onDelta?: (text: string) => void
  system?: string
}): Promise<{ text: string; usage?: AiUsage }> {
  const key = opts.apiKey.trim()
  if (!key) {
    throw new Error('Chưa cấu hình Gemini API Key. Hãy bấm nút "🔑 API Key" ở góc trên để nhập key.')
  }

  const body = buildGeminiRequestBody(opts.question, opts.contextText, opts.history, opts.system)
  // Key đi trong header (như listGeminiModels), không nằm trên URL nên không lọt vào log proxy/thông báo lỗi
  const post = (model: AiModelId): Promise<Response> =>
    postJsonWithRetry({
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
      headers: { 'x-goog-api-key': key },
      body,
      label: 'Gemini',
      apiKey: key,
      signal: opts.signal,
    })

  let activeModel = opts.model
  let res = await post(activeModel)
  // Tự động chuyển về model flash ổn định nếu model đã chọn bị khai tử hoặc trả 404
  if (res.status === 404 && activeModel !== DEFAULT_AI_MODEL) {
    await res.body?.cancel().catch(() => {})
    activeModel = DEFAULT_AI_MODEL
    res = await post(activeModel)
  }

  if (!res.ok) {
    const msg = redactApiKey(await errorMessageOf(res), key)
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      throw new Error('Gemini API Key không hợp lệ hoặc không có quyền truy cập (' + res.status + '): ' + msg)
    }
    if (res.status === 429) {
      throw new Error('Đã vượt giới hạn quota Gemini API (429). Vui lòng chờ ít giây rồi thử lại.')
    }
    throw new Error(`Lỗi Gemini API (${res.status}): ` + msg)
  }

  const data = await readGeminiBody(res, opts.onDelta, opts.signal)

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

  const um = data.usageMetadata
  const usage =
    um && typeof um.totalTokenCount === 'number'
      ? {
          promptTokens: um.promptTokenCount ?? 0,
          completionTokens: um.candidatesTokenCount ?? 0,
          totalTokens: um.totalTokenCount,
          cachedTokens: um.cachedContentTokenCount,
        }
      : undefined

  return { text: rawText, usage }
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
