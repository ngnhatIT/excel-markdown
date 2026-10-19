import type { ConvertProgress } from '../api'
import { cn } from '../utils'
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
  fileCount: number
  checkedCount: number
  appVersion: string
  lastConvertAt: string
  onConvert: () => void
}

/** Thanh dưới: thư mục xuất, tiến độ, nút Hủy và nút Convert. */
export function Footer(p: Props): React.ReactElement {
  const { outDir, progress, converting, checkedCount } = p
  return (
    <footer className="x2m-footer">
      <div className="x2m-outdir" title={outDir || 'Chưa chọn thư mục lưu'}>
        <IconFolder size={16} />
        <span className={cn('x2m-outdir-text', !outDir && 'dim')}>{outDir || 'Chưa chọn thư mục lưu file.md'}</span>
        {p.recentDirs.length > 0 && (
          <select
            className="x2m-dir-select"
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
        <button className="btn btn-sm" onClick={p.onChooseDir}>
          Chọn thư mục
        </button>
        {outDir && (
          <button className="btn btn-sm btn-ghost" onClick={p.onOpenDir} title="Mở thư mục" aria-label="Mở thư mục">
            <IconOpen size={14} />
          </button>
        )}
      </div>
      <div className="x2m-footer-actions">
        {converting && progress && progress.total > 0 && (
          <div
            className="x2m-progress"
            role="progressbar"
            aria-valuenow={progress.done}
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-label="Tiến độ convert"
          >
            <div className="x2m-progress-fill" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
            <span className="x2m-progress-text">
              {progress.done}/{progress.total}
            </span>
          </div>
        )}
        {converting && (
          <button className="btn btn-sm" onClick={p.onCancel} title="Dừng convert (file đã ghi được giữ nguyên)">
            Hủy
          </button>
        )}
        <span className="dim">
          {p.fileCount} file, {checkedCount} sheet được chọn
          {p.appVersion ? ` · v${p.appVersion}` : ''}
          {p.lastConvertAt ? ` · convert lúc ${p.lastConvertAt}` : ''}
        </span>
        <button
          className="btn btn-primary"
          onClick={p.onConvert}
          disabled={converting || p.fileCount === 0 || checkedCount === 0}
          title="Ctrl+Enter"
        >
          {converting ? (
            <>Đang convert...</>
          ) : (
            <>
              <IconCheck size={16} /> Convert {checkedCount > 0 ? `${checkedCount} sheet ` : ''}sang Markdown
            </>
          )}
        </button>
      </div>
    </footer>
  )
}
