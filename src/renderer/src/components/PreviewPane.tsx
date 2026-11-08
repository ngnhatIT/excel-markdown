import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { marked } from 'marked'
import { buildGuideHtml, guideFileStem } from '../../../shared/guideHtml'
import { frontMatterAsCode, slugifyHeading, uniqueSlugs } from '../../../shared/mdView'
import { errMsg } from '../lib/api'
import { sanitizeHtml } from '../lib/sanitize'
import { inlineMermaid, renderMermaidIn } from '../lib/mermaid'
import { findTextRanges, setSearchHighlight } from '../lib/highlight'
import { SelectionTranslate } from './SelectionTranslate'
import { DdlPopover, ErDialog } from './TableDefTools'
import { TestDesignDialog } from './TestDesignTools'
import { buildTestDesign } from '../../../shared/testDesign'
import { parseTableDefs, type TableDef } from '../../../shared/tableDef'
import { cn, copyText, matchHeadingText, toast } from '../lib/utils'
import { btnGhost, btnSm, cx } from '../lib/ui'
import { getLocale, LOCALES, t as tr, useLang, useT } from '../i18n'
import { IconCopy, IconEye, IconList, IconMarkdown, IconSplit, IconTable, IconWrap } from './icons'

/** Preview dài hơn số dòng này thì cắt, bấm "Hiện thêm" để xem hết. */
const PREVIEW_LINE_LIMIT = 300

/** Theo dõi data-theme trên <html> (App đổi khi bấm Sáng/Tối). */
function subscribeTheme(cb: () => void): () => void {
  const mo = new MutationObserver(cb)
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => mo.disconnect()
}
const readTheme = (): string => document.documentElement.dataset.theme ?? 'dark'

interface OutlineItem {
  kind: 'heading' | 'table'
  label: string
  /** Chỉ số thứ tự trong danh sách h1..h6 hoặc table của .md-body */
  domIndex: number
  /** Nếu là bảng: lưu dữ liệu dòng/cột và mã nguồn Markdown của bảng để copy nhanh */
  mdBlock?: string
  tsvBlock?: string
  colCount?: number
  rowCount?: number
  /** Dòng header của bảng (tính từ 1), để khớp với TableDef.line */
  line?: number
}

/** Trích xuất danh sách mục lục (Headings + Bảng) từ mã Markdown để nhảy nhanh & copy bảng. */
export function extractOutline(md: string): OutlineItem[] {
  if (!md) return []
  const lines = md.split('\n')
  const items: OutlineItem[] = []
  let headingIdx = 0
  let tableIdx = 0
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const hMatch = /^(#{1,4})\s+(.+)$/.exec(line)
    if (hMatch) {
      const rawText = hMatch[2].replace(/\\([#*~_`[\]()<>|-])/g, '$1').trim()
      items.push({
        kind: 'heading',
        label: rawText,
        domIndex: headingIdx++,
      })
      i++
      continue
    }
    // Nhận diện khối bảng Markdown: dòng bắt đầu bằng | và dòng kế tiếp là |---|
    if (
      line.startsWith('|') &&
      i + 1 < lines.length &&
      /^\|[\s:-]+(\|[\s:-]+)+\|?$/.test(lines[i + 1].trim())
    ) {
      const line = i + 1
      const tableLines: string[] = []
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i])
        i++
      }
      const parseCells = (rowLine: string): string[] =>
        rowLine
          .trim()
          .replace(/^\||\|$/g, '')
          .split(/(?<!\\)\|/)
          .map((c) =>
            c
              .trim()
              .replace(/\\\|/g, '|')
              .replace(/<br\s*\/?>/gi, ' ')
          )
      const headerCells = parseCells(tableLines[0])
      const dataRows = tableLines.slice(2).map(parseCells)
      const firstHeader = headerCells.find((c) => c !== '') ?? tr('preview.table', { n: tableIdx + 1 })
      const tsvLines = [headerCells, ...dataRows].map((r) => r.join('\t')).join('\n')
      items.push({
        kind: 'table',
        label: tr('preview.tableLabel', { name: `${firstHeader.slice(0, 22)}${firstHeader.length > 22 ? '…' : ''}` }),
        domIndex: tableIdx++,
        mdBlock: tableLines.join('\n'),
        tsvBlock: tsvLines,
        colCount: headerCells.length,
        rowCount: dataRows.length,
        line,
      })
      continue
    }
    i++
  }
  return items
}

interface Props {
  /** "file / sheet" đang xem, null nếu chưa chọn */
  title: string | null
  md: string
  loading: boolean
  error: string
  zoom: number
  onResetZoom: () => void
  /** Chữ ở thanh trên khi chưa chọn gì */
  noSelectionText?: string
  /** Chữ khi đang tải nội dung */
  loadingText?: string
  /** Chữ vùng trống khi chưa có nội dung */
  emptyText?: string
  /** Hiện ảnh: URL cho `src` của ảnh, null = bỏ ảnh. Không truyền thì không hiện ảnh. */
  resolveImage?: (src: string) => string | null
  /** Bấm link trong bản render; trả true nếu đã xử lý (không cho trình duyệt điều hướng). */
  onLinkClick?: (href: string) => boolean
  /** Bản render giãn hết chiều rộng vùng xem */
  fullWidth?: boolean
  /** Nhảy tới heading (trích dẫn AI) và/hoặc chữ `text` sau heading đó (kết quả tìm, được tô sáng) */
  scrollTarget?: ScrollTarget | null
  /** Nút đặt trước tiêu đề trên thanh preview (vd Lùi/Tiến của chế độ Đọc Markdown) */
  leading?: React.ReactNode
}

export interface ScrollTarget {
  heading: string
  /** Từ khóa (cách nhau bởi khoảng trắng) cần cuộn tới và tô sáng */
  text?: string
  /** Nhảy ngay (link #anchor, Lùi/Tiến) thay vì cuộn mượt */
  instant?: boolean
  seq: number
}

/** Thanh tab + vùng xem trước (Markdown đã render, Song song, hoặc Mã nguồn). */
export function PreviewPane({
  title,
  md,
  loading,
  error,
  zoom,
  onResetZoom,
  noSelectionText,
  loadingText,
  emptyText,
  resolveImage,
  onLinkClick,
  fullWidth = true,
  scrollTarget,
  leading,
}: Props): React.ReactElement {
  const t = useT()
  const lang = useLang()
  const [tab, setTab] = useState<'rendered' | 'split' | 'source'>('rendered')
  const [expanded, setExpanded] = useState(false)
  const [wrapTables, setWrapTables] = useState(true)
  const [showOutline, setShowOutline] = useState(true)
  const previewRef = useRef<HTMLDivElement | null>(null)

  // Đổi file mới thu gọn lại; cùng file được tải lại (đổi md) thì giữ "Hiện thêm" để không mất vị trí cuộn
  useEffect(() => {
    setExpanded(false)
  }, [title])

  const display = useMemo(() => {
    const lines = md.split('\n')
    if (expanded || lines.length <= PREVIEW_LINE_LIMIT) {
      return { md, truncated: false, hidden: 0 }
    }
    // cắt ở ranh giới dòng trống gần nhất để không xé đôi bảng
    let cut = PREVIEW_LINE_LIMIT
    while (cut > PREVIEW_LINE_LIMIT - 40 && lines[cut] !== '') cut--
    if (lines[cut] !== '') cut = PREVIEW_LINE_LIMIT
    return { md: lines.slice(0, cut).join('\n'), truncated: true, hidden: lines.length - cut }
  }, [md, expanded])

  const html = useMemo(() => {
    if (!display.md) return ''
    try {
      return sanitizeHtml(marked.parse(frontMatterAsCode(display.md), { breaks: false }) as string, { resolveImage })
    } catch {
      return ''
    }
  }, [display, resolveImage])

  // Khối ```mermaid -> sơ đồ SVG; vẽ lại khi đổi tab hoặc đổi giao diện sáng/tối
  const theme = useSyncExternalStore(subscribeTheme, readTheme)
  useEffect(() => {
    const root = previewRef.current
    if (!root || loading || !html.includes('language-mermaid')) return
    void renderMermaidIn(root, theme === 'light' ? 'default' : 'dark')
  }, [html, tab, theme, loading])

  // Tô sáng chỉ thuộc về bản render hiện tại
  useEffect(() => () => setSearchHighlight([]), [html, tab])

  /** seq của scrollTarget đã xử lý: đổi file sau đó không cuộn/tô lại theo mục tiêu cũ */
  const doneSeq = useRef(0)
  useEffect(() => {
    if (loading || !html || !scrollTarget || scrollTarget.seq === doneSeq.current) return
    if (tab === 'source') {
      setTab('rendered')
      return
    }
    if (display.truncated) {
      setExpanded(true)
      return
    }
    const container = previewRef.current
    if (!container) return
    const body = container.querySelector('.md-body')
    if (!body) return
    doneSeq.current = scrollTarget.seq
    const targetHeading = scrollTarget.heading.trim()
    // Không heading, không chữ: về đầu file (Lùi/Tiến tới mục không có anchor)
    if (!targetHeading && !scrollTarget.text) {
      container.scrollTo({ top: 0 })
      return
    }
    const headings = Array.from(body.querySelectorAll('h1, h2, h3, h4, h5, h6')) as HTMLElement[]
    // Slug kiểu GitHub trước (link `#anchor`), rồi mới so gần đúng (tiêu đề trích dẫn AI)
    const bySlug = targetHeading ? headings[uniqueSlugs(headings.map((h) => h.textContent ?? '')).indexOf(slugifyHeading(targetHeading))] : undefined
    const matched = bySlug ?? (targetHeading ? headings.find((h) => matchHeadingText(h.textContent ?? '', targetHeading)) : undefined)
    if (scrollTarget.text) {
      const ranges = findTextRanges(body, scrollTarget.text.split(/\s+/))
      setSearchHighlight(ranges)
      // Chỗ khớp đầu tiên sau heading của kết quả (không có thì chỗ đầu tiên của file)
      const after = matched
        ? ranges.find((r) => matched.compareDocumentPosition(r.startContainer) & Node.DOCUMENT_POSITION_FOLLOWING)
        : undefined
      const hit = after ?? ranges[0]
      if (hit) {
        hit.startContainer.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }
    }
    if (targetHeading.toLowerCase() === 'tổng quan') {
      container.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    matched?.scrollIntoView({ behavior: scrollTarget.instant ? 'instant' : 'smooth', block: 'start' })
  }, [scrollTarget, loading, html, display.truncated, tab])

  // lang: nhãn "Bảng: ..." theo ngôn ngữ giao diện
  // Mục lục tính trên toàn văn (không phải bản đã cắt "Hiện thêm"): copy TSV/MD của bảng dài phải đủ dòng
  const outline = useMemo(() => extractOutline(md), [md, lang])
  const tablesInOutline = useMemo(() => outline.filter((x) => x.kind === 'table'), [outline])
  // テーブル定義書: bảng có cột 物理名 + 型 -> nút DDL trên chip, nút ER trên thanh xem
  const tableDefs = useMemo(() => parseTableDefs(md, title ?? ''), [md, title])
  const defByLine = useMemo(() => new Map(tableDefs.map((d) => [d.line, d])), [tableDefs])
  const hasOutlineBar = outline.length > 1 || tableDefs.length > 0
  const [ddl, setDdl] = useState<{ def: TableDef; x: number; y: number } | null>(null)
  const [erOpen, setErOpen] = useState(false)
  const closeDdl = useCallback(() => setDdl(null), [])
  const closeEr = useCallback(() => setErOpen(false), [])
  // テスト観点表: nút 観点表 khi tài liệu có bảng 項目定義 thuộc một 画面
  const testTables = useMemo(() => buildTestDesign(md).tables, [md])
  const [testOpen, setTestOpen] = useState(false)
  const closeTest = useCallback(() => setTestOpen(false), [])
  useEffect(() => {
    setDdl(null)
    setErOpen(false)
    setTestOpen(false)
  }, [title])

  const jumpToItem = useCallback((item: OutlineItem) => {
    const container = previewRef.current
    if (!container) return
    const body = container.querySelector('.md-body')
    if (!body) return
    const selector = item.kind === 'heading' ? 'h1, h2, h3, h4' : 'table'
    const targets = body.querySelectorAll(selector)
    const el = targets[item.domIndex] as HTMLElement | undefined
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else if (display.truncated) {
      // Mục nằm trong phần đang ẩn: mở hết rồi nhảy sau khi render
      setExpanded(true)
      pendingJump.current = item
    }
  }, [display.truncated])
  const pendingJump = useRef<OutlineItem | null>(null)
  useEffect(() => {
    const item = pendingJump.current
    if (!item || display.truncated) return
    pendingJump.current = null
    requestAnimationFrame(() => jumpToItem(item))
  }, [display.truncated, jumpToItem])

  const copyTableData = useCallback(async (text: string, label: string) => {
    const ok = await copyText(text)
    toast(ok ? tr('toast.copied', { label }) : tr('common.copyFailed'), ok ? 'ok' : 'err')
  }, [])

  const exportHtml = useCallback(async () => {
    if (!md) return
    try {
      // Bản xuất đứng riêng: chỉ ảnh data: còn dùng được, ảnh cục bộ không đi theo file.
      // Sơ đồ Mermaid được vẽ sẵn thành SVG (giao diện sáng) để trang xuất không cần thư viện
      const body = await inlineMermaid(
        sanitizeHtml(marked.parse(frontMatterAsCode(md), { breaks: false }) as string, {
          resolveImage: (src) => (/^data:image\//i.test(src) ? src : null),
        }),
        'default'
      )
      // Tiêu đề trang: h1 (không có thì h2) đầu tiên của bản đã render, nên không dính "# ..." trong khối code.
      const doc = new DOMParser().parseFromString(body, 'text/html')
      const docHeading = (doc.querySelector('h1') ?? doc.querySelector('h2'))?.textContent?.trim()
      const stem = guideFileStem(title)
      const saved = await window.api.saveHtml(stem, buildGuideHtml(docHeading || stem, body, { date: new Date().toLocaleDateString(getLocale()) }))
      if (saved) toast(tr('toast.htmlSaved', { path: saved }), 'ok')
    } catch (err) {
      toast(tr('toast.htmlFailed', { err: errMsg(err) }), 'err')
    }
  }, [md, title])

  const clickBody = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onLinkClick) return
      const a = (e.target as HTMLElement).closest('a')
      const href = a?.getAttribute('href')
      if (href && onLinkClick(href)) e.preventDefault()
    },
    [onLinkClick]
  )

  const stats = useMemo(() => {
    if (!md) return null
    const tables = (md.match(/^\|[-| :]+\|$/gm) || []).length
    return { lines: md.split('\n').length, chars: md.length, tables }
  }, [md])

  const copy = useCallback(async () => {
    if (!md) return
    const ok = await copyText(md)
    toast(tr(ok ? 'toast.mdCopied' : 'common.copyFailed'), ok ? 'ok' : 'err')
  }, [md])

  const sourceLines = useMemo(() => display.md.split('\n'), [display.md])

  return (
    <>
      <div className="x2m-preview-bar flex min-h-10 flex-wrap items-center justify-between gap-3 border-b border-line-subtle px-3 py-1">
        <div className="x2m-tabs flex shrink-0 items-center gap-0.5 rounded-lg border border-line-subtle bg-canvas p-0.5">
          <button
            className={cn(
              'x2m-tab inline-flex items-center gap-1.5 rounded-md px-2.5 py-[3px] text-xs font-medium text-dim transition-colors duration-300 ease-spring hover:text-ink',
              tab === 'rendered' && 'active seg-on'
            )}
            onClick={() => setTab('rendered')}
          >
            <IconEye size={15} /> {t('preview.tab.rendered')}
          </button>
          <button
            className={cn(
              'x2m-tab inline-flex items-center gap-1.5 rounded-md px-2.5 py-[3px] text-xs font-medium text-dim transition-colors duration-300 ease-spring hover:text-ink',
              tab === 'split' && 'active seg-on'
            )}
            onClick={() => setTab('split')}
            title={t('preview.tab.splitTitle')}
          >
            <IconSplit size={15} /> {t('preview.tab.split')}
          </button>
          <button
            className={cn(
              'x2m-tab inline-flex items-center gap-1.5 rounded-md px-2.5 py-[3px] text-xs font-medium text-dim transition-colors duration-300 ease-spring hover:text-ink',
              tab === 'source' && 'active seg-on'
            )}
            onClick={() => setTab('source')}
          >
            <IconMarkdown size={15} /> {t('preview.tab.source')}
          </button>
        </div>
        {/* flex-wrap: cửa sổ hẹp thì xuống dòng, không đẩy nút Lùi/Tiến + tên file tràn ra mép trái */}
        <div className="x2m-preview-meta flex min-w-0 flex-1 basis-[28rem] flex-wrap items-center justify-end gap-1 text-xs">
          {leading}
          {title ? (
            <span className="x2m-meta-stats dim mr-auto min-w-24 flex-1 basis-0 truncate pl-1 text-dim" title={title}>
              <strong className="x2m-meta-title font-semibold text-ink">{title}</strong>
              {stats ? ` · ${t('preview.stats', { lines: stats.lines, tables: stats.tables, chars: stats.chars.toLocaleString(LOCALES[lang]) })}` : ''}
            </span>
          ) : (
            <span className="dim text-dim">{noSelectionText ?? t('preview.noSheet')}</span>
          )}
          {zoom !== 1 && (
            <button className={cx('btn btn-sm btn-ghost', btnGhost, btnSm)} onClick={onResetZoom} title={t('preview.resetZoom')}>
              {Math.round(zoom * 100)}%
            </button>
          )}
          {tab !== 'source' && md && (
            <button
              className={cx('btn btn-sm btn-ghost', btnGhost, btnSm, wrapTables && 'active-pill border-accent-line bg-accent-soft text-accent-ink')}
              onClick={() => setWrapTables((w) => !w)}
              title={t(wrapTables ? 'preview.wrapOnTitle' : 'preview.wrapOffTitle')}
              aria-pressed={wrapTables}
            >
              <IconWrap size={14} /> {t(wrapTables ? 'preview.wrapOn' : 'preview.wrapOff')}
            </button>
          )}
          {hasOutlineBar && tab !== 'source' && (
            <button
              className={cx('btn btn-sm btn-ghost', btnGhost, btnSm, showOutline && 'active-pill border-accent-line bg-accent-soft text-accent-ink')}
              onClick={() => setShowOutline((s) => !s)}
              title={t('preview.outlineTitle')}
              aria-pressed={showOutline}
            >
              <IconList size={14} /> {t('preview.outline', { n: outline.length })}
            </button>
          )}
          {tableDefs.length > 0 && !loading && (
            <button className={cx('x2m-er-btn btn btn-sm btn-ghost', btnGhost, btnSm)} onClick={() => setErOpen(true)} title={t('td.erTitle', { n: tableDefs.length })}>
              {t('td.er')}
            </button>
          )}
          {testTables > 0 && !loading && (
            <button className={cx('x2m-testdesign-btn btn btn-sm btn-ghost', btnGhost, btnSm)} onClick={() => setTestOpen(true)} title={t('tsd.btnTitle', { n: testTables })}>
              {t('tsd.btn')}
            </button>
          )}
          <button className={cx('btn btn-sm btn-ghost', btnGhost, btnSm)} onClick={copy} disabled={!md || loading} title={t('preview.copyTitle')}>
            <IconCopy size={14} /> {t('common.copy')}
          </button>
          <button
            className={cx('btn btn-sm btn-ghost', btnGhost, btnSm)}
            onClick={() => void exportHtml()}
            disabled={!md || loading}
            title={t('preview.exportHtmlTitle')}
          >
            {t('preview.exportHtml')}
          </button>
          <button
            className={cx('btn btn-sm btn-ghost', btnGhost, btnSm)}
            onClick={() => window.print()}
            disabled={!md || loading}
            title={t('preview.printTitle')}
          >
            {t('preview.print')}
          </button>
        </div>
      </div>

      {showOutline && hasOutlineBar && tab !== 'source' && !loading && !error && md && (
        <div className="x2m-outline-bar border-b border-line-subtle px-3 py-2 overflow-x-auto [scrollbar-width:none] [mask-image:linear-gradient(90deg,transparent,#000_14px,#000_calc(100%-14px),transparent)]" role="navigation" aria-label={t('preview.outlineAria')}>
          <div className="x2m-outline-items flex w-max items-center gap-1.5">
            {outline.map((item, idx) => (
              <div key={idx} className={cn('x2m-outline-chip glass-chip inline-flex shrink-0 items-center overflow-hidden whitespace-nowrap rounded-full text-xs', item.kind === 'table' && 'is-table')}>
                <button
                  className="x2m-outline-jump inline-flex items-center gap-1 px-2.5 py-1 text-dim transition-colors hover:bg-hover hover:text-ink"
                  onClick={() => jumpToItem(item)}
                  title={
                    item.kind === 'table'
                      ? t('preview.jumpTable', { label: item.label, rows: item.rowCount ?? 0, cols: item.colCount ?? 0 })
                      : t('preview.jumpHeading', { label: item.label })
                  }
                >
                  {item.kind === 'table' && <IconTable size={12} />}
                  <span>{item.label}</span>
                  {item.kind === 'table' && (
                    <span className="x2m-outline-badge ml-1 rounded bg-line px-1 py-0.5 text-[10px] text-faint">
                      {item.rowCount}×{item.colCount}
                    </span>
                  )}
                </button>
                {item.kind === 'table' && item.tsvBlock && (
                  <button
                    className="x2m-outline-copy border-l border-line px-1.5 py-1 text-[11px] font-semibold text-accent-ink transition-colors hover:bg-accent-soft"
                    onClick={() => void copyTableData(item.tsvBlock!, t('preview.copyTsv', { label: item.label }))}
                    title={t('preview.copyTsvTitle')}
                  >
                    TSV
                  </button>
                )}
                {item.kind === 'table' && item.mdBlock && tablesInOutline.length > 1 && (
                  <button
                    className="x2m-outline-copy border-l border-line px-1.5 py-1 text-[11px] font-semibold text-accent-ink transition-colors hover:bg-accent-soft"
                    onClick={() => void copyTableData(item.mdBlock!, t('preview.copyMd', { label: item.label }))}
                    title={t('preview.copyMdTitle')}
                  >
                    MD
                  </button>
                )}
                {item.kind === 'table' && item.line !== undefined && defByLine.has(item.line) && (
                  <button
                    className="x2m-outline-copy x2m-outline-ddl border-l border-line px-1.5 py-1 text-[11px] font-semibold text-accent-ink transition-colors hover:bg-accent-soft"
                    onClick={(e) => {
                      const r = e.currentTarget.getBoundingClientRect()
                      setDdl({ def: defByLine.get(item.line!)!, x: r.left, y: r.bottom + 6 })
                    }}
                    title={t('td.ddlTitle')}
                    aria-haspopup="dialog"
                  >
                    DDL
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        ref={previewRef}
        className={cn('x2m-preview relative flex-1 overflow-auto p-6', tab === 'split' && 'is-split !p-4')}
        style={{ zoom }}
      >
        {loading ? (
          <div className="x2m-loading flex h-full items-center justify-center p-8 text-sm text-dim">{loadingText ?? t('common.converting')}</div>
        ) : error ? (
          <div className="x2m-error m-4 rounded-lg border border-danger/30 bg-danger-soft p-4 text-sm text-danger">{error}</div>
        ) : !md ? (
          <div className="x2m-empty flex h-full flex-col items-center justify-center gap-3 p-12 text-center text-faint">
            <IconEye size={36} />
            <p className="text-dim text-sm">{emptyText ?? t('preview.empty')}</p>
          </div>
        ) : tab === 'source' ? (
          <div className="x2m-source-wrap flex min-h-full overflow-auto rounded-lg border border-line bg-code font-mono text-xs">
            <div className="x2m-gutter flex select-none flex-col border-r border-line bg-raised/40 px-2 py-3 text-right text-faint" aria-hidden="true">
              {sourceLines.map((_, i) => (
                <span key={i}>{i + 1}</span>
              ))}
            </div>
            <pre className="x2m-source flex-1 overflow-x-auto whitespace-pre p-3 font-mono leading-relaxed text-ink outline-none">{display.md}</pre>
          </div>
        ) : tab === 'split' ? (
          <div className="x2m-split-pane grid h-full grid-cols-2 gap-4">
            <div className="x2m-split-col x2m-split-source flex flex-col overflow-hidden rounded-lg border border-line">
              <div className="x2m-split-col-head border-b border-line bg-raised px-3 py-1.5 text-xs font-semibold text-dim">{t('preview.sourceHead')}</div>
              <div className="x2m-source-wrap flex flex-1 overflow-auto bg-code font-mono text-xs">
                <div className="x2m-gutter flex select-none flex-col border-r border-line bg-raised/40 px-2 py-3 text-right text-faint" aria-hidden="true">
                  {sourceLines.map((_, i) => (
                    <span key={i}>{i + 1}</span>
                  ))}
                </div>
                <pre className="x2m-source flex-1 overflow-x-auto whitespace-pre p-3 font-mono leading-relaxed text-ink outline-none">{display.md}</pre>
              </div>
            </div>
            <div className="x2m-split-col x2m-split-rendered flex flex-col overflow-hidden rounded-lg border border-line">
              <div className="x2m-split-col-head border-b border-line bg-raised px-3 py-1.5 text-xs font-semibold text-dim">{t('preview.renderedHead')}</div>
              <div className="flex-1 overflow-auto p-4">
                <div
                  className={cn('md-body', fullWidth && 'full', wrapTables && 'wrap-cells')}
                  onClick={clickBody}
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              </div>
            </div>
          </div>
        ) : (
          <div
            className={cn('md-body mx-auto', fullWidth && 'full !max-w-none', wrapTables && 'wrap-cells')}
            onClick={clickBody}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </div>
      {display.truncated && (
        <button className={cx('btn btn-sm x2m-show-more mx-auto my-3', btnGhost, btnSm)} onClick={() => setExpanded(true)}>
          {t('preview.showMore', { n: display.hidden })}
        </button>
      )}
      <SelectionTranslate containerRef={previewRef} />
      {ddl && <DdlPopover def={ddl.def} x={ddl.x} y={ddl.y} onClose={closeDdl} onCopy={(text, label) => void copyTableData(text, label)} />}
      {erOpen && <ErDialog defs={tableDefs} onClose={closeEr} onCopy={(text, label) => void copyTableData(text, label)} />}
      {testOpen && <TestDesignDialog md={md} title={title} onClose={closeTest} onCopy={(text, label) => void copyTableData(text, label)} />}
    </>
  )
}
