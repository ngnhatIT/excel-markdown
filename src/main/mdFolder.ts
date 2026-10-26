/* Chế độ Đọc Markdown: liệt kê và đọc file .md trong thư mục người dùng chọn.
 * Thuần Node (không phụ thuộc Electron) để test trực tiếp bằng vitest.
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

/** Quá số file này thì dừng quét (chọn nhầm ổ C:\ không treo app). */
export const MD_LIST_LIMIT = 5000
/** File .md lớn hơn thì không đọc (preview không dùng được với file cỡ này). */
export const MD_READ_MAX_BYTES = 20 * 1024 * 1024

/** Thư mục không quét: thư viện cài đặt, thư mục ẩn (.git, .vscode...). */
const SKIP_DIRS = new Set(['node_modules', 'bower_components', '$RECYCLE.BIN', 'System Volume Information'])

/** Mọi file .md/.markdown dưới `root` (đệ quy, không theo symlink), đường dẫn tương đối phân cách `/`.
 * Thư mục con không đọc được thì bỏ qua; `root` không đọc được thì throw. */
export async function listMarkdownFiles(
  root: string,
  limit = MD_LIST_LIMIT
): Promise<{ files: string[]; truncated: boolean }> {
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
        if (files.length >= limit) return { files, truncated: true }
        files.push(childRel)
      }
    }
  }
  return { files, truncated: false }
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
