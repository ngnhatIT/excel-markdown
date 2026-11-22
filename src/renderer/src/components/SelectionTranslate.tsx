/* Dịch nhanh đoạn bôi đen (Selection Translation): chọn chữ trong `containerRef` -> nút 「Dịch」 cạnh vùng chọn
 * -> popup bản dịch. Chỉ gửi đi khi người dùng bấm (hoặc Ctrl+Shift+T), qua nhà cung cấp AI đã cấu hình. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { resolveTarget, type TranslateLang } from '../../../shared/translate'
import { useLang, useT } from '../i18n'
import { copyText, toast } from '../lib/utils'
import { btnGhost, btnSm, cx } from '../lib/ui'
import { IconCopy, IconTranslate, IconX } from './icons'
import { Direction, Skeleton, TargetPicker, TermsUsed, useTranslate } from './TranslateDialog'

interface Anchor {
  text: string
  /** Toạ độ viewport của mép dưới-phải vùng chọn */
  x: number
  y: number
}

const POPUP_W = 420

/** Đoạn chọn hiện tại nếu nằm trong `root` (bỏ chọn trong ô nhập liệu). */
function selectionIn(root: HTMLElement | null): Anchor | null {
  const sel = window.getSelection()
  if (!root || !sel || sel.isCollapsed || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  if (!root.contains(range.commonAncestorContainer)) return null
  const text = sel.toString().trim()
  if (!text) return null
  const rects = range.getClientRects()
  const r = rects[rects.length - 1] ?? range.getBoundingClientRect()
  return { text, x: r.right, y: r.bottom }
}

export function SelectionTranslate({ containerRef }: { containerRef: React.RefObject<HTMLElement | null> }): React.ReactElement | null {
  const t = useT()
  const uiLang = useLang()
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<TranslateLang>(uiLang)
  const { state, run, cancel } = useTranslate('selection', '')
  const popupRef = useRef<HTMLDivElement | null>(null)

  const openPopup = useCallback(
    (a: Anchor) => {
      const to = resolveTarget(a.text, uiLang)
      setAnchor(a)
      setTarget(to)
      setOpen(true)
      void run(a.text, to)
    },
    [uiLang, run]
  )

  const close = useCallback(() => {
    cancel()
    setOpen(false)
    setAnchor(null)
  }, [cancel])

  // Nhả chuột / phím Shift sau khi bôi đen -> hiện nút 「Dịch」 (chưa gửi gì)
  useEffect(() => {
    const onUp = (e: Event): void => {
      if (popupRef.current?.contains(e.target as Node)) return
      // Chờ trình duyệt chốt vùng chọn. setTimeout thay vì requestAnimationFrame: rAF bị dừng khi cửa sổ bị che / chạy nền
      setTimeout(() => {
        if (open) return
        setAnchor(selectionIn(containerRef.current))
      }, 0)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && (open || anchor)) {
        // Popup đang mở: Esc chỉ đóng popup, không tới phím tắt chung (xóa ô lọc / kết quả) gắn ở window
        if (open) e.stopPropagation()
        close()
        return
      }
      if (e.ctrlKey && e.shiftKey && (e.key === 'T' || e.key === 't')) {
        const a = selectionIn(containerRef.current)
        if (a) {
          e.preventDefault()
          openPopup(a)
        }
      }
    }
    document.addEventListener('mouseup', onUp)
    document.addEventListener('keyup', onUp)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mouseup', onUp)
      document.removeEventListener('keyup', onUp)
      document.removeEventListener('keydown', onKey)
    }
  }, [containerRef, open, anchor, close, openPopup])

  // Cuộn khung xem thì vị trí cũ sai: ẩn nút (popup đang mở thì giữ)
  useEffect(() => {
    const el = containerRef.current
    if (!el || open) return
    const hide = (): void => setAnchor(null)
    el.addEventListener('scroll', hide, true)
    return () => el.removeEventListener('scroll', hide, true)
  }, [containerRef, open])

  if (!anchor) return null
  const left = Math.max(8, Math.min(anchor.x - (open ? POPUP_W : 0), window.innerWidth - (open ? POPUP_W : 80) - 8))
  const below = anchor.y + 8
  const top = open && below + 260 > window.innerHeight ? Math.max(8, anchor.y - 280) : below

  // Render ra document.body: khung cha có transform / filter sẽ giam `position: fixed` và cắt popup
  if (!open) {
    return createPortal(
      <button
        className="x2m-tr-btn fixed z-50 flex items-center gap-1 rounded-md border border-accent-line bg-[var(--sheet)] px-2 py-1 text-xs font-semibold text-accent-ink shadow-pop transition-transform duration-200 ease-spring hover:-translate-y-px active:scale-[0.97]"
        style={{ left, top: below }}
        onMouseDown={(e) => e.preventDefault()} // giữ nguyên vùng chọn khi bấm
        onClick={() => openPopup(anchor)}
        title={t('tr.buttonTitle')}
      >
        <span aria-hidden="true">訳</span> {t('tr.button')}
      </button>,
      document.body
    )
  }

  return createPortal(
    <div
      ref={popupRef}
      role="dialog"
      aria-label={t('tr.title')}
      className="x2m-tr-popup fixed z-50 flex max-h-[min(460px,72vh)] flex-col overflow-hidden rounded-lg text-ink"
      style={{ left, top, width: POPUP_W }}
    >
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <IconTranslate size={15} />
        <Direction source={anchor.text} to={target} />
        <span className="ml-auto">
          <TargetPicker
            value={target}
            onChange={(l) => {
              setTarget(l)
              void run(anchor.text, l)
            }}
          />
        </span>
        <button className={cx(btnGhost, '!p-1')} onClick={close} title={t('tr.close')} aria-label={t('tr.close')}>
          <IconX size={13} />
        </button>
      </div>
      <p className="m-0 line-clamp-2 border-b border-line-subtle bg-soft px-3 py-1.5 text-[11.5px] text-faint" title={anchor.text}>
        {anchor.text}
      </p>
      <div className="min-h-[64px] flex-1 overflow-y-auto px-3 py-2.5 text-[13.5px] leading-relaxed" aria-live="polite">
        {state.loading ? (
          <Skeleton label={t('tr.loading')} />
        ) : state.error ? (
          <div className="flex flex-col items-start gap-2 text-xs text-danger">
            <span>{state.error}</span>
            {state.error !== t('tr.noKey') && (
              <button className={cx(btnGhost, btnSm)} onClick={() => void run(anchor.text, target)}>
                {t('tr.retry')}
              </button>
            )}
          </div>
        ) : (
          <div className="whitespace-pre-wrap select-text">{state.text}</div>
        )}
      </div>
      {state.terms.length > 0 && (
        <div className="border-t border-line-subtle px-3 py-1.5">
          <TermsUsed terms={state.terms} />
        </div>
      )}
      <div className="flex items-center gap-2 border-t border-line px-3 py-1.5">
        <span className="text-[10.5px] text-faint">{t('tr.privacy')}</span>
        <button
          className={cx(btnGhost, btnSm, 'ml-auto')}
          disabled={!state.text}
          onClick={async () => {
            const ok = await copyText(state.text)
            if (ok) toast(t('tr.copied'))
          }}
        >
          <IconCopy size={13} /> {t('tr.copy')}
        </button>
      </div>
    </div>,
    document.body
  )
}
