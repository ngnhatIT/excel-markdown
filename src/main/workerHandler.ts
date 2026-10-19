/* Xử lý một yêu cầu của worker (thuần, test được không cần Electron). */
import { convertSheetInWorkbook, convertSheetsInWorkbook, listSheetsInWorkbook, type WorkBook } from './converter'
import type { WorkerRequest, WorkerResponse } from './workerProtocol'

export interface WorkbookSource {
  get(path: string): WorkBook
}

export function handleRequest(src: WorkbookSource, req: WorkerRequest): WorkerResponse {
  try {
    switch (req.type) {
      case 'listSheets':
        return { id: req.id, ok: true, data: listSheetsInWorkbook(src.get(req.path), req.skipDelSheets) }
      case 'preview':
        return { id: req.id, ok: true, data: convertSheetInWorkbook(src.get(req.path), req.sheet, req.options) }
      case 'convert':
        return { id: req.id, ok: true, data: convertSheetsInWorkbook(src.get(req.path), req.sheets, req.options) }
      default:
        throw new Error('Yêu cầu không hợp lệ: ' + String((req as { type?: unknown }).type))
    }
  } catch (err) {
    return {
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    }
  }
}
