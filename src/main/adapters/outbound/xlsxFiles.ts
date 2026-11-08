/* Adapter đọc file Excel từ đĩa bằng SheetJS. Logic chuyển đổi thuần nằm ở domain/excel/converter.ts. */
import * as fs from 'node:fs'
import * as XLSX from 'xlsx'
import type { ConvertOptions } from '../../../shared/types'
import {
  convertSheetInWorkbook,
  convertSheetsInWorkbook,
  listSheetsInWorkbook,
  type WorkBook,
} from '../../domain/excel/converter'
import { attachCellExtras } from '../../domain/excel/cellExtras'
import type { SheetResult } from '../../domain/excel/output'
import { NOT_EXCEL_MESSAGE } from '../../domain/errors'

// SheetJS >= 0.20: bản ESM (vitest dùng) không tự nạp `fs`, readFile/writeFile sẽ lỗi
// "Cannot access file". Bản CJS (worker build) không cần nhưng gọi cũng vô hại.
XLSX.set_fs(fs)

/** Đọc + parse file Excel (một lần cho cả liệt kê sheet, preview và convert). */
export function readWorkbook(filePath: string): WorkBook {
  // SheetJS đọc được cả file text/CSV: file đổi đuôi .xlsx sẽ thành "Sheet1" chứa rác. Kiểm chữ ký trước.
  if (!looksLikeExcel(readHead(filePath), filePath)) throw new Error(NOT_EXCEL_MESSAGE)
  let wb: WorkBook
  try {
    // bookFiles: giữ part gốc để đọc lớp vẽ (ảnh, shape) — xem domain/excel/drawings.ts
    wb = XLSX.readFile(filePath, { cellDates: false, bookFiles: true })
  } catch (err) {
    // Lỗi fs (có code) và file có mật khẩu giữ nguyên để friendlyError dịch; còn lại là lỗi parse của file hỏng
    if ((err as { code?: unknown } | null)?.code !== undefined || /password-protected/i.test(String((err as Error)?.message))) throw err
    throw new Error(NOT_EXCEL_MESSAGE, { cause: err })
  }
  const files = (wb as { files?: Record<string, unknown> }).files
  // Gạch ngang cả ô + 入力規則: SheetJS không đọc, lấy từ XML sheet trước khi bỏ part
  attachCellExtras(wb)
  // Workbook nằm trong cache của worker: chỉ giữ part lớp vẽ cần, bỏ XML sheet (có thể rất lớn)
  if (files) for (const k of Object.keys(files)) if (!KEEP_PART.test(k)) delete files[k]
  return wb
}

/** 1 KB đầu file (đủ cho BOM + khoảng trắng trước `<` của file XML/HTML). */
function readHead(filePath: string): Buffer {
  const fd = fs.openSync(filePath, 'r')
  try {
    const buf = Buffer.alloc(1024)
    return buf.subarray(0, fs.readSync(fd, buf, 0, buf.length, 0))
  } finally {
    fs.closeSync(fd)
  }
}

const ZIP_SIG = Buffer.from([0x50, 0x4b, 0x03, 0x04])
const CFB_SIG = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])

/** Chữ ký file Excel: .xlsx/.xlsm/.xltx/.xltm là zip, hoặc CFB (file có mật khẩu bọc trong CFB);
 * .xls là CFB, zip (xlsx đổi đuôi), hoặc XML/HTML bắt đầu bằng `<` (Excel 2003 XML, HTML lưu thành .xls).
 * shortcut: không nhận .xls BIFF2–4 trần (Excel 2.x–4.x, không bọc CFB), thêm khi gặp thật. */
export function looksLikeExcel(head: Buffer, filePath: string): boolean {
  if (head.subarray(0, 4).equals(ZIP_SIG) || head.subarray(0, 8).equals(CFB_SIG)) return true
  if (/\.x(lsx|lsm|ltx|ltm)$/i.test(filePath)) return false
  const xmlStart = /^\uFEFF?\s*</
  return xmlStart.test(head.toString('utf-8')) || xmlStart.test(head.toString('utf16le')) // XML UTF-16 (BOM FF FE)
}

const KEEP_PART = /^xl\/(?:_rels\/workbook\.xml\.rels|worksheets\/_rels\/|drawings\/|media\/|charts\/[^/]+\.xml$)/

/** Liệt kê sheet của file Excel. Ném lỗi nếu file không đọc được. */
export function listSheets(filePath: string, skipDelSheets: boolean): ReturnType<typeof listSheetsInWorkbook> {
  return listSheetsInWorkbook(readWorkbook(filePath), skipDelSheets)
}

/** Convert một sheet theo tên. Ném lỗi nếu không tìm thấy sheet. */
export function convertSheet(filePath: string, sheetName: string, opts: ConvertOptions): string {
  return convertSheetInWorkbook(readWorkbook(filePath), sheetName, opts)
}

/** Convert nhiều sheet của một file Excel (xem convertSheetsInWorkbook). */
export function convertWorkbook(filePath: string, sheetNames: string[], opts: ConvertOptions): SheetResult[] {
  return convertSheetsInWorkbook(readWorkbook(filePath), sheetNames, opts)
}
