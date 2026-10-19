import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_OPTIONS, type ConvertOptions, type ConvertResultItem, type OutputMode } from '../../types'
import { errMsg, type ConvertProgress } from './api'
import { copyText, toast } from './utils'
import { FileList } from './components/FileList'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import { OptionsPanel } from './components/OptionsPanel'
import { PreviewPane } from './components/PreviewPane'
import { ResultsPanel } from './components/ResultsPanel'
import { Toasts } from './components/Toasts'
import { IconX } from './components/icons'
import { useFiles } from './hooks/useFiles'
import { usePreview } from './hooks/usePreview'
import { useShortcuts } from './hooks/useShortcuts'

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
        /* bỏ qua: dùng mặc định */
      }
    })()
    return () => {
      alive = false
    }
    // chỉ nạp một lần khi mở app
  }, [])

  useEffect(() => window.api.onProgress((pr) => setProgress(pr)), [])

  const addPathsRef = useRef(addPaths)
  addPathsRef.current = addPaths
  useEffect(() => window.api.onOpenFiles((paths) => void addPathsRef.current(paths)), [])

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
        applyOutDir(picked, true)
      } catch (err) {
        toast(errMsg(err), 'err')
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
        setLastConvertAt(
          new Date().toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
        )
      } else {
        toast(`${okCount}/${res.length} file thành công, xem chi tiết bên dưới`, 'err')
      }
    } catch (err) {
      toast(errMsg(err), 'err')
    } finally {
      setConverting(false)
      window.setTimeout(() => setProgress(null), 1500)
    }
  }, [files, outDir, options, outputMode, applyOutDir])

  const cancelConvert = useCallback(() => {
    window.api.cancelConvert().catch((err) => toast(errMsg(err), 'err'))
  }, [])

  useShortcuts({
    onEscape: () => {
      setResults(null)
      setSheetFilter('')
    },
    onMoveSheet: moveSheet,
    onConvert: () => void doConvert(),
    onPickFiles: () => void pickFiles(),
    onZoom: (a) =>
      setZoom((z) =>
        a === 'reset'
          ? 1
          : a === 'in'
            ? Math.min(2, Math.round((z + 0.1) * 100) / 100)
            : Math.max(0.5, Math.round((z - 0.1) * 100) / 100)
      ),
  })

  /* -------------------------------- render --------------------------------- */
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
      <Header theme={theme} onToggleTheme={toggleTheme} onPickFiles={pickFiles} />

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
          onReloadSheets={reloadSheets}
        />

        <main className="x2m-main">
          <PreviewPane
            title={selFile && selSheet ? `${selFile.name} / ${selSheet}` : null}
            md={preview.md}
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

        <OptionsPanel
          options={options}
          outputMode={outputMode}
          onSetOption={setOption}
          onSetMode={setMode}
          onReset={resetOptions}
        />
      </div>

      <Footer
        outDir={outDir}
        recentDirs={recentDirs}
        onPickRecentDir={(dir) => applyOutDir(dir, false)}
        onChooseDir={chooseOutDir}
        onOpenDir={openOutDir}
        converting={converting}
        progress={progress}
        onCancel={cancelConvert}
        fileCount={files.length}
        checkedCount={checkedCount}
        appVersion={appVersion}
        lastConvertAt={lastConvertAt}
        onConvert={doConvert}
      />

      <Toasts />
    </div>
  )
}
