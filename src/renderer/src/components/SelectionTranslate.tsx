/* Dịch nhanh đoạn bôi đen (Selection Translation): chọn chữ trong `containerRef` -> nút 「Dịch」 cạnh vùng chọn
 * -> popup bản dịch. Chỉ gửi đi khi người dùng bấm (hoặc Ctrl+Shift+T), qua nhà cung cấp AI đã cấu hình. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { MAX_TRANSLATE_CHARS, resolveTarget, TRANSLATE_LANGS, type TranslateLang } from '../../../shared/translate'
import { useLang, useT } from '../i18n'
import { errMsg } from '../lib/api'
import { cn, copyText, toast } from '../lib/utils'
import { btnGhost, btnSm, cx } from '../lib/ui'
import { IconCopy, IconX } from './icons'

interface Anchor {
  text: string
  /** Toạ độ viewport của mép dưới-phải vùng chọn */
  x: number
  y: number
}

const POPUP_W = 380

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
  const [state, setState] = useState<{ loading: boolean; text: string; error: string }>({ loading: false, text: '', error: '' })
  const seq = useRef(0)
  const popupRef = useRef<HTMLDivElement | null>(null)

  const run = useCallback(
    async (text: string, to: TranslateLang) => {
      const s = ++seq.current
      if (text.length > MAX_TRANSLATE_CHARS) {
        setState({ loading: false, text: '', error: t('tr.tooLong', { n: MAX_TRANSLATE_CHARS }) })
        return
      }
      setState({ loading: true, text: '', error: '' })
      try {
        const out = await window.api.aiTranslate(text, to)
        if (s === seq.current) setState({ loading: false, text: out, error: '' })
      } catch (err) {
        const msg = errMsg(err)
        if (s === seq.current) setState({ loading: false, text: '', error: msg === 'NO_KEY' ? t('tr.noKey') : msg })
      }
    },
    [t]
  )

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
    ++seq.current
    setOpen(false)
    setAnchor(null)
  }, [])

  // Nhả chuột / phím Shift sau khi bôi đen -> hiện nút 「Dịch」 (chưa gửi gì)
  useEffect(() => {
    const onUp = (e: Event): void => {
      if (popupRef.current?.contains(e.target as Node)) return
      requestAnimationFrame(() => {
        if (open) return
        setAnchor(selectionIn(containerRef.current))
      })
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && (open || anchor)) {
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

  if (!open) {
    return (
      <button
        className="x2m-tr-btn fixed z-50 flex items-center gap-1 rounded-lg border border-accent-line bg-raised px-2 py-1 text-xs font-semibold text-accent-ink shadow-pop backdrop-blur-xl transition-transform duration-200 ease-spring hover:-translate-y-px active:scale-[0.97]"
        style={{ left, top: below }}
        onMouseDown={(e) => e.preventDefault()} // giữ nguyên vùng chọn khi bấm
        onClick={() => openPopup(anchor)}
        title={t('tr.buttonTitle')}
      >
        <span aria-hidden="true">訳</span> {t('tr.button')}
      </button>
    )
  }

  return (
    <div
      ref={popupRef}
      role="dialog"
      aria-label={t('tr.title')}
      className="x2m-tr-popup glass fixed z-50 flex max-h-[min(420px,70vh)] flex-col rounded-xl text-ink"
      style={{ left, top, width: POPUP_W }}
    >
      <div className="flex items-center gap-2 border-b border-line-subtle px-3 py-2">
        <span className="text-xs font-semibold">{t('tr.title')}</span>
        <span className="ml-auto flex items-center gap-0.5 rounded-md border border-line bg-soft p-0.5" role="radiogroup" aria-label={t('tr.to')}>
          {TRANSLATE_LANGS.map((l) => (
            <button
              key={l}
              role="radio"
              aria-checked={target === l}
              className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium text-dim hover:text-ink', target === l && 'seg-on')}
              onClick={() => {
                setTarget(l)
                void run(anchor.text, l)
              }}
            >
              {l === 'ja' ? '日本語' : l.toUpperCase()}
            </button>
          ))}
        </span>
        <button className={cx(btnGhost, '!p-1')} onClick={close} title={t('tr.close')} aria-label={t('tr.close')}>
          <IconX size={13} />
        </button>
      </div>
      <p className="m-0 line-clamp-2 border-b border-line-subtle px-3 py-1.5 text-[11.5px] text-faint" title={anchor.text}>
        {anchor.text}
      </p>
      <div className="min-h-[64px] flex-1 overflow-y-auto px-3 py-2 text-[13px] leading-relaxed" aria-live="polite">
        {state.loading ? (
          <div className="flex flex-col gap-1.5" aria-label={t('tr.loading')}>
            <div className="h-3 w-11/12 animate-pulse rounded bg-hover" />
            <div className="h-3 w-4/5 animate-pulse rounded bg-hover" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-hover" />
          </div>
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
      <div className="flex items-center gap-2 border-t border-line-subtle px-3 py-1.5">
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
    </div>
  )
}
