/* Tab Dịch ở cột phải (Đọc Markdown): các bản dịch trong phiên, mới nhất trước. Bản dịch mục / bảng mở lại
 * trong hộp hai cột mà không gọi AI lần nữa. */
import { useState } from 'react'
import { useT } from '../i18n'
import { clearTranslations, useTranslations, type TranslateEntry } from '../lib/translateHistory'
import { btnGhost, btnSm, cx, emptyHint } from '../lib/ui'
import { copyText, toast } from '../lib/utils'
import { IconCopy } from './icons'
import { Direction, TermsUsed, TranslateDialog } from './TranslateDialog'

export function TranslateHistory(): React.ReactElement {
  const t = useT()
  const entries = useTranslations()
  const [open, setOpen] = useState<TranslateEntry | null>(null)
  return (
    <div className="x2m-tr-history flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-line-subtle px-3 py-2 text-[11px] text-faint">
        <span>{t('tr.historyNote')}</span>
        {entries.length > 0 && (
          <button className={cx(btnGhost, btnSm, 'ml-auto')} onClick={clearTranslations}>
            {t('tr.historyClear')}
          </button>
        )}
      </div>
      {entries.length === 0 ? (
        <p className={cx(emptyHint, 'm-0 px-4 py-8 leading-relaxed')}>{t('tr.historyEmpty')}</p>
      ) : (
        <ol className="m-0 flex min-h-0 flex-1 list-none flex-col gap-2 overflow-y-auto p-3">
          {entries.map((e) => (
            <li key={e.id} className="rounded-md border border-line bg-[var(--sheet)]">
              <div className="flex items-center gap-2 border-b border-line-subtle px-2.5 py-1.5">
                <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-ink" title={e.label || e.source}>
                  {e.label || e.source}
                </span>
                <Direction source={e.source} to={e.to} />
              </div>
              <div className="px-2.5 py-2 text-[12.5px] leading-relaxed">
                <p className="m-0 line-clamp-6 whitespace-pre-wrap select-text text-ink">{e.text}</p>
                <div className="mt-1.5">
                  <TermsUsed terms={e.terms} />
                </div>
              </div>
              <div className="flex items-center gap-1 border-t border-line-subtle px-1.5 py-1">
                <span className="px-1 text-[10.5px] tabular-nums text-faint">{new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                {e.kind === 'section' && (
                  <button className={cx(btnGhost, btnSm, 'ml-auto')} onClick={() => setOpen(e)}>
                    {t('tr.open')}
                  </button>
                )}
                <button
                  className={cx(btnGhost, btnSm, e.kind !== 'section' && 'ml-auto')}
                  onClick={async () => {
                    if (await copyText(e.text)) toast(t('tr.copied'))
                  }}
                >
                  <IconCopy size={13} /> {t('tr.copy')}
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
      {open && <TranslateDialog source={open.source} label={open.label} initial={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
