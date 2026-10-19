// Markdown -> mô hình sheet (spec §5, §7, §8): marked.lexer rồi đổi từng token cấp ngoài thành Block.
// Chữ trong ô/đoạn luôn lấy qua inlineCell nên đã được gỡ escape, `<br>` -> xuống dòng, bỏ ký hiệu inline.
// Tên sheet trả về là tên thô; khử trùng/ký tự cấm là việc của assignSheetNames.
import { marked, type Tokens } from 'marked'
import type { Block, ParsedFile, SheetModel, XCell } from './model'
import { inlineCell } from './inline'

type Token = Tokens.Generic
type MetaItem = Extract<Block, { kind: 'meta' }>['items'][number]

const BOM = /^﻿/
const BANNER_PREFIX = '基本設計'
const BANNER_SEPARATOR = '：'
const BULLET = '・'
// Sau `**label**` phải là `:` (do Excel -> Markdown sinh ra) hoặc `：` toàn角 (gõ tay); chỉ bỏ
// khoảng trắng thường sau dấu, không bỏ khoảng trắng toàn角 để giữ thụt lề của giá trị.
const META_COLON = /^[:：][ \t]*/
// Khối HTML chỉ là `<br>` (type-7 HTML block, không lọt vào inlineCell) hoặc đúng một comment: không có chữ để hiển thị.
const BR_ONLY = /^<br\s*\/?>$/i
const COMMENT_ONLY = /^<!--(?:(?!-->)[\s\S])*-->$/

/** Chữ hiển thị của token có inline con (paragraph, text, heading); không có thì dùng raw. */
function inlineText(t: Token): string {
  return t.tokens ? inlineCell(t.tokens).text : String(t.raw ?? '').trim()
}

/** Khối HTML không có chữ hiển thị (`<br>` riêng một dòng, comment) -> bỏ; HTML khác giữ nguyên chữ (§6). */
function isBlankHtml(t: Token): boolean {
  const raw = String(t.raw ?? '').trim()
  return BR_ONLY.test(raw) || COMMENT_ONLY.test(raw)
}

/** Các dòng chữ thuần của một token khối, dùng khi gộp vào ô meta hoặc ghi chú. */
function blockLines(t: Token): string[] {
  switch (t.type) {
    case 'space':
      return []
    case 'paragraph':
    case 'text':
    case 'heading':
      return [inlineText(t)]
    case 'code':
      return String(t.text ?? '').split('\n')
    case 'blockquote':
      return (t.tokens ?? []).flatMap(blockLines)
    case 'list':
      return (t.items ?? []).flatMap((item: Token) => (item.tokens ?? []).flatMap(blockLines))
    case 'html':
      return isBlankHtml(t) ? [] : [String(t.raw ?? '').trim()]
    // table, def... -> chữ thuần
    default:
      return [String(t.raw ?? '').trim()]
  }
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
  const extra = blocks.slice(1).flatMap(blockLines)
  const value: XCell = inlineCell(rest)
  const labelText = inlineCell(label.tokens).text
  if (extra.length === 0) return { label: labelText, value }
  // Có dòng thêm: giá trị thành chữ thuần nhiều dòng (không còn là "cả ô là một link")
  const lines = value.text ? [value.text, ...extra] : extra
  return { label: labelText, value: { text: lines.join('\n') } }
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
  // List đánh số: item thường mang số hiển thị (start + vị trí); list không đánh số: `・`
  const start = typeof list.start === 'number' ? list.start : 1
  const items: Token[] = list.items ?? []
  for (const [i, item] of items.entries()) {
    const m = metaItem(item)
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
    out.push({ kind: 'paragraph', text: prefix + (hasText ? inlineText(head) : '') })
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
        rows: (t.rows as Token[][]).map((row) => row.map((c) => inlineCell(c.tokens)))
      })
      return
    case 'blockquote': {
      const text = (t.tokens ?? []).flatMap(blockLines).join('\n')
      out.push(first && text.trimStart().startsWith(BANNER_PREFIX) ? bannerOf(text) : { kind: 'note', text })
      return
    }
    case 'list':
      listBlocks(t, out)
      return
    case 'paragraph':
    case 'text':
      out.push({ kind: 'paragraph', text: inlineText(t) })
      return
    case 'code':
      out.push({ kind: 'code', lines: String(t.text ?? '').split('\n') })
      return
    case 'html':
      if (!isBlankHtml(t)) out.push({ kind: 'paragraph', text: String(t.raw ?? '').trim() })
      return
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
  // Bỏ `space`: không có nghĩa gì với bố cục sheet, và để "phần rỗng" chỉ còn là phần không có token nội dung
  const flow = (marked.lexer(md.replace(BOM, '')) as Token[]).filter((t) => t.type !== 'space')

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
    return { name, blocks }
  })
  return { title, sheets }
}
