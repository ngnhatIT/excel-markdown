// Tên workbook mặc định (không đuôi) khi chuyển Markdown -> Excel.
// Dùng chung cho renderer và main nên KHÔNG import module chỉ có ở Node (vd node:path).

/** Tên file không thư mục, không đuôi; tách đường dẫn theo cả `\` và `/`. */
function stemOf(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(0, dot) : base
}

/** Phần trước `__` cuối cùng của tên file; null nếu không có `__` hoặc phần đó rỗng. */
function prefixOf(stem: string): string | null {
  const at = stem.lastIndexOf('__')
  if (at <= 0) return null
  return stem.slice(0, at)
}

/**
 * Chọn tên workbook mặc định:
 * 1. mọi file có `__` và phần trước `__` cuối cùng giống nhau -> phần đó;
 * 2. không thì `title` của file đầu (nếu khác rỗng);
 * 3. không thì tên file đầu không đuôi; danh sách rỗng -> `workbook`.
 */
export function defaultWorkbookName(files: { path: string; title: string | null }[]): string {
  if (files.length === 0) return 'workbook'
  const stems = files.map((f) => stemOf(f.path))

  const prefixes = stems.map(prefixOf)
  const first = prefixes[0]
  if (first !== null && prefixes.every((p) => p === first)) return first

  const title = files[0].title?.trim()
  if (title) return title

  return stems[0]
}
