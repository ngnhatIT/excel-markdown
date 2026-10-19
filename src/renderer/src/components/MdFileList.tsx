import type { MdFileItem } from '../../../types'
import { cn } from '../utils'
import { IconFile, IconRefresh, IconX } from './icons'

interface Props {
  files: MdFileItem[]
  selectedId: string | null
  dragOver: boolean
  onSelect: (id: string) => void
  onReload: (id: string) => void
  onMove: (id: string, dir: -1 | 1) => void
  onRemove: (id: string) => void
}

/** Cột trái chế độ Markdown → Excel: file .md theo thứ tự sheet, tên sheet sẽ tạo của từng file. */
export function MdFileList({ files, selectedId, dragOver, onSelect, onReload, onMove, onRemove }: Props): React.ReactElement {
  return (
    <aside className={cn('x2m-files', dragOver && 'drag-over')}>
      <div className="x2m-pane-title">File Markdown ({files.length})</div>
      {files.length === 0 ? (
        <div className="x2m-empty">
          <IconFile size={36} />
          <p>Kéo thả file Markdown vào đây</p>
          <p className="dim">hoặc bấm nút Thêm file Markdown ở trên</p>
        </div>
      ) : (
        <div className="x2m-file-list">
          {files.map((f, idx) => (
            <div key={f.id} className={cn('x2m-file', 'x2m-md-file', selectedId === f.id && 'active')}>
              <div className="x2m-file-head">
                <button className="x2m-file-name" onClick={() => onSelect(f.id)} title={f.path}>
                  <span className="x2m-file-name-text">{f.name}</span>
                  <span className={cn('x2m-md-count', f.error ? 'x2m-md-count-err' : 'dim')}>
                    {f.loading ? 'đang đọc...' : f.error ? 'lỗi' : `${f.sheets.length} sheet`}
                  </span>
                </button>
                <button
                  className="x2m-move-btn x2m-reload-btn"
                  onClick={() => onReload(f.id)}
                  disabled={f.loading}
                  title="Tải lại file (khi đã sửa file .md)"
                  aria-label="Tải lại"
                >
                  <IconRefresh size={14} />
                </button>
                <button
                  className="x2m-move-btn"
                  onClick={() => onMove(f.id, -1)}
                  disabled={idx === 0}
                  title="Đưa lên"
                  aria-label="Đưa lên"
                >
                  ↑
                </button>
                <button
                  className="x2m-move-btn"
                  onClick={() => onMove(f.id, 1)}
                  disabled={idx === files.length - 1}
                  title="Đưa xuống"
                  aria-label="Đưa xuống"
                >
                  ↓
                </button>
                <button
                  className="icon-btn"
                  onClick={() => onRemove(f.id)}
                  title="Xóa khỏi danh sách"
                  aria-label="Xóa khỏi danh sách"
                >
                  <IconX size={14} />
                </button>
              </div>
              {f.error ? (
                <div className="x2m-file-error">{f.error}</div>
              ) : (
                f.sheets.length > 0 && (
                  <div className="x2m-md-sheets dim" title={f.sheets.join('\n')}>
                    {f.sheets.join(' · ')}
                  </div>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </aside>
  )
}
