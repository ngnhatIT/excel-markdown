// Tên sheet Excel hợp lệ: bỏ ký tự cấm, <= 31 ký tự, không trùng (không phân biệt hoa/thường).

import type { SheetModel } from './model'

const MAX_SHEET_NAME = 31
// Ký tự Excel cấm trong tên sheet.
const FORBIDDEN = /[[\]:*?/\\]/g
// Dấu nháy đơn ở đầu hoặc cuối tên.
const EDGE_QUOTE = /^'|'$/g

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
  // Cắt xong mới trim và xử lý dấu nháy: phép cắt có thể để lại khoảng trắng hoặc `'` ở cuối.
  let base = cut(raw.replace(FORBIDDEN, '_').trim(), MAX_SHEET_NAME)
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
