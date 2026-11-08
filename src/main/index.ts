import { app, BrowserWindow, ipcMain, dialog, protocol, safeStorage, shell, type MessageBoxOptions } from 'electron'
import {
  AI_CONTEXT_LEVELS,
  AI_PROVIDER_IDS,
  AI_PROVIDERS,
  DEFAULT_AI_PROVIDER,
  type AiAskRequest,
  type AiAskResponse,
  type AiConfigInfo,
  type AiModelId,
  type AiProvider,
  type AiSetConfigPayload,
} from '../types'
import { loadRagDocumentCached } from './adapters/outbound/ragDocCache'
import { maskApiKey, redactApiKey } from './adapters/outbound/llm/shared'
import { askLlm, listModels } from './adapters/outbound/llm/askLlm'
import { buildRagContext } from './domain/rag/retriever'
import { collectRagDocuments, RAG_MAX_FILES, RAG_MAX_LOOSE } from './domain/rag/collect'
import { join, dirname, basename, extname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { access, appendFile, constants, readFile, rename, rm, stat, writeFile, mkdir } from 'node:fs/promises'
import type {
  ConvertOptions,
  ConvertFileSpec,
  ConvertResultItem,
  MdConvertResult,
  MdFolderListing,
  MdInspectResult,
  OutputMode,
} from '../types'
import { dedupeFileName, mdFileName, safeFileName, workbookMdFiles, type SheetResult } from './domain/excel/output'
import { CancelledError, ConverterWorker } from './adapters/outbound/converterWorker'
import { friendlyError } from './domain/errors'
import {
  EXCEL_EXT_RE,
  imageMime,
  isExcelPath,
  isInsideDir,
  isMarkdownPath,
  isOpenableDirectory,
  isSafeExternalUrl,
  shouldAllowNavigation,
} from './domain/guards'
import { listMarkdownFiles, readMarkdownFile } from './adapters/outbound/mdFolder'
import { PARTIAL_SUFFIX } from './application/ports/workerProtocol'
import { IMG_SCHEME, imagePathFromUrl } from '../shared/mdView'

// Ảnh cục bộ trong file .md (chế độ Đọc Markdown). Phải đăng ký trước app ready.
protocol.registerSchemesAsPrivileged([{ scheme: IMG_SCHEME, privileges: { standard: true, secure: true } }])

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

/** Ghi file tạm rồi đổi tên: tắt máy/crash giữa chừng không để lại store.json hỏng
 * (hỏng thì readStore trả {} và lần ghi sau xóa mất mọi cài đặt lẫn API key). */
async function writeStore(data: Record<string, unknown>): Promise<void> {
  await mkdir(dirname(storePath()), { recursive: true })
  const tmp = storePath() + '.tmp'
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8')
  await rename(tmp, storePath())
}

// Chuỗi hóa mọi lần đọc-sửa-ghi store để hai lần ghi gần nhau không làm mất thay đổi của nhau.
let storeWriteChain: Promise<void> = Promise.resolve()

function updateStore(mutate: (store: Record<string, unknown>) => void): Promise<void> {
  const task = storeWriteChain.then(async () => {
    const store = await readStore()
    mutate(store)
    await writeStore(store)
  })
  storeWriteChain = task.catch(() => undefined)
  return task
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
    void updateStore((store) => {
      store['windowBounds'] = b
    }).catch(() => undefined)
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
const NOT_EXCEL = 'Chỉ đọc được file Excel (.xlsx/.xlsm/.xls) theo đường dẫn tuyệt đối.'
let convertCancelRequested = false

/** Hộp thoại `Ghi đè` / `Hủy` (mặc định Hủy); true = ghi đè. */
async function confirmOverwrite(message: string): Promise<boolean> {
  const box: MessageBoxOptions = { type: 'question', buttons: ['Ghi đè', 'Hủy'], defaultId: 1, cancelId: 1, message }
  const { response } = await (mainWindow ? dialog.showMessageBox(mainWindow, box) : dialog.showMessageBox(box))
  return response === 0
}

ipcMain.handle('store:get', async (_e, key: string) => {
  if (key === 'aiApiKeyEnc') return { ok: true, data: null }
  try {
    const store = await readStore()
    return { ok: true, data: (key in store ? store[key] : null) as unknown }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('store:set', async (_e, key: string, value: unknown) => {
  if (key === 'aiApiKeyEnc') return { ok: false, error: 'Forbidden store key' }
  try {
    await updateStore((store) => {
      store[key] = value
    })
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
  if (!isExcelPath(filePath)) return { ok: false, error: NOT_EXCEL }
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
    if (!isExcelPath(filePath)) return { ok: false, error: NOT_EXCEL }
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
    if (
      !Array.isArray(payload?.files) ||
      !payload.files.every((f) => isExcelPath(f?.path) && Array.isArray(f.sheets)) ||
      typeof payload.outDir !== 'string' ||
      !isAbsolute(payload.outDir)
    ) {
      return { ok: false, error: NOT_EXCEL }
    }
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
      // File .md đích đã có (có thể người dùng đã sửa tay): hỏi một lần trước khi ghi đè, như Markdown → Excel.
      // Tính theo mọi sheet đã chọn nên sheet rỗng (sẽ bị bỏ qua) vẫn có thể làm hỏi thừa — hỏi thừa vô hại.
      const planned = new Set<string>()
      for (const spec of payload.files) {
        const base = basename(spec.path, extname(spec.path))
        if (payload.outputMode === 'per-workbook') dedupeFileName(mdFileName(base), planned)
        else for (const s of spec.sheets) dedupeFileName(mdFileName(base, s), planned)
      }
      const existing = (
        await Promise.all(
          [...planned].map((f) =>
            access(join(payload.outDir, f)).then(
              () => f,
              () => null
            )
          )
        )
      ).filter((f): f is string => f !== null)
      if (
        existing.length > 0 &&
        !(await confirmOverwrite(
          existing.length === 1
            ? `File ${existing[0]} đã tồn tại. Ghi đè?`
            : `${existing.length} file .md đã có trong thư mục xuất (vd ${existing[0]}). Ghi đè?`
        ))
      ) {
        return {
          ok: true,
          data: payload.files.map((spec) => ({
            fileName: basename(spec.path, extname(spec.path)),
            ok: false,
            cancelled: true,
            filesWritten: [],
            error: 'Đã hủy',
          })),
        }
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
        // Ghi lỗi giữa chừng (vd file .md đang bị khóa): báo đúng các file đã ghi và lỗi là lỗi ghi
        const written: string[] = []
        let writing = false
        try {
          const sheets = await convertWorker.request<SheetResult[]>({
            type: 'convert',
            path: spec.path,
            sheets: spec.sheets,
            options: payload.options,
          })
          writing = true
          const files = workbookMdFiles(base, basename(spec.path), sheets, payload.options, payload.outputMode === 'per-workbook', usedNames)
          for (const f of files) {
            for (const img of f.images ?? []) {
              await mkdir(dirname(join(payload.outDir, img.path)), { recursive: true })
              await writeFile(join(payload.outDir, img.path), img.data)
            }
            await writeFile(join(payload.outDir, f.name), f.text, 'utf-8')
            written.push(f.name)
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
            filesWritten: written,
            error: writing
              ? /EBUSY|EPERM|EACCES/.test(String(err))
                ? 'Không ghi được file .md: file đang bị chương trình khác khóa hoặc không có quyền ghi.'
                : 'Không ghi được file .md: ' + (err instanceof Error ? err.message : String(err))
              : friendlyError(err),
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
      if (exists && !(await confirmOverwrite(`File ${basename(outPath)} đã tồn tại. Ghi đè?`))) {
        const declined: MdConvertResult = { status: 'declined' }
        return { ok: true, data: declined }
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

/* --------------------------- Đọc Markdown (mdv:*) --------------------------- */

/** Thư mục người dùng đã mở để đọc (thư mục được liệt kê + thư mục chứa file đã đọc).
 * Scheme ảnh chỉ phục vụ file ảnh nằm trong các thư mục này. */
const viewerRoots = new Set<string>()

let aiAbort: AbortController | null = null

function encryptApiKey(rawKey: string): string {
  const k = rawKey.trim()
  if (!k) return ''
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return 'enc:' + safeStorage.encryptString(k).toString('base64')
    }
  } catch {
    /* fallback base64 khi OS không có keyring */
  }
  return 'b64:' + Buffer.from(k, 'utf-8').toString('base64')
}

function decryptApiKey(stored: unknown): string {
  if (typeof stored !== 'string' || !stored) return ''
  try {
    if (stored.startsWith('enc:') && safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'))
    }
    if (stored.startsWith('b64:')) {
      return Buffer.from(stored.slice(4), 'base64').toString('utf-8')
    }
  } catch {
    /* key lỗi hoặc khác máy -> coi như chưa có */
  }
  return ''
}

const MODEL_RE: Record<AiProvider, RegExp> = {
  gemini: /^gemini-[\w.-]{1,60}$/,
  claude: /^claude-[\w.-]{1,60}$/,
  openai: /^[\w.:-]{1,80}$/,
}

function normalizeProvider(p: unknown): AiProvider {
  return AI_PROVIDER_IDS.includes(p as AiProvider) ? (p as AiProvider) : DEFAULT_AI_PROVIDER
}

function normalizeAiModel(provider: AiProvider, m: unknown): AiModelId {
  return typeof m === 'string' && MODEL_RE[provider].test(m) ? m : AI_PROVIDERS[provider].defaultModel
}

function normalizeContextTokens(n: unknown): number {
  return AI_CONTEXT_LEVELS.includes(n as (typeof AI_CONTEXT_LEVELS)[number]) ? (n as number) : AI_CONTEXT_LEVELS[0]
}

// Gemini giữ khóa lưu cũ để key người dùng đã nhập vẫn dùng được sau khi nâng cấp
const keyField = (p: AiProvider): string => (p === 'gemini' ? 'aiApiKeyEnc' : `aiApiKeyEnc_${p}`)
const modelField = (p: AiProvider): string => (p === 'gemini' ? 'aiModel' : `aiModel_${p}`)

function aiConfigInfo(store: Record<string, unknown>): AiConfigInfo {
  const provider = normalizeProvider(store['aiProvider'])
  const keys = Object.fromEntries(
    AI_PROVIDER_IDS.map((p) => [p, maskApiKey(decryptApiKey(store[keyField(p)]))])
  ) as Record<AiProvider, string>
  return {
    provider,
    hasKey: keys[provider] !== '',
    maskedKey: keys[provider],
    model: normalizeAiModel(provider, store[modelField(provider)]),
    contextTokens: normalizeContextTokens(store['aiContextTokens']),
    keys,
  }
}

ipcMain.handle('ai:listModels', async (_e, providerArg?: AiProvider) => {
  let rawKey = ''
  try {
    const store = await readStore()
    const provider = normalizeProvider(providerArg ?? store['aiProvider'])
    rawKey = decryptApiKey(store[keyField(provider)])
    return { ok: true, data: await listModels(provider, rawKey) }
  } catch (err) {
    return { ok: false, error: redactApiKey(err instanceof Error ? err.message : String(err), rawKey) }
  }
})

ipcMain.handle('ai:getConfig', async () => {
  try {
    return { ok: true, data: aiConfigInfo(await readStore()) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('ai:setConfig', async (_e, payload: AiSetConfigPayload) => {
  try {
    await updateStore((store) => {
      if (payload?.provider !== undefined) store['aiProvider'] = normalizeProvider(payload.provider)
      const provider = normalizeProvider(store['aiProvider'])
      if (typeof payload?.apiKey === 'string') store[keyField(provider)] = encryptApiKey(payload.apiKey)
      if (payload?.model) store[modelField(provider)] = normalizeAiModel(provider, payload.model)
      if (payload?.contextTokens !== undefined) store['aiContextTokens'] = normalizeContextTokens(payload.contextTokens)
    })
    return { ok: true, data: aiConfigInfo(await readStore()) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('ai:cancel', async () => {
  if (aiAbort) {
    aiAbort.abort()
    aiAbort = null
  }
  return { ok: true, data: null }
})

ipcMain.handle('ai:ask', async (e, req: AiAskRequest) => {
  let rawKey = ''
  if (aiAbort) aiAbort.abort()
  const controller = new AbortController()
  aiAbort = controller
  try {
    const question = (req?.question ?? '').trim()
    if (!question) return { ok: false, error: 'Câu hỏi không được để trống.' }

    const store = await readStore()
    const provider = normalizeProvider(req.provider ?? store['aiProvider'])
    rawKey = decryptApiKey(store[keyField(provider)])
    const model = normalizeAiModel(provider, req.model ?? store[modelField(provider)])

    const { docs, skippedFiles } = await collectRagDocuments(req, loadRagDocumentCached)

    if (docs.length === 0) {
      return { ok: false, error: 'Chưa có file Markdown nào để tra cứu. Hãy mở thư mục hoặc chọn file Markdown trước.' }
    }

    const ragCtx = buildRagContext(docs, question, {
      scope: req.scope,
      activeFilePath: req.activeFilePath ?? undefined,
      maxContextTokens: normalizeContextTokens(store['aiContextTokens']),
    })

    const apiRes = await askLlm(provider, {
      apiKey: rawKey,
      model,
      question,
      contextText: ragCtx.contextText,
      history: Array.isArray(req.history) ? req.history : [],
      availableCitations: ragCtx.citations,
      signal: controller.signal,
      // Đẩy từng đoạn câu trả lời về renderer để hiện dần trong lúc model còn đang viết
      onDelta: (text) => {
        if (!e.sender.isDestroyed()) e.sender.send('ai:delta', text)
      },
    })

    const out: AiAskResponse = {
      answer:
        skippedFiles > 0
          ? apiRes.answer +
            `\n\n*(Lưu ý: mỗi câu hỏi chỉ đọc tối đa ${RAG_MAX_FILES} file của thư mục và ${RAG_MAX_LOOSE} file mở lẻ; ${skippedFiles} file vượt giới hạn chưa được đọc. Hãy mở thư mục con hoặc chọn "Chỉ file đang xem" để hỏi về các file đó.)*`
          : apiRes.answer,
      citations: apiRes.citations,
      mode: ragCtx.mode,
      docCount: ragCtx.docCount,
      usage: apiRes.usage,
    }
    return { ok: true, data: out }
  } catch (err) {
    const safeMsg = redactApiKey(err instanceof Error ? err.message : String(err), rawKey)
    void logError('ai:ask', new Error(safeMsg))
    return { ok: false, error: safeMsg }
  } finally {
    if (aiAbort === controller) aiAbort = null
  }
})

ipcMain.handle('dialog:openMarkdownFolder', async () => {
  try {
    const res = await dialog.showOpenDialog({
      title: 'Chọn thư mục chứa file Markdown',
      properties: ['openDirectory'],
    })
    return { ok: true, data: res.canceled ? null : res.filePaths[0] ?? null }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('mdv:list', async (_e, root: unknown) => {
  if (!(await isOpenableDirectory(root))) {
    return { ok: false, error: 'Không mở được: thư mục không tồn tại hoặc không hợp lệ.' }
  }
  try {
    const { files, mtimes, truncated } = await listMarkdownFiles(root as string)
    viewerRoots.add(root as string)
    const listing: MdFolderListing = { root: root as string, files, mtimes, truncated }
    return { ok: true, data: listing }
  } catch (err) {
    void logError('mdv:list', err)
    return { ok: false, error: friendlyError(err) }
  }
})

ipcMain.handle('mdv:read', async (_e, path: unknown) => {
  if (!isMarkdownPath(path)) return { ok: false, error: 'Chỉ đọc được file Markdown (.md).' }
  try {
    const text = await readMarkdownFile(path as string)
    viewerRoots.add(dirname(path as string))
    return { ok: true, data: text }
  } catch (err) {
    void logError('mdv:read', err)
    return { ok: false, error: friendlyError(err) }
  }
})

/** Ảnh `x2m-img://f/<đường dẫn mã hóa>`: chỉ file ảnh, chỉ trong thư mục đã mở để đọc. */
function registerImageProtocol(): void {
  protocol.handle(IMG_SCHEME, async (req) => {
    const p = imagePathFromUrl(req.url)
    const mime = p ? imageMime(p) : null
    if (!p || !mime || ![...viewerRoots].some((root) => isInsideDir(root, p))) {
      return new Response(null, { status: 403 })
    }
    try {
      return new Response(await readFile(p), { headers: { 'content-type': mime } })
    } catch {
      return new Response(null, { status: 404 })
    }
  })
}

/* ---------------------------------- App ----------------------------------- */

/** Lọc đường dẫn file Excel từ argv (mở file bằng app / kéo thả vào exe). */
function extractExcelPaths(argv: string[], cwd = process.cwd()): string[] {
  // IPC excel:* chỉ nhận đường dẫn tuyệt đối; `app.exe a.xlsx` gõ trong terminal là đường dẫn tương đối
  return argv.filter((a) => EXCEL_EXT_RE.test(a)).map((a) => resolve(cwd, a))
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
  app.on('second-instance', (_e, argv, workingDirectory) => {
    forwardFilesToWindow(extractExcelPaths(argv, workingDirectory))
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
    registerImageProtocol()
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
