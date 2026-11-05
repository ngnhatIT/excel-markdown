import { describe, expect, it } from 'vitest'
import { compressMarkdownLossless, parseMarkdownForRag } from './chunker'

describe('compressMarkdownLossless', () => {
  it('thu gọn khoảng trắng căn cột bảng và dòng trống thừa nhưng giữ nguyên 100% dữ liệu, bảng 版数 và ghi chú ※', () => {
    const raw = [
      '## 顧客一覧',
      '',
      '',
      '> 基本設計：画面項目定義書',
      '',
      '| 版数   | 作成日     | 作成者   |',
      '| ------ | ---------- | -------- |',
      '| 1.0    | 2026/10/01 | 山田     |',
      '',
      '- **機能ID**: FN01',
      '- **画面ID**: SC001',
      '',
      '### 【項目定義】',
      '| No   | 項目名       | 必須 |',
      '| ---- | ------------ | ---- |',
      '| 1    | 顧客コード   | ○    |',
      '',
      '> ※ 必須項目は○で示す',
    ].join('\n')

    const compressed = compressMarkdownLossless(raw)
    expect(compressed).toContain('| 版数 | 作成日 | 作成者 |\n|---|---|---|\n| 1.0 | 2026/10/01 | 山田 |')
    expect(compressed).toContain('| No | 項目名 | 必須 |\n|---|---|---|\n| 1 | 顧客コード | ○ |')
    expect(compressed).toContain('> ※ 必須項目は○で示す')
    expect(compressed).not.toContain('\n\n\n')
    expect(compressed.length).toBeLessThan(raw.length)
  })
})

describe('parseMarkdownForRag', () => {
  it('trích xuất metaHeader, outline và tách các RagSection theo ## / ### mà không cắt bảng', () => {
    const md = [
      '---',
      'source: "spec.xlsx"',
      'sheet: "SC001"',
      '---',
      '## SC001_顧客一覧',
      '> 基本設計：画面項目定義書',
      '- **機能ID**: FN01',
      '- **画面ID**: SC001',
      '### 【項目定義】',
      '| No | 項目名 |',
      '|---|---|',
      '| 1 | 顧客コード |',
      '### 【イベント定義】',
      '| No | イベント名 |',
      '|---|---|',
      '| 1 | 検索ボタン押下 |',
    ].join('\n')

    const doc = parseMarkdownForRag('/abs/SC001.md', 'SC001.md', md, 123)
    expect(doc.metaHeader).toContain('SC001.md')
    expect(doc.metaHeader).toContain('機能ID: FN01')
    expect(doc.metaHeader).toContain('画面ID: SC001')
    expect(doc.outline).toEqual(['SC001_顧客一覧', '【項目定義】', '【イベント定義】'])
    expect(doc.sections.map((s) => s.sectionTitle)).toEqual(['Tổng quan', '【項目定義】', '【イベント定義】'])
    expect(doc.sections[1].content).toContain('| 1 | 顧客コード |')
  })

  it('file không có heading hoặc file rỗng không crash', () => {
    const doc = parseMarkdownForRag('/a.md', 'a.md', 'Chỉ có chữ thuần')
    expect(doc.sections).toHaveLength(1)
    expect(doc.sections[0].sectionTitle).toBe('Tổng quan')
    const empty = parseMarkdownForRag('/e.md', 'e.md', '   ')
    expect(empty.sections).toHaveLength(0)
    expect(empty.tokensEst).toBe(0)
  })
})
