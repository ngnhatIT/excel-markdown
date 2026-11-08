import { describe, expect, it } from 'vitest'
import { chatToMarkdown } from './chatExport'

const cite = (filePath: string, relPath: string, sectionTitle: string) => ({ filePath, relPath, sheetName: relPath, sectionTitle })

describe('chatToMarkdown', () => {
  it('câu hỏi thành quote, câu trả lời giữ Markdown, trích dẫn thành link tương đối', () => {
    const md = chatToMarkdown(
      [
        { role: 'user', text: 'Màn hình A\nkiểm tra gì?' },
        {
          role: 'model',
          text: '**Trả lời** có bảng\n',
          citations: [cite('/p/docs/a.md', 'docs/a.md', '入力チェック'), cite('C:\\p\\sub\\b c.md', 'sub\\b c.md', 'Mục [1]')],
        },
      ],
      '/p'
    )
    expect(md).toBe(
      [
        '# Trò chuyện Trợ lý AI',
        '',
        'Thư mục: `/p`',
        '',
        '## Câu hỏi 1',
        '',
        '> Màn hình A',
        '> kiểm tra gì?',
        '',
        '### Trả lời',
        '',
        '**Trả lời** có bảng',
        '',
        '**Nguồn:**',
        '',
        '- [docs/a.md › 入力チェック](docs/a.md)',
        '- [sub/b c.md › Mục \\[1\\]](<sub/b c.md>)',
        '',
      ].join('\n')
    )
  })

  it('đường dẫn Windows trong thư mục gốc thành rel với /, bản dán không có link', () => {
    const md = chatToMarkdown(
      [{ role: 'model', text: 'x', citations: [cite('C:\\p\\d\\a.md', 'a.md', 'A'), cite('clipboard:paste', 'Dán', 'B')] }],
      'C:\\p\\'
    )
    expect(md).toContain('- [d/a.md › A](d/a.md)')
    expect(md).toContain('- Dán từ clipboard › B')
  })

  it('bỏ câu trả lời lỗi, đánh số câu hỏi, không có thư mục thì không ghi dòng Thư mục', () => {
    const md = chatToMarkdown(
      [
        { role: 'user', text: 'Q1' },
        { role: 'model', text: '⚠️ lỗi', isError: true },
        { role: 'user', text: 'Q2' },
        { role: 'model', text: 'A2' },
      ],
      null
    )
    expect(md).not.toContain('lỗi')
    expect(md).not.toContain('Thư mục')
    expect(md).toContain('## Câu hỏi 2\n\n> Q2\n\n### Trả lời\n\nA2\n')
  })
})
