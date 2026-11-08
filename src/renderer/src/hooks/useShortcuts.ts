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
  /** Ctrl+K / Cmd+K (cả khi đang gõ): bảng lệnh. Không truyền = phím không làm gì */
  onPalette?: () => void
  /** Alt+← / Alt+→ khi không focus ô nhập: Lùi / Tiến */
  onHistory?: (dir: 'back' | 'forward') => void
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
      if (mod && !e.altKey && !e.shiftKey && (e.key === 'k' || e.key === 'K') && h.onPalette) {
        e.preventDefault()
        h.onPalette()
        return
      }
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.altKey && !mod && !e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && h.onHistory) {
        e.preventDefault()
        h.onHistory(e.key === 'ArrowLeft' ? 'back' : 'forward')
        return
      }
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
    // Nút chuột Lùi (3) / Tiến (4)
    const onMouse = (e: MouseEvent): void => {
      const h = ref.current.onHistory
      if ((e.button !== 3 && e.button !== 4) || !h) return
      e.preventDefault()
      h(e.button === 3 ? 'back' : 'forward')
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mouseup', onMouse)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mouseup', onMouse)
    }
  }, [])
}
