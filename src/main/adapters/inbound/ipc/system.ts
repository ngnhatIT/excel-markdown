/* IPC chung: store cài đặt, hộp thoại chọn file/thư mục, lưu HTML/Markdown, mở thư mục, phiên bản app, log lỗi của renderer. */
import { app, dialog, ipcMain, shell } from 'electron'
import { writeFile } from 'node:fs/promises'
import { errorCode, errText } from '../../../domain/errors'
import { safeFileName } from '../../../domain/excel/output'
import { isOpenableDirectory } from '../../../domain/guards'
import { isSecretStoreKey } from '../../outbound/llm/aiConfig'
import { logError, readStore, updateStore } from '../../outbound/store'
import { mt, setMainLang } from '../../../i18nMain'

/** Giá trị lưu vào store tối đa (ký tự JSON): renderer bị chiếm quyền không làm phình store.json. */
const STORE_VALUE_MAX = 1024 * 1024
/** Log lỗi renderer gửi sang (stack + component stack) tối đa. */
const RENDERER_LOG_MAX = 20_000
const HTML_EXPORT_MAX = 20_000_000
const MD_EXPORT_MAX = 5_000_000

async function pickPaths(options: Electron.OpenDialogOptions): Promise<string[]> {
  const res = await dialog.showOpenDialog(options)
  return res.canceled ? [] : res.filePaths
}

/** `onLangChange`: renderer vừa lưu ngôn ngữ giao diện mới (main dựng lại menu). */
export function registerSystemIpc(onLangChange: () => void): void {
  // API Key chỉ đi qua ai:* (đã mã hóa, renderer chỉ thấy bản che); store:* không bao giờ chạm tới
  ipcMain.handle('store:get', async (_e, key: unknown) => {
    if (isSecretStoreKey(key)) return { ok: true, data: null }
    try {
      const store = await readStore()
      return { ok: true, data: (key as string) in store ? store[key as string] : null }
    } catch (err) {
      return { ok: false, error: errText(err) }
    }
  })

  ipcMain.handle('store:set', async (_e, key: unknown, value: unknown) => {
    if (typeof key !== 'string' || key === '' || isSecretStoreKey(key)) return { ok: false, error: 'E_BAD_REQUEST' }
    const json = JSON.stringify(value) as string | undefined
    if (json !== undefined && json.length > STORE_VALUE_MAX) return { ok: false, error: 'E_STORE_TOO_LARGE' }
    try {
      await updateStore((store) => {
        store[key] = value
      })
      if (key === 'lang') {
        setMainLang(value, app.getLocale())
        onLangChange()
      }
      return { ok: true, data: null }
    } catch (err) {
      return { ok: false, error: errText(err) }
    }
  })

  ipcMain.handle('dialog:openExcelFiles', async () => {
    try {
      const data = await pickPaths({
        title: mt('dialog.openExcel'),
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Excel', extensions: ['xlsx', 'xlsm', 'xls', 'xltx', 'xltm'] }],
      })
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: errText(err) }
    }
  })

  ipcMain.handle('dialog:openMarkdownFiles', async () => {
    try {
      const data = await pickPaths({
        title: mt('dialog.openMd'),
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
      })
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: errText(err) }
    }
  })

  /** Chọn một file để so sánh 新旧 (Excel hoặc Markdown). */
  ipcMain.handle('dialog:openCompareFile', async () => {
    try {
      const [file] = await pickPaths({
        title: mt('dialog.openCompare'),
        properties: ['openFile'],
        filters: [{ name: 'Excel / Markdown', extensions: ['xlsx', 'xlsm', 'xls', 'md', 'markdown'] }],
      })
      return { ok: true, data: file ?? null }
    } catch (err) {
      return { ok: false, error: errText(err) }
    }
  })

  ipcMain.handle('dialog:openDirectory', async () => {
    try {
      const [dir] = await pickPaths({ title: mt('dialog.outDir'), properties: ['openDirectory', 'createDirectory'] })
      return { ok: true, data: dir ?? null }
    } catch (err) {
      return { ok: false, error: errText(err) }
    }
  })

  ipcMain.handle('dialog:openMarkdownFolder', async () => {
    try {
      const [dir] = await pickPaths({ title: mt('dialog.mdFolder'), properties: ['openDirectory'] })
      return { ok: true, data: dir ?? null }
    } catch (err) {
      return { ok: false, error: errText(err) }
    }
  })

  /** Lưu trang HTML xuất từ khung xem trước. Người dùng chọn nơi lưu; trả đường dẫn, null nếu hủy. */
  ipcMain.handle('export:html', async (_e, defaultName: unknown, html: unknown) => {
    try {
      if (typeof defaultName !== 'string' || typeof html !== 'string') return { ok: false, error: 'E_BAD_REQUEST' }
      if (html.length > HTML_EXPORT_MAX) return { ok: false, error: 'E_EXPORT_TOO_LARGE' }
      const res = await dialog.showSaveDialog({
        title: mt('dialog.saveHtml'),
        // Renderer đã bỏ đuôi file (guideFileStem); ở đây chỉ lọc ký tự cấm vì dữ liệu từ renderer.
        defaultPath: safeFileName(defaultName) + '.html',
        filters: [{ name: 'HTML', extensions: ['html'] }],
      })
      if (res.canceled || !res.filePath) return { ok: true, data: null }
      await writeFile(res.filePath, html, 'utf-8')
      return { ok: true, data: res.filePath }
    } catch (err) {
      void logError('export:html', err)
      return { ok: false, error: errorCode(err) }
    }
  })

  /** Lưu file Markdown (xuất cuộc trò chuyện AI). Luôn đuôi .md; trả đường dẫn, null nếu hủy. */
  ipcMain.handle('export:md', async (_e, defaultName: unknown, md: unknown) => {
    try {
      if (typeof defaultName !== 'string' || typeof md !== 'string') return { ok: false, error: 'E_BAD_REQUEST' }
      if (md.length > MD_EXPORT_MAX) return { ok: false, error: 'E_EXPORT_TOO_LARGE' }
      const res = await dialog.showSaveDialog({
        title: mt('dialog.saveMd'),
        defaultPath: safeFileName(defaultName.replace(/\.(md|markdown)$/i, '')) + '.md',
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      })
      if (res.canceled || !res.filePath) return { ok: true, data: null }
      const filePath = /\.md$/i.test(res.filePath) ? res.filePath : res.filePath + '.md'
      await writeFile(filePath, md, 'utf-8')
      return { ok: true, data: filePath }
    } catch (err) {
      void logError('export:md', err)
      return { ok: false, error: errorCode(err) }
    }
  })

  ipcMain.handle('shell:openPath', async (_e, target: unknown) => {
    try {
      // Chỉ mở thư mục (thư mục xuất); không bao giờ mở/chạy file.
      if (!(await isOpenableDirectory(target))) {
        return { ok: false, error: 'E_DIR_NOT_FOUND' }
      }
      const errMsg = await shell.openPath(target as string)
      return errMsg ? { ok: false, error: errMsg } : { ok: true, data: null }
    } catch (err) {
      return { ok: false, error: errText(err) }
    }
  })

  ipcMain.handle('app:getVersion', () => ({ ok: true, data: app.getVersion() }))

  /** Lỗi render của React (ErrorBoundary) gửi sang để ghi error.log; cắt ngắn, chỉ nhận chuỗi. */
  ipcMain.on('log:renderer', (_e, msg: unknown) => {
    if (typeof msg === 'string') void logError('renderer', msg.slice(0, RENDERER_LOG_MAX))
  })
}
