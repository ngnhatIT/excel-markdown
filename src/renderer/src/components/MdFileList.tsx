import type { MdFileItem } from '../../../types'
import { cn } from '../utils'
import { chk, emptyBox, emptyHint, emptyP, fileCard, fileCardActive, fileError, fileHead, fileNameBtn, fileNameText, filesAside, filesAsideDrag, moveBtn, reloadBtn } from './FileList'
import { iconBtn, paneTitle } from '../ui'
import { btnPrimary } from '../ui'
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
    <aside className={cn('x2m-files', filesAside, dragOver && 'drag-over', dragOver && filesAsideDrag)}>
      <div className={cn("x2m-pane-title", paneTitle)}>File Markdown ({files.length})</div>
      {files.length === 0 ? (
        <div className={cn("x2m-empty", emptyBox)}>
          <IconFile size={36} />
          <p className={emptyP}>Kéo thả file Markdown vào đây</p>
          <p className={cn("dim", emptyP, emptyHint)}>hoặc bấm nút Thêm file Markdown ở trên</p>
        </div>
      ) : (
        <div className="x2m-file-list flex flex-col gap-1.5 px-2 pb-4">
          {files.map((f, idx) => (
            <div key={f.id} className={cn('x2m-file', 'x2m-md-file', fileCard, selectedId === f.id && 'active', selectedId === f.id && fileCardActive)}>
              <div className={cn("x2m-file-head", fileHead)}>
                <button className={cn("x2m-file-name", fileNameBtn)} onClick={() => onSelect(f.id)} title={f.path}>
                  <span className={cn("x2m-file-name-text", fileNameText)}>{f.name}</span>
                  <span className={cn('x2m-md-count text-[11.5px]', f.error ? 'x2m-md-count-err text-danger' : 'dim text-dim')}>
                    {f.loading ? 'đang đọc...' : f.error ? 'lỗi' : `${f.sheets.length} sheet`}
                  </span>
                </button>
                <button
                  className={cn("x2m-move-btn x2m-reload-btn", moveBtn, reloadBtn)}
                  onClick={() => onReload(f.id)}
                  disabled={f.loading}
                  title="Tải lại file (khi đã sửa file .md)"
                  aria-label="Tải lại"
                >
                  <IconRefresh size={14} />
                </button>
                <button
                  className={cn("x2m-move-btn", moveBtn)}
                  onClick={() => onMove(f.id, -1)}
                  disabled={idx === 0}
                  title="Đưa lên"
                  aria-label="Đưa lên"
                >
                  ↑
                </button>
                <button
                  className={cn("x2m-move-btn", moveBtn)}
                  onClick={() => onMove(f.id, 1)}
                  disabled={idx === files.length - 1}
                  title="Đưa xuống"
                  aria-label="Đưa xuống"
                >
                  ↓
                </button>
                <button
                  className={cn("icon-btn", iconBtn)}
                  onClick={() => onRemove(f.id)}
                  title="Xóa khỏi danh sách"
                  aria-label="Xóa khỏi danh sách"
                >
                  <IconX size={14} />
                </button>
              </div>
              {f.error ? (
                <div className={cn("x2m-file-error", fileError)}>{f.error}</div>
              ) : (
                f.sheets.length > 0 && (
                  <div className="x2m-md-sheets dim mx-2 -mt-0.5 mb-[7px] truncate text-[11.5px] text-dim" title={f.sheets.join('\n')}>
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
