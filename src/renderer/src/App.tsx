import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_OPTIONS,
  type RagCitation,
  type AppMode,
  type ConvertOptions,
  type ConvertResultItem,
  type OutputMode,
} from '../../types'
import { defaultWorkbookName } from '../../shared/workbookName'
import { imageUrl, resolveRelative } from '../../shared/mdView'
import { errMsg, type ConvertProgress } from './api'
import { baseName, copyText, toast } from './utils'
import { iconBtn } from './ui'
import { AiChatPanel } from './components/AiChatPanel'
import { FileList } from './components/FileList'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import { MdFileList } from './components/MdFileList'
import { MdOptionsPanel } from './components/MdOptionsPanel'
import { MdTreeList } from './components/MdTreeList'
import { OptionsPanel } from './components/OptionsPanel'
import { PreviewPane } from './components/PreviewPane'
import { ResultsPanel } from './components/ResultsPanel'
import { Toasts } from './components/Toasts'
import { IconX } from './components/icons'
import { EXCEL_EXT, useFiles } from './hooks/useFiles'
import { MD_EXT, useMdFiles } from './hooks/useMdFiles'
import { PASTE_PATH, useMdViewer } from './hooks/useMdViewer'
import { usePreview } from './hooks/usePreview'
import { useShortcuts } from './hooks/useShortcuts'

/** Gợi ý khi thả nhầm loại file so với chế độ đang chọn (không tự chuyển chế độ). */
const HINT_EXCEL_FILE = 'File Excel: chuyển sang chế độ Excel → Markdown để convert'
const HINT_MD_FILE = 'File Markdown: chuyển sang chế độ Markdown → Excel để tạo file Excel'

/** Thời điểm convert hiện ở thanh dưới. */
function timeLabel(): string {
  return new Date().toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
}

/** Theme mặc định lần đầu chạy: theo OS thay vì cứng dark. */
function systemTheme(): 'dark' | 'light' {
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export default function App(): React.ReactElement {
  const [options, setOptions] = useState<ConvertOptions>(DEFAULT_OPTIONS)
  const [outputMode, setOutputMode] = useState<OutputMode>('per-sheet')
  const [outDir, setOutDir] = useState<string>('')
  const [recentDirs, setRecentDirs] = useState<string[]>([])
  const [theme, setTheme] = useState<'dark' | 'light'>(systemTheme)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [selFileId, setSelFileId] = useState<string | null>(null)
  const [selSheet, setSelSheet] = useState<string | null>(null)
  const [converting, setConverting] = useState(false)
  const [progress, setProgress] = useState<ConvertProgress | null>(null)
  const [lastConvertAt, setLastConvertAt] = useState('')
  const [results, setResults] = useState<ConvertResultItem[] | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [appVersion, setAppVersion] = useState('')
  const [sheetFilter, setSheetFilter] = useState('')
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [appMode, setAppMode] = useState<AppMode>('excel2md')
  /** Tên file Excel người dùng gõ; null = chưa sửa (dùng tên mặc định theo danh sách file) */
  const [mdName, setMdName] = useState<string | null>(null)
  const [mdResult, setMdResult] = useState<ConvertResultItem | null>(null)
  /** Cột Tùy chọn bên phải và cột File bên trái (thu gọn & độ rộng kéo giãn) */
  const [sideCollapsed, setSideCollapsed] = useState(false)
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [leftWidth, setLeftWidth] = useState(300)
  const [rightWidth, setRightWidth] = useState(304)
  const [scrollTarget, setScrollTarget] = useState<{ heading: string; seq: number } | null>(null)

  const persist = useCallback((key: string, value: unknown) => {
    window.api.storeSet(key, value).catch(() => undefined)
  }, [])

  const {
    files,
    setSavedChecks,
    addPaths,
    removeFile: dropFile,
    toggleFileSheets,
    toggleSheet,
    reloadSheets,
    relistAll,
  } = useFiles(options.skipDelSheets, persist)

  const {
    files: mdFiles,
    selectedId: mdSelId,
    selected: mdSel,
    addPaths: addMdPaths,
    reload: reloadMdFile,
    remove: removeMdFile,
    move: moveMdFile,
    select: selectMdFile,
  } = useMdFiles()

  const viewer = useMdViewer(persist)

  /* ------------------------------- theme/store ------------------------------ */
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [t, d, o, m, sc, am] = await Promise.all([
          window.api.storeGet<'dark' | 'light'>('theme'),
          window.api.storeGet<string>('outDir'),
          window.api.storeGet<ConvertOptions>('options'),
          window.api.storeGet<OutputMode>('outputMode'),
          window.api.storeGet<Record<string, string[]>>('checkedSheets'),
          window.api.storeGet<AppMode>('mode'),
        ])
        if (!alive) return
        if (t === 'dark' || t === 'light') setTheme(t)
        if (d) setOutDir(d)
        window.api
          .storeGet<string[]>('recentDirs')
          .then((r) => {
            if (Array.isArray(r)) setRecentDirs(r.filter((x) => typeof x === 'string').slice(0, 5))
          })
          .catch(() => undefined)
        if (o) setOptions({ ...DEFAULT_OPTIONS, ...o })
        if (m === 'per-sheet' || m === 'per-workbook') setOutputMode(m)
        if (sc && typeof sc === 'object') setSavedChecks(sc)
        if (am === 'excel2md' || am === 'md2excel' || am === 'mdview') setAppMode(am)
      } catch {
        /* bỏ qua: dùng mặc định */
      }
    })()
    return () => {
      alive = false
    }
    // chỉ nạp một lần khi mở app
  }, [])

  // Cột Tùy chọn thu gọn + thư mục/file Đọc Markdown lần trước (thư mục đã mất thì bỏ qua, không báo lỗi)
  const { openFolder: viewerOpenFolder, select: viewerSelect, openFiles: viewerOpenFiles } = viewer
  useEffect(() => {
    window.api
      .storeGet<boolean>('sideCollapsed')
      .then((c) => setSideCollapsed(c === true))
      .catch(() => undefined)
    ;(async () => {
      try {
        const [root, file] = await Promise.all([
          window.api.storeGet<string>('viewerRoot'),
          window.api.storeGet<string>('viewerFile'),
        ])
        if (typeof root !== 'string' || root === '') return
        const files = await viewerOpenFolder(root, true)
        if (files && typeof file === 'string' && files.includes(file)) void viewerSelect(file)
      } catch {
        /* bỏ qua: bắt đầu với chế độ đọc trống */
      }
    })()
  }, [viewerOpenFolder, viewerSelect])

  const toggleSide = useCallback(() => {
    setSideCollapsed((c) => {
      persist('sideCollapsed', !c)
      return !c
    })
  }, [persist])

  const toggleLeft = useCallback(() => {
    setLeftCollapsed((c) => !c)
  }, [])

  const startResize = useCallback(
    (side: 'left' | 'right', e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault()
      const startX = e.clientX
      const startW = side === 'left' ? leftWidth : rightWidth
      const onMove = (ev: MouseEvent): void => {
        const delta = ev.clientX - startX
        if (side === 'left') {
          setLeftWidth(Math.min(520, Math.max(220, startW + delta)))
        } else {
          setRightWidth(Math.min(500, Math.max(240, startW - delta)))
        }
      }
      const onUp = (): void => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        document.body.style.cursor = ''
      }
      document.body.style.cursor = 'col-resize'
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [leftWidth, rightWidth]
  )

  useEffect(() => window.api.onProgress((pr) => setProgress(pr)), [])

  const addPathsRef = useRef(addPaths)
  addPathsRef.current = addPaths
  const appModeRef = useRef(appMode)
  appModeRef.current = appMode
  // main chỉ chuyển tiếp file Excel (mở bằng app): luôn vào danh sách Excel
  useEffect(
    () =>
      window.api.onOpenFiles((paths) => {
        void addPathsRef.current(paths)
        if (appModeRef.current !== 'excel2md') toast(HINT_EXCEL_FILE, 'err')
      }),
    []
  )

  useEffect(() => {
    window.api
      .getVersion()
      .then((v) => setAppVersion(v))
      .catch(() => undefined)
    window.api
      .storeGet<boolean>('onboardingSeen')
      .then((seen) => {
        if (!seen) setShowOnboarding(true)
      })
      .catch(() => undefined)
  }, [])

  const changeAppMode = useCallback(
    (m: AppMode) => {
      setAppMode(m)
      persist('mode', m)
    },
    [persist]
  )

  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    persist('theme', next)
  }, [theme, persist])

  /* -------------------------------- files ---------------------------------- */
  const pickFiles = useCallback(async () => {
    try {
      await addPaths(await window.api.openExcelFiles())
    } catch (err) {
      toast(errMsg(err), 'err')
    }
  }, [addPaths])

  const pickMdFiles = useCallback(async () => {
    try {
      await addMdPaths(await window.api.openMarkdownFiles())
    } catch (err) {
      toast(errMsg(err), 'err')
    }
  }, [addMdPaths])

  const pickViewerFolder = useCallback(async () => {
    try {
      const dir = await window.api.openMarkdownFolder()
      if (dir) await viewerOpenFolder(dir)
    } catch (err) {
      toast(errMsg(err), 'err')
    }
  }, [viewerOpenFolder])

  const pickViewerFiles = useCallback(async () => {
    try {
      viewerOpenFiles(await window.api.openMarkdownFiles())
    } catch (err) {
      toast(errMsg(err), 'err')
    }
  }, [viewerOpenFiles])

  /** Thả file: chỉ nhận loại file của chế độ đang chọn, loại kia chỉ gợi ý chuyển chế độ.
   * Chế độ Đọc Markdown: file .md mở để xem, thứ khác thử mở như thư mục. */
  const dropPaths = useCallback(
    (paths: string[]) => {
      if (appMode === 'mdview') {
        if (paths.some((p) => EXCEL_EXT.test(p))) toast(HINT_EXCEL_FILE, 'err')
        viewerOpenFiles(paths.filter((p) => MD_EXT.test(p)))
        const dir = paths.find((p) => !MD_EXT.test(p) && !EXCEL_EXT.test(p))
        if (dir) void viewerOpenFolder(dir)
        return
      }
      const [foreign, hint, add] =
        appMode === 'md2excel' ? [EXCEL_EXT, HINT_EXCEL_FILE, addMdPaths] : [MD_EXT, HINT_MD_FILE, addPaths]
      if (paths.some((p) => foreign.test(p))) toast(hint, 'err')
      const rest = paths.filter((p) => !foreign.test(p))
      if (rest.length > 0) void add(rest)
    },
    [appMode, addMdPaths, addPaths, viewerOpenFiles, viewerOpenFolder]
  )

  const removeFile = useCallback(
    (id: string) => {
      dropFile(id)
      if (selFileId === id) {
        setSelFileId(null)
        setSelSheet(null)
      }
    },
    [dropFile, selFileId]
  )

  const clearAllFiles = useCallback(() => {
    for (const f of files) dropFile(f.id)
    setSelFileId(null)
    setSelSheet(null)
    setResults(null)
  }, [files, dropFile])

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((p) => ({ ...p, [id]: !(p[id] ?? false) }))
  }, [])

  // chọn mặc định file/sheet đầu tiên khi có dữ liệu
  useEffect(() => {
    if (selFileId) return
    const first = files.find((f) => f.sheets.length > 0)
    if (first) {
      setSelFileId(first.id)
      setSelSheet(first.sheets[0].name)
      setExpanded((prev) => ({ ...prev, [first.id]: true }))
    }
  }, [files, selFileId])

  const selFile = useMemo(() => files.find((f) => f.id === selFileId) ?? null, [files, selFileId])

  const selectSheet = useCallback((fileId: string, sheetName: string) => {
    setSelFileId(fileId)
    setSelSheet(sheetName)
    setExpanded((prev) => ({ ...prev, [fileId]: true }))
    setResults(null)
  }, [])

  const moveSheet = useCallback(
    (dir: 1 | -1) => {
      if (!selFile || !selSheet) return
      const names = selFile.sheets.map((x) => x.name)
      const next = names[names.indexOf(selSheet) + dir]
      if (next) selectSheet(selFile.id, next)
    },
    [selFile, selSheet, selectSheet]
  )

  const preview = usePreview(selFile, selSheet, options)

  /* ------------------------------- options --------------------------------- */
  const setOption = useCallback(
    <K extends keyof ConvertOptions>(key: K, value: ConvertOptions[K]) => {
      setOptions((prev) => {
        const next = { ...prev, [key]: value }
        persist('options', next)
        return next
      })
      // đổi skipDelSheets thì nạp lại danh sách sheet
      if (key === 'skipDelSheets') void relistAll(value as boolean)
    },
    [relistAll, persist]
  )

  const applyPreset = useCallback(
    (patch: Partial<ConvertOptions>) => {
      setOptions((prev) => {
        const next = { ...prev, ...patch }
        persist('options', next)
        return next
      })
      if (patch.skipDelSheets !== undefined) void relistAll(patch.skipDelSheets)
    },
    [relistAll, persist]
  )

  const setMode = useCallback(
    (m: OutputMode) => {
      setOutputMode(m)
      persist('outputMode', m)
    },
    [persist]
  )

  const dismissOnboarding = useCallback(() => {
    setShowOnboarding(false)
    persist('onboardingSeen', true)
  }, [persist])

  const resetOptions = useCallback(() => {
    setOptions(DEFAULT_OPTIONS)
    persist('options', DEFAULT_OPTIONS)
    setOutputMode('per-sheet')
    persist('outputMode', 'per-sheet')
    toast('Đã khôi phục tùy chọn mặc định', 'ok')
  }, [persist])

  /* ------------------------------- out dir --------------------------------- */
  const rememberDir = useCallback(
    (dir: string) => {
      setRecentDirs((prev) => {
        const next = [dir, ...prev.filter((x) => x !== dir)].slice(0, 5)
        persist('recentDirs', next)
        return next
      })
    },
    [persist]
  )

  const applyOutDir = useCallback(
    (dir: string, remember: boolean) => {
      setOutDir(dir)
      persist('outDir', dir)
      if (remember) rememberDir(dir)
    },
    [persist, rememberDir]
  )

  const chooseOutDir = useCallback(async () => {
    try {
      const dir = await window.api.openDirectory()
      if (dir) applyOutDir(dir, true)
    } catch (err) {
      toast(errMsg(err), 'err')
    }
  }, [applyOutDir])

  const copyOutDir = useCallback(async () => {
    if (!outDir) return
    const ok = await copyText(outDir)
    toast(ok ? 'Đã copy đường dẫn thư mục' : 'Copy thất bại', ok ? 'ok' : 'err')
  }, [outDir])

  const openOutDir = useCallback(async () => {
    if (!outDir) return
    try {
      await window.api.openPath(outDir)
    } catch (err) {
      toast(errMsg(err), 'err')
    }
  }, [outDir])

  /* ------------------------------- convert --------------------------------- */
  const checkedCount = useMemo(
    () => files.reduce((n, f) => n + f.sheets.filter((s) => s.checked).length, 0),
    [files]
  )

  /** Thư mục xuất hiện tại; chưa có thì hỏi người dùng. null = bỏ qua (hoặc lỗi đã báo). */
  const ensureOutDir = useCallback(async (): Promise<string | null> => {
    if (outDir) return outDir
    try {
      const picked = await window.api.openDirectory()
      if (!picked) return null
      applyOutDir(picked, true)
      return picked
    } catch (err) {
      toast(errMsg(err), 'err')
      return null
    }
  }, [outDir, applyOutDir])

  const doConvert = useCallback(async () => {
    // đang chạy (kể cả lần tạo Excel ở chế độ kia): không gửi lần mới, tránh xóa cờ converting khi main từ chối
    if (converting) return
    if (files.length === 0) {
      toast('Chưa có file Excel nào', 'err')
      return
    }
    const specs = files
      .map((f) => ({ path: f.path, sheets: f.sheets.filter((s) => s.checked).map((s) => s.name) }))
      .filter((s) => s.sheets.length > 0)
    if (specs.length === 0) {
      toast('Chưa chọn sheet nào để convert', 'err')
      return
    }
    const dir = await ensureOutDir()
    if (!dir) return
    setConverting(true)
    setResults(null)
    setProgress(null)
    try {
      const res = await window.api.convert({ files: specs, outDir: dir, options, outputMode })
      setResults(res)
      const okCount = res.filter((r) => r.ok).length
      const cancelledCount = res.filter((r) => r.cancelled).length
      const mdCount = res.reduce((n, r) => n + r.filesWritten.length, 0)
      if (cancelledCount > 0) {
        toast(`Đã hủy: ${okCount} file Excel đã convert xong, ${cancelledCount} file bị hủy`, 'err')
      } else if (okCount === res.length) {
        toast(
          mdCount === 0
            ? 'Không tạo file nào (các sheet đều rỗng hoặc bị bỏ qua)'
            : `Xong: ${mdCount} file Markdown từ ${res.length} file Excel`
        )
        setLastConvertAt(timeLabel())
      } else {
        toast(`${okCount}/${res.length} file thành công, xem chi tiết bên dưới`, 'err')
      }
    } catch (err) {
      toast(errMsg(err), 'err')
    } finally {
      setConverting(false)
      window.setTimeout(() => setProgress(null), 1500)
    }
  }, [converting, files, options, outputMode, ensureOutDir])

  /* ------------------------- Markdown → Excel ------------------------------ */
  const mdDefaultName = useMemo(() => defaultWorkbookName(mdFiles), [mdFiles])
  const mdSheetCount = useMemo(() => mdFiles.reduce((n, f) => n + f.sheets.length, 0), [mdFiles])
  const mdCanConvert = mdSheetCount > 0 && mdFiles.every((f) => !f.loading && !f.error)

  // danh sách rỗng -> lần thêm file sau lại dùng tên mặc định mới
  useEffect(() => {
    if (mdFiles.length === 0) setMdName(null)
  }, [mdFiles.length])

  const selectMd = useCallback(
    (id: string) => {
      selectMdFile(id)
      setMdResult(null)
    },
    [selectMdFile]
  )

  /** ↑/↓: chọn file trước/sau trong danh sách Markdown. */
  const moveMdSelection = useCallback(
    (dir: 1 | -1) => {
      const next = mdFiles[mdFiles.findIndex((f) => f.id === mdSelId) + dir]
      if (next) selectMd(next.id)
    },
    [mdFiles, mdSelId, selectMd]
  )

  const doMdConvert = useCallback(async () => {
    if (converting) return
    if (mdFiles.length === 0) {
      toast('Chưa có file Markdown nào', 'err')
      return
    }
    if (mdFiles.some((f) => f.loading)) {
      toast('Đang đọc file Markdown, vui lòng chờ', 'err')
      return
    }
    const bad = mdFiles.filter((f) => f.error)
    if (bad.length > 0) {
      // một file lỗi thì không tạo file Excel (thiếu sheet còn tệ hơn không có)
      toast(`Không tạo file Excel: file lỗi ${bad.map((f) => f.name).join(', ')}`, 'err')
      return
    }
    if (mdSheetCount === 0) {
      toast('Không có sheet nào để tạo (các file Markdown đều rỗng)', 'err')
      return
    }
    const dir = await ensureOutDir()
    if (!dir) return
    setConverting(true)
    setMdResult(null)
    setProgress(null)
    try {
      const res = await window.api.convertMarkdown({
        files: mdFiles.map((f) => f.path),
        outDir: dir,
        // ô tên để trống = dùng tên mặc định
        fileName: (mdName ?? '').trim() || mdDefaultName,
      })
      if (res.status === 'done') {
        const name = baseName(res.outPath)
        toast(`Đã tạo ${name} (${res.sheets.length} sheet)`)
        setMdResult({ fileName: name, ok: true, filesWritten: res.sheets })
        setLastConvertAt(timeLabel())
      } else if (res.status === 'cancelled') {
        toast('Đã hủy tạo file Excel', 'err')
      }
      // declined: người dùng chọn không ghi đè -> không làm gì
    } catch (err) {
      toast(errMsg(err), 'err')
    } finally {
      setConverting(false)
    }
  }, [converting, mdFiles, mdSheetCount, mdName, mdDefaultName, ensureOutDir])

  const isMd = appMode === 'md2excel'
  const isView = appMode === 'mdview'

  /** Preview Excel: ảnh trong sheet được worker nhúng sẵn dạng data:. */
  const resolvePreviewImage = useCallback((src: string): string | null => (/^data:image\/(png|jpe?g|gif|webp|bmp);/i.test(src) ? src : null), [])

  /* ----------------------------- Đọc Markdown ------------------------------ */
  const viewerPath = viewer.doc?.path ?? null

  /** Ảnh trong file đang xem: đường dẫn tương đối -> scheme ảnh cục bộ; data: ảnh raster giữ nguyên;
   * ảnh từ mạng bị bỏ (CSP không cho tải mạng). */
  const resolveViewerImage = useCallback(
    (src: string): string | null => {
      if (/^data:image\/(png|jpe?g|gif|webp);/i.test(src)) return src
      const abs = viewerPath && viewerPath !== PASTE_PATH ? resolveRelative(viewerPath, src) : null
      return abs ? imageUrl(abs) : null
    },
    [viewerPath]
  )

  /** Link tới file .md khác (tương đối): mở ngay trong app. Link http/mailto: để main mở bằng trình duyệt. */
  const viewerLinkClick = useCallback(
    (href: string): boolean => {
      if (/^(https?:|mailto:)/i.test(href)) return false
      if (href.startsWith('#')) return true
      const abs = viewerPath && viewerPath !== PASTE_PATH ? resolveRelative(viewerPath, href) : null
      if (abs && MD_EXT.test(abs)) viewerOpenFiles([abs])
      else toast('Chỉ mở được link tới file Markdown hoặc link web', 'err')
      return true
    },
    [viewerPath, viewerOpenFiles]
  )

  /** Thanh trên preview: đường dẫn tương đối trong thư mục đang mở, file lẻ thì tên file. */
  const viewerRoot = viewer.root
  const viewerTitle = useMemo(() => {
    if (!viewerPath) return null
    if (viewerPath === PASTE_PATH) return 'Dán từ clipboard'
    if (viewerRoot && viewerPath.startsWith(viewerRoot)) return viewerPath.slice(viewerRoot.length).replace(/^[\\/]+/, '')
    return baseName(viewerPath)
  }, [viewerPath, viewerRoot])

  /** Dán Markdown từ clipboard để xem; clipboard rỗng hoặc bị từ chối thì báo lỗi, giữ nguyên tài liệu đang xem. */
  const pasteViewer = useCallback(async () => {
    let text = ''
    try {
      text = await navigator.clipboard.readText()
    } catch {
      /* bị từ chối quyền: xử lý như clipboard rỗng */
    }
    if (text.trim() === '') toast('Clipboard trống hoặc không đọc được', 'err')
    else viewer.pasteText(text)
  }, [viewer.pasteText])

  const viewerLooseItems = useMemo(
    () => viewer.loose.map((p) => ({ path: p, name: baseName(p) })),
    [viewer.loose]
  )

  const handleJumpToCitation = useCallback(
    async (c: RagCitation) => {
      if (c.filePath === PASTE_PATH) {
        if (viewerPath !== PASTE_PATH) viewer.showPaste()
      } else if (c.filePath !== viewerPath) {
        await viewerSelect(c.filePath)
      }
      setScrollTarget({ heading: c.sectionTitle, seq: Date.now() })
    },
    [viewerPath, viewer.showPaste, viewerSelect]
  )

  const cancelConvert = useCallback(() => {
    window.api.cancelConvert().catch((err) => toast(errMsg(err), 'err'))
  }, [])

  useShortcuts({
    onEscape: () => {
      setResults(null)
      setMdResult(null)
      setSheetFilter('')
      viewer.setFilter('')
    },
    onMoveSheet: isView ? viewer.move : isMd ? moveMdSelection : moveSheet,
    // Đọc Markdown không có convert
    onConvert: () => void (isView ? undefined : isMd ? doMdConvert() : doConvert()),
    onPickFiles: () => void (isView ? pickViewerFolder() : isMd ? pickMdFiles() : pickFiles()),
    onZoom: (a) =>
      setZoom((z) =>
        a === 'reset'
          ? 1
          : a === 'in'
            ? Math.min(2, Math.round((z + 0.1) * 100) / 100)
            : Math.max(0.5, Math.round((z - 0.1) * 100) / 100)
      ),
  })

  // Trạng thái + nút convert ở thanh dưới theo chế độ (chế độ Excel giữ nguyên chữ cũ)
  const footerMode = isMd
    ? {
        status: `${mdFiles.length} file, ${mdSheetCount} sheet sẽ tạo`,
        convertLabel: `Tạo file Excel (${mdSheetCount} sheet)`,
        canConvert: mdCanConvert,
        onConvert: doMdConvert,
      }
    : {
        status: `${files.length} file, ${checkedCount} sheet được chọn`,
        convertLabel: `Convert ${checkedCount > 0 ? `${checkedCount} sheet ` : ''}sang Markdown`,
        canConvert: files.length > 0 && checkedCount > 0,
        onConvert: doConvert,
      }

  /* -------------------------------- render --------------------------------- */
  return (
    <div
      className="x2m-app flex h-screen flex-col p-2 text-ink"
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const paths = Array.from(e.dataTransfer.files)
          .map((f) => window.api.getPathForFile(f))
          .filter(Boolean)
        dropPaths(paths)
      }}
    >
      <div className="x2m-shell flex min-h-0 flex-1 flex-col">
      <div className="x2m-core glass flex min-h-0 flex-1 flex-col overflow-hidden">
      <Header
        theme={theme}
        onToggleTheme={toggleTheme}
        onPickFiles={isView ? pickViewerFolder : isMd ? pickMdFiles : pickFiles}
        mode={appMode}
        onModeChange={changeAppMode}
      />

      {showOnboarding && (
        <div className="x2m-onboarding flex shrink-0 items-center justify-between border-b border-accent-line/40 bg-accent-soft px-4 py-1.5 text-xs text-dim [&_b]:font-semibold [&_b]:text-ink">
          {isView ? (
            <span>
              Kéo thả thư mục hoặc file Markdown vào đây để đọc — <b>Ctrl+O</b> mở thư mục,
              <b> ↑/↓</b> chuyển file.
            </span>
          ) : isMd ? (
            <span>
              Kéo thả file Markdown vào đây để bắt đầu — <b>Ctrl+O</b> thêm file,
              <b> Ctrl+Enter</b> để tạo file Excel.
            </span>
          ) : (
            <span>
              Kéo thả file Excel vào đây để bắt đầu — <b>Ctrl+O</b> thêm file,
              <b> Ctrl+Enter</b> để convert.
            </span>
          )}
          <button className={`icon-btn ${iconBtn}`} onClick={dismissOnboarding} title="Đóng" aria-label="Đóng">
            <IconX size={14} />
          </button>
        </div>
      )}

      <div className="x2m-body flex min-h-0 flex-1">
        {isView ? (
          <>
            <MdTreeList
              root={viewer.root}
              tree={viewer.tree}
              relFiles={viewer.relFiles}
              recent={viewer.recent}
              mtimes={viewer.mtimes}
              sort={viewer.sort}
              onSortChange={viewer.setSort}
              pasted={viewer.pasted !== null}
              onPaste={() => void pasteViewer()}
              onShowPaste={viewer.showPaste}
              onClosePaste={viewer.closePaste}
              loose={viewer.loose}
              collapsed={viewer.collapsed}
              selectedPath={viewerPath}
              listing={viewer.listing}
              dragOver={dragOver}
              filter={viewer.filter}
              onFilterChange={viewer.setFilter}
              onSelect={(p) => void viewerSelect(p)}
              onToggleDir={viewer.toggleDir}
              onOpenFolder={() => void pickViewerFolder()}
              onOpenFiles={() => void pickViewerFiles()}
              onRefresh={() => viewer.root && void viewerOpenFolder(viewer.root)}
              onCloseFolder={viewer.closeFolder}
              onRemoveLoose={viewer.removeLoose}
            />

            <main className="x2m-main flex min-w-0 flex-1 flex-col overflow-hidden bg-editor">
              <PreviewPane
                title={viewerTitle}
                md={viewer.doc?.markdown ?? ''}
                loading={viewer.doc?.loading ?? false}
                error={viewer.doc?.error ?? ''}
                zoom={zoom}
                onResetZoom={() => setZoom(1)}
                noSelectionText="Chưa chọn file"
                loadingText="Đang đọc..."
                emptyText={viewer.doc ? 'File rỗng' : 'Chọn một file Markdown bên trái để đọc'}
                resolveImage={resolveViewerImage}
                onLinkClick={viewerLinkClick}
                fullWidth
                scrollTarget={scrollTarget}
              />
            </main>

            {!sideCollapsed && (
              <div
                className="x2m-resizer relative z-[5] -mx-[3px] w-[5px] shrink-0 cursor-col-resize bg-transparent transition-colors duration-300 ease-spring hover:bg-accent/70 active:bg-accent"
                onMouseDown={(e) => startResize('right', e)}
                title="Kéo để thay đổi độ rộng cột Trợ lý AI"
              />
            )}

            <AiChatPanel
              collapsed={sideCollapsed}
              onToggleCollapsed={toggleSide}
              width={rightWidth}
              rootDir={viewer.root}
              relFiles={viewer.relFiles}
              looseFiles={viewerLooseItems}
              activeFilePath={viewerPath}
              activeMarkdown={viewer.doc?.markdown ?? ''}
              pastedMarkdown={viewer.pasted}
              onJumpToCitation={(c) => void handleJumpToCitation(c)}
            />
          </>
        ) : isMd ? (
          <>
            <MdFileList
              files={mdFiles}
              selectedId={mdSelId}
              dragOver={dragOver}
              onSelect={selectMd}
              onReload={(id) => void reloadMdFile(id)}
              onMove={moveMdFile}
              onRemove={removeMdFile}
            />

            <main className="x2m-main flex min-w-0 flex-1 flex-col overflow-hidden bg-editor">
              <PreviewPane
                title={mdSel ? mdSel.name : null}
                md={mdSel?.markdown ?? ''}
                loading={mdSel?.loading ?? false}
                error={mdSel?.error ?? ''}
                zoom={zoom}
                onResetZoom={() => setZoom(1)}
                noSelectionText="Chưa chọn file"
                loadingText="Đang đọc..."
                emptyText="Chọn một file Markdown để xem trước"
              />
              {mdResult && (
                <ResultsPanel
                  results={[mdResult]}
                  outDir={outDir}
                  converting={converting}
                  onRetry={() => void doMdConvert()}
                  onClose={() => setMdResult(null)}
                  onOpenDir={openOutDir}
                  onCopyDir={copyOutDir}
                  unitLabel="sheet"
                  openDirLabel="Mở thư mục chứa file Excel"
                />
              )}
            </main>

            {!sideCollapsed && (
              <div
                className="x2m-resizer relative z-[5] -mx-[3px] w-[5px] shrink-0 cursor-col-resize bg-transparent transition-colors duration-300 ease-spring hover:bg-accent/70 active:bg-accent"
                onMouseDown={(e) => startResize('right', e)}
                title="Kéo để thay đổi độ rộng cột Tùy chọn"
              />
            )}

            <MdOptionsPanel
              fileName={mdName ?? mdDefaultName}
              defaultName={mdDefaultName}
              onFileNameChange={setMdName}
              collapsed={sideCollapsed}
              onToggleCollapsed={toggleSide}
              width={rightWidth}
            />
          </>
        ) : (
          <>
            <FileList
              files={files}
              expanded={expanded}
              onToggleExpanded={toggleExpanded}
              selFileId={selFileId}
              selSheet={selSheet}
              sheetFilter={sheetFilter}
              onSheetFilterChange={setSheetFilter}
              dragOver={dragOver}
              onToggleFileSheets={toggleFileSheets}
              onToggleSheet={toggleSheet}
              onSelectSheet={selectSheet}
              onRemoveFile={removeFile}
              onClearAll={clearAllFiles}
              onReloadSheets={reloadSheets}
              collapsed={leftCollapsed}
              onToggleCollapsed={toggleLeft}
              width={leftWidth}
            />

            {!leftCollapsed && (
              <div
                className="x2m-resizer relative z-[5] -mx-[3px] w-[5px] shrink-0 cursor-col-resize bg-transparent transition-colors duration-300 ease-spring hover:bg-accent/70 active:bg-accent"
                onMouseDown={(e) => startResize('left', e)}
                title="Kéo để thay đổi độ rộng cột File Excel"
              />
            )}

            <main className="x2m-main flex min-w-0 flex-1 flex-col overflow-hidden bg-editor">
              <PreviewPane
                title={selFile && selSheet ? `${selFile.name} / ${selSheet}` : null}
                md={preview.md}
                resolveImage={resolvePreviewImage}
                loading={preview.loading}
                error={preview.error}
                zoom={zoom}
                onResetZoom={() => setZoom(1)}
              />
              {results && (
                <ResultsPanel
                  results={results}
                  outDir={outDir}
                  converting={converting}
                  onRetry={() => void doConvert()}
                  onClose={() => setResults(null)}
                  onOpenDir={openOutDir}
                  onCopyDir={copyOutDir}
                />
              )}
            </main>

            {!sideCollapsed && (
              <div
                className="x2m-resizer relative z-[5] -mx-[3px] w-[5px] shrink-0 cursor-col-resize bg-transparent transition-colors duration-300 ease-spring hover:bg-accent/70 active:bg-accent"
                onMouseDown={(e) => startResize('right', e)}
                title="Kéo để thay đổi độ rộng cột Tùy chọn"
              />
            )}

            <OptionsPanel
              options={options}
              outputMode={outputMode}
              onSetOption={setOption}
              onApplyPreset={applyPreset}
              onSetMode={setMode}
              onReset={resetOptions}
              collapsed={sideCollapsed}
              onToggleCollapsed={toggleSide}
              width={rightWidth}
            />
          </>
        )}
      </div>

      {/* Đọc Markdown không convert nên không có thanh thư mục lưu + nút convert */}
      {!isView && (
        <Footer
          outDir={outDir}
          recentDirs={recentDirs}
          onPickRecentDir={(dir) => applyOutDir(dir, false)}
          onChooseDir={chooseOutDir}
          onOpenDir={openOutDir}
          converting={converting}
          progress={progress}
          onCancel={cancelConvert}
          appVersion={appVersion}
          lastConvertAt={lastConvertAt}
          outDirPlaceholder={isMd ? 'Chưa chọn thư mục lưu file Excel' : undefined}
          {...footerMode}
        />
      )}
      </div>
      </div>

      <Toasts />
    </div>
  )
}
