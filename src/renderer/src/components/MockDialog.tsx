/* Mock màn hình từ 項目定義: xem từng màn hình ngay trong app (bấm nút / link 遷移 để chuyển màn hình) và lưu một
 * file HTML đứng riêng để gửi khách. HTML do shared/mockScreen sinh, mọi chữ của tài liệu đã được escape. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { mockLang, mockPageHtml, mockScreenHtml, type MockScreen } from '../../../shared/mockScreen'
import { guideFileStem } from '../../../shared/guideHtml'
import { useT } from '../i18n'
import { errMsg } from '../lib/api'
import { useFocusTrap } from '../lib/focusTrap'
import { btnGhost, btnPrimary, btnSm, cx } from '../lib/ui'
import { cn, toast } from '../lib/utils'

/** `screens`: mock của một tài liệu (bản xem) hoặc cả thư mục (Bản đồ thiết kế). */
export function MockDialog({ screens, title, onClose }: { screens: MockScreen[]; title: string | null; onClose: () => void }): React.ReactElement {
  const t = useT()
  const ref = useRef<HTMLDivElement | null>(null)
  useFocusTrap(ref)
  const [sel, setSel] = useState(0)
  const current = screens[sel]
  const lang = useMemo(() => mockLang(screens), [screens])
  const html = useMemo(() => (current ? mockScreenHtml(current, sel, lang) : ''), [current, sel, lang])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const save = async (): Promise<void> => {
    try {
      const name = `${guideFileStem(title)}_画面モック`
      const saved = await window.api.saveHtml(name, mockPageHtml(screens, guideFileStem(title)))
      if (saved) toast(t('mock.saved', { path: saved }), 'ok')
    } catch (err) {
      toast(t('mock.saveFailed', { err: errMsg(err) }), 'err')
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/40 pt-[4vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={t('mock.title')} className="x2m-mock-dialog x2m-er-dialog flex h-[90vh] w-[min(1240px,96vw)] flex-col overflow-hidden rounded-lg text-ink">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
          <h2 className="m-0 text-[14px] font-semibold">{t('mock.title')}</h2>
          <span className="text-[11.5px] text-faint">{t('mock.summary', { n: screens.length })}</span>
          <span className="ml-auto flex items-center gap-1.5">
            <button className={cx('x2m-mock-save', btnPrimary, btnSm)} disabled={screens.length === 0} onClick={() => void save()} title={t('mock.saveTitle')}>
              {t('mock.save')}
            </button>
            <button className={cx(btnGhost, '!p-1')} onClick={onClose} title={t('tr.close')} aria-label={t('tr.close')}>
              ✕
            </button>
          </span>
        </div>
        <p className="m-0 border-b border-line-subtle px-4 py-1.5 text-[11.5px] text-dim">{t('mock.note')}</p>
        <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)]">
          <nav className="min-h-0 overflow-y-auto border-r border-line p-2" aria-label={t('mock.screens')}>
            {screens.map((s, i) => (
              <button
                key={s.id}
                className={cn('block w-full truncate rounded-md px-2 py-1.5 text-left text-[12.5px] text-dim hover:bg-hover hover:text-ink', i === sel && 'bg-accent-soft font-semibold !text-accent-ink')}
                onClick={() => setSel(i)}
                aria-current={i === sel}
                title={`${s.id} ${s.name}`}
              >
                <span className="text-faint">{s.id}</span> {s.name}
              </button>
            ))}
          </nav>
          <div
            className="x2m-mock min-h-0 overflow-auto bg-[#e9edf1] p-6"
            lang={lang}
            tabIndex={0}
            // Link 遷移 / nút có data-goto: chuyển màn hình trong hộp thoại, không điều hướng trang của app
            onClick={(e) => {
              const a = (e.target as HTMLElement).closest('[data-goto]')
              if (!a) return
              e.preventDefault()
              setSel(Number(a.getAttribute('data-goto')))
            }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
    </div>,
    document.body
  )
}
