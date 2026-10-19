import { useEffect, useRef } from 'react'

export interface ShortcutHandlers {
  /** Escape: đóng kết quả, xóa bộ lọc */
  onEscape: () => void
  /** ↑/↓ khi không focus ô nhập: chuyển sheet */
  onMoveSheet: (dir: 1 | -1) => void
  /** Ctrl+Enter */
  onConvert: () => void
  /** Ctrl+O */
  onPickFiles: () => void
  /** Ctrl+= / Ctrl+- / Ctrl+0 */
  onZoom: (action: 'in' | 'out' | 'reset') => void
}

/** Phím tắt toàn cửa sổ. Handler luôn là bản mới nhất (qua ref), listener gắn một lần. */
export function useShortcuts(handlers: ShortcutHandlers): void {
  const ref = useRef(handlers)
  ref.current = handlers

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const h = ref.current
      const mod = e.ctrlKey || e.metaKey
      // Ctrl+Enter / Ctrl+O chạy cả khi đang gõ trong ô nhập (vd ô "Tên file Excel" rồi Ctrl+Enter)
      if (mod && e.key === 'Enter') {
        e.preventDefault()
        h.onConvert()
        return
      }
      if (mod && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault()
        h.onPickFiles()
        return
      }
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'Escape') {
        h.onEscape()
        return
      }
      if (e.key === 'ArrowDown' && !e.ctrlKey && !e.metaKey && e.target === document.body) {
        e.preventDefault()
        h.onMoveSheet(1)
        return
      }
      if (e.key === 'ArrowUp' && !e.ctrlKey && !e.metaKey && e.target === document.body) {
        e.preventDefault()
        h.onMoveSheet(-1)
        return
      }
      if (!mod) return
      if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        h.onZoom('in')
      } else if (e.key === '-') {
        e.preventDefault()
        h.onZoom('out')
      } else if (e.key === '0') {
        e.preventDefault()
        h.onZoom('reset')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
