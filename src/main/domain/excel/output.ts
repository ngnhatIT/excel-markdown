/* Phần output không phụ thuộc SheetJS: escape Markdown, ghép file per-workbook, tên file.
 * Main process chỉ import file này (không nạp SheetJS); parse Excel chạy trong worker.
 */
import type { ConvertOptions } from '../../../types'

export interface SheetResult {
  sheet: string
  markdown: string
  title?: string
  meta?: Record<string, string>
  /** Ảnh sheet tham chiếu (tên file -> nội dung); link trong markdown dùng ASSET_TOKEN */
  images?: Record<string, Uint8Array>
}

/** Tiền tố link ảnh do converter sinh (`![..](x2m-asset:image1.png)`), thay bằng thư mục ảnh
 * khi ghi file (linkAssets) hoặc data: khi preview (inlineAssets). */
export const ASSET_TOKEN = 'x2m-asset:'
const ASSET_LINK = /\]\(x2m-asset:([^)\s]+)\)/g

const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
}

/** Thay link ảnh bằng data: URI. Ảnh trình duyệt không hiển thị được (emf/wmf...) giữ tên file. */
export function inlineAssets(md: string, media: Record<string, Uint8Array>): string {
  return md.replace(ASSET_LINK, (m, enc: string) => {
    const name = decodeURIComponent(enc)
    const mime = IMAGE_MIME[name.split('.').pop()?.toLowerCase() ?? '']
    const data = media[name]
    return mime && data ? '](data:' + mime + ';base64,' + Buffer.from(data).toString('base64') + ')' : '](' + enc + ')'
  })
}

/** Thay link ảnh bằng đường dẫn tương đối `dir/tên` (encode ký tự làm gãy cú pháp link). */
function linkAssets(md: string, dir: string): string {
  const d = dir.replace(/[ ()<>#%]/g, (ch) => '%' + ch.charCodeAt(0).toString(16).toUpperCase())
  return md.replace(ASSET_LINK, (_m, enc: string) => '](' + d + '/' + enc + ')')
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

/** Tên file .md (chưa khử trùng) Excel → Markdown ghi cho một sheet; không có `sheet` = file gộp cả workbook. */
export function mdFileName(base: string, sheet?: string): string {
  return safeFileName(sheet === undefined ? base : base + '__' + sheet) + '.md'
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

export interface MdOutputFile {
  /** Tên file .md đã khử trùng */
  name: string
  text: string
  /** Ảnh cần ghi kèm, `path` tương đối thư mục xuất (`<tên>_images/image1.png`) */
  images?: { path: string; data: Uint8Array }[]
}

/** Các file .md Excel → Markdown ghi cho một workbook; app (IPC excel:convert) và CLI dùng chung.
 * `used`: tên đã dùng trong lần convert này (được cập nhật). Gộp workbook mà mọi sheet rỗng thì không ghi gì. */
export function workbookMdFiles(
  base: string,
  sourceName: string,
  sheets: SheetResult[],
  options: Pick<ConvertOptions, 'escapeMarkdown' | 'frontMatter'>,
  perWorkbook: boolean,
  used: Set<string>
): MdOutputFile[] {
  // Một thư mục ảnh cho cả workbook (tên ảnh trong xl/media không trùng nhau)
  const dir = sheets.some((s) => s.images) ? dedupeFileName(safeFileName(base + '_images'), used) : ''
  const images = (list: SheetResult[]): MdOutputFile['images'] => {
    const all = list.flatMap((s) => Object.entries(s.images ?? {}))
    return all.length > 0 ? all.map(([name, data]) => ({ path: dir + '/' + name, data })) : undefined
  }
  const withImages = (f: MdOutputFile, list: SheetResult[]): MdOutputFile => {
    const imgs = images(list)
    return imgs ? { ...f, text: linkAssets(f.text, dir), images: imgs } : f
  }
  if (perWorkbook) {
    if (!sheets.some((s) => s.markdown.trim() !== '')) return []
    const text = joinWorkbookMarkdown(base, sheets, options.escapeMarkdown !== false, options.frontMatter ? sourceName : undefined)
    return [withImages({ name: dedupeFileName(mdFileName(base), used), text }, sheets)]
  }
  return sheets.map((s) =>
    withImages(
      {
        name: dedupeFileName(mdFileName(base, s.sheet), used),
        text:
          (options.frontMatter ? frontMatter({ source: sourceName, sheet: s.sheet, title: s.title, meta: s.meta }) : '') +
          s.markdown +
          '\n',
      },
      [s]
    )
  )
}
