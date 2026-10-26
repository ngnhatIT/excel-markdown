import type { AppMode } from '../../../types'
import { cn } from '../utils'
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
      <div className="x2m-mode" role="group" aria-label="Chế độ">
        {MODES.map((m) => (
          <button
            key={m.value}
            className={cn('x2m-mode-btn', mode === m.value && 'active')}
            onClick={() => onModeChange(m.value)}
            aria-pressed={mode === m.value}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="x2m-header-actions">
        <button className="btn btn-ghost btn-sm" onClick={onToggleTheme} title={themeLabel} aria-label={themeLabel}>
          {theme === 'dark' ? <IconSun size={16} /> : <IconMoon size={16} />}
        </button>
        <button className="btn btn-primary btn-sm" onClick={onPickFiles}>
          {mode === 'mdview' ? <IconFolder size={16} /> : <IconPlus size={16} />} {PICK_LABEL[mode]}
        </button>
      </div>
    </header>
  )
}
