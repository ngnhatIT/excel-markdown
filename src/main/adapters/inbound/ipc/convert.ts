/* IPC hai chiều chuyển đổi: Excel → Markdown (excel:*) và Markdown → Excel (md:*).
 * Hai chiều dùng chung worker convert, cờ `convertRunning` (mỗi lúc chỉ một lần convert) và nút Hủy (excel:cancel).
 *
 * Đọc Excel chạy trong utilityProcess (out/main/worker.js), main không nạp SheetJS / exceljs.
 * Hai worker: preview không phải chờ convert hàng loạt, và Hủy convert chỉ kill worker convert.
 * Worker preview cache 3 workbook / 150 MB file nguồn (đổi sheet không parse lại); worker convert đọc mỗi file một lần nên chỉ giữ 1.
 * Lỗi trả về renderer là mã `E_…` (renderer dịch); hộp thoại ghi đè theo ngôn ngữ giao diện (i18nMain).
 */
import { BrowserWindow, dialog, ipcMain, type MessageBoxOptions, type WebContents } from 'electron'
import { rm } from 'node:fs/promises'
import { basename, isAbsolute, join } from 'node:path'
import type { ConvertOptions, MdConvertResult, MdInspectResult } from '../../../../shared/types'
import { CancelledError, PARTIAL_SUFFIX } from '../../../application/ports/workerProtocol'
import { errorCode, errText } from '../../../domain/errors'
import { safeFileName, type SheetResult } from '../../../domain/excel/output'
import { isExcelPath, isMarkdownPath } from '../../../domain/guards'
import { ConverterWorker } from '../../outbound/converterWorker'
import { logError } from '../../outbound/store'
import { mt } from '../../../i18nMain'
import { canAccess, capPreview, ensureWritableDir, runExcelConvert, type ExcelConvertPayload } from './excelConvert'

// Mã lỗi, renderer dịch (i18n/errors.ts)
const NOT_EXCEL = 'E_NOT_EXCEL'
const NOT_MD = 'E_NOT_MD'
const BUSY = 'E_BUSY'

/** Markdown preview gửi sang renderer tối đa (ký tự): sheet khổng lồ không làm treo khung xem. */
const PREVIEW_MAX_CHARS = 2_000_000

/** Hộp thoại `Ghi đè` / `Hủy` (mặc định Hủy); true = ghi đè. */
async function confirmOverwrite(sender: WebContents, message: string): Promise<boolean> {
  const box: MessageBoxOptions = { type: 'question', buttons: [mt('overwrite.yes'), mt('common.cancel')], defaultId: 1, cancelId: 1, message }
  const win = BrowserWindow.fromWebContents(sender)
  const { response } = await (win ? dialog.showMessageBox(win, box) : dialog.showMessageBox(box))
  return response === 0
}

export interface ConvertIpc {
  /** Khởi động sẵn worker preview để file đầu tiên mở nhanh. */
  warmUp(): void
}

export function registerConvertIpc(workerEntry: string): ConvertIpc {
  // Preview có giới hạn giờ: một file treo parser không được chặn mọi preview sau nó
  const previewWorker = new ConverterWorker(workerEntry, ['--cache=3', '--cache-mb=150'], 'x2m-preview', 120_000)
  const convertWorker = new ConverterWorker(workerEntry, ['--cache=1'], 'x2m-convert')
  let convertRunning = false
  let convertCancelRequested = false

  /* ---------------------------- Excel → Markdown ---------------------------- */

  ipcMain.handle('excel:listSheets', async (_e, filePath: unknown, skipDelSheets: unknown) => {
    if (!isExcelPath(filePath)) return { ok: false, error: NOT_EXCEL }
    try {
      const sheets = await previewWorker.request({ type: 'listSheets', path: filePath as string, skipDelSheets: skipDelSheets === true })
      return { ok: true, data: sheets }
    } catch (err) {
      void logError('excel:listSheets', err)
      return { ok: false, error: errorCode(err) }
    }
  })

  ipcMain.handle('excel:preview', async (_e, filePath: unknown, sheetName: unknown, options: unknown) => {
    if (!isExcelPath(filePath)) return { ok: false, error: NOT_EXCEL }
    if (typeof sheetName !== 'string' || sheetName.length > 255 || !options || typeof options !== 'object' || Array.isArray(options)) {
      return { ok: false, error: 'E_BAD_REQUEST' }
    }
    try {
      const md = await previewWorker.request<string>({
        type: 'preview',
        path: filePath as string,
        sheet: sheetName,
        options: options as ConvertOptions,
      })
      return {
        ok: true,
        data: capPreview(md, PREVIEW_MAX_CHARS, (shown, total) => mt('preview.truncated', { shown, total })),
      }
    } catch (err) {
      void logError('excel:preview', err)
      return { ok: false, error: errorCode(err) }
    }
  })

  ipcMain.handle('excel:convert', async (e, payload: ExcelConvertPayload) => {
    if (
      !Array.isArray(payload?.files) ||
      !payload.files.every((f) => isExcelPath(f?.path) && Array.isArray(f.sheets)) ||
      typeof payload.outDir !== 'string' ||
      !isAbsolute(payload.outDir)
    ) {
      return { ok: false, error: NOT_EXCEL }
    }
    if (convertRunning) return { ok: false, error: BUSY }
    convertRunning = true
    convertCancelRequested = false
    try {
      return await runExcelConvert(payload, {
        convert: (path, sheets, options) => convertWorker.request<SheetResult[]>({ type: 'convert', path, sheets, options }),
        confirmOverwrite: (message) => confirmOverwrite(e.sender, message),
        isCancelled: () => convertCancelRequested,
        onProgress: (p) => {
          if (!e.sender.isDestroyed()) e.sender.send('excel:progress', p)
        },
        logError: (scope, err) => void logError(scope, err),
      })
    } catch (err) {
      return { ok: false, error: errText(err) }
    } finally {
      convertRunning = false
      convertCancelRequested = false
    }
  })

  /** Hủy convert đang chạy (cả hai chiều): file chưa xong trả về `cancelled: true`; file đã ghi giữ nguyên. */
  ipcMain.handle('excel:cancel', () => {
    if (convertRunning) {
      convertCancelRequested = true
      convertWorker.cancel()
    }
    return { ok: true, data: null }
  })

  /* ---------------------------- Markdown → Excel ---------------------------- */

  /** Đọc nhanh một file Markdown: tiêu đề, tên sheet sẽ tạo, nội dung để preview.
   * Chạy ở worker preview (renderer không đọc filesystem; chỉ nhận file .md). */
  ipcMain.handle('md:inspect', async (_e, path: unknown) => {
    if (!isMarkdownPath(path)) return { ok: false, error: NOT_MD }
    try {
      const result = await previewWorker.request<MdInspectResult>({ type: 'mdInspect', path: path as string })
      return { ok: true, data: result }
    } catch (err) {
      void logError('md:inspect', err)
      // Worker đã dịch lỗi sang tiếng Việt (kèm tên file) nên trả nguyên văn
      return { ok: false, error: errText(err) }
    }
  })

  /** Ghép các file .md thành một workbook .xlsx trong `outDir`. File đích đã có thì hỏi ghi đè;
   * worker ghi `.partial` rồi đổi tên nên Hủy/lỗi không để lại .xlsx dở. */
  ipcMain.handle('md:convert', async (e, payload: { files: string[]; outDir: string; fileName: string }) => {
    if (!Array.isArray(payload?.files) || !payload.files.every(isMarkdownPath)) return { ok: false, error: NOT_MD }
    if (typeof payload.outDir !== 'string' || !isAbsolute(payload.outDir) || typeof payload.fileName !== 'string') {
      return { ok: false, error: 'E_BAD_OUTPUT' }
    }
    if (convertRunning) return { ok: false, error: BUSY }
    convertRunning = true
    convertCancelRequested = false
    const outPath = join(payload.outDir, safeFileName(payload.fileName.replace(/\.xlsx$/i, '')) + '.xlsx')
    const result = (r: MdConvertResult): { ok: true; data: MdConvertResult } => ({ ok: true, data: r })
    try {
      if (!(await ensureWritableDir(payload.outDir))) return { ok: false, error: 'E_OUTDIR_NOT_WRITABLE|' + payload.outDir }
      if ((await canAccess(outPath)) && !(await confirmOverwrite(e.sender, mt('overwrite.one', { name: basename(outPath) })))) {
        return result({ status: 'declined' })
      }
      // Hủy bấm trước khi worker khởi động (lúc tạo thư mục / chờ hộp thoại): cancel() chưa có gì để kill
      if (convertCancelRequested) return result({ status: 'cancelled' })
      const written = await convertWorker.request<{ outPath: string; sheets: string[] }>({
        type: 'mdToXlsx',
        files: payload.files,
        outPath,
      })
      return result({ status: 'done', outPath: written.outPath, sheets: written.sheets })
    } catch (err) {
      // Worker bị kill giữa chừng (Hủy) hoặc ghi lỗi: không để lại .partial (file đích cũ, nếu có, còn nguyên).
      // Windows có thể còn giữ handle vài chục ms sau khi process thoát nên thử lại.
      await rm(outPath + PARTIAL_SUFFIX, { force: true, maxRetries: 5, retryDelay: 100 }).catch(() => undefined)
      if (err instanceof CancelledError) return result({ status: 'cancelled' })
      void logError('md:convert', err)
      // Worker đã dịch lỗi sang tiếng Việt (EBUSY khi file đang mở trong Excel, tên file lỗi...)
      return { ok: false, error: errText(err) }
    } finally {
      convertRunning = false
      convertCancelRequested = false
    }
  })

  return { warmUp: () => previewWorker.warmUp() }
}
