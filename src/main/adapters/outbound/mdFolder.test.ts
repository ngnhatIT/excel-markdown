import { describe, expect, it } from 'vitest'
import { chmodSync, mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listMarkdownFiles, readMarkdownFile, readMarkdownFolder, searchMarkdownFolder, walkFiles } from './mdFolder'

function makeTree(): string {
  const root = mkdtempSync(join(tmpdir(), 'x2m-mdv-'))
  for (const d of ['docs/sub', 'node_modules/pkg', '.git', 'img']) mkdirSync(join(root, d), { recursive: true })
  for (const f of ['README.md', 'docs/a.md', 'docs/sub/b.MARKDOWN', 'node_modules/pkg/x.md', '.git/y.md', 'img/p.png', 'note.txt'])
    writeFileSync(join(root, f), '# x\n')
  return root
}

describe('listMarkdownFiles', () => {
  it('đệ quy, chỉ .md/.markdown, bỏ node_modules và thư mục ẩn, đường dẫn tương đối dấu /', async () => {
    const res = await listMarkdownFiles(makeTree())
    expect(res.truncated).toBe(false)
    expect(res.files.sort()).toEqual(['README.md', 'docs/a.md', 'docs/sub/b.MARKDOWN'])
  })

  it('trả mtimeMs của từng file', async () => {
    const root = makeTree()
    const old = new Date(2020, 0, 1)
    utimesSync(join(root, 'docs/a.md'), old, old)
    const res = await listMarkdownFiles(root)
    expect(res.mtimes['docs/a.md']).toBe(old.getTime())
    expect(Object.keys(res.mtimes).sort()).toEqual([...res.files].sort())
  })

  it('vượt giới hạn -> dừng, truncated', async () => {
    const res = await listMarkdownFiles(makeTree(), 2)
    expect(res.files.length).toBe(2)
    expect(res.truncated).toBe(true)
  })

  it('thư mục gốc không tồn tại -> throw', async () => {
    await expect(listMarkdownFiles(join(tmpdir(), 'x2m-khong-co-' + Date.now()))).rejects.toThrow()
  })
})

describe('readMarkdownFile', () => {
  it('đọc UTF-8, bỏ BOM', async () => {
    const p = join(mkdtempSync(join(tmpdir(), 'x2m-mdv-')), 'bom.md')
    writeFileSync(p, '﻿# 見出し\n')
    expect(await readMarkdownFile(p)).toBe('# 見出し\n')
  })
})

describe('searchMarkdownFolder', () => {
  it('tìm trong nội dung các file của thư mục (bỏ node_modules), giới hạn số file', async () => {
    const root = makeTree()
    writeFileSync(join(root, 'docs/a.md'), '# A\n顧客コード\n')
    writeFileSync(join(root, 'README.md'), '\ufeff顧客\n')
    writeFileSync(join(root, 'node_modules/pkg/x.md'), '顧客\n')
    const res = await searchMarkdownFolder(root, '顧客')
    expect(res.truncated).toBe(false)
    expect(res.files.map((f) => f.rel).sort()).toEqual(['README.md', 'docs/a.md'])
    expect(res.files.find((f) => f.rel === 'docs/a.md')?.hits).toEqual([{ line: 2, text: '顧客コード', heading: 'A' }])
    const one = await searchMarkdownFolder(root, '顧客', 1)
    expect(one.files).toHaveLength(1)
    expect(one.truncated).toBe(true)
    expect((await searchMarkdownFolder(root, '  ')).files).toEqual([])
  })
})

describe('searchMarkdownFolder: cache và hủy sớm', () => {
  it('file sửa sau lần tìm trước vẫn được đọc lại (cache theo mtime/size)', async () => {
    const root = makeTree()
    writeFileSync(join(root, 'docs/a.md'), '旧\n')
    expect((await searchMarkdownFolder(root, '新')).files).toEqual([])
    writeFileSync(join(root, 'docs/a.md'), '新しい行\n')
    expect((await searchMarkdownFolder(root, '新')).files.map((f) => f.rel)).toEqual(['docs/a.md'])
  })

  it('isStale -> dừng, không đọc tiếp', async () => {
    const root = makeTree()
    writeFileSync(join(root, 'docs/a.md'), 'x\n')
    expect((await searchMarkdownFolder(root, 'x', 200, 20, () => true)).files).toEqual([])
  })
})

describe('walkFiles', () => {
  // chmod không chặn được đọc trên Windows / khi chạy bằng root
  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('thư mục con không đọc được: bỏ qua, vẫn trả các file khác', async () => {
    const root = makeTree()
    mkdirSync(join(root, 'locked'))
    writeFileSync(join(root, 'locked', 'z.md'), '# z\n')
    chmodSync(join(root, 'locked'), 0o000)
    try {
      const res = await walkFiles(root, (n) => n.endsWith('.md'), 100)
      expect(res.files.sort()).toEqual(['README.md', 'docs/a.md'])
    } finally {
      chmodSync(join(root, 'locked'), 0o755)
    }
  })

  it('quá giới hạn -> truncated', async () => {
    expect((await walkFiles(makeTree(), () => true, 2)).truncated).toBe(true)
  })
})

describe('readMarkdownFolder', () => {
  it('đọc theo danh sách, bỏ file lỗi; có yêu cầu mới hơn -> null', async () => {
    const root = makeTree()
    expect(await readMarkdownFolder(root, ['README.md', 'khong-co.md', 'docs/a.md'])).toEqual([
      { rel: 'README.md', text: '# x\n' },
      { rel: 'docs/a.md', text: '# x\n' },
    ])
    expect(await readMarkdownFolder(root, ['README.md'], () => true)).toBeNull()
  })
})
