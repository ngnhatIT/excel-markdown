import type { ConvertProgress } from '../lib/api'
import { cn } from '../lib/utils'
import { useT } from '../i18n'
import { btn, btnGhost, btnSm, cx } from '../lib/ui'
import { IconCheck, IconFolder, IconOpen } from './icons'

interface Props {
  outDir: string
  recentDirs: string[]
  onPickRecentDir: (dir: string) => void
  onChooseDir: () => void
  onOpenDir: () => void
  converting: boolean
  progress: ConvertProgress | null
  onCancel: () => void
  /** Chữ nút convert theo chế độ (vd `Convert 3 sheet sang Markdown`) */
  convertLabel: string
  canConvert: boolean
  onConvert: () => void
}

/** Đáy workbench: thư mục xuất, tiến độ, nút Convert (số sheet nằm ngay trên nút, không cần thanh trạng thái riêng). */
export function Footer(p: Props): React.ReactElement {
  const t = useT()
  const { outDir, progress, converting } = p
  const disabled = converting || !p.canConvert
  return (
    <footer className="x2m-footer shrink-0 border-t border-line-subtle">
      <div className="flex items-center justify-between gap-4 px-3 py-2">
        <div className="x2m-outdir flex min-w-0 flex-1 items-center gap-2 text-dim" title={outDir || t('footer.noOutDir')}>
          <div className="glass-chip flex min-w-0 items-center gap-2 rounded-md py-1 pl-2.5 pr-1">
            <IconFolder size={15} />
            <span className={cn('x2m-outdir-text max-w-[420px] truncate font-mono text-[11.5px]', !outDir && 'dim font-sans text-faint')}>{outDir || t('footer.noOutDirMd')}</span>
            {outDir && (
              <button className={cx('btn btn-sm btn-ghost', btnGhost, btnSm, '!p-1')} onClick={p.onOpenDir} title={t('common.openFolder')} aria-label={t('common.openFolder')}>
                <IconOpen size={13} />
              </button>
            )}
          </div>
          {p.recentDirs.length > 0 && (
            <select
              className="x2m-dir-select max-w-[150px] cursor-pointer rounded-md border border-line-subtle bg-canvas px-1.5 py-1 text-xs text-dim transition-colors duration-300 ease-spring hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              value=""
              onChange={(e) => {
                if (e.target.value) p.onPickRecentDir(e.target.value)
              }}
              title={t('footer.recent')}
              aria-label={t('footer.recent')}
            >
              <option value="">{t('footer.recentPlaceholder')}</option>
              {p.recentDirs.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )}
          <button className={cx('btn btn-sm', btn, btnSm)} onClick={p.onChooseDir}>
            {t('footer.chooseDir')}
          </button>
        </div>
        <div className="x2m-footer-actions flex shrink-0 items-center gap-3">
          {converting && progress && progress.total > 0 && (
            <div className="flex items-center gap-2">
              <div
                className="x2m-progress relative h-1.5 w-36 overflow-hidden rounded-full bg-hover"
                role="progressbar"
                aria-valuenow={progress.done}
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-label={t('footer.progress')}
              >
                {/* scaleX thay vì width để chỉ animate transform */}
                <div className="x2m-progress-fill h-full origin-left bg-accent transition-transform duration-500 ease-spring motion-reduce:transition-none" style={{ transform: `scaleX(${progress.done / progress.total})` }} />
              </div>
              <span className="x2m-progress-text tabular text-[11px] font-semibold text-dim">
                {progress.done}/{progress.total}
              </span>
            </div>
          )}
          {converting && (
            <button className={cx('btn btn-sm', btn, btnSm)} onClick={p.onCancel} title={t('footer.cancelTitle')}>
              {t('common.cancel')}
            </button>
          )}
          <button
            className={cx(
              'btn btn-primary inline-flex items-center gap-2 rounded-md border border-transparent bg-accent px-4 py-2 text-[13px] font-semibold text-white',
              'transition-[filter,transform,opacity] duration-200',
              'enabled:hover:brightness-110 enabled:active:scale-[0.98] disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
            )}
            onClick={p.onConvert}
            disabled={disabled}
            title="Ctrl+Enter"
          >
            <IconCheck size={15} />
            {converting ? t('common.converting') : p.convertLabel}
          </button>
        </div>
      </div>
    </footer>
  )
}
