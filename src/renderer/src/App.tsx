import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { marked } from 'marked'
import { sanitizeHtml } from './sanitize'
import { cn, copyText, onToast, toast, uid } from './utils'
import {
  DEFAULT_OPTIONS,
  type ConvertOptions,
  type ConvertResultItem,
  type FileItem,
  type OutputMode,
} from '../../types'
import {
  IconCheck,
  IconChevronDown,
  IconCopy,
  IconEye,
  IconMarkdown,
  IconMoon,
  IconPlus,
  IconSun,
  IconX,
} from './components/icons'

interface WindowApi {
  storeGet<T>(key: string): Promise<T | null>
  storeSet(key: string, value: unknown): Promise<void>
  openExcelFiles(): Promise<string[]>
  openDirectory(): Promise<string | null>
  openPath(target: string): Promise<void>
  getVersion(): Promise<string>
  getPathForFile(file: File): string
  onOpenFiles(cb: (paths: string[]) => void): () => void
  onProgress(cb: (p: { done: number; total: number }) => void): () => void
  listSheets(
    filePath: string,
    skipDelSheets: boolean
  ): Promise<{ name: string; rows: number; hidden: boolean }[]>
  previewSheet(filePath: string, sheetName: string, options: ConvertOptions): Promise<string>
  convert(payload: {
    files: { path: string; sheets: string[] }[]
    outDir: string
    options: ConvertOptions
    outputMode: OutputMode
  }): Promise<ConvertResultItem[]>
}

declare global {
  interface Window {
    api: WindowApi
  }
}

const EXCEL_EXT = /\.(xlsx|xlsm|xls|xltx|xltm)$/i

function baseName(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}

function IconFolder(p: { size?: number }): React.ReactElement {
  const s = p.size ?? 18
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function IconFile(p: { size?: number }): React.ReactElement {
  const s = p.size ?? 18
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  )
}

function IconOpen(p: { size?: number }): React.ReactElement {
  const s = p.size ?? 18
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
    </svg>
  )
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
  const [files, setFiles] = useState<FileItem[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [selFileId, setSelFileId] = useState<string | null>(null)
  const [selSheet, setSelSheet] = useState<string | null>(null)
  const [options, setOptions] = useState<ConvertOptions>(DEFAULT_OPTIONS)
  const [savedChecks, setSavedChecks] = useState<Record<string, string[]>>({})
  const [outputMode, setOutputMode] = useState<OutputMode>('per-sheet')
  const [outDir, setOutDir] = useState<string>('')
  const [recentDirs, setRecentDirs] = useState<string[]>([])
  const [theme, setTheme] = useState<'dark' | 'light'>(systemTheme)
  const [previewTab, setPreviewTab] = useState<'rendered' | 'source'>('rendered')
  const [previewMd, setPreviewMd] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [converting, setConverting] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [lastConvertAt, setLastConvertAt] = useState('')
  const [results, setResults] = useState<ConvertResultItem[] | null>(null)
  const [toasts, setToasts] = useState<{ id: string; msg: string; kind: 'ok' | 'err' }[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [appVersion, setAppVersion] = useState('')
  const [sheetFilter, setSheetFilter] = useState('')
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [previewExpanded, setPreviewExpanded] = useState(false)
  const previewTimer = useRef<number | null>(null)
  const previewGen = useRef(0)

  /* ------------------------------- theme/store ------------------------------ */
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [t, d, o, m, sc] = await Promise.all([
          window.api.storeGet<'dark' | 'light'>('theme'),
          window.api.storeGet<string>('outDir'),
          window.api.storeGet<ConvertOptions>('options'),
          window.api.storeGet<OutputMode>('outputMode'),
          window.api.storeGet<Record<string, string[]>>('checkedSheets'),
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
      } catch {
        /* bo qua */
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const off = window.api.onProgress((pr) => setProgress(pr))
    return off
  }, [])

  useEffect(() => {
    const off = window.api.onOpenFiles((paths) => {
      void addPathsRef.current(paths)
    })
    return off
  }, [])

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

  useEffect(() => {
    const off = onToast((msg, kind) => {
      const id = uid()
      setToasts((prev) => [...prev.slice(-2), { id, msg, kind }])
      window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3200)
    })
    return off
  }, [])

  const persist = useCallback((key: string, value: unknown) => {
    window.api.storeSet(key, value).catch(() => undefined)
  }, [])

  /* --------------------------------- files ---------------------------------- */
  const addPaths = useCallback(
    async (paths: string[]) => {
      const fresh = paths.filter((p) => EXCEL_EXT.test(p))
      const skipped = paths.length - fresh.length
      if (skipped > 0) toast(`Bỏ qua ${skipped} file không phải Excel (.xlsx/.xlsm/.xls)`, 'err')
      if (fresh.length === 0) return
      setFiles((prev) => {
        const known = new Set(prev.map((f) => f.path))
        const items: FileItem[] = fresh
          .filter((p) => !known.has(p))
          .map((p) => ({
            id: uid(),
            path: p,
            name: baseName(p),
            sheets: [],
            loading: true,
          }))
        return [...prev, ...items]
      })
      // nap sheet cho tung file moi (doc lap de UI phan hoi nhanh)
      for (const p of fresh) {
        try {
          const sheets = await window.api.listSheets(p, options.skipDelSheets)
          setFiles((prev) =>
            prev.map((f) => {
              if (f.path !== p) return f
              const remembered = savedChecksRef.current[p]
              return {
                ...f,
                loading: false,
                sheets: sheets.map((s) => ({
                  ...s,
                  // Nhớ lựa chọn lần trước; sheet mới mặc định chọn trừ sheet ẩn
                  checked: remembered ? remembered.includes(s.name) : !s.hidden,
                })),
              }
            })
          )
        } catch (err) {
          setFiles((prev) =>
            prev.map((f) =>
              f.path === p
                ? { ...f, loading: false, error: err instanceof Error ? err.message : String(err) }
                : f
            )
          )
        }
      }
    },
    [options.skipDelSheets]
  )

  const pickFiles = useCallback(async () => {
    try {
      const paths = await window.api.openExcelFiles()
      await addPaths(paths)
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'err')
    }
  }, [addPaths])

  const removeFile = useCallback(
    (id: string) => {
      setFiles((prev) => prev.filter((f) => f.id !== id))
      if (selFileId === id) {
        setSelFileId(null)
        setSelSheet(null)
      }
    },
    [selFileId]
  )

  const savedChecksRef = useRef(savedChecks)
  savedChecksRef.current = savedChecks

  const toggleFileSheets = useCallback(
    (id: string, checked: boolean) => {
      setFiles((prev) => {
        const next = prev.map((f) =>
          f.id === id ? { ...f, sheets: f.sheets.map((s) => ({ ...s, checked })) } : f
        )
        const f = next.find((x) => x.id === id)
        if (f) {
          const entries = Object.entries({ ...savedChecksRef.current, [f.path]: f.sheets.filter((x) => x.checked).map((x) => x.name) })
          const rec = Object.fromEntries(entries.slice(-50))
          setSavedChecks(rec)
          persist('checkedSheets', rec)
        }
        return next
      })
    },
    [persist]
  )

  const toggleSheet = useCallback(
    (fileId: string, sheetName: string, checked: boolean) => {
      setFiles((prev) => {
        const next = prev.map((f) =>
          f.id === fileId
            ? { ...f, sheets: f.sheets.map((s) => (s.name === sheetName ? { ...s, checked } : s)) }
            : f
        )
        const f = next.find((x) => x.id === fileId)
        if (f) {
          const entries = Object.entries({ ...savedChecksRef.current, [f.path]: f.sheets.filter((x) => x.checked).map((x) => x.name) })
          const rec = Object.fromEntries(entries.slice(-50))
          setSavedChecks(rec)
          persist('checkedSheets', rec)
        }
        return next
      })
    },
    [persist]
  )

  const reloadSheets = useCallback(
    async (file: FileItem) => {
      setFiles((prev) =>
        prev.map((f) => (f.id === file.id ? { ...f, loading: true, error: undefined } : f))
      )
      try {
        const sheets = await window.api.listSheets(file.path, options.skipDelSheets)
        setFiles((prev) =>
          prev.map((f) =>
            f.id === file.id
              ? { ...f, loading: false, sheets: sheets.map((s) => ({ ...s, checked: !s.hidden })) }
              : f
          )
        )
      } catch (err) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === file.id
              ? { ...f, loading: false, error: err instanceof Error ? err.message : String(err) }
              : f
          )
        )
      }
    },
    [options.skipDelSheets]
  )

  // chon mac dinh file/sheet dau tien khi co du lieu
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

  const moveSheet = useCallback(
    (dir: 1 | -1) => {
      const file = files.find((f) => f.id === selFileId)
      if (!file || !selSheet) return
      const names = file.sheets.map((x) => x.name)
      const next = names[names.indexOf(selSheet) + dir]
      if (next) selectSheet(file.id, next)
    },
    [files, selFileId, selSheet]
  )

  const selectSheet = useCallback((fileId: string, sheetName: string) => {
    setSelFileId(fileId)
    setSelSheet(sheetName)
    setExpanded((prev) => ({ ...prev, [fileId]: true }))
    setResults(null)
  }, [])

  /* --------------------------------- preview -------------------------------- */
  useEffect(() => {
    if (previewTimer.current) window.clearTimeout(previewTimer.current)
    const gen = ++previewGen.current
    if (!selFile || !selSheet) {
      setPreviewMd('')
      setPreviewError('')
      return
    }
    setPreviewLoading(true)
    previewTimer.current = window.setTimeout(() => {
      window.api
        .previewSheet(selFile.path, selSheet, options)
        .then((md) => {
          if (previewGen.current !== gen) return // stale: user đã chuyển sheet khác
          setPreviewMd(md)
          setPreviewError('')
        })
        .catch((err) => {
          if (previewGen.current !== gen) return
          setPreviewMd('')
          setPreviewError(err instanceof Error ? err.message : String(err))
        })
        .finally(() => {
          if (previewGen.current === gen) setPreviewLoading(false)
        })
    }, 250)
    return () => {
      if (previewTimer.current) window.clearTimeout(previewTimer.current)
    }
  }, [selFile, selSheet, options])

  const PREVIEW_LINE_LIMIT = 300

  useEffect(() => {
    setPreviewExpanded(false)
  }, [previewMd])

  const displayMd = useMemo(() => {
    const lines = previewMd.split('\n')
    if (previewExpanded || lines.length <= PREVIEW_LINE_LIMIT) {
      return { md: previewMd, truncated: false, hidden: 0 }
    }
    // cắt ở ranh giới dòng trống gần nhất để không xé đôi bảng
    let cut = PREVIEW_LINE_LIMIT
    while (cut > PREVIEW_LINE_LIMIT - 40 && lines[cut] !== '') cut--
    if (lines[cut] !== '') cut = PREVIEW_LINE_LIMIT
    return { md: lines.slice(0, cut).join('\n'), truncated: true, hidden: lines.length - cut }
  }, [previewMd, previewExpanded])

  const renderedHtml = useMemo(() => {
    if (!displayMd.md) return ''
    try {
      return sanitizeHtml(marked.parse(displayMd.md, { breaks: false }) as string)
    } catch {
      return ''
    }
  }, [displayMd])

  const previewStats = useMemo(() => {
    if (!previewMd) return null
    const tables = (previewMd.match(/^\|[-| :]+\|$/gm) || []).length
    return { lines: previewMd.split('\n').length, chars: previewMd.length, tables }
  }, [previewMd])

  const copyPreview = useCallback(async () => {
    if (!previewMd) return
    const ok = await copyText(previewMd)
    toast(ok ? 'Đã copy Markdown vào clipboard' : 'Copy thất bại', ok ? 'ok' : 'err')
  }, [previewMd])

  /* --------------------------------- options -------------------------------- */
  const setOption = useCallback(
    <K extends keyof ConvertOptions>(key: K, value: ConvertOptions[K]) => {
      setOptions((prev) => {
        const next = { ...prev, [key]: value }
        persist('options', next)
        return next
      })
      // doi skipDelSheets thi nap lai danh sach sheet
      if (key === 'skipDelSheets') {
        setFiles((prev) => prev.map((f) => ({ ...f, loading: true, sheets: [], error: undefined })))
        ;(async () => {
          for (const f of files) {
            try {
              const sheets = await window.api.listSheets(f.path, value as boolean)
              setFiles((prev) =>
                prev.map((x) =>
                  x.id === f.id
                    ? { ...x, loading: false, sheets: sheets.map((s) => ({ ...s, checked: !s.hidden })) }
                    : x
                )
              )
            } catch {
              setFiles((prev) => prev.map((x) => (x.id === f.id ? { ...x, loading: false } : x)))
            }
          }
        })()
      }
    },
    [files, persist]
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

  const chooseOutDir = useCallback(async () => {
    try {
      const dir = await window.api.openDirectory()
      if (dir) {
        setOutDir(dir)
        persist('outDir', dir)
        rememberDir(dir)
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'err')
    }
  }, [persist, rememberDir])

  /* --------------------------------- convert -------------------------------- */
  const checkedCount = useMemo(
    () => files.reduce((n, f) => n + f.sheets.filter((s) => s.checked).length, 0),
    [files]
  )

  const doConvert = useCallback(async () => {
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
    let dir = outDir
    if (!dir) {
      try {
        const picked = await window.api.openDirectory()
        if (!picked) return
        dir = picked
        setOutDir(picked)
        persist('outDir', picked)
        rememberDir(picked)
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), 'err')
        return
      }
    }
    setConverting(true)
    setResults(null)
    setProgress(null)
    try {
      const res = await window.api.convert({ files: specs, outDir: dir, options, outputMode })
      setResults(res)
      const okCount = res.filter((r) => r.ok).length
      const mdCount = res.reduce((n, r) => n + r.filesWritten.length, 0)
      if (okCount === res.length) {
        toast(
          mdCount === 0
            ? 'Không tạo file nào (các sheet đều rỗng hoặc bị bỏ qua)'
            : `Xong: ${mdCount} file Markdown từ ${res.length} file Excel`
        )
        setLastConvertAt(
          new Date().toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
        )
      } else {
        toast(`${okCount}/${res.length} file thành công, xem chi tiết bên dưới`, 'err')
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'err')
    } finally {
      setConverting(false)
      window.setTimeout(() => setProgress(null), 1500)
    }
  }, [files, outDir, options, outputMode, persist, rememberDir])

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
      toast(err instanceof Error ? err.message : String(err), 'err')
    }
  }, [outDir])

  // Phím tắt: Ctrl+Enter convert, Ctrl+O thêm file
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'Escape') {
        setResults(null)
        setSheetFilter('')
        return
      }
      if (e.key === 'ArrowDown' && !e.ctrlKey && !e.metaKey && e.target === document.body) {
        e.preventDefault()
        moveSheetRef.current(1)
        return
      }
      if (e.key === 'ArrowUp' && !e.ctrlKey && !e.metaKey && e.target === document.body) {
        e.preventDefault()
        moveSheetRef.current(-1)
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        void doConvertRef.current()
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault()
        void pickFilesRef.current()
      } else if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        setZoom((z) => Math.min(2, Math.round((z + 0.1) * 100) / 100))
      } else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault()
        setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 100) / 100))
      } else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault()
        setZoom(1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const doConvertRef = useRef(doConvert)
  doConvertRef.current = doConvert
  const pickFilesRef = useRef(pickFiles)
  pickFilesRef.current = pickFiles
  const addPathsRef = useRef(addPaths)
  addPathsRef.current = addPaths
  const moveSheetRef = useRef(moveSheet)
  moveSheetRef.current = moveSheet

  /* ---------------------------------- render --------------------------------- */
  return (
    <div
      className="x2m-app"
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
        void addPaths(paths)
      }}
    >
      {/* header */}
      <header className="x2m-header">
        <div className="x2m-brand">
          <span className="x2m-logo">
            <IconMarkdown size={22} />
          </span>
          <div>
            <div className="x2m-title">ExcelToMarkdown</div>
            <div className="x2m-sub">Convert file Excel sang Markdown, giữ đúng bố cục tài liệu</div>
          </div>
        </div>
        <div className="x2m-header-actions">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              const next = theme === 'dark' ? 'light' : 'dark'
              setTheme(next)
              persist('theme', next)
            }}
            title={theme === 'dark' ? 'Chuyển sang nền sáng' : 'Chuyển sang nền tối'}
            aria-label={theme === 'dark' ? 'Chuyển sang nền sáng' : 'Chuyển sang nền tối'}
          >
            {theme === 'dark' ? <IconSun size={16} /> : <IconMoon size={16} />}
          </button>
          <button className="btn btn-primary btn-sm" onClick={pickFiles}>
            <IconPlus size={16} /> Thêm file Excel
          </button>
        </div>
      </header>

      {showOnboarding && (
        <div className="x2m-onboarding">
          <span>
            Kéo thả file Excel vào đây để bắt đầu — <b>Ctrl+O</b> thêm file,
            <b> Ctrl+Enter</b> để convert.
          </span>
          <button className="icon-btn" onClick={dismissOnboarding} title="Đóng" aria-label="Đóng">
            <IconX size={14} />
          </button>
        </div>
      )}

      <div className="x2m-body">
        {/* files + sheets */}
        <aside className={cn('x2m-files', dragOver && 'drag-over')}>
          <div className="x2m-pane-title">File Excel ({files.length})</div>
          {files.length > 0 && (
            <div className="x2m-filter">
              <input
                className="x2m-filter-input"
                type="search"
                placeholder="Lọc sheet..."
                value={sheetFilter}
                onChange={(e) => setSheetFilter(e.target.value)}
                aria-label="Lọc sheet theo tên"
              />
            </div>
          )}
          {files.length === 0 ? (
            <div className="x2m-empty">
              <IconFile size={36} />
              <p>Kéo thả file Excel vào đây</p>
              <p className="dim">hoặc bấm nút Thêm file Excel ở trên</p>
            </div>
          ) : (
            <div className="x2m-file-list">
              {files.map((f) => {
                const checked = f.sheets.filter((s) => s.checked).length
                const isOpen = expanded[f.id] ?? false
                return (
                  <div key={f.id} className={cn('x2m-file', selFileId === f.id && 'active')}>
                    <div className="x2m-file-head">
                      <input
                        type="checkbox"
                        className="chk"
                        checked={f.sheets.length > 0 && checked === f.sheets.length}
                        ref={(el) => {
                          if (el) el.indeterminate = checked > 0 && checked < f.sheets.length
                        }}
                        onChange={(e) => toggleFileSheets(f.id, e.target.checked)}
                        title="Chọn / bỏ chọn tất cả sheet"
                      />
                      <button
                        className="x2m-file-name"
                        onClick={() => setExpanded((p) => ({ ...p, [f.id]: !isOpen }))}
                        title={f.path}
                      >
                        <span className="x2m-file-name-text">{f.name}</span>
                        <span className="dim">
                          {f.loading ? 'đang đọc...' : `${checked}/${f.sheets.length} sheet`}
                        </span>
                      </button>
                      <button
                        className={cn('x2m-chevron', isOpen && 'open')}
                        onClick={() => setExpanded((p) => ({ ...p, [f.id]: !isOpen }))}
                        title={isOpen ? 'Thu gọn' : 'Mở rộng'}
                        aria-label={isOpen ? 'Thu gọn' : 'Mở rộng'}
                      >
                        <IconChevronDown size={15} />
                      </button>
                      <button
                        className="icon-btn"
                        onClick={() => removeFile(f.id)}
                        title="Xóa khỏi danh sách"
                        aria-label="Xóa khỏi danh sách"
                      >
                        <IconX size={14} />
                      </button>
                    </div>
                    {f.error && (
                      <div className="x2m-file-error">
                        {f.error}
                        <button className="btn btn-sm btn-ghost" onClick={() => reloadSheets(f)}>
                          Thử lại
                        </button>
                      </div>
                    )}
                    {isOpen && (
                      <div className="x2m-sheets">
                        {f.loading && <div className="x2m-loading">Đang đọc sheet...</div>}
                        {(() => {
                          const visible = f.sheets.filter((s) =>
                            sheetFilter
                              ? s.name.toLowerCase().includes(sheetFilter.toLowerCase())
                              : true
                          )
                          if (visible.length === 0 && sheetFilter && !f.loading) {
                            return (
                              <div className="dim" style={{ padding: '8px 4px', fontSize: 12 }}>
                                Không có sheet nào khớp &ldquo;{sheetFilter}&rdquo;
                              </div>
                            )
                          }
                          return visible.map((s) => (
                          <label
                            key={s.name}
                            className={cn(
                              'x2m-sheet',
                              selFileId === f.id && selSheet === s.name && 'selected'
                            )}
                          >
                            <input
                              type="checkbox"
                              className="chk"
                              checked={s.checked}
                              onChange={(e) => toggleSheet(f.id, s.name, e.target.checked)}
                              aria-label={`Chọn sheet ${s.name}`}
                            />
                            <button
                              className="x2m-sheet-name"
                              onClick={(e) => {
                                e.preventDefault()
                                selectSheet(f.id, s.name)
                              }}
                              title={`${s.rows} dòng${s.hidden ? ' (sheet ẩn trong Excel)' : ''}`}
                            >
                              {s.name}
                              {s.hidden && <span className="x2m-tag">ẩn</span>}
                            </button>
                          </label>
                          ))
                        })()}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </aside>

        {/* preview */}
        <main className="x2m-main">
          <div className="x2m-preview-bar">
            <div className="x2m-tabs">
              <button
                className={cn('x2m-tab', previewTab === 'rendered' && 'active')}
                onClick={() => setPreviewTab('rendered')}
              >
                <IconEye size={15} /> Xem trước
              </button>
              <button
                className={cn('x2m-tab', previewTab === 'source' && 'active')}
                onClick={() => setPreviewTab('source')}
              >
                <IconMarkdown size={15} /> Mã Markdown
              </button>
            </div>
            <div className="x2m-preview-meta">
              {selFile && selSheet ? (
                <span className="dim">
                  {selFile.name} / {selSheet}
                  {previewStats
                    ? ` · ${previewStats.lines} dòng, ${previewStats.tables} bảng, ${previewStats.chars} ký tự`
                    : ''}
                </span>
              ) : (
                <span className="dim">Chưa chọn sheet</span>
              )}
              {zoom !== 1 && (
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => setZoom(1)}
                  title="Khôi phục cỡ chữ (Ctrl+0)"
                >
                  {Math.round(zoom * 100)}%
                </button>
              )}
              <button
                className="btn btn-sm btn-ghost"
                onClick={copyPreview}
                disabled={!previewMd || previewLoading}
                title="Copy Markdown"
              >
                <IconCopy size={14} /> Copy
              </button>
            </div>
          </div>
          <div className="x2m-preview" style={{ zoom }}>
            {previewLoading ? (
              <div className="x2m-loading">Đang convert...</div>
            ) : previewError ? (
              <div className="x2m-error">{previewError}</div>
            ) : !previewMd ? (
              <div className="x2m-empty">
                <IconEye size={36} />
                <p>Chọn một sheet để xem trước kết quả convert</p>
              </div>
            ) : previewTab === 'source' ? (
              <div className="x2m-source-wrap">
                <div className="x2m-gutter" aria-hidden="true">
                  {displayMd.md.split('\n').map((_, i) => (
                    <span key={i}>{i + 1}</span>
                  ))}
                </div>
                <pre className="x2m-source">{displayMd.md}</pre>
              </div>
            ) : (
              <div className="md-body" dangerouslySetInnerHTML={{ __html: renderedHtml }} />
            )}
          </div>
          {displayMd.truncated && (
            <button
              className="btn btn-sm x2m-show-more"
              onClick={() => setPreviewExpanded(true)}
            >
              Hiện thêm {displayMd.hidden} dòng
            </button>
          )}

          {/* results */}
          {results && (
            <div className="x2m-results" role="status" aria-live="polite">
              <div className="x2m-results-head">
                <span>
                  Kết quả: {results.filter((r) => r.ok).length}/{results.length} file thành công
                  {outDir && <span className="dim"> · {outDir}</span>}
                </span>
                {results.some((r) => !r.ok) && (
                  <button
                    className="btn btn-sm"
                    onClick={() => void doConvertRef.current()}
                    disabled={converting}
                  >
                    Thử lại file lỗi
                  </button>
                )}
                <button className="icon-btn" onClick={() => setResults(null)} title="Đóng" aria-label="Đóng">
                  <IconX size={14} />
                </button>
              </div>
              <div className="x2m-results-list">
                {results.map((r, idx) => (
                  <div key={idx} className={cn('x2m-result', r.ok ? 'ok' : 'err')}>
                    {r.ok ? <IconCheck size={15} /> : <IconX size={15} />}
                    <span className="x2m-result-name">{r.fileName}</span>
                    {r.ok ? (
                      <span className="dim">{r.filesWritten.length} file.md</span>
                    ) : (
                      <span className="x2m-result-error">{r.error}</span>
                    )}
                    {r.ok && outDir && (
                      <span className="x2m-result-actions">
                        <button
                          className="icon-btn"
                          onClick={openOutDir}
                          title="Mở thư mục chứa file.md"
                          aria-label="Mở thư mục chứa file.md"
                        >
                          <IconOpen size={13} />
                        </button>
                        <button
                          className="icon-btn"
                          onClick={copyOutDir}
                          title="Copy đường dẫn thư mục"
                          aria-label="Copy đường dẫn thư mục"
                        >
                          <IconCopy size={13} />
                        </button>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>

        {/* options */}
        <aside className="x2m-side">
          <div className="x2m-pane-title">
            Tùy chọn
            <button className="btn btn-sm btn-ghost" onClick={resetOptions} title="Khôi phục mặc định">
              Mặc định
            </button>
          </div>
          <div className="x2m-opts">
            <div className="x2m-opt-group">
              <div className="x2m-opt-label">Chế độ xuất file</div>
              <label className="x2m-radio">
                <input
                  type="radio"
                  className="chk"
                  checked={outputMode === 'per-sheet'}
                  onChange={() => setMode('per-sheet')}
                />
                <span>
                  Mỗi sheet 1 file
                  <span className="dim">TênFile__TênSheet.md</span>
                </span>
              </label>
              <label className="x2m-radio">
                <input
                  type="radio"
                  className="chk"
                  checked={outputMode === 'per-workbook'}
                  onChange={() => setMode('per-workbook')}
                />
                <span>
                  Gộp cả workbook 1 file
                  <span className="dim">TênFile.md, các sheet nối nhau</span>
                </span>
              </label>
            </div>
            <div className="x2m-opt-group">
              <div className="x2m-opt-label">Sheet</div>
              <label className="x2m-check">
                <input
                  type="checkbox"
                  className="chk"
                  checked={options.skipDelSheets}
                  onChange={(e) => setOption('skipDelSheets', e.target.checked)}
                />
                Bỏ qua sheet DEL_ (đã xóa)
              </label>
              <label className="x2m-check">
                <input
                  type="checkbox"
                  className="chk"
                  checked={options.skipEmptySheets}
                  onChange={(e) => setOption('skipEmptySheets', e.target.checked)}
                />
                Bỏ qua sheet rỗng
              </label>
              <label className="x2m-check">
                <input
                  type="checkbox"
                  className="chk"
                  checked={options.includeSheetTitle}
                  onChange={(e) => setOption('includeSheetTitle', e.target.checked)}
                />
                Thêm tiêu đề tên sheet
              </label>
              <label className="x2m-check">
                <input
                  type="checkbox"
                  className="chk"
                  checked={options.detectTwoColTables}
                  onChange={(e) => setOption('detectTwoColTables', e.target.checked)}
                />
                Nhận diện bảng 2 cột
              </label>
            </div>
            <div className="x2m-opt-group">
              <div className="x2m-opt-label">Ô nhiều dòng</div>
              <label className="x2m-radio">
                <input
                  type="radio"
                  className="chk"
                  checked={options.multiline === 'br'}
                  onChange={() => setOption('multiline', 'br')}
                />
                Xuống dòng bằng &lt;br&gt;
              </label>
              <label className="x2m-radio">
                <input
                  type="radio"
                  className="chk"
                  checked={options.multiline === 'space'}
                  onChange={() => setOption('multiline', 'space')}
                />
                Gộp thành một dòng
              </label>
            </div>
            <div className="x2m-opt-note">
              App tự nhận diện banner 基本設計, meta 機能ID/画面ID/テーブルID, section,
              bảng No/№/項番, ô merge và công thức liên sheet. Phím tắt: Ctrl+O thêm file, Ctrl+Enter để convert.
            </div>
          </div>
        </aside>
      </div>

      {/* footer */}
      <footer className="x2m-footer">
        <div className="x2m-outdir" title={outDir || 'Chưa chọn thư mục lưu'}>
          <IconFolder size={16} />
          <span className={cn('x2m-outdir-text', !outDir && 'dim')}>
            {outDir || 'Chưa chọn thư mục lưu file.md'}
          </span>
          {recentDirs.length > 0 && (
            <select
              className="x2m-dir-select"
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  setOutDir(e.target.value)
                  persist('outDir', e.target.value)
                }
              }}
              title="Thư mục gần đây"
              aria-label="Thư mục gần đây"
            >
              <option value="">Gần đây...</option>
              {recentDirs.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )}
          <button className="btn btn-sm" onClick={chooseOutDir}>
            Chọn thư mục
          </button>
          {outDir && (
            <button className="btn btn-sm btn-ghost" onClick={openOutDir} title="Mở thư mục" aria-label="Mở thư mục">
              <IconOpen size={14} />
            </button>
          )}
        </div>
        <div className="x2m-footer-actions">
          {converting && progress && progress.total > 0 && (
            <div
              className="x2m-progress"
              role="progressbar"
              aria-valuenow={progress.done}
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-label="Tiến độ convert"
            >
              <div
                className="x2m-progress-fill"
                style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
              />
              <span className="x2m-progress-text">
                {progress.done}/{progress.total}
              </span>
            </div>
          )}
          <span className="dim">
            {files.length} file, {checkedCount} sheet được chọn
            {appVersion ? ` · v${appVersion}` : ''}
            {lastConvertAt ? ` · convert lúc ${lastConvertAt}` : ''}
          </span>
          <button
            className="btn btn-primary"
            onClick={doConvert}
            disabled={converting || files.length === 0 || checkedCount === 0}
            title="Ctrl+Enter"
          >
            {converting ? (
              <>Đang convert...</>
            ) : (
              <>
                <IconCheck size={16} /> Convert {checkedCount > 0 ? `${checkedCount} sheet ` : ''}sang Markdown
              </>
            )}
          </button>
        </div>
      </footer>

      {/* toasts */}
      <div className="x2m-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={cn('x2m-toast', t.kind)} role="status">
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  )
}
