import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listMarkdownFiles, readMarkdownFile } from './mdFolder'

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
