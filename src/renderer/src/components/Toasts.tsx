import { useEffect, useState } from 'react'
import { cn, onToast, uid, type ToastAction } from '../lib/utils'
import { useT } from '../i18n'
import { btnGhost, btnSm, cx, iconBtn } from '../lib/ui'
import { IconCheck, IconX } from './icons'

type Item = { id: string; msg: string; kind: 'ok' | 'err'; action?: ToastAction }

/** Hiện tối đa 3 toast gần nhất (gọi `toast()` từ utils ở bất kỳ đâu). Lỗi ở lại lâu hơn, mọi toast đều đóng được. */
export function Toasts(): React.ReactElement {
  const t = useT()
  const [toasts, setToasts] = useState<Item[]>([])
  const close = (id: string): void => setToasts((prev) => prev.filter((x) => x.id !== id))

  useEffect(() => {
    const off = onToast((msg, kind, action) => {
      const id = uid()
      setToasts((prev) => [...prev.slice(-2), { id, msg, kind, action }])
      window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), kind === 'err' ? 10000 : action ? 8000 : 3200)
    })
    return off
  }, [])

  return (
    <div className="x2m-toasts fixed bottom-24 right-6 z-[100] flex flex-col gap-2" aria-live="polite">
      {toasts.map((x) => (
        <div key={x.id} className={cn(
            'x2m-toast glass flex max-w-[380px] items-start gap-2 rounded-lg py-2.5 pl-3 pr-2 text-[13px] text-ink',
            x.kind,
            x.kind === 'ok' ? '!border-success/50' : '!border-danger/50'
          )} role={x.kind === 'err' ? 'alert' : 'status'}>
          <span className={cn('mt-0.5 shrink-0', x.kind === 'ok' ? 'text-success' : 'text-danger')}>
            {x.kind === 'ok' ? <IconCheck size={15} /> : <IconX size={15} />}
          </span>
          <span className="min-w-0 flex-1 break-words">{x.msg}</span>
          {x.action && (
            <button
              className={cx('btn', btnGhost, btnSm, '!text-accent-ink')}
              onClick={() => {
                x.action?.onClick()
                close(x.id)
              }}
            >
              {x.action.label}
            </button>
          )}
          <button className={cx('icon-btn', iconBtn, '!p-1')} onClick={() => close(x.id)} title={t('common.close')} aria-label={t('common.close')}>
            <IconX size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
