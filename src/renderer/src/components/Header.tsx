import type { AppMode } from '../../../shared/types'
import { cn } from '../lib/utils'
import { btnGhost, btnSm, cx } from '../lib/ui'
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

/** Thanh tiêu đề kiểu IDE: thương hiệu, tab chế độ (gạch chân trượt), thao tác chính. */
export function Header({ theme, onToggleTheme, onPickFiles, mode, onModeChange }: Props): React.ReactElement {
  const themeLabel = theme === 'dark' ? 'Chuyển sang nền sáng' : 'Chuyển sang nền tối'
  return (
    <header className="x2m-header flex h-12 shrink-0 items-center gap-4 border-b border-line-subtle pl-3 pr-2">
      <div className="x2m-brand flex items-center gap-2.5" title="Convert file Excel sang Markdown, giữ đúng bố cục tài liệu">
        <span className="x2m-logo seg-on flex size-7 shrink-0 items-center justify-center rounded-lg text-accent-ink">
          <IconMarkdown size={17} />
        </span>
        <span className="x2m-title text-[13.5px] font-semibold tracking-[-0.01em]">ExcelToMarkdown</span>
      </div>
      <span className="h-5 w-px bg-line" aria-hidden="true" />
      <nav className="x2m-mode flex h-full items-stretch" role="group" aria-label="Chế độ">
        {MODES.map((m) => (
          <button
            key={m.value}
            className={cn(
              'x2m-mode-btn relative cursor-pointer whitespace-nowrap px-3 text-[12.5px] font-medium',
              'transition-colors duration-300 ease-spring focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-accent',
              'after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-accent after:transition-transform after:duration-500 after:ease-spring',
              mode === m.value ? 'active text-ink after:scale-x-100' : 'text-dim after:scale-x-0 hover:text-ink'
            )}
            onClick={() => onModeChange(m.value)}
            aria-pressed={mode === m.value}
          >
            {m.label}
          </button>
        ))}
      </nav>
      <div className="x2m-header-actions ml-auto flex items-center gap-1.5">
        <button className={cx('btn btn-ghost btn-sm', btnGhost, btnSm)} onClick={onToggleTheme} title={themeLabel} aria-label={themeLabel}>
          {theme === 'dark' ? <IconSun size={16} /> : <IconMoon size={16} />}
        </button>
        <button
          className={cx(
            'btn btn-primary group inline-flex items-center gap-2 rounded-full border border-white/20 bg-accent py-1 pl-1 pr-3.5 text-[12.5px] font-semibold text-white',
            'shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_6px_18px_-8px_var(--accent)] transition-[filter,transform] duration-300 ease-spring hover:brightness-110 active:scale-[0.98]',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
          )}
          onClick={onPickFiles}
        >
          <span className={cn('flex size-6 items-center justify-center rounded-full bg-white/20 transition-transform duration-300 ease-spring group-hover:scale-105', mode !== 'mdview' && 'group-hover:rotate-90')}>
            {mode === 'mdview' ? <IconFolder size={14} /> : <IconPlus size={14} />}
          </span>
          {PICK_LABEL[mode]}
        </button>
      </div>
    </header>
  )
}
