// Xử lý yêu cầu Markdown → Excel của worker (thuần Node, test được không cần Electron).
// write.ts (nạp exceljs) chỉ được import động trong handler mdToXlsx: worker preview và
// mọi yêu cầu Excel → Markdown không phải trả giá nạp exceljs.
import { readFile } from 'node:fs/promises'
import { basename, isAbsolute } from 'node:path'
import type { MdInspectResult } from '../../types'
import { friendlyError } from '../errors'
import { isMarkdownPath } from '../guards'
import type { WorkerRequest, WorkerResponse } from '../workerProtocol'
import type { ParsedFile, SheetModel } from './model'
import { assignSheetNames } from './names'
import { parseMarkdownFile } from './parse'

export type MdWorkerRequest = Extract<WorkerRequest, { type: 'mdInspect' | 'mdToXlsx' }>

const BOM = /^\uFEFF/

/** Lỗi đã có thông báo tiếng Việt để hiện nguyên văn cho người dùng. `detail` là lỗi gốc (nếu có) để lấy stack ghi log. */
class MdRequestError extends Error {
  constructor(
    message: string,
    readonly detail?: unknown
  ) {
    super(message)
    this.name = 'MdRequestError'
  }
}

/** Ký tự thay thế mà bộ giải mã UTF-8 sinh ra cho byte không hợp lệ. */
const REPLACEMENT_CHAR = '\uFFFD'

/**
 * Đọc UTF-8 một file Markdown; lỗi đọc nêu rõ tên file. File không phải UTF-8 (vd Shift_JIS) bị từ chối thay
 * vì ghi chữ mojibake vào Excel: giải mã ra U+FFFD thì coi là không phải UTF-8.
 */
async function readMarkdown(path: string): Promise<string> {
  let text: string
  try {
    text = await readFile(path, 'utf-8')
  } catch (err) {
    throw new MdRequestError(`Không đọc được file: ${basename(path)} — ${friendlyError(err)}`, err)
  }
  if (text.includes(REPLACEMENT_CHAR)) {
    throw new MdRequestError(`File không phải UTF-8: ${basename(path)}. Hãy lưu lại file dạng UTF-8 rồi thử lại.`)
  }
  return text
}

async function readAndParse(path: string): Promise<{ text: string; parsed: ParsedFile }> {
  const text = await readMarkdown(path)
  return { text, parsed: parseMarkdownFile(text, basename(path)) }
}

async function inspect(path: string): Promise<MdInspectResult> {
  if (!isMarkdownPath(path)) throw new MdRequestError('Chỉ đọc được file Markdown (.md).')
  const { text, parsed } = await readAndParse(path)
  return {
    title: parsed.title,
    sheets: assignSheetNames(parsed.sheets).map((s) => s.name),
    // BOM đầu file làm `# tiêu đề` không còn là heading khi render preview
    markdown: text.replace(BOM, ''),
  }
}

async function toXlsx(files: string[], outPath: string): Promise<{ outPath: string; sheets: string[] }> {
  if (!Array.isArray(files) || !files.every(isMarkdownPath)) {
    throw new MdRequestError('Chỉ đọc được file Markdown (.md).')
  }
  if (typeof outPath !== 'string' || !isAbsolute(outPath) || !/\.xlsx$/i.test(outPath)) {
    throw new MdRequestError('Đường dẫn file Excel đầu ra không hợp lệ (cần đuôi .xlsx).')
  }

  // Đọc/parse lần lượt theo thứ tự danh sách; một file lỗi thì dừng ngay, chưa ghi gì.
  const all: SheetModel[] = []
  for (const path of files) all.push(...(await readAndParse(path)).parsed.sheets)
  // Khử trùng tên trên toàn bộ sheet (trùng tên giữa các file cũng thành `Tên (2)`)
  const sheets = assignSheetNames(all)
  if (sheets.length === 0) throw new MdRequestError('Các file Markdown không có nội dung để tạo sheet.')

  const { buildWorkbook, saveWorkbook } = await import('./write')
  try {
    await saveWorkbook(buildWorkbook(sheets), outPath)
  } catch (err) {
    throw new MdRequestError(friendlyError(err, 'write'), err)
  }
  return { outPath, sheets: sheets.map((s) => s.name) }
}

export async function handleMdRequest(req: MdWorkerRequest): Promise<WorkerResponse> {
  try {
    switch (req.type) {
      case 'mdInspect':
        return { id: req.id, ok: true, data: await inspect(req.path) }
      case 'mdToXlsx':
        return { id: req.id, ok: true, data: await toXlsx(req.files, req.outPath) }
      default:
        throw new Error('Yêu cầu không hợp lệ: ' + String((req as { type?: unknown }).type))
    }
  } catch (err) {
    // Lỗi đã dịch thì chỉ gửi stack của lỗi gốc (nếu có); lỗi bất ngờ gửi cả message lẫn stack để main ghi log
    const origin = err instanceof MdRequestError ? err.detail : err
    const stack = origin instanceof Error ? origin.stack : undefined
    return {
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      ...(stack ? { stack } : {}),
    }
  }
}
