import type { FileItem } from '../../../types'
import { cn } from '../utils'
import { IconChevronDown, IconFile, IconTrash, IconX } from './icons'

interface Props {
  files: FileItem[]
  expanded: Record<string, boolean>
  onToggleExpanded: (fileId: string) => void
  selFileId: string | null
  selSheet: string | null
  sheetFilter: string
  onSheetFilterChange: (value: string) => void
  dragOver: boolean
  onToggleFileSheets: (fileId: string, checked: boolean) => void
  onToggleSheet: (fileId: string, sheetName: string, checked: boolean) => void
  onSelectSheet: (fileId: string, sheetName: string) => void
  onRemoveFile: (fileId: string) => void
  onClearAll?: () => void
  onReloadSheets: (file: FileItem) => void
  collapsed?: boolean
  onToggleCollapsed?: () => void
  width?: number
}

/** Cột trái: danh sách file Excel, sheet của từng file, ô lọc sheet và thao tác hàng loạt. */
export function FileList(p: Props): React.ReactElement {
  const { files, expanded, selFileId, selSheet, sheetFilter } = p

  if (p.collapsed && p.onToggleCollapsed) {
    return (
      <aside className="x2m-files collapsed">
        <button
          className="x2m-side-strip"
          onClick={p.onToggleCollapsed}
          title="Hiện danh sách file Excel"
          aria-label="Hiện danh sách file"
          aria-expanded={false}
        >
          <span className="x2m-left-chevron">
            <IconChevronDown size={14} />
          </span>
          <IconFile size={16} />
          <span className="x2m-side-vlabel">File Excel ({files.length})</span>
        </button>
      </aside>
    )
  }

  const totalSheets = files.reduce((acc, f) => acc + f.sheets.length, 0)
  const totalChecked = files.reduce((acc, f) => acc + f.sheets.filter((s) => s.checked).length, 0)
  const allChecked = totalSheets > 0 && totalChecked === totalSheets

  const toggleAllFiles = (): void => {
    const next = !allChecked
    for (const f of files) p.onToggleFileSheets(f.id, next)
  }

  return (
    <aside
      className={cn('x2m-files', p.dragOver && 'drag-over')}
      style={p.width ? { width: p.width, minWidth: p.width } : undefined}
    >
      <div className="x2m-pane-title">
        <span>File Excel ({files.length})</span>
        <span className="x2m-side-head-actions">
          {files.length > 0 && totalSheets > 0 && (
            <button
              className="btn btn-sm btn-ghost x2m-mini-btn"
              onClick={toggleAllFiles}
              title={allChecked ? 'Bỏ chọn tất cả sheet' : 'Chọn tất cả sheet của mọi file'}
            >
              {allChecked ? 'Bỏ chọn hết' : 'Chọn hết'}
            </button>
          )}
          {files.length > 1 && p.onClearAll && (
            <button
              className="x2m-move-btn x2m-reload-btn"
              onClick={p.onClearAll}
              title="Xóa toàn bộ danh sách file"
              aria-label="Xóa toàn bộ danh sách"
            >
              <IconTrash size={13} />
            </button>
          )}
          {p.onToggleCollapsed && (
            <button
              className="x2m-move-btn x2m-reload-btn"
              onClick={p.onToggleCollapsed}
              title="Thu gọn cột danh sách file"
              aria-label="Thu gọn danh sách file"
              aria-expanded
            >
              <span className="x2m-left-chevron open">
                <IconChevronDown size={14} />
              </span>
            </button>
          )}
        </span>
      </div>
      {files.length > 0 && (
        <div className="x2m-filter">
          <input
            className="x2m-filter-input"
            type="search"
            placeholder="Lọc sheet..."
            value={sheetFilter}
            onChange={(e) => p.onSheetFilterChange(e.target.value)}
            aria-label="Lọc sheet theo tên"
          />
        </div>
      )}
      {files.length === 0 ? (
        <div className="x2m-empty">
          <IconFile size={36} />
          <p>Kéo thả file Excel vào đây</p>
          <p className="dim">hoặc bấm nút Thêm file Excel ở trên</p>
        </div>
      ) : (
        <div className="x2m-file-list">
          {files.map((f) => {
            const checked = f.sheets.filter((s) => s.checked).length
            const isOpen = expanded[f.id] ?? false
            const visible = f.sheets.filter((s) =>
              sheetFilter ? s.name.toLowerCase().includes(sheetFilter.toLowerCase()) : true
            )
            return (
              <div key={f.id} className={cn('x2m-file', selFileId === f.id && 'active')}>
                <div className="x2m-file-head">
                  <input
                    type="checkbox"
                    className="chk"
                    checked={f.sheets.length > 0 && checked === f.sheets.length}
                    ref={(el) => {
                      if (el) el.indeterminate = checked > 0 && checked < f.sheets.length
                    }}
                    onChange={(e) => p.onToggleFileSheets(f.id, e.target.checked)}
                    title="Chọn / bỏ chọn tất cả sheet"
                  />
                  <button className="x2m-file-name" onClick={() => p.onToggleExpanded(f.id)} title={f.path}>
                    <span className="x2m-file-name-text">{f.name}</span>
                    <span className="dim">{f.loading ? 'đang đọc...' : `${checked}/${f.sheets.length} sheet`}</span>
                  </button>
                  <button
                    className={cn('x2m-chevron', isOpen && 'open')}
                    onClick={() => p.onToggleExpanded(f.id)}
                    title={isOpen ? 'Thu gọn' : 'Mở rộng'}
                    aria-label={isOpen ? 'Thu gọn' : 'Mở rộng'}
                  >
                    <IconChevronDown size={15} />
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => p.onRemoveFile(f.id)}
                    title="Xóa khỏi danh sách"
                    aria-label="Xóa khỏi danh sách"
                  >
                    <IconX size={14} />
                  </button>
                </div>
                {f.error && (
                  <div className="x2m-file-error">
                    {f.error}
                    <button className="btn btn-sm btn-ghost" onClick={() => p.onReloadSheets(f)}>
                      Thử lại
                    </button>
                  </div>
                )}
                {isOpen && (
                  <div className="x2m-sheets">
                    {f.loading && <div className="x2m-loading">Đang đọc sheet...</div>}
                    {visible.length === 0 && sheetFilter && !f.loading ? (
                      <div className="dim" style={{ padding: '8px 4px', fontSize: 12 }}>
                        Không có sheet nào khớp &ldquo;{sheetFilter}&rdquo;
                      </div>
                    ) : (
                      visible.map((s) => (
                        <label
                          key={s.name}
                          className={cn('x2m-sheet', selFileId === f.id && selSheet === s.name && 'selected')}
                        >
                          <input
                            type="checkbox"
                            className="chk"
                            checked={s.checked}
                            onChange={(e) => p.onToggleSheet(f.id, s.name, e.target.checked)}
                            aria-label={`Chọn sheet ${s.name}`}
                          />
                          <button
                            className="x2m-sheet-name"
                            onClick={(e) => {
                              e.preventDefault()
                              p.onSelectSheet(f.id, s.name)
                            }}
                            title={`${s.rows} dòng${s.hidden ? ' (sheet ẩn trong Excel)' : ''}`}
                          >
                            <span className="x2m-sheet-label">{s.name}</span>
                            {s.hidden && <span className="x2m-tag">ẩn</span>}
                            <span className="x2m-sheet-rows">{s.rows}d</span>
                          </button>
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </aside>
  )
}
