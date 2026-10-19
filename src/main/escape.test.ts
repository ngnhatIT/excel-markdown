/* Round-trip escape: render Markdown bằng `marked` (cùng renderer với preview của app),
 * lấy lại text và so với nội dung ô gốc. Nội dung ô phải hiển thị nguyên văn,
 * không biến thành thẻ HTML / in nghiêng / link / heading / list.
 */
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { marked } from 'marked'
import { escapeMarkdownInline, sheetToMarkdown } from './converter'
import { DEFAULT_OPTIONS, type ConvertOptions } from '../types'

const OPTS: ConvertOptions = { ...DEFAULT_OPTIONS, includeSheetTitle: false }
const md = (aoa: string[][], opts = OPTS): string => sheetToMarkdown(XLSX.utils.aoa_to_sheet(aoa), 'S', opts)

const decode = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')

/** Text hiển thị (bỏ thẻ) của HTML, kèm danh sách thẻ xuất hiện. */
function render(src: string): { text: string; tags: Set<string> } {
  const html = marked.parse(src, { async: false }) as string
  const tags = new Set([...html.matchAll(/<([a-z0-9]+)[\s>]/g)].map((m) => m[1]))
  return { text: decode(html.replace(/<[^>]+>/g, '')).trim(), tags }
}

const INLINE_CASES = [
  '<null>',
  '<input type="text"> を使用',
  '</div>',
  '<!-- メモ -->',
  '<https://example.com>',
  '*必須*',
  '2*3*4',
  '__x__',
  '_x_',
  'a_b_ c',
  '&nbsp;',
  '&amp; と &#123;',
  '`code`',
  '[仕様](http://example.com/a)',
  '![img](x.png)',
  '[ref]: http://x',
  '1~10, 20~30',
  '~~del~~',
  'C:\\Users\\x\\file',
  '\\*not\\*',
]
// Không cần escape -> giữ nguyên trong file .md cho dễ đọc
const UNTOUCHED = ['snake_case_name', 'a < b', '<画面名>', '1~10', 'x > y', 'https://example.com/a_b?x=1&y=2']

describe('escape: ô trong bảng hiển thị nguyên văn', () => {
  for (const s of [...INLINE_CASES, ...UNTOUCHED]) {
    it(JSON.stringify(s), () => {
      const out = md([['No', 'A'], ['1', s]])
      const row = out.split('\n')[2]
      const cell = row.slice('| 1 | '.length, -' |'.length)
      const { text, tags } = render(cell)
      expect(text).toBe(s)
      for (const t of ['em', 'strong', 'code', 'del', 'img', 'input', 'div']) expect(tags.has(t)).toBe(false)
      // GFM tự link URL trần (text vẫn nguyên văn); ngoài ra không được sinh link ẩn
      if (!/https?:\/\//.test(s)) expect(tags.has('a')).toBe(false)
    })
  }

  it('chuỗi không cần escape giữ nguyên trong file .md', () => {
    for (const s of UNTOUCHED) expect(escapeMarkdownInline(s)).toBe(s)
  })
})

const BLOCK_CASES = ['# 見出し', '###', '> 引用', '- item', '+ item', '* item', '1. one', '2) two', '---', '- - -', '***', '___', '[ref]: http://x']

describe('escape: text đứng đầu dòng không thành heading/list/quote', () => {
  for (const s of BLOCK_CASES) {
    it('quote (1 ô): ' + JSON.stringify(s), () => {
      const { text, tags } = render(md([[s]]))
      expect(text).toBe(s)
      for (const t of ['h1', 'h2', 'h3', 'ul', 'ol', 'hr', 'em', 'strong']) expect(tags.has(t)).toBe(false)
    })
    it('đoạn văn (nhiều ô): ' + JSON.stringify(s), () => {
      const { text, tags } = render(md([[s, 'tail', 'x']]))
      expect(text).toBe(s + ' tail x')
      for (const t of ['h1', 'h2', 'ul', 'ol', 'hr', 'blockquote']) expect(tags.has(t)).toBe(false)
    })
    it('sub-bullet sau meta: ' + JSON.stringify(s), () => {
      const out = md([['画面遷移', 'A'], ['', s]])
      expect(out.split('\n')[1]).toMatch(/^ {2}- /)
      const { text, tags } = render(out)
      expect(text).toContain(s)
      expect(tags.has('ol')).toBe(false)
      expect(tags.has('h1')).toBe(false)
    })
  }

  it('"N. text" do engine đánh số trong meta vẫn giữ (không escape)', () => {
    expect(md([['画面遷移', '1', '一覧へ']])).toBe('- **画面遷移**: 1. 一覧へ')
    expect(md([['画面遷移', 'A'], ['', '2', '詳細へ']])).toContain('  - 2. 詳細へ')
  })
})

describe('escape: hyperlink, tên sheet, tắt option', () => {
  it('hyperlink: text được escape, URL có khoảng trắng/ngoặc được encode', () => {
    const ws = XLSX.utils.aoa_to_sheet([['*仕様* [v2]']])
    ws['A1'].l = { Target: 'https://example.com/a b(1).html' }
    const out = sheetToMarkdown(ws, 'S', OPTS)
    expect(out).toBe('> [\\*仕様\\* \\[v2\\]](https://example.com/a%20b%281%29.html)')
    const html = marked.parse(out, { async: false }) as string
    expect(html).toContain('href="https://example.com/a%20b%281%29.html"')
    expect(render(out).text).toBe('*仕様* [v2]')
  })

  it('tên sheet có ký tự Markdown được escape trong heading', () => {
    const out = sheetToMarkdown(XLSX.utils.aoa_to_sheet([['x']]), '*draft*', DEFAULT_OPTIONS)
    expect(out.split('\n')[0]).toBe('## \\*draft\\*')
  })

  it('escapeMarkdown=false: xuất nguyên văn như bản cũ (Markdown trong ô được giữ)', () => {
    const off = { ...OPTS, escapeMarkdown: false }
    expect(md([['No', 'A'], ['1', '**bold** <br>']], off)).toContain('| 1 | **bold** <br> |')
    expect(md([['# heading', 'x']], off)).toBe('# heading x')
  })

  it('| vẫn luôn được escape (giữ cấu trúc bảng) kể cả khi tắt option', () => {
    expect(md([['No', 'A'], ['1', 'a|b']], { ...OPTS, escapeMarkdown: false })).toContain('a\\|b')
  })
})
