/* Giao thức main <-> worker đọc Excel (utilityProcess). Chỉ chứa type và hằng / lỗi nhỏ:
 * main import file này mà không kéo SheetJS vào main process.
 */
import type { ConvertOptions } from '../../../shared/types'

export type WorkerRequest =
  | { id: number; type: 'listSheets'; path: string; skipDelSheets: boolean }
  | { id: number; type: 'preview'; path: string; sheet: string; options: ConvertOptions }
  | { id: number; type: 'convert'; path: string; sheets: string[]; options: ConvertOptions }
  // Markdown cả workbook để so sánh 新旧 (data: string)
  | { id: number; type: 'workbookMarkdown'; path: string }
  // Markdown → Excel (xử lý bởi md2xlsx/mdHandler.ts)
  | { id: number; type: 'mdInspect'; path: string } // data: MdInspectResult
  | { id: number; type: 'mdToXlsx'; files: string[]; outPath: string } // data: { outPath; sheets }

export type WorkerResponse =
  | { id: number; ok: true; data: unknown }
  | { id: number; ok: false; error: string; stack?: string }

/** Hậu tố file tạm khi ghi .xlsx (Markdown → Excel). main import hằng này để dọn khi Hủy;
 * đặt ở đây (không phải md2xlsx/write.ts) để main không kéo exceljs vào process. */
export const PARTIAL_SUFFIX = '.partial'

/** Yêu cầu tới worker bị hủy (process bị kill khi người dùng bấm Hủy). */
export class CancelledError extends Error {
  constructor() {
    super('Đã hủy')
    this.name = 'CancelledError'
  }
}

/** Omit phân phối trên union (Omit thường làm mất discriminant `type`). */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
