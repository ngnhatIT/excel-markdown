/* Bản đồ thiết kế + 影響調査 (chế độ Đọc Markdown): 画面遷移図, ER, phân tích ảnh hưởng, kiểm tra nhất quán của cả thư mục.
 * Chỉ mục lập ở main (mdv:specIndex); sơ đồ và 影響調査 tính ở đây bằng hàm thuần của shared/specIndex. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  erMermaid,
  impactOf,
  impactSuggestions,
  transitionMermaid,
  type ImpactResult,
  type SpecIndex,
  type SpecIssue,
} from '../../../../shared/specIndex'
import { renderMermaidIn } from '../../lib/mermaid'
import { errMsg } from '../../lib/api'
import { btn, btnGhost, btnSm, cx, emptyBox, emptyHint, emptyP, input } from '../../lib/ui'
import { cn, copyText, toast } from '../../lib/utils'
import { IconMap, IconRefresh, IconX } from '../../components/icons'
import { t as tr, useT } from '../../i18n'

type Tab = 'flow' | 'er' | 'impact' | 'lint'
const TABS: Tab[] = ['flow', 'er', 'impact', 'lint']

/** Mở tài liệu `rel` (tương đối thư mục), cuộn tới `heading` rồi tô `text`. */
export type SpecOpen = (rel: string, heading: string, text: string) => void

interface Props {
  root: string
  onOpen: SpecOpen
  onClose: () => void
}

/** Khối Mermaid do DOM quản lý (renderMermaidIn thay node), React không đụng vào bên trong. */
function MermaidBox({ source, label, onReady }: { source: string; label: string; onReady?: (box: HTMLElement) => void }): React.ReactElement {
  const ref = useRef<HTMLDivElement | null>(null)
  const ready = useRef(onReady)
  ready.current = onReady
  useEffect(() => {
    const box = ref.current
    if (!box) return
    const pre = document.createElement('pre')
    const code = document.createElement('code')
    code.className = 'language-mermaid'
    code.textContent = source
    pre.append(code)
    box.replaceChildren(pre)
    let alive = true
    void renderMermaidIn(box, document.documentElement.dataset.theme === 'light' ? 'default' : 'dark').then(() => {
      if (alive) ready.current?.(box)
    })
    return () => {
      alive = false
    }
  }, [source])
  return <div ref={ref} className="x2m-specmap-diagram md-body full !max-w-none p-4" aria-label={label} role="group" />
}

const copyMermaid = async (src: string): Promise<void> => {
  const ok = await copyText(src)
  toast(ok ? tr('toast.copied', { label: tr('sm.copied') }) : tr('common.copyFailed'), ok ? 'ok' : 'err')
}

const issueText = (i: SpecIssue): string =>
  tr(`sm.issue.${i.code}`, { subject: i.subject, other: i.other ? `${i.other.rel}:${i.other.line}` : '' })

export function SpecMapPane({ root, onOpen, onClose }: Props): React.ReactElement {
  const t = useT()
  const [tab, setTab] = useState<Tab>('flow')
  const [index, setIndex] = useState<SpecIndex | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const req = useRef(0)

  const load = useCallback(async () => {
    const id = ++req.current
    setLoading(true)
    setError('')
    try {
      const data = await window.api.specIndex(root)
      if (id === req.current) setIndex(data)
    } catch (err) {
      // Có yêu cầu mới hơn: kết quả của nó sẽ tới
      if (id === req.current && errMsg(err) !== 'E_SPECMAP_STALE') setError(errMsg(err))
    } finally {
      if (id === req.current) setLoading(false)
    }
  }, [root])
  useEffect(() => {
    void load()
  }, [load])

  const flow = useMemo(() => (index ? transitionMermaid(index) : null), [index])
  const er = useMemo(() => (index ? erMermaid(index) : null), [index])
  const columns = useMemo(() => index?.tables.reduce((n, d) => n + d.columns.length, 0) ?? 0, [index])
  const errors = index?.issues.filter((i) => i.severity === 'error').length ?? 0
  const empty = !!index && index.screens.length === 0 && index.transitions.length === 0 && index.tables.length === 0

  /** Nút màn hình trong sơ đồ: bấm / Enter mở tài liệu định nghĩa 画面ID (Mermaid strict không cho click nên gắn tay). */
  const wireFlow = useCallback(
    (box: HTMLElement) => {
      if (!index || !flow) return
      box.querySelector('.mmd')?.removeAttribute('role')
      for (const g of Array.from(box.querySelectorAll<SVGGElement>('g.node'))) {
        const id = g.getAttribute('data-id') ?? /(?:^|-)(n\d+)(?:-\d+)?$/.exec(g.id)?.[1] ?? ''
        const screen = index.screens.find((s) => s.id === flow.ids[id])
        if (!screen) continue
        const label = screen.name ? `${screen.id} ${screen.name}` : screen.id
        g.setAttribute('tabindex', '0')
        g.setAttribute('role', 'button')
        g.setAttribute('aria-label', tr('sm.flow.open', { name: label }))
        g.classList.add('x2m-specmap-node', 'cursor-pointer')
        const open = (): void => onOpen(screen.rel, screen.heading, screen.id)
        g.addEventListener('click', open)
        g.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            open()
          }
        })
      }
    },
    [index, flow, onOpen]
  )

  /* 影響調査 */
  const [query, setQuery] = useState('')
  const [impact, setImpact] = useState<{ q: string; r: ImpactResult } | null>(null)
  const suggestions = useMemo(() => (index ? impactSuggestions(index) : []), [index])
  useEffect(() => setImpact((cur) => (cur && index ? { q: cur.q, r: impactOf(index, cur.q) } : null)), [index])
  const runImpact = (): void => {
    if (index && query.trim()) setImpact({ q: query.trim(), r: impactOf(index, query) })
  }

  const tabKeys = (e: React.KeyboardEvent): void => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!d) return
    const next = TABS[(TABS.indexOf(tab) + d + TABS.length) % TABS.length]
    setTab(next)
    ;(e.currentTarget.querySelector(`[data-tab="${next}"]`) as HTMLElement | null)?.focus()
  }

  const chip = 'rounded-md bg-soft px-1.5 py-0.5 text-dim'
  const locBtn =
    'x2m-specmap-hit flex w-full cursor-pointer items-baseline gap-2 rounded-md px-2 py-1 text-left text-[12px] text-dim outline-none hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent'

  return (
    <main className="x2m-main x2m-specmap flex min-w-0 flex-1 flex-col overflow-hidden bg-editor" aria-label={t('sm.button')}>
      <div className="x2m-specmap-bar flex flex-wrap items-center gap-2 border-b border-line-subtle px-3 py-1.5">
        <div className="x2m-tabs flex shrink-0 items-center gap-0.5 rounded-lg border border-line-subtle bg-canvas p-0.5" role="tablist" aria-label={t('sm.tabs')} onKeyDown={tabKeys}>
          {TABS.map((k) => (
            <button
              key={k}
              data-tab={k}
              role="tab"
              aria-selected={tab === k}
              tabIndex={tab === k ? 0 : -1}
              className={cn(
                'x2m-tab x2m-specmap-tab inline-flex items-center gap-1.5 rounded-md px-2.5 py-[3px] text-xs font-medium text-dim transition-colors duration-300 ease-spring hover:text-ink',
                tab === k && 'active seg-on'
              )}
              onClick={() => setTab(k)}
            >
              {t(`sm.tab.${k}`)}
            </button>
          ))}
        </div>
        {index && !empty && (
          <span className="x2m-specmap-chips flex flex-wrap items-center gap-1.5 text-[11.5px] font-medium tabular-nums">
            <span className={chip}>{t('sm.chip.screens', { n: index.screens.length })}</span>
            <span className={chip}>{t('sm.chip.transitions', { n: index.transitions.length })}</span>
            <span className={chip}>{t('sm.chip.tables', { n: index.tables.length })}</span>
            <span className={chip}>{t('sm.chip.columns', { n: columns })}</span>
            <span className={cn('rounded-md px-1.5 py-0.5', errors > 0 ? 'bg-danger-soft text-danger' : index.issues.length > 0 ? 'bg-warning-soft text-warning' : 'bg-success-soft text-success')}>
              {t('sm.chip.issues', { n: index.issues.length })}
            </span>
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          <button className={cx(btnGhost)} onClick={() => void load()} disabled={loading} title={t('sm.refresh')} aria-label={t('sm.refresh')}>
            <IconRefresh size={14} />
          </button>
          <button className={cx(btnGhost, 'x2m-specmap-close')} onClick={onClose} title={t('sm.close')} aria-label={t('sm.close')}>
            <IconX size={14} />
          </button>
        </span>
      </div>

      {index && (index.truncated.docs || index.truncated.refs) && (
        <p className="m-0 border-b border-line-subtle bg-warning-soft px-3 py-1 text-[11.5px] text-warning">
          {[index.truncated.docs && t('sm.truncated.docs', { n: index.docCount }), index.truncated.refs && t('sm.truncated.refs')].filter(Boolean).join(' ')}
        </p>
      )}

      <div className="x2m-specmap-body min-h-0 flex-1 overflow-auto" role="tabpanel" aria-label={t(`sm.tab.${tab}`)}>
        {error ? (
          <div className="x2m-error m-4 rounded-lg border border-danger/30 bg-danger-soft p-4 text-sm text-danger">{error}</div>
        ) : !index ? (
          <div className={cx('x2m-loading h-full', emptyBox)}>{t('sm.loading')}</div>
        ) : empty ? (
          <div className={cx('x2m-empty h-full', emptyBox)}>
            <IconMap size={36} />
            <p className={cx(emptyP, 'font-semibold !text-ink')}>{t('sm.empty.title')}</p>
            <p className={cx(emptyHint, 'max-w-[60ch] leading-relaxed')}>{t('sm.empty.desc')}</p>
          </div>
        ) : tab === 'flow' || tab === 'er' ? (
          (() => {
            const src = tab === 'flow' ? flow?.source ?? '' : er?.source ?? ''
            const has = tab === 'flow' ? index.transitions.length > 0 || index.screens.length > 0 : index.tables.length > 0
            if (!has) return <p className={cx(emptyP, 'p-6')}>{t(tab === 'flow' ? 'sm.flow.none' : 'sm.er.none')}</p>
            return (
              <>
                <div className="flex flex-wrap items-center gap-2 px-4 pt-3 text-[11.5px] text-faint">
                  {tab === 'flow' && <span>{t('sm.flow.hint')}</span>}
                  {(tab === 'flow' ? flow?.truncated : er?.truncated) && <span className="text-warning">{t('sm.truncated.diagram')}</span>}
                  <button className={cx(btnGhost, btnSm, 'ml-auto')} onClick={() => void copyMermaid(src)}>
                    {t('sm.copyMermaid')}
                  </button>
                </div>
                <MermaidBox key={tab} source={src} label={t(tab === 'flow' ? 'sm.flow.aria' : 'sm.er.aria')} onReady={tab === 'flow' ? wireFlow : undefined} />
              </>
            )
          })()
        ) : tab === 'impact' ? (
          <div className="x2m-specmap-impact flex flex-col gap-3 p-4">
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                runImpact()
              }}
            >
              <input
                className={cx('x2m-specmap-query max-w-[480px]', input)}
                list="x2m-specmap-suggest"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('sm.impact.placeholder')}
                aria-label={t('sm.impact.aria')}
                maxLength={200}
                autoFocus
              />
              <datalist id="x2m-specmap-suggest">
                {suggestions.map((s) => (
                  <option key={s.value} value={s.value} label={s.label || undefined} />
                ))}
              </datalist>
              <button type="submit" className={cx(btn, btnSm)} disabled={!query.trim()}>
                {t('sm.impact.run')}
              </button>
            </form>
            {!impact ? (
              <p className={cx(emptyHint, 'm-0 max-w-[70ch] leading-relaxed')}>{t('sm.impact.hint')}</p>
            ) : impact.r.kind === 'none' ? (
              <p className={cx(emptyP, 'm-0')} aria-live="polite">
                {t('sm.impact.none', { q: impact.q })}
              </p>
            ) : (
              <div className="flex flex-col gap-3" aria-live="polite">
                <p className="x2m-specmap-summary m-0 text-[12.5px] font-semibold text-ink">
                  {t('sm.impact.summary', {
                    kind: t(`sm.kind.${impact.r.kind as 'table' | 'column' | 'screen'}`),
                    targets: impact.r.targets.join(', '),
                    docs: impact.r.groups.length,
                    hits: impact.r.groups.reduce((n, g) => n + g.hits.length, 0),
                  })}
                </p>
                {impact.r.screens.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
                    {impact.r.screens.map((s) => {
                      const def = index.screens.find((x) => x.id === s.id)
                      return (
                        <button
                          key={s.id}
                          className={cn('glass-chip rounded-full px-2.5 py-1 hover:bg-hover', s.relation === 'direct' ? 'text-accent-ink' : 'text-dim')}
                          onClick={() => def && onOpen(def.rel, def.heading, def.id)}
                          title={t(s.relation === 'direct' ? 'sm.screens.direct' : 'sm.screens.related')}
                        >
                          {s.relation === 'direct' ? '● ' : '○ '}
                          {s.id} {s.name}
                        </button>
                      )
                    })}
                  </div>
                )}
                {impact.r.groups.map((g) => (
                  <section key={g.rel} className="x2m-specmap-group glass-chip rounded-xl p-2">
                    <h3 className="m-0 truncate px-2 pb-1 text-[12px] font-semibold text-ink" title={g.rel}>
                      {g.rel}
                    </h3>
                    {g.hits.map((h) => (
                      <button key={h.line} className={locBtn} onClick={() => onOpen(g.rel, h.heading, h.term)} title={t('sm.openAt', { rel: g.rel, line: h.line })}>
                        <span className="w-9 shrink-0 text-right tabular-nums text-faint">{h.line}</span>
                        <span className={cn('shrink-0 rounded px-1 text-[10.5px]', h.reason === 'definition' ? 'bg-accent-soft text-accent-ink' : h.reason === 'reference' ? 'bg-soft' : 'bg-warning-soft text-warning')}>
                          {t(`sm.reason.${h.reason}`)}
                        </span>
                        <span className="min-w-0 truncate">{h.snippet}</span>
                      </button>
                    ))}
                  </section>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="x2m-specmap-lint flex flex-col gap-1 p-4">
            {index.issues.length === 0 ? (
              <p className={cx(emptyP, 'm-0')}>{t('sm.lint.ok')}</p>
            ) : (
              [...index.issues]
                .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1))
                .map((i, k) => (
                  <button key={k} className={locBtn} onClick={() => onOpen(i.rel, i.heading, i.subject)} title={t('sm.openAt', { rel: i.rel, line: i.line })}>
                    <span className={cn('shrink-0 rounded px-1 text-[10.5px] font-semibold', i.severity === 'error' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning')}>
                      {t(i.severity === 'error' ? 'sm.lint.error' : 'sm.lint.warning')}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-ink">{issueText(i)}</span>
                    <span className="shrink-0 tabular-nums text-faint">
                      {i.rel}:{i.line}
                    </span>
                  </button>
                ))
            )}
          </div>
        )}
      </div>
    </main>
  )
}
