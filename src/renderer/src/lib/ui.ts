/* Bộ class Tailwind dùng chung cho toàn renderer, để các component có cùng diện mạo.
 * Ghép bằng cx(...). Các class "hook" cũ (x2m-*, btn...) vẫn đặt trong JSX để E2E
 * chọn phần tử; chúng KHÔNG còn CSS riêng, mọi kiểu dáng nằm ở utility Tailwind. */

export const cx = (...parts: Array<string | false | null | undefined>): string => parts.filter(Boolean).join(' ')

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

export const btn = cx(
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-[10px] border border-line bg-raised px-3 py-1.5',
  'text-[13px] font-medium text-ink shadow-[inset_0_1px_0_var(--glass-highlight)]',
  'transition-[background-color,color,transform,filter,box-shadow] duration-300 ease-spring',
  'enabled:hover:bg-hover enabled:active:scale-[0.97] disabled:opacity-50',
  focusRing
)
// Nút chính: "giọt kính" màu accent, vệt sáng mép trên + bóng cùng tông màu.
export const btnPrimary = cx(
  btn,
  '!border-white/20 !bg-accent font-semibold !text-white enabled:hover:!bg-accent enabled:hover:brightness-110',
  'shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_6px_18px_-6px_var(--accent)]'
)
export const btnGhost = cx(btn, '!border-transparent !bg-transparent !shadow-none !px-2 !py-1 !text-dim enabled:hover:!bg-hover enabled:hover:!text-ink')
export const btnSm = '!px-2.5 !py-1 !text-xs'
export const btnMini = '!px-[7px] !py-0.5 !text-[11.5px] !rounded-md'

export const iconBtn = cx(
  'inline-flex items-center justify-center rounded-[7px] p-1.5 text-faint transition-colors duration-150',
  'hover:bg-danger-soft hover:text-danger',
  focusRing
)

export const input = cx(
  'w-full rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-xs text-ink outline-none',
  'placeholder:text-faint transition-[border-color,box-shadow] duration-150',
  'focus:border-accent focus:ring-[3px] focus:ring-accent-soft'
)

export const paneTitle =
  'flex h-10 shrink-0 items-center justify-between gap-1.5 border-b border-line-subtle px-3 text-[11.5px] font-semibold text-dim'

/** Class dùng chung cho danh sách file cột trái (FileList, MdFileList). */
export const filesAside =
  'flex w-[300px] min-w-[220px] shrink-0 flex-col overflow-y-auto border-r border-line-subtle'
export const filesAsideDrag = 'outline-2 -outline-offset-2 outline-dashed outline-accent'
export const emptyBox = 'flex flex-col items-center justify-center gap-2 px-6 py-12 text-center text-faint'
export const emptyP = 'm-0 text-[13px] text-dim'
export const emptyHint = 'text-xs !text-faint'
export const moveBtn =
  'rounded-md px-1.5 py-1 text-[13px] font-bold leading-none text-dim transition-colors duration-150 enabled:hover:bg-hover enabled:hover:text-ink disabled:cursor-default disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-accent'
export const reloadBtn = 'flex items-center'
export const fileCard =
  'glass-chip overflow-hidden rounded-xl transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-px hover:border-line motion-reduce:transition-none'
export const fileCardActive = '!border-accent-line !shadow-[inset_0_1px_0_var(--glass-highlight),0_0_0_3px_var(--accent-soft)]'
export const fileHead = 'flex items-center gap-1.5 px-2 py-1.5'
export const fileNameBtn =
  'flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-0.5 rounded-sm p-0 text-left text-ink focus-visible:outline-2 focus-visible:outline-accent'
export const fileNameText = 'max-w-full truncate text-[12.5px] font-semibold'
export const fileError =
  'mx-2 mb-2 flex items-center justify-between gap-2 rounded-lg bg-danger-soft px-2.5 py-[7px] text-xs text-danger'
export const chk = 'size-3.5 shrink-0 cursor-pointer accent-accent'
