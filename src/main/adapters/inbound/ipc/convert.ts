/* IPC Excel → Markdown (excel:*): danh sách sheet, preview, convert, Hủy.
 *
 * Đọc Excel chạy trong utilityProcess (out/main/worker.js), main không nạp SheetJS.
 * Hai worker: preview không phải chờ convert hàng loạt, và Hủy convert chỉ kill worker convert.
 * Worker preview cache 3 workbook / 150 MB file nguồn (đổi sheet không parse lại); worker convert đọc mỗi file một lần nên chỉ giữ 1.
 * Lỗi trả về renderer là mã `E_…` (renderer dịch); hộp thoại ghi đè theo ngôn ngữ giao diện (i18nMain).
 */
import { BrowserWindow, dialog, ipcMain, type MessageBoxOptions, type WebContents } from 'electron'
import { isAbsolute } from 'node:path'
import type { ConvertOptions } from '../../../../shared/types'
import { errorCode, errText } from '../../../domain/errors'
import type { SheetResult } from '../../../domain/excel/output'
import { isExcelPath } from '../../../domain/guards'
import { ConverterWorker } from '../../outbound/converterWorker'
import { logError } from '../../outbound/store'
import { mt } from '../../../i18nMain'
import { capPreview, runExcelConvert, type ExcelConvertPayload } from './excelConvert'

// Mã lỗi, renderer dịch (i18n/errors.ts)
const NOT_EXCEL = 'E_NOT_EXCEL'
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

  /** Hủy convert đang chạy: file chưa xong trả về `cancelled: true`; file đã ghi giữ nguyên. */
  ipcMain.handle('excel:cancel', () => {
    if (convertRunning) {
      convertCancelRequested = true
      convertWorker.cancel()
    }
    return { ok: true, data: null }
  })

  return { warmUp: () => previewWorker.warmUp() }
}
