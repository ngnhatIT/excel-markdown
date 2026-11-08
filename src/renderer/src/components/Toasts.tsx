import { useEffect, useState } from 'react'
import { cn, onToast, uid } from '../utils'

/** Hiện tối đa 3 toast gần nhất (gọi `toast()` từ utils ở bất kỳ đâu). */
export function Toasts(): React.ReactElement {
  const [toasts, setToasts] = useState<{ id: string; msg: string; kind: 'ok' | 'err' }[]>([])

  useEffect(() => {
    const off = onToast((msg, kind) => {
      const id = uid()
      setToasts((prev) => [...prev.slice(-2), { id, msg, kind }])
      window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3200)
    })
    return off
  }, [])

  return (
    <div className="x2m-toasts fixed bottom-[68px] right-4 z-[100] flex flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={cn(
            'x2m-toast glass max-w-[380px] rounded-xl px-4 py-2.5 text-[13px] text-ink',
            t.kind,
            t.kind === 'ok' ? '!border-success/50' : '!border-danger/50'
          )} role="status">
          {t.msg}
        </div>
      ))}
    </div>
  )
}
