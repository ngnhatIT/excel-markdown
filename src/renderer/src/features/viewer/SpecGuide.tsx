/* Tab "Cách viết tài liệu" của Bản đồ thiết kế: thư mục đang mở đã có gì / còn thiếu gì để bản đồ hiện ra,
 * mỗi thứ kèm cách viết; mức nhận diện từng file; tài liệu mẫu để copy / lưu. */
import { SPEC_SAMPLE, specCoverage } from '../../../../shared/specGuide'
import type { SpecIndex } from '../../../../shared/specIndex'
import { useT } from '../../i18n'
import { errMsg } from '../../lib/api'
import { btnGhost, btnSm, cx } from '../../lib/ui'
import { cn, copyText, toast } from '../../lib/utils'

type Need = 'screen' | 'transition' | 'table' | 'ref' | 'glossary'

const EXAMPLE: Record<Need, string> = {
  screen: '## 顧客検索\n\n- **画面ID**: SCR010\n- **画面名**: 顧客検索画面',
  transition: '- **画面遷移**: メニュー → 顧客検索 → 顧客詳細\n- 〔矢印〕顧客検索 SCR010 → 顧客詳細 SCR011（行ダブルクリック）',
  table: '## TBL_CUSTOMER\n\n- **テーブルID**: TBL_CUSTOMER\n- **テーブル名**: 顧客マスタ\n\n| 論理名 | 物理名 | 型 | 桁数 | PK |\n|---|---|---|---|---|\n| 顧客コード | CUST_CD | VARCHAR | 10 | ○ |',
  ref: '- 検索: TBL_CUSTOMER.CUST_CD で前方一致検索し、一覧に表示する。\n- 「削除」押下: TBL_CUSTOMER を論理削除する。',
  glossary: '<!-- 用語集.md（thư mục gốc） -->\n| 日本語 | Tiếng Việt | English | 備考 |\n|---|---|---|---|\n| 顧客 | khách hàng | customer | |',
}

export function SpecGuide({ index, onOpen }: { index: SpecIndex; onOpen: (rel: string) => void }): React.ReactElement {
  const t = useT()
  const count: Record<Need, number> = {
    screen: index.screens.length,
    transition: index.transitions.length,
    table: index.tables.length,
    ref: index.refs.length,
    glossary: index.glossary?.entries.length ?? 0,
  }
  const coverage = specCoverage(index)
  const save = async (): Promise<void> => {
    try {
      const saved = await window.api.saveMarkdown('x2m-sample-spec', SPEC_SAMPLE)
      if (saved) toast(t('sm.export.saved', { path: saved }), 'ok')
    } catch (err) {
      toast(t('sm.export.saveFailed', { err: errMsg(err) }), 'err')
    }
  }
  const th = 'sticky top-0 border-b border-line bg-[var(--sheet)] px-2 py-1 text-left font-semibold text-dim'

  return (
    <div className="x2m-specmap-guide x2m-specmap-sheet flex flex-col gap-5 p-5 text-[12.5px] leading-relaxed">
      <p className="m-0 max-w-[80ch] text-dim">{t('sm.guide.intro')}</p>

      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {(Object.keys(EXAMPLE) as Need[]).map((k) => {
          const ok = count[k] > 0
          return (
            <li key={k} className="grid gap-x-4 gap-y-1.5 rounded-md border border-line-subtle p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className={cn('shrink-0 rounded px-1.5 py-px text-xs font-semibold tabular-nums', ok ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning')}>
                    {ok ? t('sm.guide.found', { n: count[k] }) : t('sm.guide.missing')}
                  </span>
                  <h3 className="m-0 text-[13px] font-semibold text-ink">{t(`sm.guide.${k}.title`)}</h3>
                </div>
                <p className="m-0 text-dim">{t(`sm.guide.${k}.how`)}</p>
                <p className="m-0 text-xs text-faint">{t(`sm.guide.${k}.use`)}</p>
              </div>
              <pre className="m-0 min-w-0 overflow-x-auto rounded border border-line-subtle bg-code px-3 py-2 font-mono text-xs leading-relaxed text-ink select-text">{EXAMPLE[k]}</pre>
            </li>
          )
        })}
      </ol>
      <p className="m-0 max-w-[80ch] text-dim">{t('sm.guide.excel')}</p>

      <section className="flex flex-col gap-2">
        <h3 className="m-0 text-[13px] font-semibold text-ink">{t('sm.guide.files')}</h3>
        <p className="m-0 text-xs text-faint">{t('sm.guide.filesHint')}</p>
        <div className="max-h-[320px] overflow-auto rounded-md border border-line-subtle">
          <table className="w-full border-separate border-spacing-0 text-[12px] tabular-nums">
            <thead>
              <tr>
                <th className={th}>{t('sm.guide.col.file')}</th>
                <th className={cx(th, 'text-right')}>{t('sm.guide.col.screens')}</th>
                <th className={cx(th, 'text-right')}>{t('sm.guide.col.transitions')}</th>
                <th className={cx(th, 'text-right')}>{t('sm.guide.col.tables')}</th>
                <th className={cx(th, 'text-right')}>{t('sm.guide.col.refs')}</th>
              </tr>
            </thead>
            <tbody>
              {coverage.slice(0, 500).map((c) => {
                const none = c.screens + c.transitions + c.tables + c.refs === 0
                return (
                  <tr key={c.rel} className={cn(none && 'text-faint')}>
                    <td className="border-b border-line-subtle px-2 py-1">
                      <button className="max-w-full truncate text-left hover:text-accent-ink hover:underline" onClick={() => onOpen(c.rel)} title={c.rel}>
                        {c.rel}
                      </button>
                      {none && <span className="ml-2 text-xs text-warning">{t('sm.guide.nothing')}</span>}
                    </td>
                    {[c.screens, c.transitions, c.tables, c.refs].map((n, i) => (
                      <td key={i} className="border-b border-line-subtle px-2 py-1 text-right">
                        {n || '–'}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="m-0 text-[13px] font-semibold text-ink">{t('sm.guide.sample')}</h3>
          <span className="ml-auto flex items-center gap-1">
            <button
              className={cx(btnGhost, btnSm)}
              onClick={async () => {
                if (await copyText(SPEC_SAMPLE)) toast(t('toast.copied', { label: t('sm.guide.sample') }), 'ok')
              }}
            >
              {t('sm.guide.copy')}
            </button>
            <button className={cx(btnGhost, btnSm)} onClick={() => void save()}>
              {t('sm.guide.save')}
            </button>
          </span>
        </div>
        <p className="m-0 text-xs text-faint">{t('sm.guide.sampleHint')}</p>
        <details>
          <summary className="cursor-pointer select-none text-dim hover:text-ink">{t('sm.guide.preview')}</summary>
          <pre className="mt-2 max-h-[360px] overflow-auto rounded border border-line-subtle bg-code px-3 py-2 font-mono text-xs leading-relaxed text-ink select-text">{SPEC_SAMPLE}</pre>
        </details>
      </section>
    </div>
  )
}
