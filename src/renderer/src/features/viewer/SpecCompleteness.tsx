/* Tab Hoàn thiện (完成度) của Bản đồ thiết kế: % hoàn thiện cả thư mục, rồi từng màn hình / bảng theo tiêu chí,
 * yếu nhất trước. Bấm tên để mở đúng chỗ. Xuất TSV / Markdown để báo cáo tiến độ. */
import { useMemo } from 'react'
import { completenessOf, type Check } from '../../../../shared/completeness'
import type { SpecIndex } from '../../../../shared/specIndex'
import { tableText } from '../../../../shared/specIndex'
import { ExportBar } from '../../components/ExportBar'
import { useT } from '../../i18n'
import { cn } from '../../lib/utils'

const pct = (x: number): string => `${Math.round(x * 100)}%`
const mark = (c: Check): string => (c === null ? '–' : c ? '✓' : '✗')

function Cell({ c, n }: { c: Check; n?: number }): React.ReactElement {
  const t = useT()
  return (
    <td className={cn('border-b border-line-subtle px-2 py-1.5 text-center tabular-nums', c === null ? 'text-faint' : c ? 'text-success' : 'font-semibold text-danger')} aria-label={t(c === null ? 'sm.done.na' : c ? 'sm.done.ok' : 'sm.done.ng')}>
      {mark(c)}
      {!c && n ? <span className="ml-0.5 text-[10.5px]">{n}</span> : null}
    </td>
  )
}

function Bar({ value }: { value: number }): React.ReactElement {
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-hover" aria-hidden="true">
        <span className={cn('block h-full rounded-full', value === 1 ? 'bg-success' : value >= 0.5 ? 'bg-accent' : 'bg-danger')} style={{ width: pct(value) }} />
      </span>
      <span className="w-9 text-right tabular-nums text-dim">{pct(value)}</span>
    </span>
  )
}

export function SpecCompleteness({ index, onOpen }: { index: SpecIndex; onOpen: (rel: string, heading: string, term: string) => void }): React.ReactElement {
  const t = useT()
  const c = useMemo(() => completenessOf(index), [index])
  const sHead = [t('sm.done.screen'), t('sm.done.items'), t('sm.done.transitions'), t('sm.done.tables'), t('sm.done.crud'), t('sm.done.vague'), t('sm.done.issues'), t('sm.done.score')]
  const tHead = [t('sm.done.table'), t('sm.done.pk'), t('sm.done.types'), t('sm.done.used'), t('sm.done.score')]
  const rows = (): string[][] => [
    sHead,
    ...c.screens.map((s) => [`${s.id} ${s.name}`.trim(), mark(s.items), mark(s.transitions), mark(s.tables), mark(s.crud), mark(s.noVague) + (s.vague ? ` ${s.vague}` : ''), mark(s.noIssues) + (s.issues ? ` ${s.issues}` : ''), pct(s.score)]),
    [],
    tHead,
    ...c.tables.map((x) => [x.logical ? `${x.name} (${x.logical})` : x.name, mark(x.pk), mark(x.types), mark(x.used), pct(x.score)]),
  ]
  const th = 'sticky top-0 z-[1] border-b border-line bg-[var(--sheet)] px-2 py-1.5 font-semibold text-dim'
  const summary = t('sm.done.summary', { screens: c.doneScreens, screenTotal: c.screens.length, tables: c.doneTables, tableTotal: c.tables.length })

  return (
    <div className="x2m-specmap-done x2m-specmap-sheet flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        {/* Con số duy nhất được làm to: cả dự án đã xong bao nhiêu */}
        <p className="m-0 flex items-baseline gap-3">
          <span className="text-[40px] font-semibold leading-none tabular-nums tracking-[-0.02em] text-ink">{pct(c.overall)}</span>
          <span className="text-[13px] text-dim">{t('sm.done.overall')}</span>
        </p>
        <p className="m-0 pb-1 text-[12.5px] text-dim">{summary}</p>
        <ExportBar md={() => [`# ${t('sm.tab.done')}: ${pct(c.overall)}`, '', summary, '', tableText(rows().slice(0, c.screens.length + 1), 'md'), tableText(rows().slice(c.screens.length + 3), 'md')].join('\n')} tsv={() => rows().map((r) => r.join('\t')).join('\n') + '\n'} name="完成度" label={t('sm.tab.done')} />
      </div>
      <p className="m-0 max-w-[90ch] text-[11.5px] leading-relaxed text-faint">{t('sm.done.hint')}</p>

      {c.screens.length > 0 && (
        <div className="max-h-[52vh] overflow-auto rounded-md border border-line-subtle">
          <table className="w-full border-separate border-spacing-0 text-[12px]">
            <thead>
              <tr>
                {sHead.map((h, i) => (
                  <th key={h} scope="col" className={cn(th, i === 0 ? 'text-left' : 'text-center')}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {c.screens.map((s) => (
                <tr key={s.id}>
                  <td className="border-b border-line-subtle px-2 py-1.5">
                    <button className="text-left hover:text-accent-ink hover:underline" onClick={() => onOpen(s.rel, s.heading, s.id)} title={t('sm.openAt', { rel: s.rel, line: s.line })}>
                      <span className="text-faint">{s.id}</span> {s.name}
                    </button>
                  </td>
                  <Cell c={s.items} />
                  <Cell c={s.transitions} />
                  <Cell c={s.tables} />
                  <Cell c={s.crud} />
                  <Cell c={s.noVague} n={s.vague} />
                  <Cell c={s.noIssues} n={s.issues} />
                  <td className="border-b border-line-subtle px-2 py-1.5">
                    <Bar value={s.score} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {c.tables.length > 0 && (
        <div className="max-h-[36vh] overflow-auto rounded-md border border-line-subtle">
          <table className="w-full border-separate border-spacing-0 text-[12px]">
            <thead>
              <tr>
                {tHead.map((h, i) => (
                  <th key={h} scope="col" className={cn(th, i === 0 ? 'text-left' : 'text-center')}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {c.tables.map((x) => (
                <tr key={x.name}>
                  <td className="border-b border-line-subtle px-2 py-1.5">
                    <button className="text-left hover:text-accent-ink hover:underline" onClick={() => onOpen(x.rel, '', x.name)} title={t('sm.openAt', { rel: x.rel, line: x.line })}>
                      {x.name} {x.logical && <span className="text-faint">{x.logical}</span>}
                    </button>
                  </td>
                  <Cell c={x.pk} />
                  <Cell c={x.types} />
                  <Cell c={x.used} />
                  <td className="border-b border-line-subtle px-2 py-1.5">
                    <Bar value={x.score} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
