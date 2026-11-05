/* Xử lý một yêu cầu của worker (thuần, test được không cần Electron). */
import { basename } from 'node:path'
import {
  convertSheetInWorkbook,
  convertSheetsInWorkbook,
  extractSheetMeta,
  listSheetsInWorkbook,
  type WorkBook,
} from './converter'
import { frontMatter } from './output'
import type { WorkerRequest, WorkerResponse } from './workerProtocol'

export interface WorkbookSource {
  get(path: string): WorkBook
}

export function handleRequest(src: WorkbookSource, req: WorkerRequest): WorkerResponse {
  try {
    switch (req.type) {
      case 'listSheets':
        return { id: req.id, ok: true, data: listSheetsInWorkbook(src.get(req.path), req.skipDelSheets) }
      case 'preview': {
        const wb = src.get(req.path)
        const md = convertSheetInWorkbook(wb, req.sheet, req.options)
        if (req.options.frontMatter && md.trim() !== '') {
          const extra = extractSheetMeta(wb.Sheets[req.sheet], req.sheet)
          const fm = frontMatter({ source: basename(req.path), sheet: req.sheet, ...extra })
          return { id: req.id, ok: true, data: fm + md }
        }
        return { id: req.id, ok: true, data: md }
      }
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
