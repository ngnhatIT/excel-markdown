/* IPC so sánh 新旧: đọc một file (Excel hoặc Markdown) thành Markdown để renderer diff (shared/specDiff.ts).
 * Excel đọc trong worker riêng (khởi động lười): so sánh file lớn không chặn preview / convert. */
import { ipcMain } from 'electron'
import { friendlyError } from '../../../domain/errors'
import { isExcelPath, isMarkdownPath } from '../../../domain/guards'
import { ConverterWorker } from '../../outbound/converterWorker'
import { readMarkdownFile } from '../../outbound/mdFolder'
import { logError } from '../../outbound/store'

/** Mã lỗi: renderer dịch theo ngôn ngữ giao diện (i18n `err.E_COMPARE_UNSUPPORTED`). */
const NOT_SUPPORTED = 'E_COMPARE_UNSUPPORTED'

export function registerCompareIpc(workerEntry: string): void {
  // cache 2: cặp 新旧 đang so sánh, đổi qua lại không parse lại
  const worker = new ConverterWorker(workerEntry, ['--cache=2'], 'x2m-compare', 120_000)

  ipcMain.handle('compare:read', async (_e, path: unknown) => {
    try {
      if (isExcelPath(path)) {
        return { ok: true, data: await worker.request<string>({ type: 'workbookMarkdown', path: path as string }) }
      }
      if (isMarkdownPath(path)) return { ok: true, data: await readMarkdownFile(path as string) }
      return { ok: false, error: NOT_SUPPORTED }
    } catch (err) {
      void logError('compare:read', err)
      return { ok: false, error: friendlyError(err) }
    }
  })
}
