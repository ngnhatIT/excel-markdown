export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      return true
    } catch {
      return false
    }
  }
}

/** Tên file không thư mục (tách theo cả `\` và `/`; renderer không có node:path). */
export function baseName(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}

/** Đổi chỗ phần tử `index` với phần tử kề theo `dir`. Luôn trả mảng mới;
 * `index` hoặc vị trí đích ngoài biên -> bản sao không đổi. */
export function moveItem<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const next = list.slice()
  const to = index + dir
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return next
  next[index] = list[to]
  next[to] = list[index]
  return next
}

/** So khớp tiêu đề heading trong DOM với sectionTitle của citation AI. */
export function matchHeadingText(candidate: string, targetHeading: string): boolean {
  const c = candidate.trim().toLowerCase()
  const t = targetHeading.trim().toLowerCase()
  if (!c || !t) return false
  return c === t || c.includes(t) || t.includes(c)
}

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Simple toast bus */
type ToastListener = (msg: string, kind: 'ok' | 'err') => void
const listeners = new Set<ToastListener>()

export function onToast(fn: ToastListener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function toast(msg: string, kind: 'ok' | 'err' = 'ok'): void {
  listeners.forEach((fn) => fn(msg, kind))
}
