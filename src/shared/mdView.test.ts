import { describe, expect, it } from 'vitest'
import {
  buildMdTree,
  formatRelativeTime,
  imagePathFromUrl,
  imageUrl,
  recentMdFiles,
  resolveRelative,
  visibleTreeFiles,
} from './mdView'

describe('imageUrl / imagePathFromUrl', () => {
  it('khứ hồi đường dẫn Windows có dấu cách, ký tự Nhật, #, %', () => {
    const p = 'C:\\Users\\a b\\資料\\img #1 100%.png'
    const url = imageUrl(p)
    expect(url.startsWith('x2m-img://f/')).toBe(true)
    expect(url.slice('x2m-img://f/'.length)).not.toMatch(/[\\/:#]/)
    expect(imagePathFromUrl(url)).toBe(p)
  })

  it('URL khác scheme / mã hóa hỏng / rỗng -> null', () => {
    expect(imagePathFromUrl('file:///C:/a.png')).toBeNull()
    expect(imagePathFromUrl('x2m-img://f/%E0%A4%A')).toBeNull()
    expect(imagePathFromUrl('x2m-img://f/')).toBeNull()
  })
})

describe('resolveRelative', () => {
  const from = 'C:\\docs\\guide\\intro.md'

  it('cùng thư mục, thư mục con, ./', () => {
    expect(resolveRelative(from, 'setup.md')).toBe('C:\\docs\\guide\\setup.md')
    expect(resolveRelative(from, 'img/a.png')).toBe('C:\\docs\\guide\\img\\a.png')
    expect(resolveRelative(from, './img\\a.png')).toBe('C:\\docs\\guide\\img\\a.png')
  })

  it('.. lên thư mục cha; vượt gốc ổ đĩa -> null', () => {
    expect(resolveRelative(from, '../README.md')).toBe('C:\\docs\\README.md')
    expect(resolveRelative(from, '../../../x.md')).toBeNull()
  })

  it('bỏ #hash, ?query; giải mã %20', () => {
    expect(resolveRelative(from, 'my%20file.md#phan-2')).toBe('C:\\docs\\guide\\my file.md')
    expect(resolveRelative(from, 'a.png?v=2')).toBe('C:\\docs\\guide\\a.png')
  })

  it('có scheme, ổ đĩa, đường dẫn tuyệt đối, chỉ #hash -> null', () => {
    for (const h of ['https://x.com/a.md', 'mailto:a@b', 'javascript:alert(1)', 'D:\\x.md', '/etc/x.md', '\\\\srv\\x.md', '#top', ''])
      expect(resolveRelative(from, h)).toBeNull()
  })

  it('đường dẫn POSIX giữ dấu /', () => {
    expect(resolveRelative('/home/u/docs/a.md', '../b.md')).toBe('/home/u/b.md')
  })
})

describe('buildMdTree / visibleTreeFiles', () => {
  const rels = ['z.md', 'b/2.md', 'b/10.md', 'a.md', 'b/c/x.md', 'A2.md']

  it('thư mục trước file, sắp theo tên (số theo giá trị, không phân biệt hoa thường)', () => {
    const tree = buildMdTree(rels)
    expect(tree.map((n) => n.name)).toEqual(['b', 'a.md', 'A2.md', 'z.md'])
    const b = tree[0]
    expect(b.kind === 'dir' && b.children.map((n) => n.path)).toEqual(['b/c', 'b/2.md', 'b/10.md'])
  })

  it('thứ tự hiện: bỏ qua thư mục đang thu gọn', () => {
    const tree = buildMdTree(rels)
    expect(visibleTreeFiles(tree, new Set())).toEqual(['b/c/x.md', 'b/2.md', 'b/10.md', 'a.md', 'A2.md', 'z.md'])
    expect(visibleTreeFiles(tree, new Set(['b/c']))).toEqual(['b/2.md', 'b/10.md', 'a.md', 'A2.md', 'z.md'])
    expect(visibleTreeFiles(tree, new Set(['b']))).toEqual(['a.md', 'A2.md', 'z.md'])
  })

  it('danh sách rỗng -> cây rỗng', () => {
    expect(buildMdTree([])).toEqual([])
  })
})

describe('buildMdTree sort theo ngày sửa', () => {
  const names = (nodes: ReturnType<typeof buildMdTree>): string[] => nodes.map((n) => n.name)

  it('thư mục trước theo tên, file giảm dần theo mtime', () => {
    const tree = buildMdTree(['a.md', 'b.md', 'd/x.md'], 'date', { 'a.md': 1, 'b.md': 2, 'd/x.md': 3 })
    expect(names(tree)).toEqual(['d', 'b.md', 'a.md'])
  })

  it('mtime bằng nhau hoặc thiếu -> theo tên tăng dần (số theo giá trị)', () => {
    const tree = buildMdTree(['file10.md', 'file2.md', 'z.md'], 'date', { 'file10.md': 5, 'file2.md': 5 })
    expect(names(tree)).toEqual(['file2.md', 'file10.md', 'z.md'])
  })

  it('mặc định vẫn sort theo tên', () => {
    expect(names(buildMdTree(['b.md', 'a.md']))).toEqual(['a.md', 'b.md'])
  })
})

describe('recentMdFiles', () => {
  it('lấy n file mới nhất, bỏ file không có mtime, trùng thì theo tên', () => {
    const m = { 'a.md': 10, 'b.md': 30, 'c.md': 30, 'd/e.md': 20 }
    expect(recentMdFiles(['a.md', 'b.md', 'c.md', 'd/e.md', 'x.md'], m, 3)).toEqual(['b.md', 'c.md', 'd/e.md'])
  })

  it('không có file nào có mtime -> rỗng', () => {
    expect(recentMdFiles(['a.md'], {})).toEqual([])
  })
})

describe('formatRelativeTime', () => {
  const now = new Date(2026, 9, 28, 15, 0, 0).getTime()
  const ago = (ms: number): number => now - ms
  const MIN = 60_000
  const HOUR = 60 * MIN
  const DAY = 24 * HOUR

  it('vừa xong: dưới 1 phút và tương lai', () => {
    expect(formatRelativeTime(ago(30_000), now)).toBe('vừa xong')
    expect(formatRelativeTime(now + HOUR, now)).toBe('vừa xong')
  })

  it('phút, giờ', () => {
    expect(formatRelativeTime(ago(5 * MIN), now)).toBe('5 phút')
    expect(formatRelativeTime(ago(3 * HOUR), now)).toBe('3 giờ')
  })

  it('dưới 24 giờ luôn tính giờ; từ 24 giờ: hôm qua theo ngày lịch, rồi N ngày', () => {
    expect(formatRelativeTime(new Date(2026, 9, 27, 23, 0, 0).getTime(), now)).toBe('16 giờ')
    expect(formatRelativeTime(new Date(2026, 9, 27, 8, 0, 0).getTime(), now)).toBe('hôm qua')
    expect(formatRelativeTime(ago(4 * DAY), now)).toBe('4 ngày')
  })

  it('quá 30 ngày -> dd/MM/yyyy', () => {
    expect(formatRelativeTime(new Date(2026, 8, 5, 10, 0, 0).getTime(), now)).toBe('05/09/2026')
  })
})
