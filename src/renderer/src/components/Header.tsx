import type { AppMode } from '../../../shared/types'
import { cn } from '../lib/utils'
import { LANGS, useLang, useT, type Lang } from '../i18n'
import { cx } from '../lib/ui'
import { IconBook, IconCompare, IconFolder, IconMarkdown, IconMoon, IconPlus, IconSheetToMd, IconSun } from './icons'

interface Props {
  theme: 'dark' | 'light'
  onToggleTheme: () => void
  onPickFiles: () => void
  mode: AppMode
  onModeChange: (m: AppMode) => void
  onLangChange: (l: Lang) => void
}

const MODES: AppMode[] = ['excel2md', 'mdview', 'compare']
const MODE_ICON: Record<AppMode, (p: { size?: number }) => React.ReactElement> = {
  excel2md: IconSheetToMd,
  mdview: IconBook,
  compare: IconCompare,
}
/** Chữ trên nút chọn ngôn ngữ (giữ nguyên ở mọi ngôn ngữ) */
const LANG_SHORT: Record<Lang, string> = { vi: 'VI', en: 'EN', ja: '日本語' }

/** Thanh chế độ dọc bên trái (nền chàm 藍): logo, 4 chế độ (icon + tên), đổi sáng / tối ở đáy. */
export function ModeRail({ mode, onModeChange, theme, onToggleTheme }: Pick<Props, 'mode' | 'onModeChange' | 'theme' | 'onToggleTheme'>): React.ReactElement {
  const t = useT()
  const themeLabel = t(theme === 'dark' ? 'header.theme.toLight' : 'header.theme.toDark')
  const railBtn =
    'relative flex w-full flex-col items-center gap-1 rounded-md px-1 py-2 text-[10.5px] font-medium leading-tight text-white/65 transition-colors duration-200 hover:bg-white/8 hover:text-white focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white/70'
  return (
    <nav className="x2m-rail flex w-[76px] shrink-0 flex-col items-center gap-1 bg-[var(--rail-bg)] px-1.5 pb-2 pt-3" aria-label={t('header.modes')}>
      <span className="x2m-brand mb-3 flex size-9 items-center justify-center rounded-md bg-white/12 text-white" title={t('header.brandTitle')} aria-label="ExcelToMarkdown">
        <IconMarkdown size={19} />
      </span>
      {MODES.map((m) => {
        const Icon = MODE_ICON[m]
        const on = mode === m
        return (
          <button
            key={m}
            className={cn(
              'x2m-mode-btn',
              railBtn,
              on && 'active bg-white/12 !text-white before:absolute before:inset-y-2 before:-left-1.5 before:w-[3px] before:rounded-r before:bg-[#9db7f0]'
            )}
            onClick={() => onModeChange(m)}
            aria-pressed={on}
          >
            <Icon size={21} />
            <span className="text-center">{t(`header.mode.${m}`)}</span>
          </button>
        )
      })}
      <button className={cn(railBtn, 'mt-auto')} onClick={onToggleTheme} title={themeLabel} aria-label={themeLabel}>
        {theme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
      </button>
    </nav>
  )
}

/** Thanh trên của vùng làm việc: tên chế độ đang dùng, ngôn ngữ, thao tác chính. */
export function Header({ onPickFiles, mode, onLangChange }: Pick<Props, 'onPickFiles' | 'mode' | 'onLangChange'>): React.ReactElement {
  const t = useT()
  const lang = useLang()
  return (
    <header className="x2m-header flex h-12 shrink-0 items-center gap-4 border-b border-line bg-[var(--glass)] pl-5 pr-3">
      <h1 className="x2m-title m-0 text-[15px] font-semibold tracking-[-0.01em] text-ink">{t(`header.mode.${mode}`)}</h1>
      <div className="x2m-header-actions ml-auto flex items-center gap-2">
        <div className="x2m-lang flex items-center gap-0.5 rounded-md border border-line bg-soft p-0.5" role="group" aria-label={t('lang.label')}>
          {LANGS.map((l) => (
            <button
              key={l}
              className={cn(
                'x2m-lang-btn rounded px-2 py-0.5 text-xs font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
                lang === l ? 'active seg-on' : 'text-dim hover:text-ink'
              )}
              onClick={() => onLangChange(l)}
              aria-pressed={lang === l}
              title={t(`lang.${l}`)}
              lang={l}
            >
              {LANG_SHORT[l]}
            </button>
          ))}
        </div>
        <button
          className={cx(
            'btn btn-primary inline-flex items-center gap-1.5 rounded-md border border-transparent bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-white',
            'transition-[filter,transform] duration-200 hover:brightness-110 active:scale-[0.98]',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
          )}
          onClick={onPickFiles}
        >
          {mode === 'mdview' ? <IconFolder size={15} /> : <IconPlus size={15} />}
          {mode === 'mdview' ? t('common.openFolder') : t(`header.pick.${mode}`)}
        </button>
      </div>
    </header>
  )
}
