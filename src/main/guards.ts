/* Kiểm tra an toàn cho điều hướng / mở link / mở đường dẫn.
 * Thuần Node (không phụ thuộc Electron) để test trực tiếp bằng vitest.
 */
import { stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'

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
