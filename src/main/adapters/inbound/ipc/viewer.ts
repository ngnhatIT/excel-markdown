/* IPC chế độ Đọc Markdown (mdv:*) và scheme ảnh cục bộ `x2m-img:`. */
import { ipcMain, protocol } from 'electron'
import { readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { MdFolderListing } from '../../../../shared/types'
import { IMG_SCHEME, imagePathFromUrl } from '../../../../shared/mdView'
import { friendlyError } from '../../../domain/errors'
import { imageMime, isInsideDir, isMarkdownPath, isOpenableDirectory } from '../../../domain/guards'
import { listMarkdownFiles, readMarkdownFile, searchMarkdownFolder } from '../../outbound/mdFolder'
import { logError } from '../../outbound/store'

/** Phải gọi trước app ready. */
export function registerImageScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: IMG_SCHEME, privileges: { standard: true, secure: true } }])
}

/** Đăng ký mdv:* và handler ảnh (gọi sau app ready). */
export function registerViewerIpc(): void {
  /** Thư mục người dùng đã mở để đọc (thư mục được liệt kê + thư mục chứa file đã đọc).
   * Scheme ảnh chỉ phục vụ file ảnh nằm trong các thư mục này. */
  const viewerRoots = new Set<string>()

  ipcMain.handle('mdv:list', async (_e, root: unknown) => {
    if (!(await isOpenableDirectory(root))) {
      return { ok: false, error: 'Không mở được: thư mục không tồn tại hoặc không hợp lệ.' }
    }
    try {
      const { files, mtimes, truncated } = await listMarkdownFiles(root as string)
      viewerRoots.add(root as string)
      const listing: MdFolderListing = { root: root as string, files, mtimes, truncated }
      return { ok: true, data: listing }
    } catch (err) {
      void logError('mdv:list', err)
      return { ok: false, error: friendlyError(err) }
    }
  })

  ipcMain.handle('mdv:read', async (_e, path: unknown) => {
    if (!isMarkdownPath(path)) return { ok: false, error: 'Chỉ đọc được file Markdown (.md).' }
    try {
      const text = await readMarkdownFile(path as string)
      viewerRoots.add(dirname(path as string))
      return { ok: true, data: text }
    } catch (err) {
      void logError('mdv:read', err)
      return { ok: false, error: friendlyError(err) }
    }
  })

  /** Tìm theo nội dung: chỉ trong thư mục đã mở bằng mdv:list. */
  ipcMain.handle('mdv:search', async (_e, root: unknown, query: unknown) => {
    if (typeof root !== 'string' || !viewerRoots.has(root)) return { ok: false, error: 'Chưa mở thư mục này.' }
    if (typeof query !== 'string' || query.trim() === '' || query.length > 200) {
      return { ok: false, error: 'Từ khóa không hợp lệ (1–200 ký tự).' }
    }
    try {
      return { ok: true, data: await searchMarkdownFolder(root, query) }
    } catch (err) {
      void logError('mdv:search', err)
      return { ok: false, error: friendlyError(err) }
    }
  })

  /** Ảnh `x2m-img://f/<đường dẫn mã hóa>`: chỉ file ảnh, chỉ trong thư mục đã mở để đọc. */
  protocol.handle(IMG_SCHEME, async (req) => {
    const p = imagePathFromUrl(req.url)
    const mime = p ? imageMime(p) : null
    if (!p || !mime || ![...viewerRoots].some((root) => isInsideDir(root, p))) {
      return new Response(null, { status: 403 })
    }
    try {
      return new Response(await readFile(p), { headers: { 'content-type': mime } })
    } catch {
      return new Response(null, { status: 404 })
    }
  })
}
