import { formatRelativeTime, type MdSort, type MdTreeNode } from '../../../../shared/mdView'
import { joinRoot, PASTE_PATH, type MdContentSearch } from './useMdViewer'
import type { MdSearchHit } from '../../../../shared/types'
import { baseName, cn } from '../../lib/utils'
import { btnPrimary, btnSm, cx, iconBtn, input } from '../../lib/ui'
import { IconChevronDown, IconCopy, IconFile, IconFolder, IconMap, IconRefresh, IconX } from '../../components/icons'
import { LOCALES, useLang, useT } from '../../i18n'

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
  /** Ô lọc tìm trong nội dung file thay vì tên */
  contentSearch: boolean
  onContentSearchChange: (v: boolean) => void
  search: MdContentSearch | null
  onOpenHit: (absPath: string, hit: MdSearchHit) => void
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
  /** Bản đồ thiết kế + 影響調査 của thư mục đang mở */
  specMapOpen: boolean
  onToggleSpecMap: () => void
}

const INDENT = 14

/** Cột trái chế độ Đọc Markdown: cây file .md của thư mục đang mở + các file mở lẻ. */
export function MdTreeList(p: Props): React.ReactElement {
  const t = useT()
  const locale = LOCALES[useLang()]
  const q = p.contentSearch ? '' : p.filter.trim().toLowerCase()
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
      <button className="x2m-tree-btn x2m-tree-file flex min-w-0 flex-1 items-center gap-2 py-1 text-left text-xs text-ink outline-none focus-visible:outline-2 focus-visible:outline-accent cursor-pointer" onClick={() => p.onSelect(abs)} title={title}>
        <IconFile size={14} />
        <span className="x2m-tree-name truncate flex-1">{label}</span>
        {mtime !== undefined && (
          <span className="x2m-tree-date dim ml-auto text-[11px] text-faint shrink-0" title={new Date(mtime).toLocaleString(locale)}>
            {formatRelativeTime(mtime, now, locale)}
          </span>
        )}
      </button>
      {onRemove && (
        <button className={`icon-btn ${iconBtn}`} onClick={onRemove} title={t('viewer.closeFile')} aria-label={t('viewer.closeFile')}>
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
            <button className="x2m-tree-btn x2m-tree-dir flex min-w-0 flex-1 items-center gap-2 py-1 text-left text-xs font-semibold text-dim outline-none focus-visible:outline-2 focus-visible:outline-accent cursor-pointer hover:text-ink" onClick={() => p.onToggleDir(n.path)} aria-expanded={open} title={n.path}>
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

  const rootLabel = p.root ? baseName(p.root.replace(/[\\/]+$/, '')) || p.root : t('header.mode.mdview')

  return (
    <aside className={cn('x2m-files flex w-[300px] min-w-[220px] shrink-0 flex-col overflow-y-auto border-r border-line-subtle', p.dragOver && 'drag-over outline-2 -outline-offset-2 outline-dashed outline-accent')}>
      <div className="x2m-pane-title flex h-10 shrink-0 items-center justify-between gap-1.5 border-b border-line-subtle px-3 text-[11.5px] font-semibold tracking-normal text-faint">
        <span className="x2m-tree-title truncate text-[12.5px] font-semibold text-ink" title={p.root ?? undefined}>
          {rootLabel}
          {p.root ? ` (${p.relFiles.length})` : ''}
        </span>
        <span className="x2m-tree-actions flex items-center gap-1">
          <button className="x2m-move-btn x2m-reload-btn flex cursor-pointer items-center rounded-md p-1.5 text-dim transition-colors hover:bg-hover hover:text-ink" onClick={p.onOpenFolder} title={t('viewer.openFolderTitle')} aria-label={t('common.openFolder')}>
            <IconFolder size={14} />
          </button>
          <button className="x2m-move-btn x2m-reload-btn flex cursor-pointer items-center rounded-md p-1.5 text-dim transition-colors hover:bg-hover hover:text-ink" onClick={p.onOpenFiles} title={t('viewer.openFilesTitle')} aria-label={t('viewer.openFiles')}>
            <IconFile size={14} />
          </button>
          <button
            className="x2m-move-btn x2m-reload-btn flex cursor-pointer items-center rounded-md p-1.5 text-dim transition-colors hover:bg-hover hover:text-ink"
            onClick={p.onPaste}
            title={t('viewer.pasteTitle')}
            aria-label={t('viewer.pasteAria')}
          >
            <IconCopy size={14} />
          </button>
          {p.root && (
            <>
              <button
                className={cn(
                  'x2m-specmap-btn flex cursor-pointer items-center rounded-md p-1.5 text-dim transition-colors hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent',
                  p.specMapOpen && 'bg-accent-soft text-accent-ink'
                )}
                onClick={p.onToggleSpecMap}
                aria-pressed={p.specMapOpen}
                title={t('sm.buttonTitle')}
                aria-label={t('sm.button')}
              >
                <IconMap size={14} />
              </button>
              <button
                className="x2m-move-btn x2m-reload-btn flex cursor-pointer items-center rounded-md p-1.5 text-dim transition-colors hover:bg-hover hover:text-ink"
                onClick={p.onRefresh}
                disabled={p.listing}
                title={t('viewer.rescanTitle')}
                aria-label={t('viewer.rescan')}
              >
                <IconRefresh size={14} />
              </button>
              <button className={`icon-btn ${iconBtn}`} onClick={p.onCloseFolder} title={t('viewer.closeFolder')} aria-label={t('viewer.closeFolder')}>
                <IconX size={14} />
              </button>
            </>
          )}
        </span>
      </div>
      {!empty && (
        <div className="x2m-filter flex items-center gap-1.5 px-2.5 py-2">
          <input
            className={`x2m-filter-input min-w-0 flex-1 ${input}`}
            placeholder={t(p.contentSearch ? 'viewer.searchPlaceholder' : 'viewer.filterPlaceholder')}
            value={p.filter}
            onChange={(e) => p.onFilterChange(e.target.value)}
            aria-label={t(p.contentSearch ? 'viewer.searchAria' : 'viewer.filterAria')}
          />
          {p.root && (
            <span className="x2m-sort flex shrink-0 items-center gap-0.5 rounded border border-line bg-raised p-0.5">
              {([false, true] as const).map((on) => (
                <button
                  key={String(on)}
                  className="x2m-sort-btn rounded px-1.5 py-0.5 text-[10.5px] font-medium text-dim transition-colors hover:text-ink [&[aria-pressed=true]]:bg-soft [&[aria-pressed=true]]:text-accent-ink [&[aria-pressed=true]]:shadow-xs"
                  aria-pressed={p.contentSearch === on}
                  onClick={() => p.onContentSearchChange(on)}
                  title={t(on ? 'viewer.byContentTitle' : 'viewer.byNameTitle')}
                >
                  {t(on ? 'viewer.byContent' : 'viewer.byName')}
                </button>
              ))}
            </span>
          )}
        </div>
      )}
      {empty ? (
        <div className="x2m-empty flex flex-col items-center justify-center gap-2 px-6 py-12 text-center text-faint">
          <IconFolder size={36} />
          <p>{t(p.listing ? 'viewer.scanning' : 'viewer.emptyTitle')}</p>
          <p className="dim">{t('viewer.emptyHint')}</p>
          <button className={cx('btn btn-primary btn-sm mt-2', btnPrimary, btnSm)} onClick={p.onOpenFolder}>
            <IconFolder size={14} /> {t('common.openFolder')}
          </button>
        </div>
      ) : (
        <div className="x2m-tree flex-1 overflow-y-auto px-2 py-1">
          {p.pasted && (
            <div className={cn('x2m-paste-row group flex items-center justify-between pr-2 py-0.5 rounded-md hover:bg-hover transition-colors mb-1 border-b border-line/40 pb-1.5', p.selectedPath === PASTE_PATH && 'selected bg-accent-soft text-accent-ink')}>
              <button className="x2m-tree-btn x2m-tree-file flex min-w-0 flex-1 items-center gap-2 py-1 text-left text-xs text-ink outline-none focus-visible:outline-2 focus-visible:outline-accent cursor-pointer" onClick={p.onShowPaste} title={t('viewer.pastedTitle')}>
                <IconCopy size={14} />
                <span className="x2m-tree-name truncate flex-1">{t('viewer.paste')}</span>
              </button>
              <button className={`icon-btn ${iconBtn}`} onClick={p.onClosePaste} title={t('viewer.closePaste')} aria-label={t('viewer.closePaste')}>
                <IconX size={12} />
              </button>
            </div>
          )}
          {p.root && p.recent.length > 0 && !p.search && (
            <>
              <div className="x2m-tree-section px-2 py-1.5 text-[11.5px] font-semibold text-dim">{t('viewer.recent')}</div>
              {p.recent.map((r) => fileRow(joinRoot(p.root as string, r), r, 0, r, undefined, p.mtimes[r], 'x2m-recent-row'))}
            </>
          )}
          {p.root && !p.search && (
            <div className="x2m-tree-section x2m-tree-section-bar flex items-center justify-between px-2 py-1.5 text-[11.5px] font-semibold text-dim border-t border-line/40 mt-1.5">
              <span>{t('viewer.all')}</span>
              <span className="x2m-sort flex items-center gap-0.5 rounded border border-line bg-raised p-0.5">
                <button className="x2m-sort-btn rounded px-1.5 py-0.5 text-[10.5px] font-medium text-dim transition-colors hover:text-ink [&[aria-pressed=true]]:bg-soft [&[aria-pressed=true]]:text-accent-ink [&[aria-pressed=true]]:shadow-xs" aria-pressed={p.sort === 'name'} onClick={() => p.onSortChange('name')}>
                  {t('viewer.sortName')}
                </button>
                <button className="x2m-sort-btn rounded px-1.5 py-0.5 text-[10.5px] font-medium text-dim transition-colors hover:text-ink [&[aria-pressed=true]]:bg-soft [&[aria-pressed=true]]:text-accent-ink [&[aria-pressed=true]]:shadow-xs" aria-pressed={p.sort === 'date'} onClick={() => p.onSortChange('date')}>
                  {t('viewer.sortDate')}
                </button>
              </span>
            </div>
          )}
          {p.search && p.root ? (
            <div className="x2m-search-results" aria-live="polite">
              <div className="px-2 py-1.5 text-[11.5px] text-dim">
                {p.search.error
                  ? p.search.error
                  : p.search.loading && !p.search.result
                    ? t('viewer.searching')
                    : p.search.result && p.search.result.files.length > 0
                      ? t('viewer.matches', { n: `${p.search.result.files.length}${p.search.result.truncated ? '+' : ''}` }) +
                        (p.search.loading ? ` · ${t('viewer.stillSearching')}` : '')
                      : t('viewer.notFound')}
              </div>
              {p.search.result?.files.map((f) => {
                const abs = joinRoot(p.root as string, f.rel)
                return (
                  <div key={f.rel}>
                    {fileRow(abs, f.rel, 0, f.rel, undefined, p.mtimes[f.rel])}
                    {f.hits.map((h) => (
                      <button
                        key={h.line}
                        className="x2m-search-hit flex w-full cursor-pointer gap-2 rounded-md py-0.5 pr-2 pl-[30px] text-left text-[11.5px] text-dim outline-none hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
                        onClick={() => p.onOpenHit(abs, h)}
                        title={h.heading ? t('viewer.hitTitle', { heading: h.heading, line: h.line }) : t('viewer.hitLine', { line: h.line })}
                      >
                        <span className="shrink-0 tabular-nums text-faint">{h.line}</span>
                        <span className="truncate">{h.text}</span>
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
          ) : q
            ? p.root &&
              p.relFiles
                .filter((r) => r.toLowerCase().includes(q))
                .map((r) => fileRow(joinRoot(p.root as string, r), r, 0, r, undefined, p.mtimes[r]))
            : renderNodes(p.tree, 0)}
          {p.root && p.relFiles.length === 0 && !p.listing && <div className="x2m-loading">{t('viewer.noMd')}</div>}
          {p.loose.length > 0 && (
            <>
              <div className="x2m-tree-group px-2 py-1.5 text-[11.5px] font-semibold text-dim border-t border-line/40 mt-2">{t('viewer.opened')}</div>
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
