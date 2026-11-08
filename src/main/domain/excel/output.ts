/* Phần output không phụ thuộc SheetJS: escape Markdown, ghép file per-workbook, tên file.
 * Main process chỉ import file này (không nạp SheetJS); parse Excel chạy trong worker.
 */
import type { ConvertOptions } from '../../../shared/types'
import { slugifyHeading } from '../../../shared/mdView'

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

/** Encode ký tự làm gãy cú pháp link Markdown trong đường dẫn tương đối. */
const encPath = (p: string): string => p.replace(/[ ()<>#%]/g, (ch) => '%' + ch.charCodeAt(0).toString(16).toUpperCase())

/** Thay link ảnh bằng đường dẫn tương đối `dir/tên`. */
function linkAssets(md: string, dir: string): string {
  const d = encPath(dir)
  return md.replace(ASSET_LINK, (_m, enc: string) => '](' + d + '/' + enc + ')')
}

/** Tiền tố link sang sheet khác do converter sinh (`[参照](x2m-sheet:<tên sheet đã encode>)`). Đích thật tùy
 * cách ghi file nên thay ở đây (linkSheets): gộp workbook -> `#heading`, mỗi sheet một file -> tên file .md. */
export const SHEET_TOKEN = 'x2m-sheet:'
// Nhãn do converter sinh luôn escape `[`/`]` nên không chứa ngoặc trần. Giới hạn độ dài nhãn để chuỗi `\[\[\[...`
// (chế độ không escape) không làm regex quét O(n²). shortcut: nhãn > 2000 ký tự giữ nguyên token (link chết).
const SHEET_LINK = /\[((?:\\[\s\S]|[^\\[\]]){0,2000})\]\(x2m-sheet:([^)\s]*)\)/g

/** Thay link sheet bằng `href(tên sheet)`; undefined (sheet không được ghi) -> chỉ giữ chữ. */
export function linkSheets(md: string, href: (sheet: string) => string | undefined): string {
  return md.replace(SHEET_LINK, (_m, label: string, enc: string) => {
    let h: string | undefined
    try {
      h = href(decodeURIComponent(enc))
    } catch {
      h = undefined
    }
    return h ? '[' + label + '](' + h + ')' : label
  })
}

/** Anchor của heading `## tên sheet`: cùng quy tắc slugify của trang HTML xuất từ app (shared/guideHtml.ts);
 * tên chỉ gồm chữ/số/khoảng trắng (đa số tên sheet) cho kết quả giống GitHub.
 * shortcut: không tính hậu tố `-2` khi trùng heading khác (vd tên sheet trùng tên workbook), thêm khi gặp thật. */
// Cùng slug với trình đọc của app và GitHub (shared/mdView), để link `#tên sheet` mở đúng mục ở mọi nơi
const headingSlug = slugifyHeading

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
  // Link sang sheet khác -> heading của sheet đó trong cùng file (chỉ khi sheet có heading `## tên`)
  const titled = new Set(sheets.filter((s) => s.markdown.startsWith('## ')).map((s) => s.sheet))
  const href = (sheet: string): string | undefined => (titled.has(sheet) && headingSlug(sheet) ? '#' + headingSlug(sheet) : undefined)
  const parts = sheets.map((s) => linkSheets(s.markdown.trim(), href)).filter((m) => m !== '')
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

/** Quy tắc duy nhất đặt tên file .md của một workbook: gộp thì một tên, không thì mỗi sheet một tên (cùng thứ tự).
 * `used` được cập nhật để tên không trùng trong cả lần convert. */
function mdNamesFor(base: string, sheets: string[], perWorkbook: boolean, used: Set<string>): string[] {
  return perWorkbook
    ? [dedupeFileName(mdFileName(base), used)]
    : sheets.map((sheet) => dedupeFileName(mdFileName(base, sheet), used))
}

/** Tên các file .md mà `workbookMdFiles` sẽ ghi cho các file/sheet đã chọn, tính trước khi convert để hỏi ghi đè.
 * Tính theo mọi sheet đã chọn nên có thể thừa tên của sheet rỗng (sẽ bị bỏ qua): hỏi thừa vô hại. */
export function plannedMdFileNames(specs: { base: string; sheets: string[] }[], perWorkbook: boolean): string[] {
  const used = new Set<string>()
  return specs.flatMap((s) => mdNamesFor(s.base, s.sheets, perWorkbook, used))
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
    const [name] = mdNamesFor(base, [], true, used)
    return [withImages({ name, text }, sheets)]
  }
  const names = mdNamesFor(base, sheets.map((s) => s.sheet), false, used)
  // Link sang sheet khác -> file .md của sheet đó trong lần ghi này
  const fileOf = new Map(sheets.map((s, i) => [s.sheet, encPath(names[i])]))
  return sheets.map((s, i) =>
    withImages(
      {
        name: names[i],
        text:
          (options.frontMatter ? frontMatter({ source: sourceName, sheet: s.sheet, title: s.title, meta: s.meta }) : '') +
          linkSheets(s.markdown, (sheet) => fileOf.get(sheet)) +
          '\n',
      },
      [s]
    )
  )
}
