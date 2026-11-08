/* Màn hình So sánh 新旧: hai ô chọn file (cột trái) + bảng khác biệt hai cột (giữa). */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PATH_SEP, specDiffReport, type DiffHunk, type InlineSegment, type SpecDiff } from '../../../../shared/specDiff'
import { revisionRows, revisionTable, type RevLang } from '../../../../shared/revision'
import { useT } from '../../i18n'
import { baseName, cn, copyText, toast } from '../../lib/utils'
import { btn, btnGhost, btnSm, cx, emptyBox, emptyHint, emptyP, filesAside, iconBtn, paneTitle } from '../../lib/ui'
import { IconCopy, IconFile, IconRefresh, IconSplit, IconX } from '../../components/icons'
import { SelectionTranslate } from '../../components/SelectionTranslate'
import { changeStarts, compareRows } from './compareView'
import { isComparable, type CompareState, type Side } from './useCompare'

/** Chữ của một phía, tô phần thêm/xóa trong dòng sửa. */
function Segments({ segs, side }: { segs: InlineSegment[]; side: Side }): React.ReactElement {
  return (
    <>
      {segs.map((s, i) =>
        s.type === 'same' ? (
          <span key={i}>{s.text}</span>
        ) : (side === 'old') === (s.type === 'del') ? (
          <mark key={i} className={cn('rounded-[3px] px-px text-inherit', s.type === 'del' ? 'bg-danger/30 line-through decoration-danger/60' : 'bg-success/30')}>
            {s.text}
          </mark>
        ) : null
      )}
    </>
  )
}

const ROW_BG: Record<DiffHunk['kind'], [string, string]> = {
  same: ['', ''],
  add: ['bg-soft/40', 'bg-success-soft'],
  del: ['bg-danger-soft', 'bg-soft/40'],
  change: ['bg-danger-soft/70', 'bg-success-soft/70'],
}

function Cell({ h, side }: { h: DiffHunk; side: Side }): React.ReactElement {
  const line = side === 'old' ? h.oldLine : h.newLine
  const text = side === 'old' ? h.oldText : h.newText
  const present = text !== undefined && (side === 'old' ? h.kind !== 'add' : h.kind !== 'del')
  return (
    <div className={cn('flex min-w-0 gap-2 px-2 py-[3px]', ROW_BG[h.kind][side === 'old' ? 0 : 1])}>
      <span className="w-10 shrink-0 select-none text-right text-[11px] tabular-nums text-faint">{present ? line : ''}</span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-[12px] leading-[1.55] text-ink">
        {present ? h.kind === 'change' && h.segments ? <Segments segs={h.segments} side={side} /> : text : ''}
      </span>
    </div>
  )
}

/** Nhớ người sửa giữa các lần (chỉ tiện lợi; localStorage lỗi thì bỏ qua). */
const AUTHOR_KEY = 'x2m.revAuthor'
const readAuthor = (): string => {
  try {
    return localStorage.getItem(AUTHOR_KEY) ?? ''
  } catch {
    return ''
  }
}

/** Khung tạo dòng 改訂履歴 từ các thay đổi: điền 版数 / 改訂者, xem trước, copy Markdown hoặc TSV dán Excel. */
function RevisionPanel({ diff, onClose }: { diff: SpecDiff; onClose: () => void }): React.ReactElement {
  const t = useT()
  const today = new Date()
  const [version, setVersion] = useState('')
  const [author, setAuthor] = useState(readAuthor)
  const [date, setDate] = useState(`${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`)
  const [lang, setLang] = useState<RevLang>('ja')
  const rows = useMemo(() => revisionRows(diff, lang), [diff, lang])
  const meta = { version, date, author }
  const copy = async (format: 'md' | 'tsv'): Promise<void> => {
    try {
      localStorage.setItem(AUTHOR_KEY, author)
    } catch {
      /* chỉ là tiện lợi */
    }
    const ok = await copyText(revisionTable(rows, meta, lang, format))
    toast(ok ? t('compare.rev.copied') : t('compare.copyFailed'), ok ? 'ok' : 'err')
  }
  const field = 'rounded-md border border-line bg-canvas px-2 py-1 text-xs text-ink outline-none focus:border-accent'
  return (
    <section className="x2m-rev border-b border-line-subtle bg-soft/50 px-3 py-2.5" aria-label={t('compare.rev.title')}>
      <div className="mb-2 flex flex-wrap items-end gap-2">
        <span className="mr-auto text-xs font-semibold text-ink">{t('compare.rev.title')}</span>
        <label className="flex flex-col gap-0.5 text-[11px] text-dim">
          {t('compare.rev.version')}
          <input className={cn(field, 'w-16')} value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.1" />
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] text-dim">
          {t('compare.rev.date')}
          <input className={cn(field, 'w-28 tabular-nums')} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] text-dim">
          {t('compare.rev.author')}
          <input className={cn(field, 'w-28')} value={author} onChange={(e) => setAuthor(e.target.value)} />
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] text-dim">
          {t('compare.rev.lang')}
          <select className={field} value={lang} onChange={(e) => setLang(e.target.value as RevLang)}>
            <option value="ja">日本語</option>
            <option value="vi">Tiếng Việt</option>
            <option value="en">English</option>
          </select>
        </label>
        <button className={cx(btn, btnSm)} onClick={() => void copy('md')}>
          {t('compare.rev.copyMd')}
        </button>
        <button className={cx(btn, btnSm, '!border-accent-line !text-accent-ink')} onClick={() => void copy('tsv')}>
          {t('compare.rev.copyTsv')}
        </button>
        <button className={cx(btnGhost, '!p-1')} onClick={onClose} title={t('compare.rev.close')} aria-label={t('compare.rev.close')}>
          <IconX size={13} />
        </button>
      </div>
      <div className="max-h-48 overflow-auto rounded-md border border-line-subtle bg-canvas">
        <table className="x2m-rev-table w-full border-collapse text-[11.5px]">
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-line-subtle last:border-0 align-top">
                <td className="w-12 px-2 py-1 tabular-nums text-dim">{i === 0 ? version : ''}</td>
                <td className="w-24 px-2 py-1 tabular-nums text-dim">{i === 0 ? date : ''}</td>
                <td className="w-24 px-2 py-1 text-dim">{i === 0 ? author : ''}</td>
                <td className="px-2 py-1 text-ink">{r.place}</td>
                <td className="px-2 py-1 text-ink">{r.content}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 mb-0 text-[11px] text-faint">{t('compare.rev.hint')}</p>
    </section>
  )
}

export function ComparePane({ state, dragOver }: { state: CompareState; dragOver: boolean }): React.ReactElement {
  const t = useT()
  const { slots, diff, busy } = state
  const [onlyChanges, setOnlyChanges] = useState(true)
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set())
  const [cursor, setCursor] = useState(-1)
  const [showRev, setShowRev] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setExpanded(new Set())
    setCursor(-1)
  }, [diff])

  const hunks = diff?.hunks ?? []
  const rows = useMemo(() => compareRows(hunks, onlyChanges, 3, expanded), [hunks, onlyChanges, expanded])
  const starts = useMemo(() => changeStarts(hunks), [hunks])

  const jumpToHunk = useCallback((index: number) => {
    const el = listRef.current?.querySelector(`[data-hunk="${index}"]`)
    el?.scrollIntoView({ block: 'center' })
  }, [])

  const go = useCallback(
    (dir: 1 | -1) => {
      if (starts.length === 0) return
      const next = cursor < 0 ? (dir === 1 ? 0 : starts.length - 1) : (cursor + dir + starts.length) % starts.length
      setCursor(next)
      jumpToHunk(starts[next])
    },
    [starts, cursor, jumpToHunk]
  )

  // F7 / Shift+F7: thay đổi sau / trước (như trình so sánh văn bản quen thuộc)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'F7') return
      e.preventDefault()
      go(e.shiftKey ? -1 : 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go])

  const sum = diff?.summary
  const added = sum ? sum.rowsAdded + sum.linesAdded : 0
  const removed = sum ? sum.rowsRemoved + sum.linesRemoved : 0
  const changed = sum ? sum.rowsChanged + sum.linesChanged + sum.rowsMoved : 0
  const sectionsChanged = sum ? sum.sectionsAdded + sum.sectionsRemoved + sum.sectionsChanged : 0
  const names = { oldName: slots.old.path ? baseName(slots.old.path) : '', newName: slots.new.path ? baseName(slots.new.path) : '' }

  const report = (): string => (diff ? specDiffReport(diff, names) : '')
  const exportReport = async (): Promise<void> => {
    try {
      const path = await window.api.saveMarkdown(`${names.newName.replace(/\.[^.]+$/, '')}_変更レポート`, report())
      if (path) toast(t('compare.saved', { path }))
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'err')
    }
  }
  const copyReport = async (): Promise<void> => {
    const ok = await copyText(report())
    toast(ok ? t('compare.copied') : t('compare.copyFailed'), ok ? 'ok' : 'err')
  }

  const slot = (side: Side): React.ReactElement => {
    const s = slots[side]
    const onDrop = (e: React.DragEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      const p = [...e.dataTransfer.files].map((f) => window.api.getPathForFile(f)).find(isComparable)
      if (p) state.setPath(side, p)
      else toast(t('compare.unsupported'), 'err')
    }
    return (
      <section
        className="x2m-compare-slot glass-chip rounded-xl p-2.5"
        aria-label={t(side === 'old' ? 'compare.old' : 'compare.new')}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className={cn('text-[11.5px] font-semibold', side === 'old' ? 'text-danger' : 'text-success')}>
            {t(side === 'old' ? 'compare.old' : 'compare.new')}
          </span>
          {s.path && (
            <button className={iconBtn} onClick={() => state.clear(side)} title={t('compare.clear')} aria-label={t('compare.clear')}>
              <IconX size={12} />
            </button>
          )}
        </div>
        {s.path ? (
          <div className="flex min-w-0 items-center gap-2 text-[12.5px] text-ink" title={s.path}>
            <IconFile size={14} />
            <span className="truncate font-medium">{baseName(s.path)}</span>
          </div>
        ) : (
          <p className="m-0 text-xs text-faint">{t('compare.dropHint')}</p>
        )}
        {s.loading && <div className="mt-2 h-1 overflow-hidden rounded bg-soft"><div className="h-full w-1/3 animate-pulse rounded bg-accent" /></div>}
        {s.error && <p className="mt-2 mb-0 rounded-md bg-danger-soft px-2 py-1 text-xs text-danger">{s.error}</p>}
        <button
          className={cx('x2m-compare-pick mt-2 w-full justify-center', btn, btnSm)}
          onClick={async () => {
            const p = await window.api.openCompareFile()
            if (p) state.setPath(side, p)
          }}
        >
          {t('compare.pick')}
        </button>
      </section>
    )
  }

  return (
    <>
      <aside className={cn('x2m-compare-side', filesAside, 'gap-0', dragOver && 'outline-2 -outline-offset-2 outline-dashed outline-accent')}>
        <div className={paneTitle}>
          <span>{t('compare.mode')}</span>
          <span className="flex items-center gap-1">
            <button className={cx(btnGhost, '!p-1.5')} onClick={state.swap} disabled={!slots.old.path && !slots.new.path} title={t('compare.swap')} aria-label={t('compare.swap')}>
              <IconSplit size={14} />
            </button>
            <button className={cx(btnGhost, '!p-1.5')} onClick={state.reload} disabled={!slots.old.path && !slots.new.path} title={t('compare.reload')} aria-label={t('compare.reload')}>
              <IconRefresh size={14} />
            </button>
          </span>
        </div>
        <div className="flex flex-col gap-2 p-2.5">
          {slot('old')}
          {slot('new')}
        </div>
        {diff && diff.sections.length > 0 && (
          <nav className="x2m-compare-sections flex min-h-0 flex-1 flex-col border-t border-line-subtle" aria-label={t('compare.sections')}>
            <div className="px-3 pt-2.5 pb-1 text-[11.5px] font-semibold text-dim">{t('compare.sections')}</div>
            <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
              {diff.sections.map((sec, i) => {
                const first = hunks.findIndex((h) => h.sectionPath === sec.path && h.kind !== 'same')
                return (
                  <button
                    key={i}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs text-ink hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent"
                    onClick={() => {
                      if (first < 0) return
                      setOnlyChanges(true)
                      requestAnimationFrame(() => jumpToHunk(first))
                    }}
                    title={sec.path}
                  >
                    <span
                      className={cn(
                        'shrink-0 rounded px-1 text-[10.5px] font-semibold',
                        sec.kind === 'add' ? 'bg-success-soft text-success' : sec.kind === 'del' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning'
                      )}
                    >
                      {t(sec.kind === 'add' ? 'compare.sec.add' : sec.kind === 'del' ? 'compare.sec.del' : 'compare.sec.change')}
                    </span>
                    <span className="truncate">{sec.path.split(PATH_SEP).pop() || t('compare.root')}</span>
                  </button>
                )
              })}
            </div>
          </nav>
        )}
      </aside>

      <main className="x2m-main x2m-compare flex min-w-0 flex-1 flex-col overflow-hidden bg-editor">
        {!diff ? (
          <div className={cx('x2m-empty flex-1', emptyBox)}>
            <IconSplit size={36} />
            <p className={cx(emptyP, 'font-semibold !text-ink')}>{busy ? t('compare.loading') : t('compare.empty.title')}</p>
            {!busy && <p className={cx(emptyHint, 'max-w-[60ch] leading-relaxed')}>{t('compare.empty.desc')}</p>}
          </div>
        ) : (
          <>
            <div className="x2m-compare-bar flex flex-wrap items-center gap-2 border-b border-line-subtle px-3 py-2">
              <span className="flex flex-wrap items-center gap-1.5 text-[11.5px] font-medium tabular-nums">
                <span className="rounded-md bg-soft px-1.5 py-0.5 text-dim">{t('compare.sum.sections', { n: sectionsChanged })}</span>
                <span className="rounded-md bg-success-soft px-1.5 py-0.5 text-success">{t('compare.sum.added', { n: added })}</span>
                <span className="rounded-md bg-danger-soft px-1.5 py-0.5 text-danger">{t('compare.sum.removed', { n: removed })}</span>
                <span className="rounded-md bg-warning-soft px-1.5 py-0.5 text-warning">{t('compare.sum.changed', { n: changed })}</span>
              </span>
              <span className="ml-auto flex items-center gap-1">
                <label className="mr-1 flex cursor-pointer items-center gap-1.5 text-xs text-dim">
                  <input type="checkbox" className="size-3.5 accent-accent" checked={onlyChanges} onChange={(e) => setOnlyChanges(e.target.checked)} />
                  {t('compare.onlyChanges')}
                </label>
                <button className={cx(btnGhost)} onClick={() => go(-1)} disabled={starts.length === 0} title={t('compare.prev')} aria-label={t('compare.prev')}>
                  ↑
                </button>
                <span className="min-w-[3.5em] text-center text-[11.5px] tabular-nums text-faint">
                  {starts.length === 0 ? '0' : `${cursor < 0 ? '–' : cursor + 1} / ${starts.length}`}
                </span>
                <button className={cx(btnGhost)} onClick={() => go(1)} disabled={starts.length === 0} title={t('compare.next')} aria-label={t('compare.next')}>
                  ↓
                </button>
                <button
                  className={cx(btnGhost, showRev && '!bg-accent-soft !text-accent-ink')}
                  onClick={() => setShowRev((v) => !v)}
                  aria-pressed={showRev}
                  title={t('compare.rev.title')}
                >
                  {t('compare.rev.button')}
                </button>
                <button className={cx(btnGhost)} onClick={() => void copyReport()} title={t('compare.copy')}>
                  <IconCopy size={14} /> {t('compare.copy')}
                </button>
                <button className={cx(btn, btnSm)} onClick={() => void exportReport()} title={t('compare.exportTitle')}>
                  {t('compare.export')}
                </button>
              </span>
            </div>
            {showRev && starts.length > 0 && <RevisionPanel diff={diff} onClose={() => setShowRev(false)} />}
            {starts.length === 0 ? (
              <div className={cx('x2m-empty flex-1', emptyBox)}>
                <p className={cx(emptyP, 'font-semibold !text-ink')}>{t('compare.noChanges')}</p>
              </div>
            ) : (
              <div ref={listRef} className="x2m-compare-list min-h-0 flex-1 overflow-auto" role="table" aria-label={t('compare.mode')}>
                <div className="sticky top-0 z-[1] grid grid-cols-2 border-b border-line-subtle bg-raised text-[11px] font-semibold text-dim backdrop-blur" role="row">
                  <div className="truncate px-3 py-1.5" role="columnheader" title={slots.old.path ?? ''}>
                    {t('compare.colOld')} · {names.oldName}
                  </div>
                  <div className="truncate border-l border-line-subtle px-3 py-1.5" role="columnheader" title={slots.new.path ?? ''}>
                    {t('compare.colNew')} · {names.newName}
                  </div>
                </div>
                {rows.map((r) =>
                  r.kind === 'gap' ? (
                    <button
                      key={'g' + r.from}
                      className="block w-full border-y border-line-subtle bg-soft/60 py-1 text-center text-[11px] text-faint hover:bg-hover hover:text-ink"
                      onClick={() => setExpanded((prev) => new Set(prev).add(r.from))}
                    >
                      ⋯ {t('compare.gap', { n: r.count })}
                    </button>
                  ) : (
                    <div
                      key={r.index}
                      data-hunk={r.index}
                      className={cn('grid grid-cols-2', starts[cursor] === r.index && 'outline-2 -outline-offset-2 outline-accent/70')}
                      role="row"
                    >
                      <Cell h={r.hunk} side="old" />
                      <div className="border-l border-line-subtle">
                        <Cell h={r.hunk} side="new" />
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </>
        )}
        <SelectionTranslate containerRef={listRef} />
      </main>
    </>
  )
}
