import { useCallback, useEffect, useMemo, useState } from 'react'
import { marked } from 'marked'
import { sanitizeHtml } from '../sanitize'
import { cn, copyText, toast } from '../utils'
import { IconCopy, IconEye, IconMarkdown } from './icons'

/** Preview dài hơn số dòng này thì cắt, bấm "Hiện thêm" để xem hết. */
const PREVIEW_LINE_LIMIT = 300

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
}

/** Thanh tab + vùng xem trước (Markdown đã render hoặc mã nguồn). */
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
}: Props): React.ReactElement {
  const [tab, setTab] = useState<'rendered' | 'source'>('rendered')
  const [expanded, setExpanded] = useState(false)

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
      return sanitizeHtml(marked.parse(display.md, { breaks: false }) as string)
    } catch {
      return ''
    }
  }, [display])

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

  return (
    <>
      <div className="x2m-preview-bar">
        <div className="x2m-tabs">
          <button className={cn('x2m-tab', tab === 'rendered' && 'active')} onClick={() => setTab('rendered')}>
            <IconEye size={15} /> Xem trước
          </button>
          <button className={cn('x2m-tab', tab === 'source' && 'active')} onClick={() => setTab('source')}>
            <IconMarkdown size={15} /> Mã Markdown
          </button>
        </div>
        <div className="x2m-preview-meta">
          {title ? (
            <span className="dim">
              {title}
              {stats ? ` · ${stats.lines} dòng, ${stats.tables} bảng, ${stats.chars} ký tự` : ''}
            </span>
          ) : (
            <span className="dim">{noSelectionText}</span>
          )}
          {zoom !== 1 && (
            <button className="btn btn-sm btn-ghost" onClick={onResetZoom} title="Khôi phục cỡ chữ (Ctrl+0)">
              {Math.round(zoom * 100)}%
            </button>
          )}
          <button className="btn btn-sm btn-ghost" onClick={copy} disabled={!md || loading} title="Copy Markdown">
            <IconCopy size={14} /> Copy
          </button>
        </div>
      </div>
      <div className="x2m-preview" style={{ zoom }}>
        {loading ? (
          <div className="x2m-loading">{loadingText}</div>
        ) : error ? (
          <div className="x2m-error">{error}</div>
        ) : !md ? (
          <div className="x2m-empty">
            <IconEye size={36} />
            <p>{emptyText}</p>
          </div>
        ) : tab === 'source' ? (
          <div className="x2m-source-wrap">
            <div className="x2m-gutter" aria-hidden="true">
              {display.md.split('\n').map((_, i) => (
                <span key={i}>{i + 1}</span>
              ))}
            </div>
            <pre className="x2m-source">{display.md}</pre>
          </div>
        ) : (
          <div className="md-body" dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </div>
      {display.truncated && (
        <button className="btn btn-sm x2m-show-more" onClick={() => setExpanded(true)}>
          Hiện thêm {display.hidden} dòng
        </button>
      )}
    </>
  )
}
