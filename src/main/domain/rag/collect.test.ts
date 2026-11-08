import { describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseMarkdownForRag } from './chunker'
import { collectRagDocuments, PASTE_ID, RAG_MAX_FILES, type LoadRagDoc } from './collect'

const root = join(tmpdir(), 'docs')
/** Loader giả: ghi lại (đường dẫn, tên tương đối) được yêu cầu đọc. */
function spyLoader(): { load: LoadRagDoc; calls: [string, string][] } {
  const calls: [string, string][] = []
  const load: LoadRagDoc = async (abs, rel) => {
    calls.push([abs, rel])
    return parseMarkdownForRag(abs, rel, '## x\nnội dung', 1)
  }
  return { load, calls }
}

describe('collectRagDocuments', () => {
  it('cả thư mục: bỏ file thoát ra ngoài thư mục bằng ../ và file lẻ không phải .md', async () => {
    const { load, calls } = spyLoader()
    const res = await collectRagDocuments(
      {
        question: 'q',
        scope: 'folder',
        rootDir: root,
        relFiles: ['a.md', '../secret.md', 'sub/b.md'],
        looseFiles: [join(tmpdir(), 'x.md'), join(tmpdir(), 'passwd'), 'relative.md'],
      },
      load
    )
    expect(calls.map(([, rel]) => rel)).toEqual(['a.md', 'sub/b.md', 'x.md'])
    expect(res.docs).toHaveLength(3)
    expect(res.skippedFiles).toBe(0)
  })

  it('cả thư mục vượt giới hạn: chỉ đọc RAG_MAX_FILES file và báo số file bỏ qua', async () => {
    const { load, calls } = spyLoader()
    const relFiles = Array.from({ length: RAG_MAX_FILES + 7 }, (_, i) => `f${i}.md`)
    const res = await collectRagDocuments({ question: 'q', scope: 'folder', rootDir: root, relFiles }, load)
    expect(calls).toHaveLength(RAG_MAX_FILES)
    expect(res.skippedFiles).toBe(7)
  })

  it('file đang xem: tên tương đối theo thư mục, không nhận nhầm thư mục cùng tiền tố (docs2)', async () => {
    const inside = spyLoader()
    await collectRagDocuments({ question: 'q', scope: 'active', rootDir: root, activeFilePath: join(root, 'sub', 'a.md') }, inside.load)
    expect(inside.calls[0][1]).toBe('sub/a.md')

    const sibling = spyLoader()
    await collectRagDocuments({ question: 'q', scope: 'active', rootDir: root, activeFilePath: join(root + '2', 'a.md') }, sibling.load)
    expect(sibling.calls[0][1]).toBe('a.md')
  })

  it('đang xem bản dán: dùng nội dung dán, không đọc file', async () => {
    const { load, calls } = spyLoader()
    const res = await collectRagDocuments(
      { question: 'q', scope: 'active', activeFilePath: PASTE_ID, activeMarkdown: '## Dán\nabc' },
      load
    )
    expect(calls).toHaveLength(0)
    expect(res.docs[0].filePath).toBe(PASTE_ID)
  })
})
