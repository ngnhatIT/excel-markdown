/* Chế độ Đọc Markdown: liệt kê và đọc file .md trong thư mục người dùng chọn.
 * Thuần Node (không phụ thuộc Electron) để test trực tiếp bằng vitest.
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { MdSearchResult } from '../../../shared/types'
import { searchMarkdownText, searchTerms } from '../../domain/mdSearch'

/** Quá số file này thì dừng quét (chọn nhầm ổ C:\ không treo app). */
export const MD_LIST_LIMIT = 5000
/** File .md lớn hơn thì không đọc (preview không dùng được với file cỡ này). */
export const MD_READ_MAX_BYTES = 20 * 1024 * 1024

/** Thư mục không quét: thư viện cài đặt, thư mục ẩn (.git, .vscode...). */
const SKIP_DIRS = new Set(['node_modules', 'bower_components', '$RECYCLE.BIN', 'System Volume Information'])

/** mtime (ms) của từng file trong `files` (tương đối so với `root`); file stat lỗi thì không có khóa. */
async function statMtimes(root: string, files: string[]): Promise<Record<string, number>> {
  const mtimes: Record<string, number> = {}
  for (let i = 0; i < files.length; i += 64) {
    await Promise.all(
      files.slice(i, i + 64).map(async (rel) => {
        try {
          mtimes[rel] = (await stat(join(root, rel))).mtimeMs
        } catch {
          /* file vừa bị xóa/không đọc được: bỏ qua, không có ngày sửa */
        }
      })
    )
  }
  return mtimes
}

/** Mọi file .md/.markdown dưới `root` (đệ quy, không theo symlink), đường dẫn tương đối phân cách `/`,
 * kèm mtime từng file. Thư mục con không đọc được thì bỏ qua; `root` không đọc được thì throw. */
export async function listMarkdownFiles(
  root: string,
  limit = MD_LIST_LIMIT
): Promise<{ files: string[]; mtimes: Record<string, number>; truncated: boolean }> {
  const files: string[] = []
  const queue: string[] = ['']
  while (queue.length > 0) {
    const rel = queue.shift() as string
    let entries
    try {
      entries = await readdir(rel ? join(root, rel) : root, { withFileTypes: true })
    } catch (err) {
      if (rel === '') throw err
      continue
    }
    for (const e of entries) {
      const childRel = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) {
        if (!e.name.startsWith('.') && !SKIP_DIRS.has(e.name)) queue.push(childRel)
      } else if (e.isFile() && /\.(md|markdown)$/i.test(e.name)) {
        if (files.length >= limit) return { files, mtimes: await statMtimes(root, files), truncated: true }
        files.push(childRel)
      }
    }
  }
  return { files, mtimes: await statMtimes(root, files), truncated: false }
}

/** Nội dung file Markdown (UTF-8, bỏ BOM). Throw lỗi tiếng Việt nếu file quá lớn. */
export async function readMarkdownFile(path: string): Promise<string> {
  const st = await stat(path)
  if (st.size > MD_READ_MAX_BYTES) {
    throw new Error(`File quá lớn để xem (${Math.round(st.size / 1024 / 1024)} MB, tối đa 20 MB).`)
  }
  const text = await readFile(path, 'utf-8')
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

/** Tìm `query` trong nội dung mọi file .md dưới `root` (cùng danh sách với `listMarkdownFiles`).
 * File không đọc được / quá lớn thì bỏ qua. Dừng khi đủ `maxFiles` file khớp. */
export async function searchMarkdownFolder(root: string, query: string, maxFiles = 200, maxHitsPerFile = 20): Promise<MdSearchResult> {
  const terms = searchTerms(query)
  const out: MdSearchResult = { files: [], truncated: false }
  if (terms.length === 0) return out
  const { files } = await listMarkdownFiles(root)
  for (let i = 0; i < files.length; i += 32) {
    const batch = await Promise.all(
      files.slice(i, i + 32).map(async (rel) => {
        try {
          return { rel, hits: searchMarkdownText(await readMarkdownFile(join(root, rel)), terms, maxHitsPerFile) }
        } catch {
          return { rel, hits: [] }
        }
      })
    )
    for (const f of batch) {
      if (f.hits.length === 0) continue
      if (out.files.length >= maxFiles) return { ...out, truncated: true }
      out.files.push(f)
    }
  }
  return out
}
