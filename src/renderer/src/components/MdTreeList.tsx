import { formatRelativeTime, type MdSort, type MdTreeNode } from '../../../shared/mdView'
import { joinRoot } from '../hooks/useMdViewer'
import { baseName, cn } from '../utils'
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
  onPaste: () => void
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
  const empty = !p.root && p.loose.length === 0

  const now = Date.now()

  const fileRow = (
    abs: string,
    label: string,
    depth: number,
    title: string,
    onRemove?: () => void,
    mtime?: number,
    rowClass = 'x2m-tree-row'
  ): React.ReactElement => (
    <div key={abs} className={cn(rowClass, p.selectedPath === abs && 'selected')} style={{ paddingLeft: 8 + depth * INDENT }}>
      <button className="x2m-tree-btn x2m-tree-file" onClick={() => p.onSelect(abs)} title={title}>
        <IconFile size={14} />
        <span className="x2m-tree-name">{label}</span>
        {mtime !== undefined && (
          <span className="x2m-tree-date dim" title={new Date(mtime).toLocaleString('vi-VN')}>
            {formatRelativeTime(mtime, now)}
          </span>
        )}
      </button>
      {onRemove && (
        <button className="icon-btn" onClick={onRemove} title="Đóng file" aria-label="Đóng file">
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
          <div className="x2m-tree-row" style={{ paddingLeft: 8 + depth * INDENT }}>
            <button className="x2m-tree-btn x2m-tree-dir" onClick={() => p.onToggleDir(n.path)} aria-expanded={open} title={n.path}>
              <span className={cn('x2m-tree-caret', !open && 'closed')}>
                <IconChevronDown size={14} />
              </span>
              <IconFolder size={14} />
              <span className="x2m-tree-name">{n.name}</span>
            </button>
          </div>
          {open && renderNodes(n.children, depth + 1)}
        </div>
      )
    })

  const rootLabel = p.root ? baseName(p.root.replace(/[\\/]+$/, '')) || p.root : 'Đọc Markdown'

  return (
    <aside className={cn('x2m-files', p.dragOver && 'drag-over')}>
      <div className="x2m-pane-title">
        <span className="x2m-tree-title" title={p.root ?? undefined}>
          {rootLabel}
          {p.root ? ` (${p.relFiles.length})` : ''}
        </span>
        <span className="x2m-tree-actions">
          <button className="x2m-move-btn x2m-reload-btn" onClick={p.onOpenFolder} title="Mở thư mục (Ctrl+O)" aria-label="Mở thư mục">
            <IconFolder size={14} />
          </button>
          <button className="x2m-move-btn x2m-reload-btn" onClick={p.onOpenFiles} title="Mở file Markdown" aria-label="Mở file">
            <IconFile size={14} />
          </button>
          <button
            className="x2m-move-btn x2m-reload-btn"
            onClick={p.onPaste}
            title="Dán Markdown từ clipboard để xem"
            aria-label="Dán Markdown"
          >
            <IconCopy size={14} />
          </button>
          {p.root && (
            <>
              <button
                className="x2m-move-btn x2m-reload-btn"
                onClick={p.onRefresh}
                disabled={p.listing}
                title="Quét lại thư mục (khi có file mới)"
                aria-label="Quét lại thư mục"
              >
                <IconRefresh size={14} />
              </button>
              <button className="icon-btn" onClick={p.onCloseFolder} title="Đóng thư mục" aria-label="Đóng thư mục">
                <IconX size={14} />
              </button>
            </>
          )}
        </span>
      </div>
      {!empty && (
        <div className="x2m-filter">
          <input
            className="x2m-filter-input"
            placeholder="Lọc file..."
            value={p.filter}
            onChange={(e) => p.onFilterChange(e.target.value)}
            aria-label="Lọc file theo tên"
          />
        </div>
      )}
      {empty ? (
        <div className="x2m-empty">
          <IconFolder size={36} />
          <p>{p.listing ? 'Đang quét thư mục...' : 'Mở một thư mục chứa file Markdown'}</p>
          <p className="dim">hoặc kéo thả thư mục / file .md vào đây</p>
          <button className="btn btn-primary btn-sm" onClick={p.onOpenFolder}>
            <IconFolder size={14} /> Mở thư mục
          </button>
        </div>
      ) : (
        <div className="x2m-tree" role="tree">
          {p.root && p.recent.length > 0 && (
            <>
              <div className="x2m-tree-group">Mới sửa</div>
              {p.recent.map((r) => fileRow(joinRoot(p.root as string, r), r, 0, r, undefined, p.mtimes[r], 'x2m-recent-row'))}
            </>
          )}
          {p.root && (
            <div className="x2m-tree-group x2m-tree-group-bar">
              <span>Tất cả</span>
              <span className="x2m-sort">
                <button className="x2m-sort-btn" aria-pressed={p.sort === 'name'} onClick={() => p.onSortChange('name')}>
                  Tên
                </button>
                <button className="x2m-sort-btn" aria-pressed={p.sort === 'date'} onClick={() => p.onSortChange('date')}>
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
              <div className="x2m-tree-group">File đã mở</div>
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
