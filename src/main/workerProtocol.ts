/* Giao thức main <-> worker đọc Excel (utilityProcess). Chỉ chứa type:
 * main import file này mà không kéo SheetJS vào main process.
 */
import type { ConvertOptions } from '../types'

export type WorkerRequest =
  | { id: number; type: 'listSheets'; path: string; skipDelSheets: boolean }
  | { id: number; type: 'preview'; path: string; sheet: string; options: ConvertOptions }
  | { id: number; type: 'convert'; path: string; sheets: string[]; options: ConvertOptions }

export type WorkerResponse =
  | { id: number; ok: true; data: unknown }
  | { id: number; ok: false; error: string; stack?: string }

/** Hậu tố file tạm khi ghi .xlsx (Markdown → Excel). main import hằng này để dọn khi Hủy;
 * đặt ở đây (không phải md2xlsx/write.ts) để main không kéo exceljs vào process. */
export const PARTIAL_SUFFIX = '.partial'

/** Omit phân phối trên union (Omit thường làm mất discriminant `type`). */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
