import type { ConvertResultItem } from '../../../types'
import { cn } from '../utils'
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
    <div className="x2m-results" role="status" aria-live="polite">
      <div className="x2m-results-head">
        <span>
          Kết quả: {results.filter((r) => r.ok).length}/{results.length} file thành công
          {outDir && <span className="dim"> · {outDir}</span>}
        </span>
        {results.some((r) => !r.ok) && (
          <button className="btn btn-sm" onClick={onRetry} disabled={converting}>
            Thử lại file lỗi
          </button>
        )}
        <button className="icon-btn" onClick={onClose} title="Đóng" aria-label="Đóng">
          <IconX size={14} />
        </button>
      </div>
      <div className="x2m-results-list">
        {results.map((r, idx) => (
          <div key={idx} className={cn('x2m-result', r.ok ? 'ok' : 'err')}>
            {r.ok ? <IconCheck size={15} /> : <IconX size={15} />}
            <span className="x2m-result-name">{r.fileName}</span>
            {r.ok ? (
              <span className="dim" title={r.filesWritten.join('\n')}>
                {r.filesWritten.length} {unitLabel}
              </span>
            ) : (
              <span className="x2m-result-error">{r.error}</span>
            )}
            {r.ok && outDir && (
              <span className="x2m-result-actions">
                <button
                  className="icon-btn"
                  onClick={onOpenDir}
                  title={openDirLabel}
                  aria-label={openDirLabel}
                >
                  <IconOpen size={13} />
                </button>
                <button
                  className="icon-btn"
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
