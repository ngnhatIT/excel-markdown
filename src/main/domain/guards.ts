/* Kiểm tra an toàn cho điều hướng / mở link / mở đường dẫn.
 * Thuần Node (không phụ thuộc Electron) để test trực tiếp bằng vitest.
 */
import { stat } from 'node:fs/promises'
import { isAbsolute, relative } from 'node:path'

const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

/** Chỉ cho mở bằng trình duyệt/mail client ngoài các URL http/https/mailto.
 * Chặn file:, javascript:, data:, UNC, scheme lạ (ms-*, search-ms...). */
export function isSafeExternalUrl(url: string): boolean {
  try {
    return EXTERNAL_PROTOCOLS.has(new URL(url).protocol)
  } catch {
    return false
  }
}

const stripHash = (u: string): string => {
  const i = u.indexOf('#')
  return i >= 0 ? u.slice(0, i) : u
}

/** App là SPA một trang: chỉ cho phép điều hướng về đúng trang hiện tại
 * (reload, kể cả HMR reload khi dev). Mọi điều hướng khác (link tương đối,
 * file://, link ngoài) đều bị chặn. */
export function shouldAllowNavigation(target: string, current: string): boolean {
  return current !== '' && stripHash(target) === stripHash(current)
}

/** `shell.openPath` chỉ được mở thư mục đang tồn tại (đường dẫn tuyệt đối).
 * Mở file bất kỳ = chạy được .exe/.bat/.lnk nếu renderer bị chiếm quyền. */
export async function isOpenableDirectory(target: unknown): Promise<boolean> {
  if (typeof target !== 'string' || target === '' || !isAbsolute(target)) return false
  try {
    return (await stat(target)).isDirectory()
  } catch {
    return false
  }
}

/** Renderer chỉ được yêu cầu đọc file Markdown (`.md`/`.markdown`, đường dẫn tuyệt đối):
 * IPC `md:*` không được thành đường đọc file bất kỳ nếu renderer bị chiếm quyền. */
export function isMarkdownPath(p: unknown): boolean {
  return typeof p === 'string' && isAbsolute(p) && /\.(md|markdown)$/i.test(p)
}

/** Đuôi file Excel app nhận (dialog chọn file, argv, kéo thả). */
export const EXCEL_EXT_RE = /\.(xlsx|xlsm|xls|xltx|xltm)$/i

/** Như isMarkdownPath cho IPC `excel:*`: SheetJS đọc được cả file text, nên không chặn đuôi thì
 * renderer bị chiếm quyền đọc được file bất kỳ qua preview. */
export function isExcelPath(p: unknown): boolean {
  return typeof p === 'string' && isAbsolute(p) && EXCEL_EXT_RE.test(p)
}

/** `p` nằm hẳn bên trong thư mục `root` (không phải chính `root`, không thoát ra bằng `..`). */
export function isInsideDir(root: string, p: string): boolean {
  if (!isAbsolute(root) || !isAbsolute(p)) return false
  const r = relative(root, p)
  return r !== '' && !r.startsWith('..') && !isAbsolute(r)
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Thanh tiêu đề của cửa sổ (dải 30px trên cùng) còn thấy được trên một màn hình đang cắm: ít nhất
 * 100×20px nằm trong vùng làm việc. Rút màn hình phụ thì vị trí đã lưu không dùng được nữa. */
export function isTitleBarOnScreen(win: Rect, workAreas: Rect[]): boolean {
  return workAreas.some((a) => {
    const w = Math.min(win.x + win.width, a.x + a.width) - Math.max(win.x, a.x)
    const h = Math.min(win.y + 30, a.y + a.height) - Math.max(win.y, a.y)
    return w >= 100 && h >= 20
  })
}

const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
}

/** MIME của file ảnh theo đuôi; null nếu không phải ảnh (scheme ảnh không phục vụ file khác). */
export function imageMime(p: string): string | null {
  const m = /\.([a-z0-9]+)$/i.exec(p)
  return m ? IMAGE_MIME[m[1].toLowerCase()] ?? null : null
}
