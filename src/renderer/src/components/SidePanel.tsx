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
      <aside className="x2m-side collapsed w-10 min-w-10 shrink-0 overflow-hidden border-l border-line-subtle">
        <button className="x2m-side-strip flex size-full cursor-pointer flex-col items-center gap-2.5 py-3 text-dim transition-colors duration-150 hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent" onClick={onToggle} title={showTitle} aria-label={showTitle} aria-expanded={false}>
          <span className="x2m-side-chevron open flex rotate-90">
            <IconChevronDown size={14} />
          </span>
          <IconSettings size={16} />
          <span className="x2m-side-vlabel text-xs font-bold tracking-[0.04em] [writing-mode:vertical-rl]">{title}</span>
        </button>
      </aside>
    )
  }
  return (
    <aside className="x2m-side flex w-[304px] min-w-60 shrink-0 flex-col overflow-y-auto border-l border-line-subtle" style={width ? { width, minWidth: width } : undefined}>
      <div className="x2m-pane-title sticky top-0 z-[1] flex shrink-0 bg-canvas/80 h-10 shrink-0 items-center justify-between gap-1.5 border-b border-line-subtle px-3 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-faint [&_button]:normal-case [&_button]:tracking-normal">
        {title}
        <span className="x2m-side-head-actions flex items-center gap-1">
          {actions}
          <button className="x2m-move-btn x2m-reload-btn flex cursor-pointer items-center rounded-md px-1.5 py-1 text-[13px] font-bold leading-none text-dim transition-colors duration-150 hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" onClick={onToggle} title={hideTitle} aria-label={hideTitle} aria-expanded>
            <span className="x2m-side-chevron flex -rotate-90">
              <IconChevronDown size={14} />
            </span>
          </button>
        </span>
      </div>
      {children}
    </aside>
  )
}
