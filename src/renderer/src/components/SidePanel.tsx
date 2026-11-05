import { IconChevronDown, IconSettings } from './icons'

interface Props {
  title?: string
  collapsed: boolean
  onToggle: () => void
  /** Nút thêm ở thanh tiêu đề (vd "Mặc định") */
  actions?: React.ReactNode
  width?: number
  children: React.ReactNode
}

/** Cột phải có thể thu gọn thành dải hẹp (bấm để mở lại). */
export function SidePanel({ title = 'Tùy chọn', collapsed, onToggle, actions, width, children }: Props): React.ReactElement {
  const showTitle = `Hiện ${title}`
  const hideTitle = `Ẩn ${title}`
  if (collapsed) {
    return (
      <aside className="x2m-side collapsed">
        <button className="x2m-side-strip" onClick={onToggle} title={showTitle} aria-label={showTitle} aria-expanded={false}>
          <span className="x2m-side-chevron open">
            <IconChevronDown size={14} />
          </span>
          <IconSettings size={16} />
          <span className="x2m-side-vlabel">{title}</span>
        </button>
      </aside>
    )
  }
  return (
    <aside className="x2m-side" style={width ? { width, minWidth: width } : undefined}>
      <div className="x2m-pane-title">
        {title}
        <span className="x2m-side-head-actions">
          {actions}
          <button className="x2m-move-btn x2m-reload-btn" onClick={onToggle} title={hideTitle} aria-label={hideTitle} aria-expanded>
            <span className="x2m-side-chevron">
              <IconChevronDown size={14} />
            </span>
          </button>
        </span>
      </div>
      {children}
    </aside>
  )
}
