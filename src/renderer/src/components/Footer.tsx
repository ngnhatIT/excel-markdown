import type { ConvertProgress } from '../api'
import { cn } from '../utils'
import { btn, btnGhost, btnPrimary, btnSm, cx } from '../ui'
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
  /** Dòng trạng thái theo chế độ (vd `2 file, 3 sheet được chọn`) */
  status: string
  /** Chữ nút convert theo chế độ (vd `Convert 3 sheet sang Markdown`) */
  convertLabel: string
  canConvert: boolean
  appVersion: string
  lastConvertAt: string
  onConvert: () => void
  /** Chữ khi chưa chọn thư mục lưu */
  outDirPlaceholder?: string
}

/** Thanh dưới: thư mục xuất, tiến độ, nút Hủy và nút Convert. */
export function Footer(p: Props): React.ReactElement {
  const { outDir, progress, converting } = p
  return (
    <footer className="x2m-footer glass flex shrink-0 items-center justify-between gap-4 rounded-2xl px-4 py-2.5">
      <div className="x2m-outdir flex min-w-0 flex-1 items-center gap-2 text-dim" title={outDir || 'Chưa chọn thư mục lưu'}>
        <IconFolder size={16} />
        <span className={cn('x2m-outdir-text max-w-[420px] truncate text-[12.5px]', !outDir && 'dim text-faint')}>{outDir || (p.outDirPlaceholder ?? 'Chưa chọn thư mục lưu file.md')}</span>
        {p.recentDirs.length > 0 && (
          <select
            className="x2m-dir-select max-w-[150px] cursor-pointer rounded-md border border-line bg-canvas px-1.5 py-1 text-xs text-dim transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            value=""
            onChange={(e) => {
              if (e.target.value) p.onPickRecentDir(e.target.value)
            }}
            title="Thư mục gần đây"
            aria-label="Thư mục gần đây"
          >
            <option value="">Gần đây...</option>
            {p.recentDirs.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        )}
        <button className={cx('btn btn-sm', btn, btnSm)} onClick={p.onChooseDir}>
          Chọn thư mục
        </button>
        {outDir && (
          <button className={cx('btn btn-sm btn-ghost', btnGhost, btnSm)} onClick={p.onOpenDir} title="Mở thư mục" aria-label="Mở thư mục">
            <IconOpen size={14} />
          </button>
        )}
      </div>
      <div className="x2m-footer-actions flex shrink-0 items-center gap-3">
        {converting && progress && progress.total > 0 && (
          <div
            className="x2m-progress relative h-[18px] w-40 overflow-hidden rounded-[9px] border border-line bg-canvas"
            role="progressbar"
            aria-valuenow={progress.done}
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-label="Tiến độ convert"
          >
            <div className="x2m-progress-fill h-full bg-accent transition-[width] duration-200 ease-out motion-reduce:transition-none" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
            <span className="x2m-progress-text absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-ink">
              {progress.done}/{progress.total}
            </span>
          </div>
        )}
        {converting && (
          <button className={cx('btn btn-sm', btn, btnSm)} onClick={p.onCancel} title="Dừng convert (file đã ghi được giữ nguyên)">
            Hủy
          </button>
        )}
        <span className="dim text-dim">
          {p.status}
          {p.appVersion ? ` · v${p.appVersion}` : ''}
          {p.lastConvertAt ? ` · convert lúc ${p.lastConvertAt}` : ''}
        </span>
        <button className={cx('btn btn-primary', btnPrimary)} onClick={p.onConvert} disabled={converting || !p.canConvert} title="Ctrl+Enter">
          {converting ? (
            <>Đang convert...</>
          ) : (
            <>
              <IconCheck size={16} /> {p.convertLabel}
            </>
          )}
        </button>
      </div>
    </footer>
  )
}
