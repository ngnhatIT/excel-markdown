import type { ConvertResultItem } from '../../../shared/types'
import { cn } from '../lib/utils'
import { btn, btnSm, cx, iconBtn } from '../lib/ui'
import { IconCheck, IconCopy, IconOpen, IconX } from './icons'

interface Props {
  results: ConvertResultItem[]
  outDir: string
  converting: boolean
  onRetry: () => void
  onClose: () => void
  onOpenDir: () => void
  onCopyDir: () => void
  /** Đơn vị đếm `filesWritten` của từng dòng (mặc định `file.md`) */
  unitLabel?: string
  /** title/aria-label nút mở thư mục kết quả */
  openDirLabel?: string
}

/** Kết quả lần convert gần nhất, từng file Excel. */
export function ResultsPanel({
  results,
  outDir,
  converting,
  onRetry,
  onClose,
  onOpenDir,
  onCopyDir,
  unitLabel = 'file.md',
  openDirLabel = 'Mở thư mục chứa file.md',
}: Props): React.ReactElement {
  return (
    <div className="x2m-results border-t border-line bg-raised/80 p-3 flex flex-col gap-2 max-h-56 overflow-y-auto" role="status" aria-live="polite">
      <div className="x2m-results-head flex items-center justify-between text-xs font-semibold text-ink">
        <span>
          Kết quả: {results.filter((r) => r.ok).length}/{results.length} file thành công
          {outDir && <span className="dim"> · {outDir}</span>}
        </span>
        {results.some((r) => !r.ok) && (
          <button className={cx("btn btn-sm", btn, btnSm)} onClick={onRetry} disabled={converting}>
            Thử lại file lỗi
          </button>
        )}
        <button className={`icon-btn ${iconBtn}`} onClick={onClose} title="Đóng" aria-label="Đóng">
          <IconX size={14} />
        </button>
      </div>
      <div className="x2m-results-list flex flex-col gap-1.5">
        {results.map((r, idx) => (
          <div key={idx} className={cn('x2m-result flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors', r.ok ? 'ok border-success/30 bg-success-soft text-success' : 'err border-danger/30 bg-danger-soft text-danger')}>
            {r.ok ? <IconCheck size={15} /> : <IconX size={15} />}
            <span className="x2m-result-name font-medium text-ink flex-1 truncate">{r.fileName}</span>
            {r.ok ? (
              <span className="dim" title={r.filesWritten.join('\n')}>
                {r.filesWritten.length} {unitLabel}
              </span>
            ) : (
              <span className="x2m-result-error text-danger text-xs truncate max-w-[50%]">{r.error}</span>
            )}
            {r.ok && outDir && (
              <span className="x2m-result-actions flex items-center gap-1">
                <button
                  className={`icon-btn ${iconBtn}`}
                  onClick={onOpenDir}
                  title={openDirLabel}
                  aria-label={openDirLabel}
                >
                  <IconOpen size={13} />
                </button>
                <button
                  className={`icon-btn ${iconBtn}`}
                  onClick={onCopyDir}
                  title="Copy đường dẫn thư mục"
                  aria-label="Copy đường dẫn thư mục"
                >
                  <IconCopy size={13} />
                </button>
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
