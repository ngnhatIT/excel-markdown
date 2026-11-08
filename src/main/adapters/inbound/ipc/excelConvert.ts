/* Luồng convert Excel → Markdown của IPC excel:convert, thuần (worker, hộp thoại, tiến độ được truyền vào)
 * để test được không cần Electron. Kiểm tra payload và cờ "đang convert" nằm ở convert.ts.
 */
import { access, constants, mkdir } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { ConvertFileSpec, ConvertOptions, ConvertResultItem, OutputMode } from '../../../../shared/types'
import { CancelledError } from '../../../application/ports/workerProtocol'
import { errText, friendlyError } from '../../../domain/errors'
import { plannedMdFileNames, workbookMdFiles, type SheetResult } from '../../../domain/excel/output'
import { writeMdFiles } from '../../outbound/mdOutput'

/** Đường dẫn truy cập được với quyền `mode` (mặc định: tồn tại). */
export const canAccess = (p: string, mode: number = constants.F_OK): Promise<boolean> =>
  access(p, mode).then(
    () => true,
    () => false
  )

/** Tạo thư mục xuất (nếu chưa có) và kiểm quyền ghi; false nếu không ghi được. */
export const ensureWritableDir = (dir: string): Promise<boolean> =>
  mkdir(dir, { recursive: true }).then(
    () => canAccess(dir, constants.W_OK),
    () => false
  )

export interface ExcelConvertPayload {
  files: ConvertFileSpec[]
  outDir: string
  options: ConvertOptions
  outputMode: OutputMode
}

export interface ExcelConvertDeps {
  /** Đọc + convert các sheet của một file (worker convert); ném CancelledError khi bị Hủy. */
  convert(path: string, sheets: string[], options: ConvertOptions): Promise<SheetResult[]>
  /** Hỏi Ghi đè / Hủy; true = ghi đè. */
  confirmOverwrite(message: string): Promise<boolean>
  /** Người dùng đã bấm Hủy. */
  isCancelled(): boolean
  onProgress(p: { done: number; total: number }): void
  logError(scope: string, err: unknown): void
}

const cancelledItem = (fileName: string): ConvertResultItem => ({
  fileName,
  ok: false,
  cancelled: true,
  filesWritten: [],
  error: 'Đã hủy',
})

const baseOf = (p: string): string => basename(p, extname(p))

/** Convert từng file, ghi .md vào outDir. Lỗi của một file không dừng các file sau;
 * chỉ lỗi thư mục xuất mới trả `ok: false`. */
export async function runExcelConvert(
  { files, outDir, options, outputMode }: ExcelConvertPayload,
  deps: ExcelConvertDeps
): Promise<{ ok: true; data: ConvertResultItem[] } | { ok: false; error: string }> {
  const perWorkbook = outputMode === 'per-workbook'
  if (!(await ensureWritableDir(outDir))) return { ok: false, error: 'Không ghi được vào thư mục: ' + outDir }

  // File .md đích đã có (có thể người dùng đã sửa tay): hỏi một lần trước khi ghi đè, như Markdown → Excel.
  const planned = plannedMdFileNames(
    files.map((f) => ({ base: baseOf(f.path), sheets: f.sheets })),
    perWorkbook
  )
  const existing = (await Promise.all(planned.map(async (f) => ((await canAccess(join(outDir, f))) ? f : null)))).filter(
    (f): f is string => f !== null
  )
  if (
    existing.length > 0 &&
    !(await deps.confirmOverwrite(
      existing.length === 1
        ? `File ${existing[0]} đã tồn tại. Ghi đè?`
        : `${existing.length} file .md đã có trong thư mục xuất (vd ${existing[0]}). Ghi đè?`
    ))
  ) {
    return { ok: true, data: files.map((f) => cancelledItem(baseOf(f.path))) }
  }

  const results: ConvertResultItem[] = []
  const usedNames = new Set<string>()
  // Mỗi file (xong, lỗi hay bị hủy) đều tính vào tiến độ để thanh tiến độ luôn chạy tới cuối
  const push = (item: ConvertResultItem): void => {
    results.push(item)
    deps.onProgress({ done: results.length, total: files.length })
  }
  for (const spec of files) {
    const base = baseOf(spec.path)
    if (deps.isCancelled()) {
      push(cancelledItem(base))
      continue
    }
    if (!(await canAccess(spec.path, constants.R_OK))) {
      push({ fileName: base, ok: false, filesWritten: [], error: 'File không tồn tại hoặc không đọc được: ' + spec.path })
      continue
    }
    // Ghi lỗi giữa chừng (vd file .md đang bị khóa): báo đúng các file đã ghi và lỗi là lỗi ghi
    const written: string[] = []
    let writing = false
    try {
      const sheets = await deps.convert(spec.path, spec.sheets, options)
      writing = true
      const out = workbookMdFiles(base, basename(spec.path), sheets, options, perWorkbook, usedNames)
      await writeMdFiles(outDir, out, (name) => written.push(name))
      push({ fileName: base, ok: true, filesWritten: written })
    } catch (err) {
      if (err instanceof CancelledError) {
        push(cancelledItem(base))
        continue
      }
      deps.logError('excel:convert', err)
      push({
        fileName: base,
        ok: false,
        filesWritten: written,
        error: !writing
          ? friendlyError(err)
          : /EBUSY|EPERM|EACCES/.test(String(err))
            ? 'Không ghi được file .md: file đang bị chương trình khác khóa hoặc không có quyền ghi.'
            : 'Không ghi được file .md: ' + errText(err),
      })
    }
  }
  return { ok: true, data: results }
}
