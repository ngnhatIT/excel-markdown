import { formatRelativeTime, type MdSort, type MdTreeNode } from '../../../shared/mdView'
import { joinRoot, PASTE_PATH } from '../hooks/useMdViewer'
import { baseName, cn } from '../utils'
import { btnPrimary, btnSm, cx, iconBtn, input } from '../ui'
import { IconChevronDown, IconCopy, IconFile, IconFolder, IconRefresh, IconX } from './icons'

interface Props {
  root: string | null
  tree: MdTreeNode[]
  relFiles: string[]
  /** "Mới sửa": đường dẫn tương đối, đã áp ô lọc */
  recent: string[]
  mtimes: Record<string, number>
  sort: MdSort
  loose: string[]
  collapsed: ReadonlySet<string>
  selectedPath: string | null
  listing: boolean
  dragOver: boolean
  filter: string
  onFilterChange: (v: string) => void
  onSelect: (absPath: string) => void
  onSortChange: (s: MdSort) => void
  onToggleDir: (rel: string) => void
  pasted: boolean
  onPaste: () => void
  onShowPaste: () => void
  onClosePaste: () => void
  onOpenFolder: () => void
  onOpenFiles: () => void
  onRefresh: () => void
  onCloseFolder: () => void
  onRemoveLoose: (absPath: string) => void
}

const INDENT = 14

/** Cột trái chế độ Đọc Markdown: cây file .md của thư mục đang mở + các file mở lẻ. */
export function MdTreeList(p: Props): React.ReactElement {
  const q = p.filter.trim().toLowerCase()
  const empty = !p.root && p.loose.length === 0 && !p.pasted

  const now = Date.now()

  const fileRow = (
    abs: string,
    label: string,
    depth: number,
    title: string,
    onRemove?: () => void,
    mtime?: number,
    rowClass = 'x2m-tree-row group flex items-center justify-between pr-2 py-0.5 rounded-md hover:bg-hover transition-colors [&.selected]:bg-accent-soft [&.selected]:text-accent-ink'
  ): React.ReactElement => (
    <div key={abs} className={cn(rowClass, p.selectedPath === abs && 'selected')} style={{ paddingLeft: 8 + depth * INDENT }}>
      <button className="x2m-tree-btn x2m-tree-file flex min-w-0 flex-1 items-center gap-2 py-1 text-left text-xs text-ink outline-none cursor-pointer" onClick={() => p.onSelect(abs)} title={title}>
        <IconFile size={14} />
        <span className="x2m-tree-name truncate flex-1">{label}</span>
        {mtime !== undefined && (
          <span className="x2m-tree-date dim ml-auto text-[11px] text-faint shrink-0" title={new Date(mtime).toLocaleString('vi-VN')}>
            {formatRelativeTime(mtime, now)}
          </span>
        )}
      </button>
      {onRemove && (
        <button className={`icon-btn ${iconBtn}`} onClick={onRemove} title="Đóng file" aria-label="Đóng file">
          <IconX size={12} />
        </button>
      )}
    </div>
  )

  const renderNodes = (nodes: MdTreeNode[], depth: number): React.ReactNode =>
    nodes.map((n) => {
      if (n.kind === 'file') return p.root ? fileRow(joinRoot(p.root, n.path), n.name, depth, n.path, undefined, p.mtimes[n.path]) : null
      const open = !p.collapsed.has(n.path)
      return (
        <div key={'d:' + n.path}>
          <div className="x2m-tree-row group flex items-center justify-between pr-2 py-0.5 rounded-md hover:bg-hover transition-colors" style={{ paddingLeft: 8 + depth * INDENT }}>
            <button className="x2m-tree-btn x2m-tree-dir flex min-w-0 flex-1 items-center gap-2 py-1 text-left text-xs font-semibold text-dim outline-none cursor-pointer hover:text-ink" onClick={() => p.onToggleDir(n.path)} aria-expanded={open} title={n.path}>
              <span className={cn('x2m-tree-caret', !open && 'closed')}>
                <IconChevronDown size={14} />
              </span>
              <IconFolder size={14} />
              <span className="x2m-tree-name truncate flex-1">{n.name}</span>
            </button>
          </div>
          {open && renderNodes(n.children, depth + 1)}
        </div>
      )
    })

  const rootLabel = p.root ? baseName(p.root.replace(/[\\/]+$/, '')) || p.root : 'Đọc Markdown'

  return (
    <aside className={cn('x2m-files flex w-[300px] min-w-[220px] shrink-0 flex-col overflow-y-auto border-r border-line bg-soft', p.dragOver && 'drag-over outline-2 -outline-offset-2 outline-dashed outline-accent')}>
      <div className="x2m-pane-title flex items-center justify-between gap-1.5 px-3 pb-1.5 pt-2.5 text-xs font-bold tracking-[0.01em] text-dim">
        <span className="x2m-tree-title truncate font-bold text-ink" title={p.root ?? undefined}>
          {rootLabel}
          {p.root ? ` (${p.relFiles.length})` : ''}
        </span>
        <span className="x2m-tree-actions flex items-center gap-1">
          <button className="x2m-move-btn x2m-reload-btn flex cursor-pointer items-center rounded-md p-1.5 text-dim transition-colors hover:bg-hover hover:text-ink" onClick={p.onOpenFolder} title="Mở thư mục (Ctrl+O)" aria-label="Mở thư mục">
            <IconFolder size={14} />
          </button>
          <button className="x2m-move-btn x2m-reload-btn flex cursor-pointer items-center rounded-md p-1.5 text-dim transition-colors hover:bg-hover hover:text-ink" onClick={p.onOpenFiles} title="Mở file Markdown" aria-label="Mở file">
            <IconFile size={14} />
          </button>
          <button
            className="x2m-move-btn x2m-reload-btn flex cursor-pointer items-center rounded-md p-1.5 text-dim transition-colors hover:bg-hover hover:text-ink"
            onClick={p.onPaste}
            title="Dán Markdown từ clipboard để xem"
            aria-label="Dán Markdown"
          >
            <IconCopy size={14} />
          </button>
          {p.root && (
            <>
              <button
                className="x2m-move-btn x2m-reload-btn flex cursor-pointer items-center rounded-md p-1.5 text-dim transition-colors hover:bg-hover hover:text-ink"
                onClick={p.onRefresh}
                disabled={p.listing}
                title="Quét lại thư mục (khi có file mới)"
                aria-label="Quét lại thư mục"
              >
                <IconRefresh size={14} />
              </button>
              <button className={`icon-btn ${iconBtn}`} onClick={p.onCloseFolder} title="Đóng thư mục" aria-label="Đóng thư mục">
                <IconX size={14} />
              </button>
            </>
          )}
        </span>
      </div>
      {!empty && (
        <div className="x2m-filter px-2.5 pb-2">
          <input
            className={`x2m-filter-input ${input}`}
            placeholder="Lọc file..."
            value={p.filter}
            onChange={(e) => p.onFilterChange(e.target.value)}
            aria-label="Lọc file theo tên"
          />
        </div>
      )}
      {empty ? (
        <div className="x2m-empty flex flex-col items-center justify-center gap-2 px-6 py-12 text-center text-faint">
          <IconFolder size={36} />
          <p>{p.listing ? 'Đang quét thư mục...' : 'Mở một thư mục chứa file Markdown'}</p>
          <p className="dim">hoặc kéo thả thư mục / file .md vào đây</p>
          <button className={cx('btn btn-primary btn-sm mt-2', btnPrimary, btnSm)} onClick={p.onOpenFolder}>
            <IconFolder size={14} /> Mở thư mục
          </button>
        </div>
      ) : (
        <div className="x2m-tree flex-1 overflow-y-auto px-2 py-1" role="tree">
          {p.pasted && (
            <div className={cn('x2m-paste-row group flex items-center justify-between pr-2 py-0.5 rounded-md hover:bg-hover transition-colors mb-1 border-b border-line/40 pb-1.5', p.selectedPath === PASTE_PATH && 'selected bg-accent-soft text-accent-ink')}>
              <button className="x2m-tree-btn x2m-tree-file flex min-w-0 flex-1 items-center gap-2 py-1 text-left text-xs text-ink outline-none cursor-pointer" onClick={p.onShowPaste} title="Bản Markdown đã dán">
                <IconCopy size={14} />
                <span className="x2m-tree-name truncate flex-1">Dán từ clipboard</span>
              </button>
              <button className={`icon-btn ${iconBtn}`} onClick={p.onClosePaste} title="Đóng bản dán" aria-label="Đóng bản dán">
                <IconX size={12} />
              </button>
            </div>
          )}
          {p.root && p.recent.length > 0 && (
            <>
              <div className="x2m-tree-section px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider text-faint">Mới sửa</div>
              {p.recent.map((r) => fileRow(joinRoot(p.root as string, r), r, 0, r, undefined, p.mtimes[r], 'x2m-recent-row'))}
            </>
          )}
          {p.root && (
            <div className="x2m-tree-section x2m-tree-section-bar flex items-center justify-between px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider text-faint border-t border-line/40 mt-1.5">
              <span>Tất cả</span>
              <span className="x2m-sort flex items-center gap-0.5 rounded border border-line bg-raised p-0.5 normal-case tracking-normal">
                <button className="x2m-sort-btn rounded px-1.5 py-0.5 text-[10.5px] font-medium text-dim transition-colors hover:text-ink [&[aria-pressed=true]]:bg-soft [&[aria-pressed=true]]:text-accent-ink [&[aria-pressed=true]]:shadow-xs" aria-pressed={p.sort === 'name'} onClick={() => p.onSortChange('name')}>
                  Tên
                </button>
                <button className="x2m-sort-btn rounded px-1.5 py-0.5 text-[10.5px] font-medium text-dim transition-colors hover:text-ink [&[aria-pressed=true]]:bg-soft [&[aria-pressed=true]]:text-accent-ink [&[aria-pressed=true]]:shadow-xs" aria-pressed={p.sort === 'date'} onClick={() => p.onSortChange('date')}>
                  Ngày sửa
                </button>
              </span>
            </div>
          )}
          {q
            ? p.root &&
              p.relFiles
                .filter((r) => r.toLowerCase().includes(q))
                .map((r) => fileRow(joinRoot(p.root as string, r), r, 0, r, undefined, p.mtimes[r]))
            : renderNodes(p.tree, 0)}
          {p.root && p.relFiles.length === 0 && !p.listing && <div className="x2m-loading">Không có file Markdown nào</div>}
          {p.loose.length > 0 && (
            <>
              <div className="x2m-tree-group px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider text-faint border-t border-line/40 mt-2">File đã mở</div>
              {p.loose
                .filter((f) => !q || f.toLowerCase().includes(q))
                .map((f) => fileRow(f, baseName(f), 0, f, () => p.onRemoveLoose(f)))}
            </>
          )}
        </div>
      )}
    </aside>
  )
}
