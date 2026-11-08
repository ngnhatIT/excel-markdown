/* Tiến trình main: vòng đời app, một instance, mở file từ dòng lệnh / Explorer.
 * IPC chia theo tính năng trong adapters/inbound/ipc/.
 */
import { app, BrowserWindow } from 'electron'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerAiIpc } from './adapters/inbound/ipc/ai'
import { registerConvertIpc } from './adapters/inbound/ipc/convert'
import { registerSystemIpc } from './adapters/inbound/ipc/system'
import { registerImageScheme, registerViewerIpc } from './adapters/inbound/ipc/viewer'
import { logError, readStore } from './adapters/outbound/store'
import { EXCEL_EXT_RE } from './domain/guards'
import { createWindow, focusMainWindow, getMainWindow, type WindowBounds } from './window'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Ảnh cục bộ trong file .md (chế độ Đọc Markdown). Phải đăng ký trước app ready.
registerImageScheme()

registerSystemIpc()
registerAiIpc()
const convert = registerConvertIpc(join(__dirname, 'worker.js'))

async function openWindow(): Promise<BrowserWindow> {
  const store = await readStore()
  return createWindow(
    join(__dirname, '../preload/index.js'),
    join(__dirname, '../renderer/index.html'),
    store['windowBounds'] as WindowBounds | undefined
  )
}

/** Lọc đường dẫn file Excel từ argv (mở file bằng app / kéo thả vào exe). */
function extractExcelPaths(argv: string[], cwd = process.cwd()): string[] {
  // IPC excel:* chỉ nhận đường dẫn tuyệt đối; `app.exe a.xlsx` gõ trong terminal là đường dẫn tương đối
  return argv.filter((a) => EXCEL_EXT_RE.test(a)).map((a) => resolve(cwd, a))
}

function forwardFilesToWindow(paths: string[]): void {
  const win = getMainWindow()
  if (paths.length === 0 || !win) return
  focusMainWindow()
  win.webContents.send('open-files', paths)
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv, workingDirectory) => {
    forwardFilesToWindow(extractExcelPaths(argv, workingDirectory))
    focusMainWindow()
  })

  app.on('open-file', (e, path) => {
    e.preventDefault()
    forwardFilesToWindow(extractExcelPaths([path]))
  })

  process.on('uncaughtException', (err) => {
    void logError('uncaughtException', err)
  })

  void app.whenReady().then(async () => {
    registerViewerIpc()
    const win = await openWindow()
    convert.warmUp()
    const firstPaths = extractExcelPaths(process.argv.slice(1))
    if (firstPaths.length > 0) win.webContents.once('did-finish-load', () => forwardFilesToWindow(firstPaths))
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void openWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
