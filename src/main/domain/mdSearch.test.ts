import { describe, expect, it } from 'vitest'
import { searchMarkdownText, searchTerms } from './mdSearch'

describe('searchMarkdownText', () => {
  const md = '# 顧客検索\n\n- **画面ID**: SCR010\n\n### 【項目定義】\n\n| 1 | 顧客コード | 必須 |\n| 2 | 顧客名 | 任意 |\n'

  it('khớp không phân biệt hoa thường, mọi từ khóa trên cùng dòng, kèm heading gần nhất', () => {
    expect(searchMarkdownText(md, searchTerms('scr010'))).toEqual([{ line: 3, text: '- **画面ID**: SCR010', heading: '顧客検索' }])
    expect(searchMarkdownText(md, searchTerms('顧客  必須'))).toEqual([
      { line: 7, text: '| 1 | 顧客コード | 必須 |', heading: '【項目定義】' },
    ])
    expect(searchMarkdownText(md, searchTerms('顧客')).map((h) => h.line)).toEqual([1, 7, 8])
  })

  it('giới hạn số kết quả; từ khóa rỗng không khớp gì; heading escape được bỏ \\', () => {
    expect(searchMarkdownText(md, searchTerms('顧客'), 2)).toHaveLength(2)
    expect(searchMarkdownText(md, searchTerms('   '))).toEqual([])
    expect(searchMarkdownText('## A\\_B\nxyz', ['xyz'])[0].heading).toBe('A_B')
  })

  it('dòng dài: đoạn trích cắt quanh chỗ khớp', () => {
    const line = 'a'.repeat(300) + 'KEY' + 'b'.repeat(300)
    const [hit] = searchMarkdownText(line, ['key'])
    expect(hit.text).toContain('KEY')
    expect(hit.text.startsWith('…') && hit.text.endsWith('…')).toBe(true)
    expect(hit.text.length).toBeLessThanOrEqual(162)
  })
})

describe('searchMarkdownText: hiragana ↔ katakana', () => {
  it('てーぶる tìm ra テーブル', () => {
    expect(searchMarkdownText('## テーブル定義\n', searchTerms('てーぶる'))).toHaveLength(1)
  })
})
