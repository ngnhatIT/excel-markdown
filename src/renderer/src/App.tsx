import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_OPTIONS,
  type MdSearchHit,
  type RagCitation,
  type AppMode,
  type ConvertOptions,
  type ConvertResultItem,
  type OutputMode,
} from '../../shared/types'
import { hrefHash, imageUrl, resolveRelative } from '../../shared/mdView'
import { errMsg } from './lib/api'
import { baseName, copyText, toast } from './lib/utils'
import { iconBtn } from './lib/ui'
import { AiChatPanel } from './features/ai/AiChatPanel'
import { FileList } from './features/excel2md/FileList'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import { MdFileList } from './features/md2excel/MdFileList'
import { MdOptionsPanel } from './features/md2excel/MdOptionsPanel'
import { MdTreeList } from './features/viewer/MdTreeList'
import { OptionsPanel } from './features/excel2md/OptionsPanel'
import { extractOutline, PreviewPane, type ScrollTarget } from './components/PreviewPane'
import { CommandPalette, type PaletteItem } from './features/viewer/CommandPalette'
import { ResultsPanel } from './components/ResultsPanel'
import { Toasts } from './components/Toasts'
import { IconX } from './components/icons'
import { useExcelConvert } from './features/excel2md/useExcelConvert'
import { EXCEL_EXT, useFiles } from './features/excel2md/useFiles'
import { useMdConvert } from './features/md2excel/useMdConvert'
import { MD_EXT, useMdFiles } from './features/md2excel/useMdFiles'
import { joinRoot, PASTE_PATH, useMdViewer } from './features/viewer/useMdViewer'
import { ComparePane } from './features/compare/ComparePane'
import { SpecMapPane } from './features/viewer/SpecMapPane'
import { useCompare } from './features/compare/useCompare'
import { usePreview } from './features/excel2md/usePreview'
import { useShortcuts } from './hooks/useShortcuts'
import { detectLang, getLocale, isLang, setLang, t as tr, useT, type Lang } from './i18n'

/** Gợi ý khi thả nhầm loại file so với chế độ đang chọn (không tự chuyển chế độ). */
const hintExcelFile = (): string => tr('app.hint.excelFile')
const hintMdFile = (): string => tr('app.hint.mdFile')

/** Thời điểm convert hiện ở thanh dưới. */
function timeLabel(): string {
  return new Date().toLocaleString(getLocale(), { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
}

/** `**chữ**` trong câu dịch -> <b>chữ</b> (onboarding). */
const withBold = (s: string): React.ReactNode[] => s.split('**').map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part))

/** Theme mặc định lần đầu chạy: theo OS thay vì cứng dark. */
function systemTheme(): 'dark' | 'light' {
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

/** decodeURIComponent không ném với chuỗi % hỏng (link do người viết tài liệu gõ tay). */
const safeDecode = (s: string): string => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

export default function App(): React.ReactElement {
  const t = useT()
  const [options, setOptions] = useState<ConvertOptions>(DEFAULT_OPTIONS)
  const [outputMode, setOutputMode] = useState<OutputMode>('per-sheet')
  const [outDir, setOutDir] = useState<string>('')
  const [recentDirs, setRecentDirs] = useState<string[]>([])
  const [theme, setTheme] = useState<'dark' | 'light'>(systemTheme)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [selFileId, setSelFileId] = useState<string | null>(null)
  const [selSheet, setSelSheet] = useState<string | null>(null)
  /** Dùng chung cho cả 2 chế độ convert: main từ chối lần convert thứ hai khi đang chạy */
  const [converting, setConverting] = useState(false)
  const [results, setResults] = useState<ConvertResultItem[] | null>(null)
  const [mdResult, setMdResult] = useState<ConvertResultItem | null>(null)
  const [lastConvertAt, setLastConvertAt] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [appVersion, setAppVersion] = useState('')
  const [sheetFilter, setSheetFilter] = useState('')
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [appMode, setAppMode] = useState<AppMode>('excel2md')
  /** Cột Tùy chọn bên phải và cột File bên trái (thu gọn & độ rộng kéo giãn) */
  const [sideCollapsed, setSideCollapsed] = useState(false)
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [leftWidth, setLeftWidth] = useState(300)
  const [rightWidth, setRightWidth] = useState(304)
  const [scrollTarget, setScrollTarget] = useState<ScrollTarget | null>(null)
  /** Bản đồ thiết kế + 影響調査 thay vùng xem của chế độ Đọc Markdown */
  const [specMapOpen, setSpecMapOpen] = useState(false)

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
  const compare = useCompare()

  /* ------------------------------- theme/store ------------------------------ */
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [th, d, o, m, sc, am, lg] = await Promise.all([
          window.api.storeGet<'dark' | 'light'>('theme'),
          window.api.storeGet<string>('outDir'),
          window.api.storeGet<ConvertOptions>('options'),
          window.api.storeGet<OutputMode>('outputMode'),
          window.api.storeGet<Record<string, string[]>>('checkedSheets'),
          window.api.storeGet<AppMode>('mode'),
          window.api.storeGet<string>('lang'),
        ])
        if (!alive) return
        setLang(isLang(lg) ? lg : detectLang())
        if (th === 'dark' || th === 'light') setTheme(th)
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
        if (am === 'excel2md' || am === 'md2excel' || am === 'mdview' || am === 'compare') setAppMode(am)
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

  const addPathsRef = useRef(addPaths)
  addPathsRef.current = addPaths
  const appModeRef = useRef(appMode)
  appModeRef.current = appMode
  // main chỉ chuyển tiếp file Excel (mở bằng app): luôn vào danh sách Excel
  useEffect(
    () =>
      window.api.onOpenFiles((paths) => {
        void addPathsRef.current(paths)
        if (appModeRef.current !== 'excel2md') toast(hintExcelFile(), 'err')
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

  const changeLang = useCallback(
    (l: Lang) => {
      setLang(l)
      persist('lang', l)
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
      if (appMode === 'compare') {
        if (compare.addPaths(paths) === 0) toast(t('compare.unsupported'), 'err')
        return
      }
      if (appMode === 'mdview') {
        if (paths.some((p) => EXCEL_EXT.test(p))) toast(hintExcelFile(), 'err')
        viewerOpenFiles(paths.filter((p) => MD_EXT.test(p)))
        const dir = paths.find((p) => !MD_EXT.test(p) && !EXCEL_EXT.test(p))
        if (dir) void viewerOpenFolder(dir)
        return
      }
      const [foreign, hint, add] =
        appMode === 'md2excel' ? [EXCEL_EXT, hintExcelFile(), addMdPaths] : [MD_EXT, hintMdFile(), addPaths]
      if (paths.some((p) => foreign.test(p))) toast(hint, 'err')
      const rest = paths.filter((p) => !foreign.test(p))
      if (rest.length > 0) void add(rest)
    },
    [appMode, addMdPaths, addPaths, viewerOpenFiles, viewerOpenFolder, compare]
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
    toast(tr('toast.optionsReset'), 'ok')
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
    toast(tr(ok ? 'toast.dirCopied' : 'common.copyFailed'), ok ? 'ok' : 'err')
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

  const markConverted = useCallback(() => setLastConvertAt(timeLabel()), [])

  const { progress, setProgress, doConvert, cancelConvert } = useExcelConvert({
    files,
    options,
    outputMode,
    ensureOutDir,
    converting,
    setConverting,
    setResults,
    onDone: markConverted,
  })

  /* ------------------------- Markdown → Excel ------------------------------ */
  const { mdName, setMdName, mdDefaultName, mdSheetCount, mdCanConvert, doMdConvert } = useMdConvert({
    mdFiles,
    ensureOutDir,
    converting,
    setConverting,
    setProgress,
    setMdResult,
    onDone: markConverted,
  })

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

  const isMd = appMode === 'md2excel'
  const isView = appMode === 'mdview'
  const isCompare = appMode === 'compare'
  const pickCompareFile = useCallback(async () => {
    try {
      const p = await window.api.openCompareFile()
      if (p) compare.addPaths([p])
    } catch (err) {
      toast(errMsg(err), 'err')
    }
  }, [compare])

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

  const { record: viewerRecord, showPaste: viewerShowPaste, go: viewerGo } = viewer

  /** Mở `path` (nếu chưa xem) rồi cuộn tới `heading` (anchor / tiêu đề) và tô `text`; ghi vào lịch sử Lùi/Tiến.
   * `instant`: nhảy ngay như link anchor của trình duyệt (trích dẫn AI / kết quả tìm vẫn cuộn mượt). */
  const openAt = useCallback(
    async (path: string, heading: string, text?: string, instant?: boolean) => {
      if (path === viewerPath) viewerRecord({ path, heading: heading || undefined })
      else if (path === PASTE_PATH) viewerShowPaste()
      else await viewerSelect(path, { heading })
      setScrollTarget({ heading, text, instant, seq: Date.now() })
    },
    [viewerPath, viewerRecord, viewerShowPaste, viewerSelect]
  )

  /** Lùi/Tiến (Alt+←/→, nút chuột 3/4, nút trên thanh preview): mục không có anchor thì về đầu file. */
  const viewerNavigate = useCallback(
    async (dir: 'back' | 'forward') => {
      const entry = await viewerGo(dir)
      if (entry) setScrollTarget({ heading: entry.heading ?? '', instant: true, seq: Date.now() })
    },
    [viewerGo]
  )

  /** Link `#mục`: cuộn tới tiêu đề trong file. Link tới file .md khác (tương đối, có thể kèm `#mục`): mở ngay
   * trong app rồi cuộn tới mục. Link http/mailto: để main mở bằng trình duyệt. */
  const viewerLinkClick = useCallback(
    (href: string): boolean => {
      if (/^(https?:|mailto:)/i.test(href)) return false
      const hash = hrefHash(href)
      if (href.startsWith('#')) {
        if (hash && viewerPath) void openAt(viewerPath, hash, undefined, true)
        return true
      }
      const abs = viewerPath && viewerPath !== PASTE_PATH ? resolveRelative(viewerPath, href) : null
      if (abs && MD_EXT.test(abs)) {
        if (abs === viewerPath) {
          if (hash) void openAt(abs, hash, undefined, true)
        } else {
          // Kiểm file tồn tại trước: link hỏng không được thêm "file ma" vào danh sách File đã mở
          window.api.readMarkdown(abs).then(
            () => {
              viewerOpenFiles([abs], hash || undefined)
              if (hash) setScrollTarget({ heading: hash, instant: true, seq: Date.now() })
            },
            (err: unknown) => toast(tr('toast.linkBroken', { target: safeDecode(href.replace(/#.*$/, '')), error: errMsg(err) }), 'err')
          )
        }
      } else toast(tr('toast.linkUnsupported'), 'err')
      return true
    },
    [viewerPath, viewerOpenFiles, openAt]
  )

  // Quay lại cửa sổ (focus / tab hiện lại): đọc lại file đang xem nếu đã bị sửa ở ngoài.
  // Gộp focus + visibilitychange dồn dập thành một lần đọc.
  const viewerReload = viewer.reloadCurrent
  useEffect(() => {
    if (!isView) return
    let t: number | undefined
    const onBack = (e: Event): void => {
      if (e.type === 'visibilitychange' && document.visibilityState !== 'visible') return
      window.clearTimeout(t)
      t = window.setTimeout(() => void viewerReload(), 250)
    }
    window.addEventListener('focus', onBack)
    document.addEventListener('visibilitychange', onBack)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('focus', onBack)
      document.removeEventListener('visibilitychange', onBack)
    }
  }, [isView, viewerReload])

  /* Bảng lệnh Ctrl+K: file của thư mục, file lẻ, mục của file đang xem */
  const [paletteOpen, setPaletteOpen] = useState(false)
  const viewerMarkdown = viewer.doc?.markdown ?? ''
  const paletteItems = useMemo<PaletteItem[]>(() => {
    if (!paletteOpen) return []
    const root = viewer.root
    return [
      ...(root ? viewer.relFiles.map((r): PaletteItem => ({ kind: 'file', label: r, value: joinRoot(root, r) })) : []),
      ...viewer.loose.map((p): PaletteItem => ({ kind: 'file', label: baseName(p), value: p })),
      ...extractOutline(viewerMarkdown)
        .filter((i) => i.kind === 'heading')
        .map((i): PaletteItem => ({ kind: 'heading', label: i.label, value: i.label })),
    ]
  }, [paletteOpen, viewer.root, viewer.relFiles, viewer.loose, viewerMarkdown])

  const pickPalette = useCallback(
    (item: PaletteItem) => {
      setPaletteOpen(false)
      setSpecMapOpen(false)
      if (item.kind === 'file') void viewerSelect(item.value)
      else if (viewerPath) void openAt(viewerPath, item.value, undefined, true)
    },
    [viewerSelect, viewerPath, openAt]
  )

  /** Thanh trên preview: đường dẫn tương đối trong thư mục đang mở, file lẻ thì tên file. */
  const viewerRoot = viewer.root
  const viewerTitle = useMemo(() => {
    if (!viewerPath) return null
    if (viewerPath === PASTE_PATH) return t('viewer.paste')
    if (viewerRoot && viewerPath.startsWith(viewerRoot)) return viewerPath.slice(viewerRoot.length).replace(/^[\\/]+/, '')
    return baseName(viewerPath)
  }, [viewerPath, viewerRoot, t])

  /** Dán Markdown từ clipboard để xem; clipboard rỗng hoặc bị từ chối thì báo lỗi, giữ nguyên tài liệu đang xem. */
  const pasteViewer = useCallback(async () => {
    let text = ''
    try {
      text = await navigator.clipboard.readText()
    } catch {
      /* bị từ chối quyền: xử lý như clipboard rỗng */
    }
    if (text.trim() === '') toast(tr('toast.clipboardEmpty'), 'err')
    else viewer.pasteText(text)
  }, [viewer.pasteText])

  const viewerLooseItems = useMemo(
    () => viewer.loose.map((p) => ({ path: p, name: baseName(p) })),
    [viewer.loose]
  )

  /* Bản đồ thiết kế: mở tài liệu từ bản đồ (hoặc chọn file trên cây / bảng lệnh) thì đóng bản đồ */
  const openFromMap = useCallback(
    (rel: string, heading: string, text: string) => {
      setSpecMapOpen(false)
      if (viewerRoot) void openAt(joinRoot(viewerRoot, rel), heading, text)
    },
    [viewerRoot, openAt]
  )
  const closeSpecMap = useCallback(() => setSpecMapOpen(false), [])

  const handleJumpToCitation = useCallback((c: RagCitation) => openAt(c.filePath, c.sectionTitle), [openAt])

  const searchQuery = viewer.search?.query ?? ''
  const handleOpenSearchHit = useCallback(
    (path: string, hit: MdSearchHit) => openAt(path, hit.heading ?? '', searchQuery),
    [openAt, searchQuery]
  )

  useShortcuts({
    onEscape: () => {
      setResults(null)
      setMdResult(null)
      setSheetFilter('')
      viewer.setFilter('')
    },
    onMoveSheet: isCompare ? () => undefined : isView ? viewer.move : isMd ? moveMdSelection : moveSheet,
    // Đọc Markdown không có convert
    onConvert: () => void (isView || isCompare ? undefined : isMd ? doMdConvert() : doConvert()),
    onPickFiles: () => void (isCompare ? pickCompareFile() : isView ? pickViewerFolder() : isMd ? pickMdFiles() : pickFiles()),
    onZoom: (a) =>
      setZoom((z) =>
        a === 'reset'
          ? 1
          : a === 'in'
            ? Math.min(2, Math.round((z + 0.1) * 100) / 100)
            : Math.max(0.5, Math.round((z - 0.1) * 100) / 100)
      ),
    onPalette: isView ? () => setPaletteOpen((o) => !o) : undefined,
    onHistory: isView ? (dir) => void viewerNavigate(dir) : undefined,
  })

  // Trạng thái + nút convert ở thanh dưới theo chế độ (chế độ Excel giữ nguyên chữ cũ)
  const footerMode = isMd
    ? {
        status: t('app.md.status', { files: mdFiles.length, sheets: mdSheetCount }),
        convertLabel: t('app.md.convert', { n: mdSheetCount }),
        canConvert: mdCanConvert,
        onConvert: doMdConvert,
      }
    : {
        status: t('app.excel.status', { files: files.length, n: checkedCount }),
        convertLabel: checkedCount > 0 ? t('app.excel.convertN', { n: checkedCount }) : t('app.excel.convert'),
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
        onPickFiles={isCompare ? pickCompareFile : isView ? pickViewerFolder : isMd ? pickMdFiles : pickFiles}
        mode={appMode}
        onModeChange={changeAppMode}
        onLangChange={changeLang}
      />

      {showOnboarding && (
        <div className="x2m-onboarding flex shrink-0 items-center justify-between border-b border-accent-line/40 bg-accent-soft px-4 py-1.5 text-xs text-dim [&_b]:font-semibold [&_b]:text-ink">
          <span>{withBold(t(`onboarding.${appMode}`))}</span>
          <button className={`icon-btn ${iconBtn}`} onClick={dismissOnboarding} title={t('common.close')} aria-label={t('common.close')}>
            <IconX size={14} />
          </button>
        </div>
      )}

      <div className="x2m-body flex min-h-0 flex-1">
        {isCompare ? (
          <ComparePane state={compare} dragOver={dragOver} />
        ) : isView ? (
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
              contentSearch={viewer.contentSearch}
              onContentSearchChange={viewer.setContentSearch}
              search={viewer.search}
              onOpenHit={(p, h) => {
                setSpecMapOpen(false)
                void handleOpenSearchHit(p, h)
              }}
              onSelect={(p) => {
                setSpecMapOpen(false)
                void viewerSelect(p)
              }}
              specMapOpen={specMapOpen && !!viewer.root}
              onToggleSpecMap={() => setSpecMapOpen((o) => !o)}
              onToggleDir={viewer.toggleDir}
              onOpenFolder={() => void pickViewerFolder()}
              onOpenFiles={() => void pickViewerFiles()}
              onRefresh={() => viewer.root && void viewerOpenFolder(viewer.root)}
              onCloseFolder={viewer.closeFolder}
              onRemoveLoose={viewer.removeLoose}
            />

            {specMapOpen && viewer.root ? (
              <SpecMapPane root={viewer.root} onOpen={openFromMap} onClose={closeSpecMap} />
            ) : (
            <main className="x2m-main flex min-w-0 flex-1 flex-col overflow-hidden bg-editor">
              <PreviewPane
                title={viewerTitle}
                md={viewer.doc?.markdown ?? ''}
                loading={viewer.doc?.loading ?? false}
                error={viewer.doc?.error ?? ''}
                zoom={zoom}
                onResetZoom={() => setZoom(1)}
                noSelectionText={t('common.noFile')}
                loadingText={t('common.reading')}
                emptyText={t(viewer.doc ? 'viewer.emptyFile' : 'viewer.pickFile')}
                resolveImage={resolveViewerImage}
                onLinkClick={viewerLinkClick}
                fullWidth
                scrollTarget={scrollTarget}
                leading={
                  <span className="x2m-nav flex shrink-0 items-center gap-0.5">
                    <button
                      className={`icon-btn ${iconBtn}`}
                      onClick={() => void viewerNavigate('back')}
                      disabled={!viewer.canBack}
                      title={t('viewer.backTitle')}
                      aria-label={t('viewer.back')}
                    >
                      <span aria-hidden="true">←</span>
                    </button>
                    <button
                      className={`icon-btn ${iconBtn}`}
                      onClick={() => void viewerNavigate('forward')}
                      disabled={!viewer.canForward}
                      title={t('viewer.forwardTitle')}
                      aria-label={t('viewer.forward')}
                    >
                      <span aria-hidden="true">→</span>
                    </button>
                  </span>
                }
              />
            </main>
            )}

            {!sideCollapsed && (
              <div
                className="x2m-resizer relative z-[5] -mx-[3px] w-[5px] shrink-0 cursor-col-resize bg-transparent transition-colors duration-300 ease-spring hover:bg-accent/70 active:bg-accent"
                onMouseDown={(e) => startResize('right', e)}
                title={t('app.resize.ai')}
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
                noSelectionText={t('common.noFile')}
                loadingText={t('common.reading')}
                emptyText={t('app.md.pickToPreview')}
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
                  unitLabel={t('results.unit.sheet')}
                  openDirLabel={t('app.md.openDir')}
                />
              )}
            </main>

            {!sideCollapsed && (
              <div
                className="x2m-resizer relative z-[5] -mx-[3px] w-[5px] shrink-0 cursor-col-resize bg-transparent transition-colors duration-300 ease-spring hover:bg-accent/70 active:bg-accent"
                onMouseDown={(e) => startResize('right', e)}
                title={t('app.resize.options')}
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
                title={t('app.resize.files')}
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
                title={t('app.resize.options')}
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
      {!isView && !isCompare && (
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
          outDirPlaceholder={isMd ? t('app.md.noOutDir') : undefined}
          {...footerMode}
        />
      )}
      </div>
      </div>

      {isView && paletteOpen && <CommandPalette items={paletteItems} onPick={pickPalette} onClose={() => setPaletteOpen(false)} />}
      <Toasts />
    </div>
  )
}
