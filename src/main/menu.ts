/* Menu ứng dụng: Sửa, Xem, Trợ giúp (Giới thiệu, thư mục log, thông tin chẩn đoán, đặt lại cài đặt).
 * Nhãn theo ngôn ngữ giao diện (i18nMain); đổi ngôn ngữ thì gọi lại buildAppMenu().
 * Reload / DevTools chỉ có khi chưa đóng gói. */
import { app, BrowserWindow, clipboard, dialog, Menu, shell, type MenuItemConstructorOptions } from 'electron'
import { mkdir } from 'node:fs/promises'
import { arch, platform, release } from 'node:os'
import { readStore, updateStore, errorLogPath, logError, logsDir } from './adapters/outbound/store'
import { readLogTail } from './adapters/outbound/logFile'
import { diagnosticsText, resetSettings } from './diagnostics'
import { mt, setMainLang } from './i18nMain'
import { checkForUpdate } from './updater'

const focused = (): BrowserWindow | undefined => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]

/** Hộp thoại gắn với cửa sổ (nếu có). */
function messageBox(opts: Electron.MessageBoxOptions): Promise<Electron.MessageBoxReturnValue> {
  const win = focused()
  return win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts)
}

/** Kiểm tra bản mới trên GitHub Releases: chỉ khi người dùng bấm (app không tự gọi mạng). */
async function checkUpdate(): Promise<void> {
  try {
    const r = await checkForUpdate()
    if (!r.newer) {
      await messageBox({ type: 'info', title: mt('menu.checkUpdate'), message: mt('update.latest', { version: app.getVersion() }), buttons: [mt('common.close')] })
      return
    }
    const { response } = await messageBox({
      type: 'info',
      title: mt('menu.checkUpdate'),
      message: mt('update.available', { latest: r.latest, current: app.getVersion() }),
      buttons: [mt('update.open'), mt('common.close')],
      defaultId: 0,
      cancelId: 1,
    })
    // url đã được updater giới hạn trong trang release của đúng repo
    if (response === 0) await shell.openExternal(r.url)
  } catch (err) {
    await messageBox({ type: 'warning', title: mt('menu.checkUpdate'), message: mt('update.failed'), detail: err instanceof Error ? err.message : String(err), buttons: [mt('common.close')] })
  }
}

function showAbout(): void {
  void messageBox({
    type: 'info',
    title: mt('menu.about'),
    message: 'ExcelToMarkdown',
    detail: mt('about.detail', {
      version: app.getVersion(),
      electron: process.versions.electron ?? '',
      chrome: process.versions.chrome ?? '',
      node: process.versions.node,
    }),
    buttons: [mt('common.close')],
  })
}

async function openLogs(): Promise<void> {
  await mkdir(logsDir(), { recursive: true })
  const err = await shell.openPath(logsDir())
  if (err) void logError('menu:openLogs', err)
}

async function copyDiagnostics(): Promise<void> {
  const store = await readStore()
  clipboard.writeText(
    diagnosticsText({
      version: app.getVersion(),
      versions: process.versions,
      platform: platform(),
      osRelease: release(),
      arch: arch(),
      locale: app.getLocale(),
      lang: store['lang'],
      logTail: await readLogTail(errorLogPath(), 50),
    })
  )
  void messageBox({ type: 'info', message: mt('diag.copied'), buttons: [mt('common.close')] })
}

async function resetAll(): Promise<void> {
  const { response } = await messageBox({
    type: 'warning',
    message: mt('reset.message'),
    detail: mt('reset.detail'),
    buttons: [mt('reset.confirm'), mt('common.cancel')],
    defaultId: 1,
    cancelId: 1,
  })
  if (response !== 0) return
  await updateStore(resetSettings)
  setMainLang(undefined, app.getLocale())
  buildAppMenu()
  for (const w of BrowserWindow.getAllWindows()) w.webContents.reload()
}

/** Chạy hành động menu; lỗi chỉ ghi log (không có nơi nào khác để báo). */
const run = (scope: string, f: () => Promise<void> | void) => (): void => {
  Promise.resolve()
    .then(f)
    .catch((err) => void logError(scope, err))
}

export function buildAppMenu(): void {
  const dev = !app.isPackaged
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' } as MenuItemConstructorOptions] : []),
    {
      label: mt('menu.edit'),
      submenu: [
        { role: 'undo', label: mt('menu.undo') },
        { role: 'redo', label: mt('menu.redo') },
        { type: 'separator' },
        { role: 'cut', label: mt('menu.cut') },
        { role: 'copy', label: mt('menu.copy') },
        { role: 'paste', label: mt('menu.paste') },
        { role: 'selectAll', label: mt('menu.selectAll') },
      ],
    },
    {
      label: mt('menu.view'),
      submenu: [
        ...(dev
          ? ([
              { role: 'reload', label: mt('menu.reload') },
              { role: 'forceReload', label: mt('menu.forceReload') },
              { role: 'toggleDevTools', label: mt('menu.devTools') },
              { type: 'separator' },
            ] as MenuItemConstructorOptions[])
          : []),
        { role: 'resetZoom', label: mt('menu.resetZoom') },
        { role: 'zoomIn', label: mt('menu.zoomIn') },
        { role: 'zoomOut', label: mt('menu.zoomOut') },
        { type: 'separator' },
        { role: 'togglefullscreen', label: mt('menu.fullscreen') },
      ],
    },
    {
      label: mt('menu.help'),
      submenu: [
        { label: mt('menu.about'), click: run('menu:about', showAbout) },
        { label: mt('menu.checkUpdate'), click: run('menu:checkUpdate', checkUpdate) },
        { type: 'separator' },
        { label: mt('menu.openLogs'), click: run('menu:openLogs', openLogs) },
        { label: mt('menu.copyDiag'), click: run('menu:copyDiag', copyDiagnostics) },
        { type: 'separator' },
        { label: mt('menu.reset'), click: run('menu:reset', resetAll) },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
