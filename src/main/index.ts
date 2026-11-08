/* Tiến trình main: vòng đời app, một instance, mở file từ dòng lệnh / Explorer, menu, ghi log khi crash.
 * IPC chia theo tính năng trong adapters/inbound/ipc/.
 */
import { app, BrowserWindow, dialog, session } from 'electron'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerAiIpc } from './adapters/inbound/ipc/ai'
import { registerCompareIpc } from './adapters/inbound/ipc/compare'
import { registerConvertIpc } from './adapters/inbound/ipc/convert'
import { registerSystemIpc } from './adapters/inbound/ipc/system'
import { registerImageScheme, registerViewerIpc } from './adapters/inbound/ipc/viewer'
import { logError, readStore } from './adapters/outbound/store'
import { EXCEL_EXT_RE } from './domain/guards'
import { mt, setMainLang } from './i18nMain'
import { buildAppMenu } from './menu'
import { createWindow, focusMainWindow, getMainWindow, type WindowBounds } from './window'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Ảnh cục bộ trong file .md (chế độ Đọc Markdown). Phải đăng ký trước app ready.
registerImageScheme()

registerSystemIpc(buildAppMenu)
registerAiIpc()
const convert = registerConvertIpc(join(__dirname, 'worker.js'))
registerCompareIpc(join(__dirname, 'worker.js'))

async function openWindow(): Promise<BrowserWindow> {
  const store = await readStore()
  return createWindow(
    join(__dirname, '../preload/index.js'),
    join(__dirname, '../renderer/index.html'),
    store['windowBounds'] as WindowBounds | undefined
  )
}

const MD_EXT_RE = /\.(md|markdown)$/i

/** Lọc đường dẫn file Excel / Markdown từ argv (mở file bằng app / kéo thả vào exe).
 * Renderer chia theo đuôi: Excel vào danh sách convert, Markdown mở ở chế độ Đọc Markdown. */
function extractOpenPaths(argv: string[], cwd = process.cwd()): string[] {
  // IPC chỉ nhận đường dẫn tuyệt đối; `app.exe a.xlsx` gõ trong terminal là đường dẫn tương đối
  return argv.filter((a) => EXCEL_EXT_RE.test(a) || MD_EXT_RE.test(a)).map((a) => resolve(cwd, a))
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
    forwardFilesToWindow(extractOpenPaths(argv, workingDirectory))
    focusMainWindow()
  })

  app.on('open-file', (e, path) => {
    e.preventDefault()
    forwardFilesToWindow(extractOpenPaths([path]))
  })

  process.on('uncaughtException', (err) => {
    void logError('uncaughtException', err)
  })
  process.on('unhandledRejection', (reason) => {
    void logError('unhandledRejection', reason)
  })

  // Renderer chết (crash, hết RAM...): ghi log và hỏi tải lại thay vì để cửa sổ trắng
  app.on('render-process-gone', (_e, wc, details) => {
    void logError('render-process-gone', `${details.reason} (exitCode ${details.exitCode})`)
    const win = BrowserWindow.fromWebContents(wc)
    if (!win || win.isDestroyed() || details.reason === 'clean-exit') return
    void dialog
      .showMessageBox(win, {
        type: 'error',
        message: mt('crash.message'),
        detail: mt('crash.detail', { reason: details.reason }),
        buttons: [mt('common.reload'), mt('common.close')],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0 && !win.isDestroyed()) win.webContents.reload()
        else if (!win.isDestroyed()) win.close()
      })
  })
  // Worker đọc Excel (utilityProcess) tự khởi động lại ở converterWorker; ở đây chỉ ghi log
  app.on('child-process-gone', (_e, details) => {
    if (details.reason !== 'clean-exit' && details.reason !== 'killed') {
      void logError('child-process-gone', `${details.type} ${details.name ?? details.serviceName ?? ''}: ${details.reason} (exitCode ${details.exitCode})`)
    }
  })

  void app.whenReady().then(async () => {
    // App không cần quyền web nào (camera, mic, thông báo, vị trí...) ngoài clipboard cho nút Dán Markdown / Copy
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) =>
      cb(permission === 'clipboard-read' || permission === 'clipboard-sanitized-write')
    )
    setMainLang((await readStore())['lang'], app.getLocale())
    buildAppMenu()
    registerViewerIpc()
    const win = await openWindow()
    convert.warmUp()
    const firstPaths = extractOpenPaths(process.argv.slice(1))
    if (firstPaths.length > 0) win.webContents.once('did-finish-load', () => forwardFilesToWindow(firstPaths))
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void openWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
