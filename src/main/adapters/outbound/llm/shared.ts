/* Phần dùng chung cho mọi nhà cung cấp AI (Gemini / Claude / OpenAI):
 * prompt hệ thống, lịch sử hội thoại, che API Key, trích dẫn nguồn, gọi HTTP có thử lại và đọc SSE.
 */
import type { AiChatTurn, RagCitation } from '../../../../types'

const MAX_HISTORY_MESSAGES = 12 // 6 lượt hỏi - đáp gần nhất

export const SYSTEM_INSTRUCTION = `Bạn là Trợ lý Kỹ thuật & Nghiệp vụ (BA / BrSE) chuyên phân tích tài liệu thiết kế hệ thống (đặc biệt là tài liệu 基本設計 tiếng Nhật đã được chuyển sang Markdown).
Nguyên tắc trả lời:
1. Trả lời chính xác, đầy đủ và rõ ràng bằng tiếng Việt dựa trên dữ liệu trong khối <context>. Giữ nguyên các mã kỹ thuật, tên cột DB, mã màn hình và tên mục tiếng Nhật (như \`SC001\`, \`CUSTOMER_CD\`, \`【項目定義】\`) trong inline code hoặc ngoặc đơn để người dùng dễ đối chiếu.
2. Khi liệt kê trường dữ liệu, điều kiện kiểm tra (入力チェック) hoặc sự kiện (イベント), phải đọc kỹ toàn bộ bảng liên quan trong <context> để không bỏ sót dòng nào.
3. Cuối mỗi ý hoặc đoạn thông tin lấy từ tài liệu, hãy gắn thẻ trích dẫn nguồn theo đúng cú pháp: \`[[TênFile.md | TênMục]]\` (ví dụ \`[[SC001__顧客一覧.md | 【項目定義】]]\`) khớp với dòng tiêu đề \`=== TÀI LIỆU: ... | MỤC: ... ===\` trong <context>.
4. Nếu thông tin không có trong tài liệu được cung cấp, hãy nói rõ là tài liệu hiện tại chưa đề cập, không tự bịa đặt.`

/** Khối <context> đặt sau prompt hệ thống (không nằm trong câu hỏi): hỏi tiếp trên cùng tài liệu thì
 * phần đầu request giống hệt lần trước, nhà cung cấp cache được (Claude cache_control, Gemini/OpenAI tự cache tiền tố). */
export function contextBlock(contextText: string): string {
  return contextText.trim() ? `<context>\n${contextText}\n</context>` : ''
}

export function systemWithContext(contextText: string): string {
  const ctx = contextBlock(contextText)
  return ctx ? `${SYSTEM_INSTRUCTION}\n\n${ctx}` : SYSTEM_INSTRUCTION
}

/** Tối đa 12 message gần nhất, bỏ message rỗng và message trả lời đứng đầu (Claude bắt buộc mở đầu bằng user). */
export function trimHistory(history: AiChatTurn[] = []): AiChatTurn[] {
  const recent = history.filter((h) => h.text.trim() !== '').slice(-MAX_HISTORY_MESSAGES)
  while (recent.length > 0 && recent[0].role !== 'user') recent.shift()
  return recent
}

/** Xóa sạch query param ?key=... và chuỗi API Key khỏi mọi thông báo lỗi/log trước khi lưu hoặc hiển thị. */
export function redactApiKey(text: string, apiKey?: string): string {
  let out = text.replace(/([?&]key=)[^&\s"')]+/gi, '$1***')
  out = out.replace(/AIza[0-9A-Za-z_-]{20,}/g, 'AIza***')
  out = out.replace(/sk-ant-[0-9A-Za-z_-]{10,}/g, 'sk-ant-***')
  out = out.replace(/sk-[0-9A-Za-z_-]{16,}/g, 'sk-***')
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

export const USER_ABORT_MSG = 'Đã dừng yêu cầu AI'

/** Chờ một khoảng thời gian, dừng ngay nếu người dùng huỷ yêu cầu. */
export function delayWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error(USER_ABORT_MSG))
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      reject(new Error(USER_ABORT_MSG))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

const RETRYABLE = new Set([429, 500, 502, 503, 504])

/** POST JSON có thử lại khi mất mạng hoặc gặp 429/5xx (tối đa 3 lần). Quá giờ chỉ tính tới khi có header phản hồi,
 * sau đó luồng stream chỉ dừng khi người dùng bấm Dừng. Trả về Response (kể cả lỗi không thử lại được) để bên gọi tự đọc. */
export async function postJsonWithRetry(opts: {
  url: string
  headers: Record<string, string>
  body: unknown
  label: string
  apiKey: string
  signal?: AbortSignal
  timeoutMs?: number
}): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? 120_000
  const maxAttempts = 3
  for (let attempt = 0; ; attempt++) {
    if (opts.signal?.aborted) throw new Error(USER_ABORT_MSG)
    const timeoutCtrl = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      timeoutCtrl.abort(new Error('TIMEOUT'))
    }, timeoutMs)
    const signal = opts.signal ? AbortSignal.any([opts.signal, timeoutCtrl.signal]) : timeoutCtrl.signal
    let res: Response
    try {
      res = await fetch(opts.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...opts.headers },
        body: JSON.stringify(opts.body),
        signal,
      })
    } catch (err) {
      if (opts.signal?.aborted) throw new Error(USER_ABORT_MSG)
      // Không thử lại khi quá giờ: câu trả lời chậm sẽ lại quá giờ, chỉ tốn thêm thời gian và token.
      if (timedOut) throw new Error(`Quá thời gian chờ phản hồi từ ${opts.label} API (${timeoutMs / 1000}s). Vui lòng thử lại.`)
      if (attempt < maxAttempts - 1) {
        await delayWithSignal(1500 * (attempt + 1), opts.signal)
        continue
      }
      throw new Error(`Không kết nối được tới ${opts.label} API: ` + redactApiKey(String(err), opts.apiKey))
    } finally {
      clearTimeout(timer)
    }
    if (RETRYABLE.has(res.status) && attempt < maxAttempts - 1) {
      await res.body?.cancel().catch(() => {})
      await delayWithSignal(1500 * (attempt + 1), opts.signal)
      continue
    }
    return res
  }
}

/** Đọc luồng Server-Sent Events, gọi `onData` với chuỗi `data:` của từng sự kiện.
 * Không nhận thêm byte nào trong `idleMs` (mạng rớt âm thầm) thì báo lỗi thay vì chờ mãi. */
export async function readSse(
  res: Response,
  onData: (data: string) => void,
  signal?: AbortSignal,
  idleMs = 120_000
): Promise<void> {
  if (!res.body) return
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  const flush = (block: string): void => {
    const data = block
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).replace(/^ /, ''))
      .join('\n')
    if (data && data !== '[DONE]') onData(data)
  }
  try {
    for (;;) {
      let stalled = false
      const timer = setTimeout(() => {
        stalled = true
        void reader.cancel().catch(() => {})
      }, idleMs)
      const { done, value } = await reader.read().finally(() => clearTimeout(timer))
      if (stalled) throw new Error(`Luồng trả lời bị ngắt (không nhận thêm dữ liệu sau ${idleMs / 1000}s). Vui lòng thử lại.`)
      if (done) break
      // Chuẩn hóa trên cả buffer: "\r\n" có thể bị cắt đôi giữa hai chunk mạng
      buf = (buf + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n')
      let idx: number
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        flush(buf.slice(0, idx))
        buf = buf.slice(idx + 2)
      }
    }
  } catch (err) {
    if (signal?.aborted) throw new Error(USER_ABORT_MSG)
    throw err
  }
  if (buf.trim()) flush(buf)
}

/** Nội dung lỗi trong body JSON (`{error: {message}}`) của Gemini / OpenAI. */
export async function errorMessageOf(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: { message?: string } }
    return data.error?.message ?? res.statusText
  } catch {
    return res.statusText
  }
}
