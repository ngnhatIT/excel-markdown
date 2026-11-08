/* IPC chung: store cài đặt, hộp thoại chọn file/thư mục, lưu HTML/Markdown, mở thư mục, phiên bản app. */
import { app, dialog, ipcMain, shell } from 'electron'
import { writeFile } from 'node:fs/promises'
import { errText, friendlyError } from '../../../domain/errors'
import { safeFileName } from '../../../domain/excel/output'
import { isOpenableDirectory } from '../../../domain/guards'
import { isSecretStoreKey } from '../../outbound/llm/aiConfig'
import { logError, readStore, updateStore } from '../../outbound/store'

async function pickPaths(options: Electron.OpenDialogOptions): Promise<string[]> {
  const res = await dialog.showOpenDialog(options)
  return res.canceled ? [] : res.filePaths
}

export function registerSystemIpc(): void {
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
    if (isSecretStoreKey(key)) return { ok: false, error: 'Forbidden store key' }
    try {
      await updateStore((store) => {
        store[key as string] = value
      })
      return { ok: true, data: null }
    } catch (err) {
      return { ok: false, error: errText(err) }
    }
  })

  ipcMain.handle('dialog:openExcelFiles', async () => {
    try {
      const data = await pickPaths({
        title: 'Chọn file Excel',
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
        title: 'Chọn file Markdown',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
      })
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: errText(err) }
    }
  })

  ipcMain.handle('dialog:openDirectory', async () => {
    try {
      const [dir] = await pickPaths({ title: 'Chọn thư mục lưu kết quả', properties: ['openDirectory', 'createDirectory'] })
      return { ok: true, data: dir ?? null }
    } catch (err) {
      return { ok: false, error: errText(err) }
    }
  })

  ipcMain.handle('dialog:openMarkdownFolder', async () => {
    try {
      const [dir] = await pickPaths({ title: 'Chọn thư mục chứa file Markdown', properties: ['openDirectory'] })
      return { ok: true, data: dir ?? null }
    } catch (err) {
      return { ok: false, error: errText(err) }
    }
  })

  /** Lưu trang HTML xuất từ khung xem trước. Người dùng chọn nơi lưu; trả đường dẫn, null nếu hủy. */
  ipcMain.handle('export:html', async (_e, defaultName: unknown, html: unknown) => {
    try {
      if (typeof defaultName !== 'string' || typeof html !== 'string' || html.length > 20_000_000) {
        return { ok: false, error: 'Dữ liệu xuất HTML không hợp lệ.' }
      }
      const res = await dialog.showSaveDialog({
        title: 'Lưu trang HTML',
        // Renderer đã bỏ đuôi file (guideFileStem); ở đây chỉ lọc ký tự cấm vì dữ liệu từ renderer.
        defaultPath: safeFileName(defaultName) + '.html',
        filters: [{ name: 'HTML', extensions: ['html'] }],
      })
      if (res.canceled || !res.filePath) return { ok: true, data: null }
      await writeFile(res.filePath, html, 'utf-8')
      return { ok: true, data: res.filePath }
    } catch (err) {
      void logError('export:html', err)
      return { ok: false, error: friendlyError(err) }
    }
  })

  /** Lưu file Markdown (xuất cuộc trò chuyện AI). Luôn đuôi .md; trả đường dẫn, null nếu hủy. */
  ipcMain.handle('export:md', async (_e, defaultName: unknown, md: unknown) => {
    try {
      if (typeof defaultName !== 'string' || typeof md !== 'string' || md.length > 5_000_000) {
        return { ok: false, error: 'Dữ liệu xuất Markdown không hợp lệ.' }
      }
      const res = await dialog.showSaveDialog({
        title: 'Lưu file Markdown',
        defaultPath: safeFileName(defaultName.replace(/\.(md|markdown)$/i, '')) + '.md',
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      })
      if (res.canceled || !res.filePath) return { ok: true, data: null }
      const filePath = /\.md$/i.test(res.filePath) ? res.filePath : res.filePath + '.md'
      await writeFile(filePath, md, 'utf-8')
      return { ok: true, data: filePath }
    } catch (err) {
      void logError('export:md', err)
      return { ok: false, error: friendlyError(err) }
    }
  })

  ipcMain.handle('shell:openPath', async (_e, target: unknown) => {
    try {
      // Chỉ mở thư mục (thư mục xuất); không bao giờ mở/chạy file.
      if (!(await isOpenableDirectory(target))) {
        return { ok: false, error: 'Không mở được: thư mục không tồn tại hoặc không hợp lệ.' }
      }
      const errMsg = await shell.openPath(target as string)
      return errMsg ? { ok: false, error: errMsg } : { ok: true, data: null }
    } catch (err) {
      return { ok: false, error: errText(err) }
    }
  })

  ipcMain.handle('app:getVersion', () => ({ ok: true, data: app.getVersion() }))
}
