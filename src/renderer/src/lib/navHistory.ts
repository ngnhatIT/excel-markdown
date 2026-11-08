/* Lịch sử Lùi/Tiến của chế độ Đọc Markdown (thuần, có test). */

export interface NavEntry {
  /** Đường dẫn tuyệt đối của file */
  path: string
  /** `#anchor` / tiêu đề đã nhảy tới trong file (không có = đầu file) */
  heading?: string
}

export interface NavHistory {
  stack: NavEntry[]
  /** Vị trí đang đứng trong `stack`, -1 khi rỗng */
  index: number
}

export type NavAction = { type: 'push'; entry: NavEntry } | { type: 'back' } | { type: 'forward' }

export const EMPTY_NAV: NavHistory = { stack: [], index: -1 }

/** Giữ tối đa chừng này mục, bỏ mục cũ nhất. */
export const NAV_LIMIT = 100

/** push: bỏ nhánh Tiến, trùng mục hiện tại thì giữ nguyên. back/forward ở biên trả lại đúng `s` (so `===` để biết không đi được). */
export function navReducer(s: NavHistory, a: NavAction): NavHistory {
  switch (a.type) {
    case 'push': {
      const cur = s.stack[s.index]
      if (cur && cur.path === a.entry.path && (cur.heading ?? '') === (a.entry.heading ?? '')) return s
      const stack = [...s.stack.slice(0, s.index + 1), a.entry].slice(-NAV_LIMIT)
      return { stack, index: stack.length - 1 }
    }
    case 'back':
      return s.index > 0 ? { ...s, index: s.index - 1 } : s
    case 'forward':
      return s.index < s.stack.length - 1 ? { ...s, index: s.index + 1 } : s
  }
}
