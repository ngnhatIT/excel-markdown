// Markdown -> mô hình sheet (spec §5, §7, §8): marked.lexer rồi đổi từng token cấp ngoài thành Block.
// Chữ trong ô/đoạn luôn lấy qua inlineCell nên đã được gỡ escape, `<br>` -> xuống dòng, bỏ ký hiệu inline.
// Tên sheet trả về là tên thô; khử trùng/ký tự cấm là việc của assignSheetNames.
import { Lexer, Marked, Tokenizer, type Token as MarkedToken, type Tokens } from 'marked'
import type { Align, Block, ParsedFile, SheetModel, XCell } from './model'
import { externalLinks, inlineCell } from './inline'

type Token = Tokens.Generic
type MetaItem = Extract<Block, { kind: 'meta' }>['items'][number]

const BOM = /^﻿/
const BANNER_PREFIX = '基本設計'
const BANNER_SEPARATOR = '：'
const BULLET = '・'
// Sau `**label**` phải là `:` (do Excel -> Markdown sinh ra) hoặc `：` toàn角 (gõ tay); chỉ bỏ
// khoảng trắng thường sau dấu, không bỏ khoảng trắng toàn角 để giữ thụt lề của giá trị.
const META_COLON = /^[:：][ \t]*/
// Thẻ `<br>` trong khối HTML (type-7 HTML block không lọt vào inlineCell), kèm xuống dòng nguồn ngay sau nó
// (trong HTML xuống dòng nguồn chỉ là khoảng trắng): `<br>\n次` -> `\n次`.
const BR_TAG = /<br\s*\/?>[ \t]*(?:\r?\n)?/gi
// Khối HTML đúng một comment: không có chữ để hiển thị.
const COMMENT_ONLY = /^<!--(?:(?!-->)[\s\S])*-->$/

// ---- Lexer an toàn với Markdown không tin cậy ----
// marked tìm dấu đóng `*`/`_` bằng cách quét HẾT phần còn lại của đoạn cho mỗi dấu mở -> O(n²): `**a ` × 50 000
// (200 KB) mất ~4 phút. Chỉ cho tìm trong cửa sổ EM_WINDOW ký tự: nhấn mạnh dài hơn thì giữ `*` như chữ.
const EM_WINDOW = 1000
// List lồng sâu (thụt lề tăng dần) làm marked tốn bộ nhớ O(độ sâu²) tới tràn heap; quote lồng `> > > …` làm tràn
// stack. Thụt lề quá MAX_INDENT ký tự bị cắt bớt (không văn bản thật nào cần sâu vậy).
const MAX_INDENT = 64
const LONG_INDENT = new RegExp(`^([ \\t]{${MAX_INDENT}})[ \\t]+`, 'gm')
// Trước khi tách token inline, marked che link/thẻ HTML/escape bằng cách cắt-ghép CẢ chuỗi cho mỗi lần gặp -> O(n²):
// đoạn 1 MB toàn `<br>` mất ~20s. Nguồn inline dài hơn INLINE_CHUNK được tách tại xuống dòng / khoảng trắng.
// shortcut: nhấn mạnh/link vắt qua chỗ tách giữ ký hiệu như chữ (chỉ với đoạn > 20 000 ký tự).
const INLINE_CHUNK = 20_000

const safeMarked = new Marked({
  tokenizer: {
    emStrong(src, maskedSrc, prevChar) {
      if (src.length <= EM_WINDOW) return false
      const at = maskedSrc.length - src.length
      return Tokenizer.prototype.emStrong.call(this, src.slice(0, EM_WINDOW), maskedSrc.slice(at, at + EM_WINDOW), prevChar)
    }
  }
})

class SafeLexer extends Lexer {
  inlineTokens(src: string, tokens: MarkedToken[] = []): MarkedToken[] {
    for (let at = 0; at < src.length; ) {
      let end = Math.min(src.length, at + INLINE_CHUNK)
      if (end < src.length) {
        const nl = src.lastIndexOf('\n', end - 1)
        const sp = src.lastIndexOf(' ', end - 1)
        if (nl > at) end = nl + 1
        else if (sp > at) end = sp + 1
      }
      super.inlineTokens(src.slice(at, end), tokens)
      at = end
    }
    return tokens
  }
}

/** Chữ hiển thị của token có inline con (paragraph, text, heading); không có thì dùng raw. */
function inlineText(t: Token, withUrls = false): string {
  return inlineXCell(t, withUrls).text
}

/** Như inlineText nhưng giữ cả link của ô (inlineCell). */
function inlineXCell(t: Token, withUrls = false): XCell {
  return t.tokens ? inlineCell(t.tokens, withUrls) : { text: String(t.raw ?? '').trim() }
}

/**
 * Link http/https/mailto của khối nhiều dòng (ghi chú, value meta có dòng thêm): đúng một link -> trả URL để cả ô
 * là hyperlink; từ hai link -> `withUrls` (mỗi link thêm ` (url)` vào chữ) để không mất URL nào.
 */
function blockLink(tokens: Token[]): { link?: string; withUrls: boolean } {
  const links = externalLinks(tokens)
  return links.length === 1 ? { link: links[0], withUrls: false } : { withUrls: links.length > 1 }
}

/**
 * Chữ của một khối HTML: `<br>`/`<br/>`/`<br />` (mọi kiểu hoa/thường) thành xuống dòng, bỏ dòng trống ở đầu/cuối;
 * HTML khác giữ nguyên chữ (§6). Khối không còn chữ (chỉ `<br>`, khoảng trắng, hoặc một comment) -> `null` (bỏ).
 */
function htmlText(t: Token): string | null {
  const text = String(t.raw ?? '')
    .trim()
    .replace(BR_TAG, '\n')
    .replace(/^(?:[ \t]*\n)+/, '')
    .replace(/(?:\n[ \t]*)+$/, '')
  return text.trim() === '' || COMMENT_ONLY.test(text) ? null : text
}

/** Các dòng chữ thuần của một token khối, dùng khi gộp vào ô meta hoặc ghi chú. */
function blockLines(t: Token, withUrls = false): string[] {
  switch (t.type) {
    case 'space':
      return []
    case 'paragraph':
    case 'text':
    case 'heading':
      return [inlineText(t, withUrls)]
    case 'code':
      return String(t.text ?? '').split('\n')
    case 'blockquote':
      return (t.tokens ?? []).flatMap((x: Token) => blockLines(x, withUrls))
    case 'list':
      return listLines(t, withUrls)
    case 'html': {
      const text = htmlText(t)
      return text === null ? [] : text.split('\n')
    }
    // table, def... -> chữ thuần
    default:
      return [String(t.raw ?? '').trim()]
  }
}

/** Số hiển thị của item đầu một list đánh số (`3.` -> 3); marked để `''` khi list không đánh số. */
function listStart(list: Token): number {
  return typeof list.start === 'number' ? list.start : 1
}

/**
 * Các dòng của một list khi gộp vào ô (value meta, ghi chú): list đánh số giữ số hiển thị `N. ` ở dòng đầu mỗi
 * item (Ruling 18), list không đánh số chỉ giữ chữ (không thêm `・`).
 */
function listLines(list: Token, withUrls: boolean): string[] {
  const start = listStart(list)
  return (list.items ?? []).flatMap((item: Token, i: number) => {
    const lines = (item.tokens ?? []).flatMap((x: Token) => blockLines(x, withUrls))
    if (!list.ordered) return lines
    const prefix = `${start + i}. `
    return lines.length === 0 ? [prefix] : [prefix + lines[0], ...lines.slice(1)]
  })
}

/** Item meta: token inline đầu tiên là `strong`, phần sau rỗng hoặc bắt đầu bằng `:`. */
function metaItem(item: Token): MetaItem | null {
  const blocks: Token[] = item.tokens ?? []
  const head = blocks[0]
  if (!head || (head.type !== 'text' && head.type !== 'paragraph')) return null
  const inline: Token[] = head.tokens ?? []
  const label = inline[0]
  if (!label || label.type !== 'strong') return null

  const rest = inline.slice(1)
  const first = rest[0]
  if (first) {
    // Chỉ token `text` mới có thể mở đầu bằng `:`/`：`; token khác (vd link ngay sau **x**) -> không phải meta
    if (first.type !== 'text' || !META_COLON.test(String(first.text))) return null
    const stripped = String(first.text).replace(META_COLON, '')
    rest.splice(0, 1, ...(stripped === '' ? [] : [{ ...first, raw: stripped, text: stripped }]))
  }

  // List con và khối nối tiếp của item thành từng dòng thêm vào cuối giá trị
  const labelText = inlineCell(label.tokens).text
  // Có dòng thêm: giá trị thành chữ thuần nhiều dòng; link http/https/mailto theo blockLink (không mất URL)
  const { link, withUrls } = blockLink([...rest, ...blocks.slice(1)])
  const extra = blocks.slice(1).flatMap((t) => blockLines(t, withUrls))
  if (extra.length === 0) return { label: labelText, value: inlineCell(rest) }
  const first0 = inlineCell(rest, withUrls).text
  const lines = first0 ? [first0, ...extra] : extra
  return { label: labelText, value: link ? { text: lines.join('\n'), link } : { text: lines.join('\n') } }
}

const paragraph = (text: string, link?: string): Block => (link ? { kind: 'paragraph', text, link } : { kind: 'paragraph', text })

/** Đoạn chỉ gồm đúng một ảnh `![alt](src)` (bỏ khoảng trắng) -> token ảnh; không thì undefined. */
function soleImage(t: Token): Token | undefined {
  const sig = (t.tokens ?? []).filter((x: Token) => String(x.raw).trim() !== '')
  return sig.length === 1 && sig[0].type === 'image' ? sig[0] : undefined
}

/** `基本設計：<tiêu đề>` -> banner; tách tại `：` đầu tiên, không có thì title rỗng. */
function bannerOf(text: string): Block {
  const at = text.indexOf(BANNER_SEPARATOR)
  if (at < 0) return { kind: 'banner', label: text.trim(), title: '' }
  return { kind: 'banner', label: text.slice(0, at).trim(), title: text.slice(at + 1).trim() }
}

function listBlocks(list: Token, out: Block[]): void {
  // Item meta liên tiếp trong cùng một list gộp thành một block
  let meta: MetaItem[] | null = null
  // List đánh số: mọi item mang số hiển thị (start + vị trí) và không bao giờ thành meta (Ruling 18:
  // `1. **初期表示**: …` giữ số `1. `); list không đánh số: `・`, item `**label**:` thành meta.
  const start = listStart(list)
  const items: Token[] = list.items ?? []
  for (const [i, item] of items.entries()) {
    const m = list.ordered ? null : metaItem(item)
    if (m) {
      if (!meta) {
        meta = []
        out.push({ kind: 'meta', items: meta })
      }
      meta.push(m)
      continue
    }
    meta = null
    const tokens: Token[] = item.tokens ?? []
    const head = tokens[0]
    const hasText = head !== undefined && (head.type === 'text' || head.type === 'paragraph')
    const prefix = list.ordered ? `${start + i}. ` : BULLET
    const cell: XCell = hasText ? inlineXCell(head) : { text: '' }
    out.push(paragraph(prefix + cell.text, cell.link))
    // Phần còn lại của item (list con, đoạn nối tiếp, code...) thành block riêng ngay sau
    tokens.slice(hasText ? 1 : 0).forEach((t) => tokenBlocks(t, false, out))
  }
}

/** Một token cấp ngoài -> các block. `first`: token này là block đầu của sheet (chỉ khi đó mới có banner). */
function tokenBlocks(t: Token, first: boolean, out: Block[]): void {
  switch (t.type) {
    case 'space':
      return
    case 'heading':
      out.push({ kind: 'heading', text: inlineText(t) })
      return
    case 'table':
      out.push({
        kind: 'table',
        header: (t.header as Token[]).map((c) => inlineCell(c.tokens)),
        rows: (t.rows as Token[][]).map((row) => row.map((c) => inlineCell(c.tokens))),
        align: t.align as Align[]
      })
      return
    case 'blockquote': {
      const { link, withUrls } = blockLink(t.tokens ?? [])
      const text = (t.tokens ?? []).flatMap((x: Token) => blockLines(x, withUrls)).join('\n')
      if (first && text.trimStart().startsWith(BANNER_PREFIX)) out.push(bannerOf(text))
      else out.push(link ? { kind: 'note', text, link } : { kind: 'note', text })
      return
    }
    case 'list':
      listBlocks(t, out)
      return
    case 'paragraph':
    case 'text': {
      // Đoạn chỉ có `<br>` inline (vd `<br><br>`) chỉ còn xuống dòng: bỏ như khối HTML chỉ có `<br>`.
      // (Chỉ xét khoảng trắng ASCII: đoạn chỉ có khoảng trắng toàn角 vẫn giữ.)
      const img = soleImage(t)
      if (img) {
        out.push({ kind: 'image', alt: inlineText(t), src: img.href })
        return
      }
      const cell = inlineXCell(t)
      if (!/^[ \t\n]*$/.test(cell.text)) out.push(paragraph(cell.text, cell.link))
      return
    }
    case 'code':
      out.push({ kind: 'code', lines: String(t.text ?? '').split('\n') })
      return
    case 'html': {
      const text = htmlText(t)
      if (text !== null) out.push({ kind: 'paragraph', text })
      return
    }
    // mọi token khác (def...) -> chữ thuần
    default:
      out.push({ kind: 'paragraph', text: String(t.raw ?? '').trim() })
  }
}

/** Tên file không đuôi: `kihon__テーブル定義.md` -> `kihon__テーブル定義`. */
function fileStem(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName
  return base.replace(/\.[^.]*$/, '')
}

/** Tên sheet khi phần không có `##` đầu: phần sau `__` cuối của tên file, không có thì cả tên file. */
function defaultSheetName(fileName: string): string {
  const stem = fileStem(fileName)
  const at = stem.lastIndexOf('__')
  const tail = at >= 0 ? stem.slice(at + 2) : ''
  return tail === '' ? stem : tail
}

/** Chia luồng token tại `hr` cấp ngoài; bỏ phần không có token nào. */
function splitParts(tokens: Token[]): Token[][] {
  const parts: Token[][] = [[]]
  for (const t of tokens) {
    if (t.type === 'hr') parts.push([])
    else parts[parts.length - 1].push(t)
  }
  return parts.filter((p) => p.length > 0)
}

/**
 * Phân tích một file Markdown thành các sheet.
 * `fileName` là tên file kèm đuôi (để đặt tên sheet khi không có `##`).
 */
export function parseMarkdownFile(md: string, fileName: string): ParsedFile {
  const src = md.replace(BOM, '').replace(LONG_INDENT, '$1')
  try {
    return parseTokens(new SafeLexer(safeMarked.defaults).lex(src) as Token[], fileName)
  } catch (err) {
    if (!(err instanceof RangeError)) throw err
    // Lồng quá sâu (vd `> > > …` hàng nghìn cấp) làm tràn stack: giữ nguyên chữ, mỗi dòng một đoạn, không crash
    const blocks: Block[] = src
      .split(/\r\n|\r|\n/)
      .filter((l) => l.trim() !== '')
      .map((text) => ({ kind: 'paragraph', text }))
    return { title: null, sheets: [{ name: defaultSheetName(fileName), blocks }] }
  }
}

function parseTokens(tokens: Token[], fileName: string): ParsedFile {
  // Bỏ `space`: không có nghĩa gì với bố cục sheet, và để "phần rỗng" chỉ còn là phần không có token nội dung
  const flow = tokens.filter((t) => t.type !== 'space')

  // `# tiêu đề` đứng đầu file là tên workbook, không ghi vào sheet
  let title: string | null = null
  if (flow[0]?.type === 'heading' && flow[0].depth === 1) {
    title = inlineText(flow[0])
    flow.shift()
  }

  const sheets: SheetModel[] = splitParts(flow).map((part) => {
    // `##` đầu phần là tên sheet; không có thì lấy từ tên file
    const named = part[0].type === 'heading' && part[0].depth === 2
    const name = named ? inlineText(part[0]) : defaultSheetName(fileName)
    const blocks: Block[] = []
    part.slice(named ? 1 : 0).forEach((t, i) => tokenBlocks(t, i === 0, blocks))
    return { name, blocks: attachNotes(blocks) }
  })
  // File chỉ có `# tiêu đề`: vẫn là một sheet (tiêu đề thành heading) để không lặng lẽ mất file khi gộp
  if (sheets.length === 0 && title !== null) {
    sheets.push({ name: defaultSheetName(fileName), blocks: [{ kind: 'heading', text: title }] })
  }
  return { title, sheets }
}

// ---- Dòng note do Excel -> Markdown sinh (sheetNotes của converter), gắn lại vào ô ----
// `- 〔コメント B5: 顧客コード〕本文` (list không đánh số -> đoạn `・〔…〕`). Địa chỉ gốc vô nghĩa sau khi bố cục lại nên
// tìm ô theo chữ; dòng đã gắn thành ghi chú Excel thì bỏ (Excel -> Markdown sinh lại đúng dòng đó: round-trip ổn định).
const COMMENT_LINE = /^・〔コメント [A-Z]{1,3}\d{1,7}: ([^〕\n]+)〕([\s\S]+)$/
// `- 〔入力規則 C2:C50〕入力 / 選択`; dạng công thức `=Sheet!$A$1:$A$9` không gắn được.
const VALIDATION_LINE = /^・〔入力規則 [^〕\n]+〕([^\n=][^\n]*)$/
const NOTE_LINE = /^・〔/
/** Excel giới hạn danh sách viết thẳng trong công thức `"a,b"` ở 255 ký tự. */
const MAX_LIST_FORMULA = 255

/** Cột duy nhất của bảng mà mọi ô dữ liệu có chữ đều thuộc `values` (ít nhất một ô); không có / nhiều cột -> -1. */
function listColumn(table: Extract<Block, { kind: 'table' }>, values: Set<string>): number {
  let cols = table.header.length
  for (const r of table.rows) cols = Math.max(cols, r.length)
  let found = -1
  for (let c = 0; c < cols; c++) {
    const texts = table.rows.map((r) => r[c]?.text ?? '').filter((t) => t !== '')
    if (texts.length === 0 || !texts.every((t) => values.has(t))) continue
    if (found >= 0) return -1
    found = c
  }
  return found
}

/**
 * Gắn dòng `〔コメント〕` thành ghi chú của ô bảng / value meta có chữ trùng đúng (duy nhất trong sheet), và dòng
 * `〔入力規則〕` thành danh sách thả xuống của bảng ngay trước nó (chỉ cách bởi các dòng `〔…〕` khác) ở cột duy nhất mà
 * mọi giá trị đều nằm trong danh sách. Không chắc chắn -> giữ nguyên dòng, không đoán.
 */
function attachNotes(blocks: Block[]): Block[] {
  const cells: XCell[] = []
  for (const b of blocks) {
    if (b.kind === 'table') for (const row of [b.header, ...b.rows]) cells.push(...row)
    else if (b.kind === 'meta') cells.push(...b.items.map((i) => i.value))
  }
  const out: Block[] = []
  for (const b of blocks) {
    if (b.kind === 'paragraph' && !b.link && (attachComment(b.text, cells) || attachList(b.text, out))) continue
    out.push(b)
  }
  return out
}

function attachComment(text: string, cells: XCell[]): boolean {
  const m = COMMENT_LINE.exec(text)
  if (!m || m[2].trim() === '') return false
  // Excel -> Markdown ghi chữ của ô trên một dòng (xuống dòng -> khoảng trắng)
  const hits = cells.filter((c) => c.text.replace(/\n/g, ' ') === m[1])
  if (hits.length !== 1) return false
  hits[0].note = hits[0].note === undefined ? m[2] : hits[0].note + '\n' + m[2]
  return true
}

function attachList(text: string, before: Block[]): boolean {
  const m = VALIDATION_LINE.exec(text)
  if (!m) return false
  const values = m[1].split(' / ').map((v) => v.trim()).filter((v) => v !== '')
  // Giá trị có `,`/`"` không viết được trong công thức danh sách
  if (values.length === 0 || values.some((v) => /[,"]/.test(v)) || values.join(',').length > MAX_LIST_FORMULA) return false
  let i = before.length - 1
  while (i >= 0 && before[i].kind === 'paragraph' && NOTE_LINE.test((before[i] as { text: string }).text)) i--
  const table = before[i]
  if (table?.kind !== 'table') return false
  const col = listColumn(table, new Set(values))
  if (col < 0) return false
  const rules = (table.validations ??= [])
  // Cùng cột đã có danh sách giống hệt (dòng lặp) -> coi như đã gắn; khác -> giữ dòng
  const same = rules.find((r) => r.col === col)
  if (same) return same.values.join('\n') === values.join('\n')
  rules.push({ col, values })
  return true
}
