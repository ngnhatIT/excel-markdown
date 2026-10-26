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

const byName = (a: MdTreeNode, b: MdTreeNode): number =>
  a.kind !== b.kind ? (a.kind === 'dir' ? -1 : 1) : a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })

/** Cây thư mục từ danh sách đường dẫn tương đối (`a/b.md`). Thư mục trước file, sắp theo tên (số theo giá trị). */
export function buildMdTree(relPaths: string[]): MdTreeNode[] {
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
  for (const d of dirs.values()) d.children.sort(byName)
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
