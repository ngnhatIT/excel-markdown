import { IconChevronDown, IconSettings } from './icons'

interface Props {
  collapsed: boolean
  onToggle: () => void
  /** Nút thêm ở thanh tiêu đề (vd "Mặc định") */
  actions?: React.ReactNode
  children: React.ReactNode
}

/** Cột phải "Tùy chọn" có thể thu gọn thành dải hẹp (bấm để mở lại). */
export function SidePanel({ collapsed, onToggle, actions, children }: Props): React.ReactElement {
  if (collapsed) {
    return (
      <aside className="x2m-side collapsed">
        <button className="x2m-side-strip" onClick={onToggle} title="Hiện tùy chọn" aria-label="Hiện tùy chọn" aria-expanded={false}>
          <span className="x2m-side-chevron open">
            <IconChevronDown size={14} />
          </span>
          <IconSettings size={16} />
          <span className="x2m-side-vlabel">Tùy chọn</span>
        </button>
      </aside>
    )
  }
  return (
    <aside className="x2m-side">
      <div className="x2m-pane-title">
        Tùy chọn
        <span className="x2m-side-head-actions">
          {actions}
          <button className="x2m-move-btn x2m-reload-btn" onClick={onToggle} title="Ẩn tùy chọn" aria-label="Ẩn tùy chọn" aria-expanded>
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
