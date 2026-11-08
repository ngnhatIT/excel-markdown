import { useEffect, useMemo, useRef, useState } from 'react'
import { fuzzyRank } from '../../lib/fuzzy'
import { cn } from '../../lib/utils'
import { input } from '../../lib/ui'
import { IconFile, IconList } from '../../components/icons'

export interface PaletteItem {
  kind: 'file' | 'heading'
  /** Chữ hiện và để khớp */
  label: string
  /** Đường dẫn tuyệt đối (file) hoặc chữ tiêu đề (heading) */
  value: string
}

interface Props {
  items: PaletteItem[]
  onPick: (item: PaletteItem) => void
  onClose: () => void
}

/** Bảng lệnh Ctrl+K: gõ để tìm file của thư mục / file lẻ / mục của file đang xem. Chỉ ô nhập nhận focus (Tab bị giữ lại). */
export function CommandPalette({ items, onPick, onClose }: Props): React.ReactElement {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLUListElement | null>(null)
  const results = useMemo(() => fuzzyRank(query, items, (i) => i.label), [query, items])

  // Đóng thì trả focus về chỗ cũ
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    return () => prev?.focus?.()
  }, [])

  useEffect(() => setActive(0), [query])
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (results.length > 0) setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const it = results[active]
      if (it) onPick(it)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'Tab') {
      e.preventDefault()
    }
  }

  return (
    <div className="x2m-palette-backdrop fixed inset-0 z-[90] flex items-start justify-center bg-black/40 pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="x2m-palette glass flex max-h-[60vh] w-[min(560px,90vw)] flex-col overflow-hidden rounded-xl border border-line bg-canvas shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-label="Bảng lệnh: mở file hoặc nhảy tới mục"
      >
        <input
          autoFocus
          className={cn('x2m-palette-input m-2', input)}
          placeholder="Gõ tên file hoặc tên mục..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded="true"
          aria-controls="x2m-palette-list"
          aria-activedescendant={results.length > 0 ? `x2m-palette-${active}` : undefined}
          aria-label="Tìm file hoặc mục"
        />
        <ul ref={listRef} id="x2m-palette-list" role="listbox" className="x2m-palette-list flex-1 overflow-y-auto px-2 pb-2" aria-label="Kết quả">
          {results.length === 0 && <li className="px-2 py-3 text-center text-xs text-faint">Không có kết quả</li>}
          {results.map((it, i) => (
            <li
              key={it.kind + ':' + it.value}
              id={`x2m-palette-${i}`}
              data-idx={i}
              role="option"
              aria-selected={i === active}
              className={cn(
                'x2m-palette-item flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-ink',
                i === active && 'bg-accent-soft text-accent-ink'
              )}
              onMouseMove={() => setActive(i)}
              onClick={() => onPick(it)}
            >
              {it.kind === 'file' ? <IconFile size={14} /> : <IconList size={14} />}
              <span className="truncate">{it.label}</span>
              <span className="ml-auto shrink-0 text-[11px] text-faint">{it.kind === 'file' ? 'File' : 'Mục'}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
