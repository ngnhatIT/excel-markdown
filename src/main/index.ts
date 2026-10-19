import { app, BrowserWindow, ipcMain, dialog, shell, type MessageBoxOptions } from 'electron'
import { join, dirname, basename, extname, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { access, appendFile, constants, readFile, rm, stat, writeFile, mkdir } from 'node:fs/promises'
import type {
  ConvertOptions,
  ConvertFileSpec,
  ConvertResultItem,
  MdConvertResult,
  MdInspectResult,
  OutputMode,
} from '../types'
import { dedupeFileName, joinWorkbookMarkdown, safeFileName, type SheetResult } from './output'
import { CancelledError, ConverterWorker } from './converterWorker'
import { friendlyError } from './errors'
import { isMarkdownPath, isOpenableDirectory, isSafeExternalUrl, shouldAllowNavigation } from './guards'
import { PARTIAL_SUFFIX } from './workerProtocol'

const __dirname = dirname(fileURLToPath(import.meta.url))

/* --------------------------------- Store --------------------------------- */

function storePath(): string {
  return join(app.getPath('userData'), 'store.json')
}

async function readStore(): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(storePath(), 'utf-8')
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

async function writeStore(data: Record<string, unknown>): Promise<void> {
  await mkdir(dirname(storePath()), { recursive: true })
  await writeFile(storePath(), JSON.stringify(data, null, 2), 'utf-8')
}

const LOG_MAX_BYTES = 512 * 1024

/** Ghi lỗi ra logs/error.log trong userData (xoay vòng khi > 512KB). Không bao giờ throw. */
async function logError(scope: string, err: unknown): Promise<void> {
  try {
    const dir = join(app.getPath('userData'), 'logs')
    await mkdir(dir, { recursive: true })
    const p = join(dir, 'error.log')
    try {
      const st = await stat(p)
      if (st.size > LOG_MAX_BYTES) await writeFile(p, '', 'utf-8')
    } catch {
      /* chưa có file log */
    }
    const msg = err instanceof Error ? err.stack ?? err.message : String(err)
    await appendFile(p, '[' + new Date().toISOString() + '] [' + scope + '] ' + msg + '\n', 'utf-8')
  } catch {
    /* logging không được làm crash app */
  }
}

/* --------------------------------- Window --------------------------------- */

let mainWindow: BrowserWindow | null = null

interface WindowBounds {
  x?: number
  y?: number
  width?: number
  height?: number
}

function createWindow(saved?: WindowBounds): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 640,
    ...(saved?.x !== undefined && saved?.y !== undefined ? { x: saved.x, y: saved.y } : {}),
    ...(saved?.width && saved.width >= 1024 ? { width: saved.width } : {}),
    ...(saved?.height && saved.height >= 640 ? { height: saved.height } : {}),
    title: 'ExcelToMarkdown',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  const saveBounds = (): void => {
    if (!mainWindow || mainWindow.isMaximized()) return
    const b = mainWindow.getBounds()
    void readStore()
      .then((store) => writeStore({ ...store, windowBounds: b }))
      .catch(() => undefined)
  }
  mainWindow.on('close', saveBounds)

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Link trong preview (hyperlink từ Excel): chỉ http/https/mailto được mở bằng
  // trình duyệt ngoài; link tương đối / file:// / UNC bị chặn để cửa sổ app
  // không bị điều hướng mất trạng thái và không mở được file cục bộ.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (shouldAllowNavigation(url, mainWindow?.webContents.getURL() ?? '')) return
    e.preventDefault()
    if (isSafeExternalUrl(url)) void shell.openExternal(url)
  })
}

/* ---------------------------------- IPC ----------------------------------- */

/* Đọc Excel chạy trong utilityProcess (out/main/worker.js), main không nạp SheetJS.
 * Hai worker: preview không phải chờ convert hàng loạt, và Hủy convert chỉ kill worker
 * convert. Worker preview cache 3 workbook (đổi sheet không parse lại); worker convert
 * đọc mỗi file một lần nên chỉ giữ 1. */
const workerEntry = join(__dirname, 'worker.js')
const previewWorker = new ConverterWorker(workerEntry, ['--cache=3'], 'x2m-preview')
const convertWorker = new ConverterWorker(workerEntry, ['--cache=1'], 'x2m-convert')
let convertRunning = false
let convertCancelRequested = false

ipcMain.handle('store:get', async (_e, key: string) => {
  try {
    const store = await readStore()
    return { ok: true, data: (key in store ? store[key] : null) as unknown }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

// Chuỗi hóa các lần ghi store để tránh race read-modify-write.
let storeWriteChain: Promise<void> = Promise.resolve()

ipcMain.handle('store:set', async (_e, key: string, value: unknown) => {
  const task = storeWriteChain.then(async () => {
    const store = await readStore()
    store[key] = value
    await writeStore(store)
  })
  storeWriteChain = task.catch(() => undefined)
  try {
    await task
    return { ok: true, data: null }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('dialog:openExcelFiles', async () => {
  try {
    const res = await dialog.showOpenDialog({
      title: 'Chọn file Excel',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Excel', extensions: ['xlsx', 'xlsm', 'xls', 'xltx', 'xltm'] }],
    })
    return { ok: true, data: res.canceled ? [] : res.filePaths }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('dialog:openMarkdownFiles', async () => {
  try {
    const res = await dialog.showOpenDialog({
      title: 'Chọn file Markdown',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
    })
    return { ok: true, data: res.canceled ? [] : res.filePaths }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('dialog:openDirectory', async () => {
  try {
    const res = await dialog.showOpenDialog({
      title: 'Chọn thư mục lưu kết quả',
      properties: ['openDirectory', 'createDirectory'],
    })
    return { ok: true, data: res.canceled ? null : res.filePaths[0] ?? null }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('shell:openPath', async (_e, target: unknown) => {
  try {
    // Chỉ mở thư mục (thư mục xuất); không bao giờ mở/chạy file.
    if (!(await isOpenableDirectory(target))) {
      return { ok: false, error: 'Không mở được: thư mục không tồn tại hoặc không hợp lệ.' }
    }
    const errMsg = await shell.openPath(target as string)
    if (errMsg) return { ok: false, error: errMsg }
    return { ok: true, data: null }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('app:getVersion', async () => {
  try {
    return { ok: true, data: app.getVersion() }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('excel:listSheets', async (_e, filePath: string, skipDelSheets: boolean) => {
  try {
    const sheets = await previewWorker.request({ type: 'listSheets', path: filePath, skipDelSheets })
    return { ok: true, data: sheets }
  } catch (err) {
    void logError('excel:listSheets', err)
    return { ok: false, error: friendlyError(err) }
  }
})

ipcMain.handle(
  'excel:preview',
  async (_e, filePath: string, sheetName: string, options: ConvertOptions) => {
    try {
      const md = await previewWorker.request<string>({ type: 'preview', path: filePath, sheet: sheetName, options })
      return { ok: true, data: md }
    } catch (err) {
      void logError('excel:preview', err)
      return { ok: false, error: friendlyError(err) }
    }
  }
)

ipcMain.handle(
  'excel:convert',
  async (
    e,
    payload: {
      files: ConvertFileSpec[]
      outDir: string
      options: ConvertOptions
      outputMode: OutputMode
    }
  ) => {
    if (convertRunning) return { ok: false, error: 'Đang convert, vui lòng chờ hoặc bấm Hủy.' }
    convertRunning = true
    convertCancelRequested = false
    const results: ConvertResultItem[] = []
    try {
      await mkdir(payload.outDir, { recursive: true })
      try {
        await access(payload.outDir, constants.W_OK)
      } catch {
        return { ok: false, error: 'Không ghi được vào thư mục: ' + payload.outDir }
      }
      const usedNames = new Set<string>()
      const total = payload.files.length
      let done = 0
      const reportProgress = (): void => {
        done++
        if (!e.sender.isDestroyed()) {
          e.sender.send('excel:progress', { done, total })
        }
      }
      for (const spec of payload.files) {
        const base = basename(spec.path, extname(spec.path))
        if (convertCancelRequested) {
          results.push({ fileName: base, ok: false, cancelled: true, filesWritten: [], error: 'Đã hủy' })
          continue
        }
        try {
          await access(spec.path, constants.R_OK)
        } catch {
          results.push({
            fileName: base,
            ok: false,
            filesWritten: [],
            error: 'File không tồn tại hoặc không đọc được: ' + spec.path,
          })
          continue
        }
        try {
          const sheets = await convertWorker.request<SheetResult[]>({
            type: 'convert',
            path: spec.path,
            sheets: spec.sheets,
            options: payload.options,
          })
          const written: string[] = []
          if (payload.outputMode === 'per-workbook') {
            const md = joinWorkbookMarkdown(base, sheets, payload.options.escapeMarkdown !== false)
            if (sheets.some((s) => s.markdown.trim() !== '')) {
              const fileName = dedupeFileName(safeFileName(base) + '.md', usedNames)
              await writeFile(join(payload.outDir, fileName), md, 'utf-8')
              written.push(fileName)
            }
          } else {
            for (const s of sheets) {
              const fileName = dedupeFileName(safeFileName(base + '__' + s.sheet) + '.md', usedNames)
              await writeFile(join(payload.outDir, fileName), s.markdown + '\n', 'utf-8')
              written.push(fileName)
            }
          }
          results.push({ fileName: base, ok: true, filesWritten: written })
          reportProgress()
        } catch (err) {
          if (err instanceof CancelledError) {
            results.push({ fileName: base, ok: false, cancelled: true, filesWritten: [], error: 'Đã hủy' })
            continue
          }
          void logError('excel:convert', err)
          results.push({
            fileName: base,
            ok: false,
            filesWritten: [],
            error: friendlyError(err),
          })
          reportProgress()
        }
      }
      return { ok: true, data: results }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    } finally {
      convertRunning = false
      convertCancelRequested = false
    }
  }
)

/** Hủy convert đang chạy: các file chưa xong được trả về với `cancelled: true`;
 * file đã ghi giữ nguyên. */
ipcMain.handle('excel:cancel', async () => {
  if (convertRunning) {
    convertCancelRequested = true
    convertWorker.cancel()
  }
  return { ok: true, data: null }
})

/* ------------------------- Markdown → Excel (md:*) ------------------------- */

/** Đọc nhanh một file Markdown: tiêu đề, tên sheet sẽ tạo, nội dung để preview.
 * Chạy ở worker preview (renderer không đọc filesystem; chỉ nhận file .md). */
ipcMain.handle('md:inspect', async (_e, path: unknown) => {
  if (!isMarkdownPath(path)) return { ok: false, error: 'Chỉ đọc được file Markdown (.md).' }
  try {
    const result = await previewWorker.request<MdInspectResult>({ type: 'mdInspect', path: path as string })
    return { ok: true, data: result }
  } catch (err) {
    void logError('md:inspect', err)
    // Worker đã dịch lỗi sang tiếng Việt (kèm tên file) nên trả nguyên văn
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

/** Ghép các file .md thành một workbook .xlsx trong `outDir`. Dùng chung cờ `convertRunning`,
 * worker convert và `excel:cancel` với Excel → Markdown (một lúc chỉ chạy một lần convert).
 * File đích đã có thì hỏi ghi đè; worker ghi `.partial` rồi đổi tên nên Hủy/lỗi không để lại .xlsx dở. */
ipcMain.handle(
  'md:convert',
  async (_e, payload: { files: string[]; outDir: string; fileName: string }) => {
    if (!Array.isArray(payload?.files) || !payload.files.every(isMarkdownPath)) {
      return { ok: false, error: 'Chỉ đọc được file Markdown (.md).' }
    }
    if (
      typeof payload.outDir !== 'string' ||
      !isAbsolute(payload.outDir) ||
      typeof payload.fileName !== 'string'
    ) {
      return { ok: false, error: 'Thư mục hoặc tên file xuất không hợp lệ.' }
    }
    if (convertRunning) return { ok: false, error: 'Đang convert, vui lòng chờ hoặc bấm Hủy.' }
    convertRunning = true
    convertCancelRequested = false
    const outPath = join(payload.outDir, safeFileName(payload.fileName.replace(/\.xlsx$/i, '')) + '.xlsx')
    try {
      try {
        await mkdir(payload.outDir, { recursive: true })
        await access(payload.outDir, constants.W_OK)
      } catch {
        return { ok: false, error: 'Không ghi được vào thư mục: ' + payload.outDir }
      }
      const exists = await access(outPath, constants.F_OK).then(
        () => true,
        () => false
      )
      if (exists) {
        const box: MessageBoxOptions = {
          type: 'question',
          buttons: ['Ghi đè', 'Hủy'],
          defaultId: 1,
          cancelId: 1,
          message: `File ${basename(outPath)} đã tồn tại. Ghi đè?`,
        }
        const { response } = await (mainWindow
          ? dialog.showMessageBox(mainWindow, box)
          : dialog.showMessageBox(box))
        if (response !== 0) {
          const declined: MdConvertResult = { status: 'declined' }
          return { ok: true, data: declined }
        }
      }
      // Hủy bấm trước khi worker khởi động (lúc tạo thư mục / chờ hộp thoại): cancel() chưa có gì để kill
      if (convertCancelRequested) {
        const cancelled: MdConvertResult = { status: 'cancelled' }
        return { ok: true, data: cancelled }
      }
      const written = await convertWorker.request<{ outPath: string; sheets: string[] }>({
        type: 'mdToXlsx',
        files: payload.files,
        outPath,
      })
      const done: MdConvertResult = { status: 'done', outPath: written.outPath, sheets: written.sheets }
      return { ok: true, data: done }
    } catch (err) {
      // Worker bị kill giữa chừng (Hủy) hoặc ghi lỗi: không để lại .partial (file đích cũ, nếu có, còn nguyên).
      // Windows có thể còn giữ handle vài chục ms sau khi process thoát nên thử lại.
      await rm(outPath + PARTIAL_SUFFIX, { force: true, maxRetries: 5, retryDelay: 100 }).catch(() => undefined)
      if (err instanceof CancelledError) {
        const cancelled: MdConvertResult = { status: 'cancelled' }
        return { ok: true, data: cancelled }
      }
      void logError('md:convert', err)
      // Worker đã dịch lỗi sang tiếng Việt (EBUSY khi file đang mở trong Excel, tên file lỗi...)
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    } finally {
      convertRunning = false
      convertCancelRequested = false
    }
  }
)

/* ---------------------------------- App ----------------------------------- */

const EXCEL_EXTS = ['.xlsx', '.xlsm', '.xls', '.xltx', '.xltm']

/** Lọc đường dẫn file Excel từ argv (mở file bằng app / kéo thả vào exe). */
function extractExcelPaths(argv: string[]): string[] {
  return argv.filter((a) => {
    const lower = a.toLowerCase()
    return EXCEL_EXTS.some((ext) => lower.endsWith(ext))
  })
}

function forwardFilesToWindow(paths: string[]): void {
  if (paths.length === 0 || !mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
  mainWindow.webContents.send('open-files', paths)
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    forwardFilesToWindow(extractExcelPaths(argv))
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.on('open-file', (e, path) => {
    e.preventDefault()
    forwardFilesToWindow(extractExcelPaths([path]))
  })

  process.on('uncaughtException', (err) => {
    void logError('uncaughtException', err)
  })

  void app.whenReady().then(async () => {
    const store = await readStore()
    createWindow(store['windowBounds'] as WindowBounds | undefined)
    previewWorker.warmUp()
    const firstPaths = extractExcelPaths(process.argv.slice(1))
    if (firstPaths.length > 0 && mainWindow) {
      mainWindow.webContents.once('did-finish-load', () => {
        forwardFilesToWindow(firstPaths)
      })
    }
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void readStore().then((store) =>
          createWindow(store['windowBounds'] as WindowBounds | undefined)
        )
      }
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
