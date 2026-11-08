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
import type { SheetResult } from '../../domain/excel/output'

// SheetJS >= 0.20: bản ESM (vitest dùng) không tự nạp `fs`, readFile/writeFile sẽ lỗi
// "Cannot access file". Bản CJS (worker build) không cần nhưng gọi cũng vô hại.
XLSX.set_fs(fs)

/** Đọc + parse file Excel (một lần cho cả liệt kê sheet, preview và convert). */
export function readWorkbook(filePath: string): WorkBook {
  // bookFiles: giữ part gốc để đọc lớp vẽ (ảnh, shape) — xem domain/excel/drawings.ts
  const wb = XLSX.readFile(filePath, { cellDates: false, bookFiles: true })
  const files = (wb as { files?: Record<string, unknown> }).files
  // Workbook nằm trong cache của worker: chỉ giữ part lớp vẽ cần, bỏ XML sheet (có thể rất lớn)
  if (files) for (const k of Object.keys(files)) if (!KEEP_PART.test(k)) delete files[k]
  return wb
}

const KEEP_PART = /^xl\/(?:_rels\/workbook\.xml\.rels|worksheets\/_rels\/|drawings\/|media\/)/

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
