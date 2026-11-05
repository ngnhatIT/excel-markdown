/* Bộ class Tailwind dùng chung cho toàn renderer, để các component có cùng diện mạo.
 * Ghép bằng cx(...). Các class "hook" cũ (x2m-*, btn...) vẫn đặt trong JSX để E2E
 * chọn phần tử; chúng KHÔNG còn CSS riêng, mọi kiểu dáng nằm ở utility Tailwind. */

export const cx = (...parts: Array<string | false | null | undefined>): string => parts.filter(Boolean).join(' ')

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

export const btn = cx(
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-line bg-raised px-3 py-1.5',
  'text-[13px] font-medium text-ink transition-colors duration-150',
  'enabled:hover:bg-hover disabled:opacity-50',
  focusRing
)
export const btnPrimary = cx(
  btn,
  '!border-accent !bg-accent font-semibold !text-white shadow-sm enabled:hover:!bg-accent enabled:hover:brightness-110'
)
export const btnDanger = cx(btn, '!border-danger !bg-danger-soft !text-danger')
export const btnGhost = cx(btn, '!border-transparent !bg-transparent !px-2 !py-1 !text-dim enabled:hover:!bg-hover enabled:hover:!text-ink')
export const btnSm = '!px-2.5 !py-1 !text-xs'
export const btnMini = '!px-[7px] !py-0.5 !text-[11.5px] !rounded-md'
export const btnPill = '!border-accent-line !bg-accent-soft !text-accent-ink'

export const iconBtn = cx(
  'inline-flex items-center justify-center rounded-[7px] p-1.5 text-faint transition-colors duration-150',
  'hover:bg-danger-soft hover:text-danger',
  focusRing
)

export const input = cx(
  'w-full rounded-[7px] border border-line bg-canvas px-2.5 py-1.5 text-xs text-ink outline-none',
  'placeholder:text-faint transition-[border-color,box-shadow] duration-150',
  'focus:border-accent focus:ring-[3px] focus:ring-accent-soft'
)

export const card = 'rounded-card border border-line bg-soft'
export const paneTitle = 'flex items-center justify-between gap-1.5 px-3 pb-1.5 pt-2.5 text-xs font-bold tracking-[0.01em] text-dim'
