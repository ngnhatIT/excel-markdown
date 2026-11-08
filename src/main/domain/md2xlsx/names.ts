// Tên sheet Excel hợp lệ: bỏ ký tự cấm, <= 31 ký tự, không trùng (không phân biệt hoa/thường).

import { dirname, resolve } from 'node:path'
import type { SheetModel } from './model'

const MAX_SHEET_NAME = 31
// Ký tự Excel cấm trong tên sheet.
const FORBIDDEN = /[[\]:*?/\\]/g
// Dấu nháy đơn ở đầu hoặc cuối tên.
const EDGE_QUOTE = /^'|'$/g
// Ký tự cấm của XML 1.0: lọt vào workbook.xml thì exceljs ghi sai hoặc Excel đòi sửa file.
const XML_INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g

/** Cắt còn tối đa `max` đơn vị UTF-16, không để lại nửa cặp surrogate. */
function cut(text: string, max: number): string {
  if (text.length <= max) return text
  const head = text.slice(0, max)
  const last = head.charCodeAt(head.length - 1)
  return last >= 0xd800 && last <= 0xdbff ? head.slice(0, -1) : head
}

/**
 * Biến `raw` thành tên sheet hợp lệ và duy nhất.
 * `used` chứa các tên đã dùng ở dạng chữ thường; hàm tự thêm tên trả về vào `used`.
 */
export function safeSheetName(raw: string, used: Set<string>): string {
  // Bỏ ký tự cấm XML TRƯỚC khi trim/cắt/khử trùng: tên rỗng sau đó thành `Sheet`,
  // hai tên chỉ khác ký tự cấm vẫn được khử trùng.
  // Cắt xong mới trim và xử lý dấu nháy: phép cắt có thể để lại khoảng trắng hoặc `'` ở cuối.
  let base = cut(raw.replace(XML_INVALID, '').replace(FORBIDDEN, '_').trim(), MAX_SHEET_NAME)
    .trim()
    // Excel cấm `'` ở ký tự đầu hoặc cuối tên sheet.
    .replace(EDGE_QUOTE, '_')
  if (base === '') base = 'Sheet'
  // "History" là tên dành riêng của Excel (không phân biệt hoa/thường).
  if (base.toLowerCase() === 'history') base += '_'

  let name = base
  for (let n = 2; used.has(name.toLowerCase()); n++) {
    const suffix = ` (${n})`
    name = cut(base, MAX_SHEET_NAME - suffix.length) + suffix
  }
  used.add(name.toLowerCase())
  return name
}

/** Trả bản sao các sheet với `name` đã hợp lệ và không trùng nhau. */
export function assignSheetNames(sheets: SheetModel[]): SheetModel[] {
  const used = new Set<string>()
  return sheets.map((sheet) => ({ ...sheet, name: safeSheetName(sheet.name, used) }))
}

// Cùng quy tắc với headingSlug của excel/output.ts: anchor của `## tên sheet` khi Excel -> Markdown gộp workbook.
const headingSlug = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')
const EXTERNAL_LINK_RE = /^(?:https?|mailto):/i

/**
 * Đặt tên sheet (assignSheetNames trên toàn bộ file) rồi giải link nội bộ của ô / đoạn văn:
 * `#slug` -> sheet cùng file có tên khớp anchor; `x.md` (tương đối với file chứa link) -> sheet đầu của file đó nếu
 * file nằm trong cùng lần tạo. Giải được -> `'Sheet'!A1` (writer ghi hyperlink nội bộ), không -> bỏ link, giữ chữ.
 * Sửa link tại chỗ trên các block (block do parse vừa tạo, không dùng lại ở nơi khác).
 */
export function nameAndLinkSheets(files: { path: string; sheets: SheetModel[] }[]): SheetModel[] {
  const raw = files.flatMap((f) => f.sheets)
  const named = assignSheetNames(raw)
  let at = 0
  const spans = files.map((f) => {
    const from = at
    at += f.sheets.length
    return { from, to: at, path: resolve(f.path) }
  })
  const target = (href: string, file: number): string | undefined => {
    let h: string
    try {
      h = decodeURIComponent(href)
    } catch {
      return undefined
    }
    let idx: number | undefined
    if (h.startsWith('#')) {
      const want = headingSlug(h.slice(1))
      const { from, to } = spans[file]
      for (let i = from; i < to && idx === undefined; i++) if (want !== '' && headingSlug(raw[i].name) === want) idx = i
    } else {
      const path = resolve(dirname(spans[file].path), h.replace(/#.*$/, ''))
      idx = spans.find((s) => s.path === path && s.to > s.from)?.from
    }
    const name = idx === undefined ? undefined : named[idx].name
    // shortcut: exceljs chỉ nhận link nội bộ dạng /^[^!]+!A1$/ -> tên sheet có `!` thì giữ chữ, nâng khi gặp thật
    return name === undefined || name.includes('!') ? undefined : `'${name.replace(/'/g, "''")}'!A1`
  }
  const fix = (x: { link?: string }, file: number): void => {
    if (x.link === undefined || EXTERNAL_LINK_RE.test(x.link)) return
    const t = target(x.link, file)
    if (t === undefined) delete x.link
    else x.link = t
  }
  files.forEach((f, file) => {
    for (const sheet of f.sheets) {
      for (const b of sheet.blocks) {
        if (b.kind === 'table') for (const row of [b.header, ...b.rows]) row.forEach((c) => fix(c, file))
        else if (b.kind === 'meta') b.items.forEach((i) => fix(i.value, file))
        else if (b.kind === 'paragraph' || b.kind === 'note') fix(b, file)
      }
    }
  })
  return named
}
