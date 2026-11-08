/* Luồng convert Excel → Markdown của IPC excel:convert, thuần (worker, hộp thoại, tiến độ được truyền vào)
 * để test được không cần Electron. Kiểm tra payload và cờ "đang convert" nằm ở convert.ts.
 * Lỗi từng file nằm trong dữ liệu trả về (renderer hiện nguyên văn) nên dịch ở đây theo ngôn ngữ giao diện;
 * lỗi cả lần convert là mã `E_…` (renderer dịch).
 */
import { access, constants, mkdir } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { ConvertFileSpec, ConvertOptions, ConvertResultItem, OutputMode } from '../../../../shared/types'
import { CancelledError } from '../../../application/ports/workerProtocol'
import { errText } from '../../../domain/errors'
import { plannedMdFileNames, workbookMdFiles, type SheetResult } from '../../../domain/excel/output'
import { writeMdFiles } from '../../outbound/mdOutput'
import { mErr, mt } from '../../../i18nMain'

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
  error: mt('convert.cancelled'),
})

const baseOf = (p: string): string => basename(p, extname(p))

/** Cắt Markdown preview quá `max` ký tự (tại đầu dòng gần nhất) và thêm ghi chú dạng blockquote.
 * shortcut: chỗ cắt có thể nằm giữa bảng / khối code (ghi chú khi đó dính vào khối), đủ cho preview. */
export function capPreview(md: string, max: number, note: (shown: number, total: number) => string): string {
  if (md.length <= max) return md
  const nl = md.lastIndexOf('\n', max)
  const cut = nl > max / 2 ? nl : max
  return md.slice(0, cut) + '\n\n> ' + note(cut, md.length) + '\n'
}

/** Convert từng file, ghi .md vào outDir. Lỗi của một file không dừng các file sau;
 * chỉ lỗi thư mục xuất mới trả `ok: false`. */
export async function runExcelConvert(
  { files, outDir, options, outputMode }: ExcelConvertPayload,
  deps: ExcelConvertDeps
): Promise<{ ok: true; data: ConvertResultItem[] } | { ok: false; error: string }> {
  const perWorkbook = outputMode === 'per-workbook'
  if (!(await ensureWritableDir(outDir))) return { ok: false, error: 'E_OUTDIR_NOT_WRITABLE|' + outDir }

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
        ? mt('overwrite.one', { name: existing[0] })
        : mt('overwrite.many', { n: existing.length, name: existing[0] })
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
      push({ fileName: base, ok: false, filesWritten: [], error: mt('convert.unreadable', { path: spec.path }) })
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
          ? mErr(err)
          : /EBUSY|EPERM|EACCES/.test(String(err))
            ? mt('convert.mdLocked')
            : mt('convert.mdWriteFailed', { err: errText(err) }),
      })
    }
  }
  return { ok: true, data: results }
}
