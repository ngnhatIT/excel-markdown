// Xử lý yêu cầu Markdown → Excel của worker (thuần Node, test được không cần Electron).
// write.ts (nạp exceljs) chỉ được import động trong handler mdToXlsx: worker preview và
// mọi yêu cầu Excel → Markdown không phải trả giá nạp exceljs.
import { readFile, realpath, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import type { MdInspectResult } from '../../../../shared/types'
import { friendlyError } from '../../../domain/errors'
import { isMarkdownPath } from '../../../domain/guards'
import type { WorkerRequest, WorkerResponse } from '../../../application/ports/workerProtocol'
import { imageInfo } from '../../../domain/md2xlsx/image'
import type { ImageData, ParsedFile, SheetModel } from '../../../domain/md2xlsx/model'
import { assignSheetNames, nameAndLinkSheets } from '../../../domain/md2xlsx/names'
import { parseMarkdownFile } from '../../../domain/md2xlsx/parse'

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

/** Ảnh nhúng: chỉ PNG/JPEG (đuôi file và nội dung), mỗi ảnh ≤ 10 MB, tổng ≤ 100 MB mỗi lần tạo. */
const IMAGE_EXT = /\.(?:png|jpe?g)$/i
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_TOTAL_IMAGE_BYTES = 100 * 1024 * 1024

/**
 * Đọc ảnh `![alt](src)` của Markdown (không tin cậy): `src` phải là đường dẫn tương đối nằm TRONG thư mục chứa file
 * .md (sau khi giải symlink). Scheme (`x2m-asset:`, `file:`, `C:`), đường dẫn tuyệt đối, thoát ra ngoài bằng `..`,
 * đuôi / nội dung không phải PNG/JPEG, quá cỡ, không đọc được -> null (writer ghi chữ alt).
 */
async function readImage(src: string, dir: string, budget: { left: number }): Promise<ImageData | null> {
  let rel: string
  try {
    rel = decodeURIComponent(src)
  } catch {
    return null
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(rel) || isAbsolute(rel) || /^[\\/]/.test(rel) || rel.includes('\0') || !IMAGE_EXT.test(rel)) {
    return null
  }
  try {
    const file = await realpath(resolve(dir, rel))
    const back = relative(dir, file)
    if (back === '' || back === '..' || back.startsWith('..' + sep) || isAbsolute(back)) return null
    const st = await stat(file)
    if (!st.isFile() || st.size > MAX_IMAGE_BYTES || st.size > budget.left) return null
    const data = await readFile(file)
    const info = imageInfo(data)
    if (!info) return null
    budget.left -= data.length
    return { data, ...info }
  } catch {
    return null
  }
}

/** Điền `image` cho các block ảnh của một file .md (đường dẫn ảnh tương đối với thư mục của file). */
async function loadImages(sheets: SheetModel[], mdPath: string, budget: { left: number }): Promise<void> {
  const dir = await realpath(dirname(mdPath)).catch(() => null)
  if (dir === null) return
  for (const sheet of sheets) {
    for (const b of sheet.blocks) {
      if (b.kind !== 'image') continue
      const image = await readImage(b.src, dir, budget)
      if (image) b.image = image
    }
  }
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

  // Đọc/parse lần lượt theo thứ tự danh sách; một file lỗi (cả file không có nội dung) thì dừng ngay, chưa ghi gì.
  const parsed: { path: string; sheets: SheetModel[] }[] = []
  const budget = { left: MAX_TOTAL_IMAGE_BYTES }
  for (const path of files) {
    const { sheets } = (await readAndParse(path)).parsed
    if (sheets.length === 0) {
      throw new MdRequestError(`File không có nội dung: ${basename(path)}. Hãy bỏ file khỏi danh sách hoặc thêm nội dung rồi thử lại.`)
    }
    await loadImages(sheets, path, budget)
    parsed.push({ path, sheets })
  }
  // Khử trùng tên trên toàn bộ sheet (trùng tên giữa các file cũng thành `Tên (2)`), giải link sang sheet khác
  const sheets = nameAndLinkSheets(parsed)
  if (sheets.length === 0) throw new MdRequestError('Các file Markdown không có nội dung để tạo sheet.')

  const { buildWorkbook } = await import('../../../domain/md2xlsx/write')
  const { saveWorkbook } = await import('../../outbound/xlsxWriter')
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
