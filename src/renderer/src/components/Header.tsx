import { IconMarkdown, IconMoon, IconPlus, IconSun } from './icons'

interface Props {
  theme: 'dark' | 'light'
  onToggleTheme: () => void
  onPickFiles: () => void
}

export function Header({ theme, onToggleTheme, onPickFiles }: Props): React.ReactElement {
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
      <div className="x2m-header-actions">
        <button className="btn btn-ghost btn-sm" onClick={onToggleTheme} title={themeLabel} aria-label={themeLabel}>
          {theme === 'dark' ? <IconSun size={16} /> : <IconMoon size={16} />}
        </button>
        <button className="btn btn-primary btn-sm" onClick={onPickFiles}>
          <IconPlus size={16} /> Thêm file Excel
        </button>
      </div>
    </header>
  )
}
