import type { FileItem } from '../../../types'
import { cn } from '../utils'
import { btnGhost, btnSm, btnMini, iconBtn, input, paneTitle } from '../ui'
import { IconChevronDown, IconFile, IconTrash, IconX } from './icons'

/** Class dùng chung cho các component cột trái (FileList, MdFileList, MdTreeList). */
export const filesAside =
  'flex w-[300px] min-w-[220px] shrink-0 flex-col overflow-y-auto border-r border-line bg-soft'
export const filesAsideDrag = 'outline-2 -outline-offset-2 outline-dashed outline-accent'
export const emptyBox = 'flex flex-col items-center justify-center gap-2 px-6 py-12 text-center text-faint'
export const emptyP = 'm-0 text-[13px] text-dim'
export const emptyHint = 'text-xs !text-faint'
export const filterWrap = 'px-2.5 pb-2'
export const chevronBtn =
  'flex rounded-md p-1 text-dim transition-[transform,color] duration-150 hover:text-ink motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-accent'
export const moveBtn =
  'rounded-md px-1.5 py-1 text-[13px] font-bold leading-none text-dim transition-colors duration-150 enabled:hover:bg-hover enabled:hover:text-ink disabled:cursor-default disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-accent'
export const reloadBtn = 'flex items-center'
export const fileCard =
  'overflow-hidden rounded-[9px] border border-line bg-canvas transition-colors duration-150 hover:border-faint motion-reduce:transition-none'
export const fileCardActive = '!border-accent'
export const fileHead = 'flex items-center gap-1.5 px-2 py-1.5'
export const fileNameBtn =
  'flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-0.5 rounded-sm p-0 text-left text-ink focus-visible:outline-2 focus-visible:outline-accent'
export const fileNameText = 'max-w-full truncate text-[12.5px] font-semibold'
export const fileError =
  'mx-2 mb-2 flex items-center justify-between gap-2 rounded-lg bg-danger-soft px-2.5 py-[7px] text-xs text-danger'
export const chk = 'size-3.5 shrink-0 cursor-pointer accent-accent'

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
      <aside className="x2m-files collapsed flex w-10 min-w-10 shrink-0 flex-col overflow-hidden border-r border-line bg-soft">
        <button
          className="x2m-side-strip flex size-full cursor-pointer flex-col items-center gap-2.5 py-3 text-dim transition-colors duration-150 hover:bg-hover hover:text-ink motion-reduce:transition-none"
          onClick={p.onToggleCollapsed}
          title="Hiện danh sách file Excel"
          aria-label="Hiện danh sách file"
          aria-expanded={false}
        >
          <span className="x2m-left-chevron flex -rotate-90">
            <IconChevronDown size={14} />
          </span>
          <IconFile size={16} />
          <span className="x2m-side-vlabel text-xs font-bold tracking-[0.04em] [writing-mode:vertical-rl]">File Excel ({files.length})</span>
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
      className={cn('x2m-files', filesAside, p.dragOver && 'drag-over', p.dragOver && filesAsideDrag)}
      style={p.width ? { width: p.width, minWidth: p.width } : undefined}
    >
      <div className={cn("x2m-pane-title", paneTitle)}>
        <span>File Excel ({files.length})</span>
        <span className="x2m-side-head-actions flex items-center gap-1">
          {files.length > 0 && totalSheets > 0 && (
            <button
              className={cn("btn btn-sm btn-ghost x2m-mini-btn", btnGhost, btnSm, btnMini)}
              onClick={toggleAllFiles}
              title={allChecked ? 'Bỏ chọn tất cả sheet' : 'Chọn tất cả sheet của mọi file'}
            >
              {allChecked ? 'Bỏ chọn hết' : 'Chọn hết'}
            </button>
          )}
          {files.length > 1 && p.onClearAll && (
            <button
              className={cn("x2m-move-btn x2m-reload-btn", moveBtn, reloadBtn)}
              onClick={p.onClearAll}
              title="Xóa toàn bộ danh sách file"
              aria-label="Xóa toàn bộ danh sách"
            >
              <IconTrash size={13} />
            </button>
          )}
          {p.onToggleCollapsed && (
            <button
              className={cn("x2m-move-btn x2m-reload-btn", moveBtn, reloadBtn)}
              onClick={p.onToggleCollapsed}
              title="Thu gọn cột danh sách file"
              aria-label="Thu gọn danh sách file"
              aria-expanded
            >
              <span className="x2m-left-chevron open flex rotate-90">
                <IconChevronDown size={14} />
              </span>
            </button>
          )}
        </span>
      </div>
      {files.length > 0 && (
        <div className={cn("x2m-filter", filterWrap)}>
          <input
            className={cn("x2m-filter-input", input)}
            type="search"
            placeholder="Lọc sheet..."
            value={sheetFilter}
            onChange={(e) => p.onSheetFilterChange(e.target.value)}
            aria-label="Lọc sheet theo tên"
          />
        </div>
      )}
      {files.length === 0 ? (
        <div className={cn("x2m-empty", emptyBox)}>
          <IconFile size={36} />
          <p className={emptyP}>Kéo thả file Excel vào đây</p>
          <p className={cn("dim", emptyP, emptyHint)}>hoặc bấm nút Thêm file Excel ở trên</p>
        </div>
      ) : (
        <div className="x2m-file-list flex flex-col gap-1.5 px-2 pb-4">
          {files.map((f) => {
            const checked = f.sheets.filter((s) => s.checked).length
            const isOpen = expanded[f.id] ?? false
            const visible = f.sheets.filter((s) =>
              sheetFilter ? s.name.toLowerCase().includes(sheetFilter.toLowerCase()) : true
            )
            return (
              <div key={f.id} className={cn('x2m-file', fileCard, selFileId === f.id && 'active', selFileId === f.id && fileCardActive)}>
                <div className={cn("x2m-file-head", fileHead)}>
                  <input
                    type="checkbox"
                    className={cn("chk", chk)}
                    checked={f.sheets.length > 0 && checked === f.sheets.length}
                    ref={(el) => {
                      if (el) el.indeterminate = checked > 0 && checked < f.sheets.length
                    }}
                    onChange={(e) => p.onToggleFileSheets(f.id, e.target.checked)}
                    title="Chọn / bỏ chọn tất cả sheet"
                  />
                  <button className={cn("x2m-file-name", fileNameBtn)} onClick={() => p.onToggleExpanded(f.id)} title={f.path}>
                    <span className={cn("x2m-file-name-text", fileNameText)}>{f.name}</span>
                    <span className="dim text-[11.5px] text-dim">{f.loading ? 'đang đọc...' : `${checked}/${f.sheets.length} sheet`}</span>
                  </button>
                  <button
                    className={cn('x2m-chevron', chevronBtn, isOpen && 'open rotate-180')}
                    onClick={() => p.onToggleExpanded(f.id)}
                    title={isOpen ? 'Thu gọn' : 'Mở rộng'}
                    aria-label={isOpen ? 'Thu gọn' : 'Mở rộng'}
                  >
                    <IconChevronDown size={15} />
                  </button>
                  <button
                    className={cn("icon-btn", iconBtn)}
                    onClick={() => p.onRemoveFile(f.id)}
                    title="Xóa khỏi danh sách"
                    aria-label="Xóa khỏi danh sách"
                  >
                    <IconX size={14} />
                  </button>
                </div>
                {f.error && (
                  <div className={cn("x2m-file-error", fileError)}>
                    {f.error}
                    <button className={cn("btn btn-sm btn-ghost", btnGhost, btnSm)} onClick={() => p.onReloadSheets(f)}>
                      Thử lại
                    </button>
                  </div>
                )}
                {isOpen && (
                  <div className="x2m-sheets max-h-[340px] overflow-y-auto border-t border-line bg-soft p-1">
                    {f.loading && <div className="x2m-loading p-4 text-[12.5px] text-faint">Đang đọc sheet...</div>}
                    {visible.length === 0 && sheetFilter && !f.loading ? (
                      <div className="dim px-1 py-2 text-xs text-dim">
                        Không có sheet nào khớp &ldquo;{sheetFilter}&rdquo;
                      </div>
                    ) : (
                      visible.map((s) => (
                        <label
                          key={s.name}
                          className={cn('x2m-sheet group flex cursor-pointer items-center gap-[7px] rounded-md px-2 py-[5px] transition-colors duration-100 hover:bg-hover motion-reduce:transition-none', selFileId === f.id && selSheet === s.name && 'selected bg-accent-soft')}
                        >
                          <input
                            type="checkbox"
                            className={cn("chk", chk)}
                            checked={s.checked}
                            onChange={(e) => p.onToggleSheet(f.id, s.name, e.target.checked)}
                            aria-label={`Chọn sheet ${s.name}`}
                          />
                          <button
                            className="x2m-sheet-name flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-sm p-0 text-left text-[12.5px] text-ink focus-visible:outline-2 focus-visible:outline-accent"
                            onClick={(e) => {
                              e.preventDefault()
                              p.onSelectSheet(f.id, s.name)
                            }}
                            title={`${s.rows} dòng${s.hidden ? ' (sheet ẩn trong Excel)' : ''}`}
                          >
                            <span className={cn("x2m-sheet-label min-w-0 flex-1 truncate", selFileId === f.id && selSheet === s.name && "font-semibold text-accent-ink")}>{s.name}</span>
                            {s.hidden && <span className="x2m-tag inline-block shrink-0 rounded-md border border-line bg-raised px-[5px] text-[10px] leading-[15px] text-faint">ẩn</span>}
                            <span className="x2m-sheet-rows shrink-0 text-[10.5px] tabular-nums text-faint">{s.rows}d</span>
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
