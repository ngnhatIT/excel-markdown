import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { marked } from 'marked'
import { buildGuideHtml } from '../../../shared/guideHtml'
import { errMsg } from '../api'
import { sanitizeHtml } from '../sanitize'
import { cn, copyText, matchHeadingText, toast } from '../utils'
import { btnGhost, btnSm, cx } from '../ui'
import { IconCopy, IconEye, IconList, IconMarkdown, IconSplit, IconTable, IconWrap } from './icons'

/** Preview dài hơn số dòng này thì cắt, bấm "Hiện thêm" để xem hết. */
const PREVIEW_LINE_LIMIT = 300

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
}

/** Trích xuất danh sách mục lục (Headings + Bảng) từ mã Markdown để nhảy nhanh & copy bảng. */
function extractOutline(md: string): OutlineItem[] {
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
      const firstHeader = headerCells.find((c) => c !== '') ?? `Bảng ${tableIdx + 1}`
      const tsvLines = [headerCells, ...dataRows].map((r) => r.join('\t')).join('\n')
      items.push({
        kind: 'table',
        label: `Bảng: ${firstHeader.slice(0, 22)}${firstHeader.length > 22 ? '…' : ''}`,
        domIndex: tableIdx++,
        mdBlock: tableLines.join('\n'),
        tsvBlock: tsvLines,
        colCount: headerCells.length,
        rowCount: dataRows.length,
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
  /** Nhảy tới heading tương ứng khi bấm trích dẫn AI */
  scrollTarget?: { heading: string; seq: number } | null
}

/** Thanh tab + vùng xem trước (Markdown đã render, Song song, hoặc Mã nguồn). */
export function PreviewPane({
  title,
  md,
  loading,
  error,
  zoom,
  onResetZoom,
  noSelectionText = 'Chưa chọn sheet',
  loadingText = 'Đang convert...',
  emptyText = 'Chọn một sheet để xem trước kết quả convert',
  resolveImage,
  onLinkClick,
  fullWidth = true,
  scrollTarget,
}: Props): React.ReactElement {
  const [tab, setTab] = useState<'rendered' | 'split' | 'source'>('rendered')
  const [expanded, setExpanded] = useState(false)
  const [wrapTables, setWrapTables] = useState(true)
  const [showOutline, setShowOutline] = useState(true)
  const previewRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setExpanded(false)
  }, [md])

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
      return sanitizeHtml(marked.parse(display.md, { breaks: false }) as string, { resolveImage })
    } catch {
      return ''
    }
  }, [display, resolveImage])

  useEffect(() => {
    if (loading || !html || !scrollTarget?.heading) return
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
    const targetHeading = scrollTarget.heading.trim()
    if (targetHeading.toLowerCase() === 'tổng quan') {
      container.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    const headings = Array.from(body.querySelectorAll('h1, h2, h3, h4')) as HTMLElement[]
    const matched = headings.find((h) => matchHeadingText(h.textContent ?? '', targetHeading))
    if (matched) {
      matched.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [scrollTarget, loading, html, display.truncated, tab])

  const outline = useMemo(() => extractOutline(display.md), [display.md])
  const tablesInOutline = useMemo(() => outline.filter((x) => x.kind === 'table'), [outline])

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
    }
  }, [])

  const copyTableData = useCallback(async (text: string, label: string) => {
    const ok = await copyText(text)
    toast(ok ? `Đã copy ${label}` : 'Copy thất bại', ok ? 'ok' : 'err')
  }, [])

  const exportHtml = useCallback(async () => {
    if (!md) return
    try {
      // Bản xuất đứng riêng: chỉ ảnh data: còn dùng được, ảnh cục bộ không đi theo file.
      const body = sanitizeHtml(marked.parse(md, { breaks: false }) as string, {
        resolveImage: (src) => (/^data:image\//i.test(src) ? src : null),
      })
      const cleanName = (title ?? 'ghi-chu')
        .replace(/\.[a-zA-Z0-9]+$/g, '')
        .replace(/[\\/]/g, ' - ')
        .trim() || 'ghi-chu'
      const docHeading = (md.match(/^#\s+(.+)$/m) || md.match(/^##\s+(.+)$/m))?.[1]?.replace(/<[^>]*>/g, '').trim()
      const pageTitle = docHeading || cleanName
      const saved = await window.api.saveHtml(cleanName, buildGuideHtml(pageTitle, body, { date: new Date().toLocaleDateString('vi-VN') }))
      if (saved) toast('Đã lưu HTML: ' + saved, 'ok')
    } catch (err) {
      toast('Xuất HTML thất bại: ' + errMsg(err), 'err')
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
    toast(ok ? 'Đã copy Markdown vào clipboard' : 'Copy thất bại', ok ? 'ok' : 'err')
  }, [md])

  const sourceLines = useMemo(() => display.md.split('\n'), [display.md])

  return (
    <>
      <div className="x2m-preview-bar flex flex-wrap items-center justify-between gap-3 border-b border-line bg-soft px-4 py-2">
        <div className="x2m-tabs flex items-center gap-1 rounded-lg border border-line bg-raised p-0.5">
          <button
            className={cn(
              'x2m-tab inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium text-dim transition-colors hover:text-ink',
              tab === 'rendered' && 'active bg-soft text-accent-ink shadow-sm'
            )}
            onClick={() => setTab('rendered')}
          >
            <IconEye size={15} /> Xem trước
          </button>
          <button
            className={cn(
              'x2m-tab inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium text-dim transition-colors hover:text-ink',
              tab === 'split' && 'active bg-soft text-accent-ink shadow-sm'
            )}
            onClick={() => setTab('split')}
            title="Xem song song Mã Markdown và Bản hiển thị"
          >
            <IconSplit size={15} /> Song song
          </button>
          <button
            className={cn(
              'x2m-tab inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium text-dim transition-colors hover:text-ink',
              tab === 'source' && 'active bg-soft text-accent-ink shadow-sm'
            )}
            onClick={() => setTab('source')}
          >
            <IconMarkdown size={15} /> Mã Markdown
          </button>
        </div>
        <div className="x2m-preview-meta flex items-center gap-2 text-xs">
          {title ? (
            <span className="x2m-meta-stats dim text-dim" title={title}>
              <strong className="x2m-meta-title font-semibold text-ink">{title}</strong>
              {stats ? ` · ${stats.lines} dòng · ${stats.tables} bảng · ${stats.chars.toLocaleString('vi-VN')} ký tự` : ''}
            </span>
          ) : (
            <span className="dim text-dim">{noSelectionText}</span>
          )}
          {zoom !== 1 && (
            <button className={cx('btn btn-sm btn-ghost', btnGhost, btnSm)} onClick={onResetZoom} title="Khôi phục cỡ chữ (Ctrl+0)">
              {Math.round(zoom * 100)}%
            </button>
          )}
          {tab !== 'source' && md && (
            <button
              className={cx('btn btn-sm btn-ghost', btnGhost, btnSm, wrapTables && 'active-pill border-accent-line bg-accent-soft text-accent-ink')}
              onClick={() => setWrapTables((w) => !w)}
              title={wrapTables ? 'Đang tự xuống dòng trong ô bảng dài (bấm để giữ 1 dòng ngang)' : 'Đang giữ 1 dòng ngang (bấm để tự xuống dòng ô dài)'}
              aria-pressed={wrapTables}
            >
              <IconWrap size={14} /> {wrapTables ? 'Gói dòng' : '1 dòng'}
            </button>
          )}
          {outline.length > 1 && tab !== 'source' && (
            <button
              className={cx('btn btn-sm btn-ghost', btnGhost, btnSm, showOutline && 'active-pill border-accent-line bg-accent-soft text-accent-ink')}
              onClick={() => setShowOutline((s) => !s)}
              title="Ẩn/hiện thanh Mục lục & Công cụ Bảng"
              aria-pressed={showOutline}
            >
              <IconList size={14} /> Mục lục ({outline.length})
            </button>
          )}
          <button className={cx('btn btn-sm btn-ghost', btnGhost, btnSm)} onClick={copy} disabled={!md || loading} title="Copy toàn bộ Markdown">
            <IconCopy size={14} /> Copy
          </button>
          <button
            className={cx('btn btn-sm btn-ghost', btnGhost, btnSm)}
            onClick={() => void exportHtml()}
            disabled={!md || loading}
            title="Xuất trang HTML đứng riêng có mục lục (ghi chú hướng dẫn)"
          >
            Xuất HTML
          </button>
          <button
            className={cx('btn btn-sm btn-ghost', btnGhost, btnSm)}
            onClick={() => window.print()}
            disabled={!md || loading}
            title="In hoặc lưu PDF (chọn 'Lưu dưới dạng PDF')"
          >
            In / PDF
          </button>
        </div>
      </div>

      {showOutline && outline.length > 1 && tab !== 'source' && !loading && !error && md && (
        <div className="x2m-outline-bar border-b border-line bg-raised/40 px-3 py-1.5 overflow-x-auto" role="navigation" aria-label="Mục lục nhanh">
          <div className="x2m-outline-items flex items-center gap-1.5">
            {outline.map((item, idx) => (
              <div key={idx} className={cn('x2m-outline-chip inline-flex items-center overflow-hidden rounded-md border border-line bg-soft text-xs shadow-xs', item.kind === 'table' && 'is-table')}>
                <button
                  className="x2m-outline-jump inline-flex items-center gap-1 px-2 py-1 text-dim transition-colors hover:bg-hover hover:text-ink"
                  onClick={() => jumpToItem(item)}
                  title={
                    item.kind === 'table'
                      ? `Nhảy tới ${item.label} (${item.rowCount} dòng × ${item.colCount} cột)`
                      : `Nhảy tới mục: ${item.label}`
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
                    onClick={() => void copyTableData(item.tsvBlock!, `${item.label} (TSV cho Excel)`)}
                    title="Copy bảng dạng TSV (dán thẳng vào Excel / Google Sheets)"
                  >
                    TSV
                  </button>
                )}
                {item.kind === 'table' && item.mdBlock && tablesInOutline.length > 1 && (
                  <button
                    className="x2m-outline-copy border-l border-line px-1.5 py-1 text-[11px] font-semibold text-accent-ink transition-colors hover:bg-accent-soft"
                    onClick={() => void copyTableData(item.mdBlock!, `${item.label} (Markdown)`)}
                    title="Copy riêng bảng này dạng Markdown"
                  >
                    MD
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        ref={previewRef}
        className={cn('x2m-preview relative flex-1 overflow-auto bg-canvas p-6', tab === 'split' && 'is-split !p-4')}
        style={{ zoom }}
      >
        {loading ? (
          <div className="x2m-loading flex h-full items-center justify-center p-8 text-sm text-dim">{loadingText}</div>
        ) : error ? (
          <div className="x2m-error m-4 rounded-lg border border-danger/30 bg-danger-soft p-4 text-sm text-danger">{error}</div>
        ) : !md ? (
          <div className="x2m-empty flex h-full flex-col items-center justify-center gap-3 p-12 text-center text-faint">
            <IconEye size={36} />
            <p className="text-dim text-sm">{emptyText}</p>
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
              <div className="x2m-split-col-head border-b border-line bg-raised px-3 py-1.5 text-xs font-semibold text-dim">Mã nguồn Markdown</div>
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
              <div className="x2m-split-col-head border-b border-line bg-raised px-3 py-1.5 text-xs font-semibold text-dim">Bản hiển thị</div>
              <div className="flex-1 overflow-auto p-4 bg-canvas">
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
          Hiện thêm {display.hidden} dòng
        </button>
      )}
    </>
  )
}
