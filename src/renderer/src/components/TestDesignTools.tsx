/* Hộp thoại テスト観点表: sinh tại chỗ từ tài liệu đang xem (shared/testDesign.ts), xem trước, Copy TSV / Markdown, Lưu .md. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { buildTestDesign, TEST_LANGS, TEST_MAX_ROWS, testDesignHeader, testDesignMarkdown, testDesignTsv, type TestLang } from '../../../shared/testDesign'
import { guideFileStem } from '../../../shared/guideHtml'
import { errMsg } from '../lib/api'
import { toast } from '../lib/utils'
import { btnGhost, btnSm, cx, input } from '../lib/ui'
import { useT } from '../i18n'

/** Bảng xem trước chỉ render chừng này dòng (không ảo hóa); Copy / Lưu luôn đủ. */
const SHOW_MAX = 300
const LANG_LABEL: Record<TestLang, string> = { ja: '日本語', vi: 'Tiếng Việt', en: 'English' }
const COLS = ['no', 'screen', 'item', 'aspect', 'steps', 'expected', 'ref'] as const

/** Focus nút đóng khi mở mà không cuộn các khung cha. */
const focusNoScroll = (el: HTMLButtonElement | null): void => el?.focus({ preventScroll: true })

export function TestDesignDialog({ md, title, onClose, onCopy }: { md: string; title: string | null; onClose: () => void; onCopy: (text: string, label: string) => void }): React.ReactElement {
  const t = useT()
  const ref = useRef<HTMLDivElement | null>(null)
  const [lang, setLang] = useState<TestLang>('ja')
  const design = useMemo(() => buildTestDesign(md, { source: title ?? '', lang }), [md, title, lang])
  const shown = design.rows.slice(0, SHOW_MAX)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      // Giữ Tab trong hộp thoại (aria-modal)
      const box = ref.current
      if (e.key !== 'Tab' || !box) return
      const items = [...box.querySelectorAll<HTMLElement>('button:not([disabled]), select, [tabindex="0"]')]
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || !box.contains(document.activeElement))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (document.activeElement === last || !box.contains(document.activeElement))) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const save = async (): Promise<void> => {
    try {
      const stem = guideFileStem(title)
      const saved = await window.api.saveMarkdown(`${stem}_テスト仕様書`, testDesignMarkdown(design, lang, stem))
      if (saved) toast(t('tsd.saved', { path: saved }), 'ok')
    } catch (err) {
      toast(t('tsd.saveFailed', { err: errMsg(err) }), 'err')
    }
  }

  const empty = design.rows.length === 0
  return createPortal(
    <div
      className="x2m-testdesign-backdrop fixed inset-0 z-[90] flex items-start justify-center bg-black/40 pt-[6vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={t('tsd.heading', { n: design.rows.length })}
        className="x2m-testdesign glass flex max-h-[86vh] w-[min(1200px,94vw)] flex-col overflow-hidden rounded-xl border border-line bg-canvas text-ink shadow-lg"
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-line-subtle px-3 py-2 text-xs">
          <span className="font-semibold">{t('tsd.heading', { n: design.rows.length })}</span>
          <label className="flex items-center gap-1.5 text-dim">
            {t('tsd.lang')}
            <select className={cx(input, 'x2m-testdesign-lang !w-auto !py-1')} value={lang} onChange={(e) => setLang(e.target.value as TestLang)}>
              {TEST_LANGS.map((l) => (
                <option key={l} value={l}>
                  {LANG_LABEL[l]}
                </option>
              ))}
            </select>
          </label>
          <span className="ml-auto flex flex-wrap gap-1">
            <button className={cx('x2m-testdesign-tsv', btnGhost, btnSm)} disabled={empty} title={t('tsd.copyTsvTitle')} onClick={() => onCopy(testDesignTsv(design, lang), t('tsd.lblTsv'))}>
              {t('tsd.copyTsv')}
            </button>
            <button className={cx(btnGhost, btnSm)} disabled={empty} onClick={() => onCopy(testDesignMarkdown(design, lang), t('tsd.lblMd'))}>
              {t('tsd.copyMd')}
            </button>
            <button className={cx(btnGhost, btnSm)} disabled={empty} title={t('tsd.saveMdTitle')} onClick={() => void save()}>
              {t('tsd.saveMd')}
            </button>
          </span>
          <button className={cx(btnGhost, '!p-1')} onClick={onClose} title={t('tsd.close')} aria-label={t('tsd.close')} ref={focusNoScroll}>
            ✕
          </button>
        </div>
        {(design.truncated || design.rows.length > SHOW_MAX) && (
          <p className="m-0 border-b border-line-subtle px-3 py-1.5 text-xs text-dim">
            {design.rows.length > SHOW_MAX && t('tsd.capped', { shown: SHOW_MAX, n: design.rows.length })} {design.truncated && t('tsd.truncated', { max: TEST_MAX_ROWS })}
          </p>
        )}
        <div className="flex-1 overflow-auto" tabIndex={0}>
          {empty ? (
            <p className="m-0 p-4 text-sm text-dim">{t('tsd.empty')}</p>
          ) : (
            <table className="x2m-testdesign-table w-full border-collapse text-[12px] select-text">
              <thead className="sticky top-0 bg-raised">
                <tr>
                  {testDesignHeader(lang).map((h) => (
                    <th key={h} className="border-b border-line px-2 py-1 text-left font-semibold whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.no} className="align-top odd:bg-hover/40">
                    {COLS.map((c) => (
                      <td key={c} className={cx('border-b border-line-subtle px-2 py-1', (c === 'no' || c === 'ref') && 'whitespace-nowrap text-dim')}>
                        {r[c]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
