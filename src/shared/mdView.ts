/* Hàm thuần cho chế độ Đọc Markdown (dùng ở cả main và renderer). */

/** Scheme main phục vụ ảnh cục bộ trong file .md (xem `protocol.handle` ở src/main/index.ts). */
export const IMG_SCHEME = 'x2m-img'
const IMG_PREFIX = `${IMG_SCHEME}://f/`

/** URL ảnh cục bộ: cả đường dẫn tuyệt đối mã hóa thành một đoạn (không còn `/`, `\`, `:`). */
export function imageUrl(absPath: string): string {
  return IMG_PREFIX + encodeURIComponent(absPath)
}

/** Ngược của `imageUrl`; null nếu không phải URL ảnh của app. */
export function imagePathFromUrl(url: string): string | null {
  if (!url.startsWith(IMG_PREFIX)) return null
  try {
    const p = decodeURIComponent(url.slice(IMG_PREFIX.length))
    return p === '' ? null : p
  } catch {
    return null
  }
}

/** Đường dẫn tuyệt đối của link/ảnh tương đối `href` trong file `fromFile`.
 * null nếu `href` có scheme (http:, C:...), là đường dẫn tuyệt đối, rỗng, hoặc `..` vượt quá gốc ổ đĩa.
 * Bỏ `?query`/`#hash`, giải mã %xx; giữ kiểu dấu phân cách của `fromFile`. */
export function resolveRelative(fromFile: string, href: string): string | null {
  let h = href.trim()
  const cut = h.search(/[?#]/)
  if (cut >= 0) h = h.slice(0, cut)
  if (h === '' || /^[a-z][a-z0-9+.-]*:/i.test(h) || h.startsWith('/') || h.startsWith('\\')) return null
  try {
    h = decodeURIComponent(h)
  } catch {
    return null
  }
  const sep = fromFile.includes('\\') ? '\\' : '/'
  const parts = fromFile.split(/[\\/]/)
  parts.pop()
  for (const seg of h.split(/[\\/]/)) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (parts.length <= 1) return null
      parts.pop()
    } else {
      parts.push(seg)
    }
  }
  return parts.join(sep)
}

export interface MdTreeFile {
  kind: 'file'
  name: string
  /** Đường dẫn tương đối từ thư mục gốc, phân cách `/` */
  path: string
}

export interface MdTreeDir {
  kind: 'dir'
  name: string
  path: string
  children: MdTreeNode[]
}

export type MdTreeNode = MdTreeFile | MdTreeDir

export type MdSort = 'name' | 'date'

const cmpName = (a: string, b: string): number => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

const byName = (a: MdTreeNode, b: MdTreeNode): number =>
  a.kind !== b.kind ? (a.kind === 'dir' ? -1 : 1) : cmpName(a.name, b.name)

/** Thư mục trước (theo tên); file giảm dần theo mtime (thiếu mtime xếp cuối), trùng thì theo tên. */
const byDate =
  (mtimes: Record<string, number>) =>
  (a: MdTreeNode, b: MdTreeNode): number =>
    a.kind !== b.kind || a.kind === 'dir' ? byName(a, b) : (mtimes[b.path] ?? 0) - (mtimes[a.path] ?? 0) || byName(a, b)

/** Cây thư mục từ danh sách đường dẫn tương đối (`a/b.md`). Thư mục trước file; file sắp theo tên (số theo giá trị)
 * hoặc, với `sort = 'date'`, theo ngày sửa giảm dần. */
export function buildMdTree(relPaths: string[], sort: MdSort = 'name', mtimes: Record<string, number> = {}): MdTreeNode[] {
  const root: MdTreeDir = { kind: 'dir', name: '', path: '', children: [] }
  const dirs = new Map<string, MdTreeDir>([['', root]])
  for (const rel of relPaths) {
    const segs = rel.split('/').filter(Boolean)
    if (segs.length === 0) continue
    let parent = root
    for (let i = 0; i < segs.length - 1; i++) {
      const path = segs.slice(0, i + 1).join('/')
      let d = dirs.get(path)
      if (!d) {
        d = { kind: 'dir', name: segs[i], path, children: [] }
        dirs.set(path, d)
        parent.children.push(d)
      }
      parent = d
    }
    parent.children.push({ kind: 'file', name: segs[segs.length - 1], path: segs.join('/') })
  }
  const cmp = sort === 'date' ? byDate(mtimes) : byName
  for (const d of dirs.values()) d.children.sort(cmp)
  return root.children
}

/** Các file đang hiện theo thứ tự trên cây (bỏ qua thư mục đang thu gọn) — dùng cho ↑/↓. */
export function visibleTreeFiles(nodes: MdTreeNode[], collapsed: ReadonlySet<string>): string[] {
  const out: string[] = []
  const walk = (list: MdTreeNode[]): void => {
    for (const n of list) {
      if (n.kind === 'file') out.push(n.path)
      else if (!collapsed.has(n.path)) walk(n.children)
    }
  }
  walk(nodes)
  return out
}

/** `n` file sửa gần nhất (đường dẫn tương đối); bỏ file không có mtime, trùng mtime thì theo tên. */
export function recentMdFiles(relPaths: string[], mtimes: Record<string, number>, n = 6): string[] {
  return relPaths
    .filter((r) => mtimes[r] !== undefined)
    .sort((a, b) => mtimes[b] - mtimes[a] || cmpName(a, b))
    .slice(0, n)
}

/** Ngày sửa dạng ngắn theo `locale` (Intl): "bây giờ", "N phút trước", "N giờ trước", "hôm qua", "N ngày trước"
 * (≤ 30 ngày), rồi ngày dạng số của locale (vi: dd/MM/yyyy). */
export function formatRelativeTime(mtimeMs: number, nowMs: number, locale = 'vi-VN'): string {
  const named = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' })
  const rel = new Intl.RelativeTimeFormat(locale, { style: 'short' })
  const diff = nowMs - mtimeMs
  if (diff < 60_000) return named.format(0, 'second')
  if (diff < 3_600_000) return rel.format(-Math.floor(diff / 60_000), 'minute')
  if (diff < 86_400_000) return rel.format(-Math.floor(diff / 3_600_000), 'hour')
  const d = new Date(mtimeMs)
  const yesterday = new Date(nowMs)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return named.format(-1, 'day')
  const days = Math.floor(diff / 86_400_000)
  // "always": 1 ngày nhưng không phải hôm qua theo lịch thì vẫn ghi "1 ngày trước"
  if (days <= 30) return rel.format(-days, 'day')
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
}

/** Phần `#anchor` của link (đã giải mã %xx), '' nếu không có. `b.md#Mục%201` -> `Mục 1`. */
export function hrefHash(href: string): string {
  const i = href.indexOf('#')
  if (i < 0) return ''
  const h = href.slice(i + 1)
  try {
    return decodeURIComponent(h)
  } catch {
    return h
  }
}

/** Slug kiểu GitHub của tiêu đề: chữ thường, bỏ dấu câu (giữ chữ mọi thứ tiếng, số, `_`, `-`), khoảng trắng -> `-`.
 * Slug của một slug không đổi, nên so được cả `#anchor` lẫn chữ tiêu đề. */
export function slugifyHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, '')
    .replace(/ /g, '-')
}

/** Slug của từng tiêu đề theo thứ tự; trùng thì thêm `-1`, `-2`... như GitHub. */
export function uniqueSlugs(texts: string[]): string[] {
  const used = new Set<string>()
  return texts.map((t) => {
    const base = slugifyHeading(t)
    let slug = base
    for (let n = 1; used.has(slug); n++) slug = `${base}-${n}`
    used.add(slug)
    return slug
  })
}

/** Front-matter YAML ở đầu file (`---` … `---`, do app tạo khi bật tùy chọn front-matter) -> khối code yaml
 * để bản xem không hiểu nhầm thành đường kẻ + heading setext khổng lồ. Chỉ dùng khi render, không đổi file. */
export function frontMatterAsCode(md: string): string {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(md)
  if (!m || m[1].split('\n').length > 200) return md
  return '```yaml\n' + m[1] + '\n```\n' + md.slice(m[0].length)
}
