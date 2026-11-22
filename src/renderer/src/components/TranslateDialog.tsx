/* Dịch một mục / một bảng của tài liệu (giữ nguyên cấu trúc Markdown, kể cả bảng): hộp hai cột Bản gốc | Bản dịch.
 * Hook useTranslate dùng chung với popup Dịch nhanh: gọi IPC, bỏ kết quả muộn, ghi lịch sử. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { marked } from 'marked'
import type { GlossaryEntry } from '../../../shared/glossary'
import { detectTextLang, MAX_TRANSLATE_CHARS, resolveTarget, TRANSLATE_LANGS, type TranslateLang } from '../../../shared/translate'
import { guideFileStem } from '../../../shared/guideHtml'
import { useLang, useT } from '../i18n'
import { errMsg } from '../lib/api'
import { useFocusTrap } from '../lib/focusTrap'
import { sanitizeHtml } from '../lib/sanitize'
import { addTranslation } from '../lib/translateHistory'
import { btnGhost, btnSm, cx } from '../lib/ui'
import { cn, copyText, toast } from '../lib/utils'
import { IconCopy, IconTranslate, IconX } from './icons'

export interface TranslateState {
  loading: boolean
  text: string
  terms: GlossaryEntry[]
  error: string
}

const IDLE: TranslateState = { loading: false, text: '', terms: [], error: '' }

/** Gọi dịch + ghi lịch sử. Gọi lại khi đang chạy thì kết quả cũ bị bỏ (main cũng hủy yêu cầu cũ). */
export function useTranslate(kind: 'selection' | 'section', label: string): { state: TranslateState; run: (text: string, to: TranslateLang) => Promise<void>; cancel: () => void } {
  const t = useT()
  const [state, setState] = useState<TranslateState>(IDLE)
  const seq = useRef(0)
  const run = useCallback(
    async (text: string, to: TranslateLang) => {
      const s = ++seq.current
      if (text.length > MAX_TRANSLATE_CHARS) {
        setState({ ...IDLE, error: t('tr.tooLong', { n: MAX_TRANSLATE_CHARS.toLocaleString() }) })
        return
      }
      setState({ ...IDLE, loading: true })
      try {
        const out = await window.api.aiTranslate(text, to)
        if (s !== seq.current) return
        setState({ loading: false, text: out.text, terms: out.terms, error: '' })
        addTranslation({ kind, label, source: text, from: detectTextLang(text), to, text: out.text, terms: out.terms })
      } catch (err) {
        const msg = errMsg(err)
        if (s === seq.current) setState({ ...IDLE, error: msg === 'NO_KEY' ? t('tr.noKey') : msg })
      }
    },
    [t, kind, label]
  )
  const cancel = useCallback(() => {
    ++seq.current
  }, [])
  return { state, run, cancel }
}

/** Nhãn ngôn ngữ trên nút chọn đích (giữ nguyên ở mọi ngôn ngữ giao diện). */
export const LANG_CHIP: Record<TranslateLang, string> = { vi: 'VI', en: 'EN', ja: '日本語' }

/** Chọn ngôn ngữ đích (radiogroup). */
export function TargetPicker({ value, onChange }: { value: TranslateLang; onChange: (l: TranslateLang) => void }): React.ReactElement {
  const t = useT()
  return (
    <span className="flex items-center gap-0.5 rounded-md border border-line bg-soft p-0.5" role="radiogroup" aria-label={t('tr.to')}>
      {TRANSLATE_LANGS.map((l) => (
        <button
          key={l}
          role="radio"
          aria-checked={value === l}
          className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium text-dim hover:text-ink', value === l && 'seg-on')}
          onClick={() => onChange(l)}
          lang={l}
        >
          {LANG_CHIP[l]}
        </button>
      ))}
    </span>
  )
}

/** `Tiếng Nhật → Tiếng Việt` */
export function Direction({ source, to }: { source: string; to: TranslateLang }): React.ReactElement {
  const t = useT()
  return <span className="text-[11.5px] text-dim">{t('tr.direction', { from: t(`tr.lang.${detectTextLang(source)}`), to: t(`tr.lang.${to}`) })}</span>
}

/** Thuật ngữ 用語集 mà bản dịch đã theo. */
export function TermsUsed({ terms }: { terms: GlossaryEntry[] }): React.ReactElement | null {
  const t = useT()
  if (terms.length === 0) return null
  return (
    <p className="m-0 flex flex-wrap items-center gap-1 text-[11px] text-faint">
      <span>{t('tr.terms')}</span>
      {terms.slice(0, 12).map((e, i) => (
        <span key={i} className="rounded border border-line-subtle bg-soft px-1.5 py-px text-dim">
          {[e.ja, e.vi || e.en].filter(Boolean).join(' = ')}
        </span>
      ))}
      {terms.length > 12 && <span>+{terms.length - 12}</span>}
    </p>
  )
}

export const MdHtml = ({ md, className }: { md: string; className?: string }): React.ReactElement => (
  <div className={cn('md-body !max-w-none select-text', className)} dangerouslySetInnerHTML={{ __html: sanitizeHtml(marked.parse(md, { breaks: false }) as string) }} />
)

/** Skeleton vài dòng khi đang dịch */
export function Skeleton({ label }: { label: string }): React.ReactElement {
  return (
    <div className="flex flex-col gap-1.5" aria-label={label} role="status">
      <div className="h-3 w-11/12 animate-pulse rounded bg-hover" />
      <div className="h-3 w-4/5 animate-pulse rounded bg-hover" />
      <div className="h-3 w-2/3 animate-pulse rounded bg-hover" />
    </div>
  )
}

/** Hộp dịch một mục / một bảng. `initialText`: bản dịch có sẵn (mở lại từ lịch sử) thì không gọi AI. */
export function TranslateDialog({ source, label, initial, onClose }: { source: string; label: string; initial?: { to: TranslateLang; text: string; terms: GlossaryEntry[] }; onClose: () => void }): React.ReactElement {
  const t = useT()
  const uiLang = useLang()
  const ref = useRef<HTMLDivElement | null>(null)
  useFocusTrap(ref)
  const [to, setTo] = useState<TranslateLang>(initial?.to ?? resolveTarget(source, uiLang))
  const { state, run, cancel } = useTranslate('section', label)
  const shown: TranslateState = initial && to === initial.to && !state.loading && !state.text && !state.error ? { ...IDLE, text: initial.text, terms: initial.terms } : state

  useEffect(() => {
    if (!initial) void run(source, to)
    return cancel
    // Chỉ chạy khi mở hộp; đổi ngôn ngữ đích gọi run trực tiếp
  }, [])

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
      const saved = await window.api.saveMarkdown(`${guideFileStem(label) || 'translation'}_${to}`, shown.text)
      if (saved) toast(t('tr.saved', { path: saved }), 'ok')
    } catch (err) {
      toast(t('tr.saveFailed', { err: errMsg(err) }), 'err')
    }
  }

  return createPortal(
    <div className="x2m-tr-backdrop fixed inset-0 z-[90] flex items-start justify-center bg-black/40 pt-[5vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={t('tr.sectionTitle', { label })} className="x2m-tr-dialog flex max-h-[88vh] w-[min(1280px,95vw)] flex-col overflow-hidden rounded-lg text-ink">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5">
          <IconTranslate size={17} />
          <h2 className="m-0 min-w-0 truncate text-[14px] font-semibold">{t('tr.sectionTitle', { label })}</h2>
          <Direction source={source} to={to} />
          <span className="ml-auto flex items-center gap-1.5">
            <TargetPicker
              value={to}
              onChange={(l) => {
                setTo(l)
                void run(source, l)
              }}
            />
            <button
              className={cx(btnGhost, btnSm)}
              disabled={!shown.text}
              onClick={async () => {
                if (await copyText(shown.text)) toast(t('tr.copied'))
              }}
            >
              <IconCopy size={13} /> {t('tr.copyMd')}
            </button>
            <button className={cx(btnGhost, btnSm)} disabled={!shown.text} onClick={() => void save()}>
              {t('tr.saveMd')}
            </button>
            <button className={cx(btnGhost, '!p-1')} onClick={onClose} title={t('tr.close')} aria-label={t('tr.close')}>
              <IconX size={14} />
            </button>
          </span>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-line overflow-hidden">
          <section className="flex min-h-0 flex-col" aria-label={t('tr.source')}>
            <h3 className="m-0 border-b border-line-subtle bg-soft px-4 py-1.5 text-[11.5px] font-semibold text-dim">{t('tr.source')}</h3>
            <div className="min-h-0 flex-1 overflow-auto px-4 py-3" tabIndex={0}>
              <MdHtml md={source} />
            </div>
          </section>
          <section className="flex min-h-0 flex-col" aria-label={t('tr.result')}>
            <h3 className="m-0 border-b border-line-subtle bg-soft px-4 py-1.5 text-[11.5px] font-semibold text-dim">{t('tr.result')}</h3>
            <div className="min-h-0 flex-1 overflow-auto px-4 py-3" tabIndex={0} aria-live="polite">
              {shown.loading ? (
                <Skeleton label={t('tr.loading')} />
              ) : shown.error ? (
                <div className="flex flex-col items-start gap-2 text-xs text-danger">
                  <span>{shown.error}</span>
                  {shown.error !== t('tr.noKey') && (
                    <button className={cx(btnGhost, btnSm)} onClick={() => void run(source, to)}>
                      {t('tr.retry')}
                    </button>
                  )}
                </div>
              ) : (
                <MdHtml md={shown.text} />
              )}
            </div>
          </section>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-2">
          <TermsUsed terms={shown.terms} />
          <span className="ml-auto text-[10.5px] text-faint">{t('tr.privacy')}</span>
        </div>
      </div>
    </div>,
    document.body
  )
}
