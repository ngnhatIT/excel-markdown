import { describe, expect, it } from 'vitest'
import { buildMdTree, imagePathFromUrl, imageUrl, resolveRelative, visibleTreeFiles } from './mdView'

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
