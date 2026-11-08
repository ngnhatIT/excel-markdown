/* Cửa sổ chính: tạo, nhớ vị trí/kích thước/phóng to, chặn điều hướng và mở link ngoài. */
import { BrowserWindow, screen, shell } from 'electron'
import { updateStore } from './adapters/outbound/store'
import { isSafeExternalUrl, isTitleBarOnScreen, shouldAllowNavigation } from './domain/guards'

export interface WindowBounds {
  x?: number
  y?: number
  width?: number
  height?: number
  maximized?: boolean
}

const DEFAULT = { width: 1280, height: 820 }
const MIN = { width: 1024, height: 640 }

let mainWindow: BrowserWindow | null = null

export const getMainWindow = (): BrowserWindow | null => mainWindow

/** Kích thước/vị trí lần trước; vị trí bị bỏ nếu không còn nằm trên màn hình nào (đã rút màn hình phụ). */
function restoredBounds(saved?: WindowBounds): Partial<Electron.Rectangle> {
  const width = saved?.width && saved.width >= MIN.width ? saved.width : DEFAULT.width
  const height = saved?.height && saved.height >= MIN.height ? saved.height : DEFAULT.height
  const { x, y } = saved ?? {}
  if (x === undefined || y === undefined) return { width, height }
  const onScreen = isTitleBarOnScreen({ x, y, width, height }, screen.getAllDisplays().map((d) => d.workArea))
  return onScreen ? { x, y, width, height } : { width, height }
}

export function createWindow(preloadPath: string, rendererHtml: string, saved?: WindowBounds): BrowserWindow {
  const win = new BrowserWindow({
    ...restoredBounds(saved),
    minWidth: MIN.width,
    minHeight: MIN.height,
    title: 'ExcelToMarkdown',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      // preload chỉ dùng contextBridge / ipcRenderer / webUtils (có trong sandbox)
      sandbox: true,
    },
  })
  mainWindow = win
  if (saved?.maximized) win.maximize()

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(rendererHtml)
  }

  win.on('close', () => {
    // Đang phóng to: lưu kích thước thường (để bỏ phóng to lần sau về đúng chỗ) + cờ phóng to
    const maximized = win.isMaximized()
    const b: WindowBounds = { ...(maximized ? win.getNormalBounds() : win.getBounds()), maximized }
    void updateStore((store) => {
      store['windowBounds'] = b
    }).catch(() => undefined)
  })
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  // Link trong preview (hyperlink từ Excel): chỉ http/https/mailto được mở bằng
  // trình duyệt ngoài; link tương đối / file:// / UNC bị chặn để cửa sổ app
  // không bị điều hướng mất trạng thái và không mở được file cục bộ.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (shouldAllowNavigation(url, win.webContents.getURL())) return
    e.preventDefault()
    if (isSafeExternalUrl(url)) void shell.openExternal(url)
  })
  return win
}

/** Đưa cửa sổ lên trước (mở file từ instance thứ hai / Explorer). */
export function focusMainWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
}
