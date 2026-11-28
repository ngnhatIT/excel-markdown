/* Tab 質問票 của Bản đồ thiết kế: câu hỏi gửi khách sinh từ các chỗ thiết kế chưa rõ, chọn ngôn ngữ câu hỏi,
 * lọc chỉ câu hỏi đặc tả, copy TSV dán vào mẫu 質問票 của dự án. */
import { useMemo, useState } from 'react'
import { buildQaRows, QA_LANGS, qaCategoryLabel, qaLang, qaTable, type QaLang } from '../../../../shared/qaSheet'
import type { SpecIndex } from '../../../../shared/specIndex'
import { tableText } from '../../../../shared/specIndex'
import { ExportBar } from '../../components/ExportBar'
import { useT } from '../../i18n'
import { emptyHint } from '../../lib/ui'
import { cn } from '../../lib/utils'

const LANG_CHIP: Record<QaLang, string> = { ja: '日本語', vi: 'VI', en: 'EN' }

export function SpecQa({ index, onOpen }: { index: SpecIndex; onOpen: (rel: string, heading: string, term: string) => void }): React.ReactElement {
  const t = useT()
  const [lang, setLang] = useState<QaLang>(() => qaLang(index))
  const [specOnly, setSpecOnly] = useState(false)
  const all = useMemo(() => buildQaRows(index, lang), [index, lang])
  // Đánh số lại khi lọc để bảng dán vào Excel liền mạch
  const rows = useMemo(() => (specOnly ? all.filter((r) => r.category === 'spec') : all).map((r, k) => ({ ...r, no: k + 1 })), [all, specOnly])
  const table = useMemo(() => qaTable(rows, lang), [rows, lang])
  const spec = all.filter((r) => r.category === 'spec').length
  const th = 'sticky top-0 z-[1] border-b border-line bg-[var(--sheet)] px-2 py-1.5 text-left font-semibold text-dim'

  return (
    <div className="x2m-specmap-qa x2m-specmap-sheet flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="m-0 text-[12.5px] font-semibold text-ink">{t('sm.qa.summary', { n: all.length, spec, doc: all.length - spec })}</p>
        <span className="flex items-center gap-0.5 rounded-md border border-line bg-soft p-0.5" role="radiogroup" aria-label={t('sm.qa.lang')}>
          {QA_LANGS.map((l) => (
            <button key={l} role="radio" aria-checked={lang === l} lang={l} className={cn('rounded px-1.5 py-0.5 text-xs font-medium text-dim hover:text-ink', lang === l && 'seg-on')} onClick={() => setLang(l)}>
              {LANG_CHIP[l]}
            </button>
          ))}
        </span>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-dim">
          <input type="checkbox" className="size-3.5 accent-accent" checked={specOnly} onChange={(e) => setSpecOnly(e.target.checked)} />
          {t('sm.qa.specOnly')}
        </label>
        {rows.length > 0 && <ExportBar md={() => tableText(table, 'md')} tsv={() => tableText(table, 'tsv')} name="質問票" label={t('sm.tab.qa')} />}
      </div>
      <p className={cn(emptyHint, 'm-0 max-w-[90ch] leading-relaxed')}>{t('sm.qa.hint')}</p>
      {rows.length === 0 ? (
        <p className="m-0 text-[13px] text-dim">{t('sm.qa.none')}</p>
      ) : (
        <div className="max-h-[65vh] overflow-auto rounded-md border border-line-subtle">
          {/* table-fixed + cột phụ cố định: cột Câu hỏi luôn nhận phần rộng còn lại, kể cả khi cửa sổ hẹp */}
          <table className="w-full table-fixed border-separate border-spacing-0 text-[12px]">
            <colgroup>
              <col className="w-[3em]" />
              <col className="w-[7.5em]" />
              <col className="w-[7em]" />
              <col className="w-[8em]" />
              <col className="w-[11em]" />
              <col />
            </colgroup>
            <thead>
              <tr>
                {table[0].slice(0, 6).map((h) => (
                  <th key={h} scope="col" className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.kind}|${r.rel}|${r.line}|${r.no}`} className="align-top">
                  <td className="border-b border-line-subtle px-2 py-1.5 tabular-nums text-faint">{r.no}</td>
                  <td className="border-b border-line-subtle px-2 py-1.5">
                    <span className={cn('whitespace-nowrap rounded px-1.5 py-px text-xs font-semibold', r.category === 'spec' ? 'bg-accent-soft text-accent-ink' : 'bg-warning-soft text-warning')}>
                      {qaCategoryLabel(r.category, lang)}
                    </span>
                  </td>
                  <td className="border-b border-line-subtle px-2 py-1.5 text-ink [overflow-wrap:anywhere]">{r.screenId}</td>
                  <td className="border-b border-line-subtle px-2 py-1.5 text-dim [overflow-wrap:anywhere]">{r.screenName}</td>
                  <td className="border-b border-line-subtle px-2 py-1.5">
                    <button className="text-left tabular-nums text-accent-ink hover:underline [overflow-wrap:anywhere]" onClick={() => onOpen(r.rel, r.heading, r.term)} title={t('sm.openAt', { rel: r.rel, line: r.line })}>
                      {r.rel}:{r.line}
                    </button>
                  </td>
                  <td className="border-b border-line-subtle px-2 py-1.5 text-ink select-text" lang={lang}>
                    {r.question}
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
