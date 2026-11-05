import type { AppMode } from '../../../types'
import { cn } from '../utils'
import { btnGhost, btnPrimary, btnSm, cx } from '../ui'
import { IconFolder, IconMarkdown, IconMoon, IconPlus, IconSun } from './icons'

interface Props {
  theme: 'dark' | 'light'
  onToggleTheme: () => void
  onPickFiles: () => void
  mode: AppMode
  onModeChange: (m: AppMode) => void
}

const MODES: { value: AppMode; label: string }[] = [
  { value: 'excel2md', label: 'Excel → Markdown' },
  { value: 'md2excel', label: 'Markdown → Excel' },
  { value: 'mdview', label: 'Đọc Markdown' },
]

const PICK_LABEL: Record<AppMode, string> = {
  excel2md: 'Thêm file Excel',
  md2excel: 'Thêm file Markdown',
  mdview: 'Mở thư mục',
}

export function Header({ theme, onToggleTheme, onPickFiles, mode, onModeChange }: Props): React.ReactElement {
  const themeLabel = theme === 'dark' ? 'Chuyển sang nền sáng' : 'Chuyển sang nền tối'
  return (
    <header className="x2m-header flex shrink-0 items-center justify-between gap-3 border-b border-line bg-soft px-4 py-2.5">
      <div className="x2m-brand flex items-center gap-[11px]">
        <span className="x2m-logo flex size-9 shrink-0 items-center justify-center rounded-[9px] border border-accent-line bg-accent-soft text-accent-ink">
          <IconMarkdown size={22} />
        </span>
        <div>
          <div className="x2m-title text-[15px] font-bold tracking-[-0.01em]">ExcelToMarkdown</div>
          <div className="x2m-sub text-[11.5px] text-dim">Convert file Excel sang Markdown, giữ đúng bố cục tài liệu</div>
        </div>
      </div>
      <div className="x2m-mode flex gap-0.5 rounded-[9px] border border-line bg-raised p-[3px]" role="group" aria-label="Chế độ">
        {MODES.map((m) => (
          <button
            key={m.value}
            className={cn(
              'x2m-mode-btn cursor-pointer whitespace-nowrap rounded-[7px] px-3 py-[5px] text-[12.5px] font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
              mode === m.value ? 'active bg-accent-soft text-accent-ink' : 'text-dim hover:bg-hover hover:text-ink'
            )}
            onClick={() => onModeChange(m.value)}
            aria-pressed={mode === m.value}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="x2m-header-actions flex items-center gap-2">
        <button className={cx('btn btn-ghost btn-sm', btnGhost, btnSm)} onClick={onToggleTheme} title={themeLabel} aria-label={themeLabel}>
          {theme === 'dark' ? <IconSun size={16} /> : <IconMoon size={16} />}
        </button>
        <button className={cx('btn btn-primary btn-sm', btnPrimary, btnSm)} onClick={onPickFiles}>
          {mode === 'mdview' ? <IconFolder size={16} /> : <IconPlus size={16} />} {PICK_LABEL[mode]}
        </button>
      </div>
    </header>
  )
}
