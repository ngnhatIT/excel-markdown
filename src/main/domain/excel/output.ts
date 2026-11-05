/* Phần output không phụ thuộc SheetJS: escape Markdown, ghép file per-workbook, tên file.
 * Main process chỉ import file này (không nạp SheetJS); parse Excel chạy trong worker.
 */

export interface SheetResult {
  sheet: string
  markdown: string
  title?: string
  meta?: Record<string, string>
}

export type FrontMatterValue = string | string[] | Record<string, string>

const isWordChar = (ch: string | undefined): boolean => !!ch && /[\p{L}\p{N}]/u.test(ch)

/** Escape ký tự Markdown/HTML *inline* để bản render hiển thị đúng nội dung ô.
 * Chỉ escape chỗ thật sự bị hiểu nhầm, giữ file .md dễ đọc khi mở thô:
 * `<null>`/`<input>` (thẻ HTML bị ẩn), `*x*`/`__x__` (in nghiêng/đậm), `` `x` ``,
 * `&nbsp;` (entity), `1~10, 20~30` (gạch ngang), `[a](b)` (link).
 * `snake_case`, `a < b`, `<画面名>`, `1~10` giữ nguyên. Không xử lý `|` (escCell lo). */
export function escapeMarkdownInline(s: string): string {
  let out = s.replace(/\\(?=[!-/:-@[-`{-~])/g, '\\\\')
  out = out.replace(/[*`]/g, '\\$&')
  out = out.replace(/_/g, (m, i: number, str: string) =>
    isWordChar(str[i - 1]) && isWordChar(str[i + 1]) ? m : '\\_'
  )
  out = out.replace(/<(?=[A-Za-z/!?])/g, '\\<')
  out = out.replace(/&(?=#?[A-Za-z0-9]+;)/g, '\\&')
  if ((out.match(/~/g) || []).length >= 2) out = out.replace(/~/g, '\\~')
  return out.replace(/\](?=[([:])/g, '\\]')
}

/** YAML front-matter cho RAG/LLM. Giá trị là chuỗi JSON (hợp lệ YAML, không cần escape riêng).
 * Bỏ qua các khóa có giá trị undefined hoặc object rỗng. */
export function frontMatter(fields: Record<string, FrontMatterValue | undefined>): string {
  const entries = Object.entries(fields).filter(([, v]) => {
    if (v === undefined) return false
    if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) return false
    return true
  }) as [string, FrontMatterValue][]
  const line = ([k, v]: [string, FrontMatterValue]): string => k + ': ' + JSON.stringify(v)
  return '---\n' + entries.map(line).join('\n') + '\n---\n\n'
}

/** Gộp markdown các sheet cho per-workbook mode: bỏ sheet rỗng để không
 * tạo separator `---` thừa giữa các khoảng trống. `source` có thì thêm front-matter. */
export function joinWorkbookMarkdown(base: string, sheets: SheetResult[], escape = true, source?: string): string {
  const parts = sheets.map((s) => s.markdown.trim()).filter((m) => m !== '')
  const fm = source ? frontMatter({ source, sheets: sheets.map((s) => s.sheet) }) : ''
  return fm + '# ' + (escape ? escapeMarkdownInline(base) : base) + '\n\n' + parts.join('\n\n---\n\n') + '\n'
}

/** Tên file an toàn trên Windows: thay ký tự cấm, cắt ngắn, bỏ dấu chấm /
 * khoảng trắng ở cuối (Windows cấm tên kết thúc bằng chúng). */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

/** Tên file an toàn trên Windows: thay ký tự cấm bằng `_`, cắt ngắn,
 * bỏ dấu chấm/khoảng trắng ở cuối, prefix `_` cho tên reserved (CON, NUL...).
 * Trả về 'sheet' nếu rỗng sau khi làm sạch. */
export function safeFileName(name: string, maxLen = 80): string {
  let cleaned = name.replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, maxLen).replace(/[. ]+$/, '')
  if (WINDOWS_RESERVED.test(cleaned.split('.')[0])) cleaned = '_' + cleaned
  return cleaned.slice(0, maxLen) || 'sheet'
}

/** Trả về tên file chưa dùng: nếu `wanted` đã có trong `used` thì thêm hậu tố
 * ` (2)`, ` (3)`... Tên được chọn sẽ được thêm vào `used`. */
export function dedupeFileName(wanted: string, used: Set<string>): string {
  if (!used.has(wanted)) {
    used.add(wanted)
    return wanted
  }
  const dot = wanted.lastIndexOf('.')
  const stem = dot >= 0 ? wanted.slice(0, dot) : wanted
  const ext = dot >= 0 ? wanted.slice(dot) : ''
  let n = 2
  while (used.has(stem + ' (' + n + ')' + ext)) n++
  const name = stem + ' (' + n + ')' + ext
  used.add(name)
  return name
}
