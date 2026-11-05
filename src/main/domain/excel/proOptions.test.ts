import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { DEFAULT_OPTIONS, type ConvertOptions } from '../../../types'
import { extractSheetMeta, parseRange, sheetToMarkdown } from './converter'
import { frontMatter, joinWorkbookMarkdown } from './output'

const OPTS: ConvertOptions = { ...DEFAULT_OPTIONS, includeSheetTitle: false }
const md = (ws: XLSX.WorkSheet, o: Partial<ConvertOptions> = {}): string =>
  sheetToMarkdown(ws, 'S', { ...OPTS, ...o })

const grid = (): XLSX.WorkSheet =>
  XLSX.utils.aoa_to_sheet([
    ['No', 'Tên', 'SL'],
    [1, 'a', 10],
    [2, 'b', 20],
    [3, 'c', 30],
    [4, 'd', 40],
  ])

describe('parseRange', () => {
  it('nhận A1:F40, B2, không phân biệt hoa thường', () => {
    expect(parseRange('a1:f40')).toEqual({ s: { r: 0, c: 0 }, e: { r: 39, c: 5 } })
    expect(parseRange(' B2 ')).toEqual({ s: { r: 1, c: 1 }, e: { r: 1, c: 1 } })
  })
  it('chuỗi lạ / ngược chiều -> null', () => {
    for (const bad of ['', 'abc', 'A1:', 'F5:A1', '1:2', 'A0']) expect(parseRange(bad)).toBeNull()
  })
})

describe('option range', () => {
  it('chỉ convert vùng chọn', () => {
    const out = md(grid(), { range: 'A1:B3' })
    expect(out).toContain('| 2 | b |')
    expect(out).not.toContain('SL')
    expect(out).not.toContain('| 3 |')
  })
  it('range không hợp lệ = cả sheet', () => {
    expect(md(grid(), { range: 'xx' })).toBe(md(grid()))
  })
})

describe('option showFormulas', () => {
  const ws = (): XLSX.WorkSheet => {
    const s = XLSX.utils.aoa_to_sheet([['No', 'Tổng'], [1, 3]])
    s.B2 = { t: 'n', v: 3, f: 'SUM(1,2)' }
    return s
  }
  it('tắt: chỉ giá trị', () => expect(md(ws())).not.toContain('SUM'))
  it('bật: giá trị kèm công thức', () => expect(md(ws(), { showFormulas: true })).toContain('| 1 | 3 `=SUM(1,2)` |'))
})

describe('option chunkRows', () => {
  it('tách khối, lặp header', () => {
    const out = md(grid(), { chunkRows: 3 })
    expect(out.match(/\| No \| Tên \| SL \|/g)).toHaveLength(2)
    expect(out).toContain('| 4 | d | 40 |')
  })
  it('bảng ngắn hơn N giữ nguyên; 0 = tắt', () => {
    expect(md(grid(), { chunkRows: 10 })).toBe(md(grid()))
    expect(md(grid(), { chunkRows: 0 })).toBe(md(grid()))
  })
})

describe('frontMatter', () => {
  it('YAML với giá trị JSON-quoted', () => {
    expect(frontMatter({ source: 'a "b".xlsx', sheet: 'S' })).toBe('---\nsource: "a \\"b\\".xlsx"\nsheet: "S"\n---\n\n')
  })
  it('per-workbook: front-matter đứng đầu, không có thì không đổi', () => {
    const sheets = [{ sheet: 'S1', markdown: 'x' }]
    expect(joinWorkbookMarkdown('b', sheets, true, 'b.xlsx')).toMatch(/^---\nsource: "b.xlsx"\nsheets: \["S1"\]\n---\n\n# b/)
    expect(joinWorkbookMarkdown('b', sheets)).toBe('# b\n\nx\n')
  })
  it('trích xuất title từ banner 基本設計 và các cặp META_LABELS', () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['基本設計', '画面項目定義書（顧客一覧）'],
      ['機能ID', 'FN01', '画面ID', 'SC001'],
      ['No', '項目名', '型'],
      ['1', '顧客コード', 'VARCHAR'],
    ])
    expect(extractSheetMeta(ws, '顧客一覧')).toEqual({
      title: '画面項目定義書（顧客一覧）',
      meta: { 機能ID: 'FN01', 画面ID: 'SC001' },
    })
  })
  it('sheet bảng thường không có banner/meta -> trả object rỗng, frontMatter giữ nguyên 2 dòng', () => {
    const extra = extractSheetMeta(grid(), 'S')
    expect(extra).toEqual({})
    expect(frontMatter({ source: 'a.xlsx', sheet: 'S', ...extra })).toBe(
      '---\nsource: "a.xlsx"\nsheet: "S"\n---\n\n'
    )
  })
})

describe('bố cục nâng cao: header 2 tầng, merge ngang/dọc, ghi chú cuối bảng, căn thẳng cột', () => {
  it('gộp header 2 tầng (merge ngang nhóm cột + merge dọc cột đơn)', () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['No', '項目名', '入力チェック', '', '備考'],
      ['', '', '必須', '桁数', ''],
      ['1', '顧客コード', '○', '10', '半角英数'],
    ])
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }, // No merge dọc
      { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } }, // 項目名 merge dọc
      { s: { r: 0, c: 2 }, e: { r: 0, c: 3 } }, // 入力チェック merge ngang C1:D1
      { s: { r: 0, c: 4 }, e: { r: 1, c: 4 } }, // 備考 merge dọc
    ]
    const out = md(ws)
    expect(out).toBe(
      '| No | 項目名 | 入力チェック / 必須 | 入力チェック / 桁数 | 備考 |\n' +
      '|---|---|---|---|---|\n' +
      '| 1 | 顧客コード | ○ | 10 | 半角英数 |'
    )
  })

  it('gộp dữ liệu nằm trong vùng merge ngang của header (tránh cột rỗng không tên)', () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['No', '項目名', '', '型'],
      ['1', '顧客ID', '', 'VARCHAR'],
      ['2', '', 'サブ項目', 'INT'],
    ])
    ws['!merges'] = [{ s: { r: 0, c: 1 }, e: { r: 0, c: 2 } }] // 項目名 merge B1:C1
    const out = md(ws)
    expect(out).toBe(
      '| No | 項目名 | 型 |\n' +
      '|---|---|---|\n' +
      '| 1 | 顧客ID | VARCHAR |\n' +
      '| 2 | サブ項目 | INT |'
    )
  })

  it('tách dòng ghi chú ※ hoặc 注： ngay sát dưới bảng thành blockquote thay vì nuốt vào bảng', () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['No', '項目名', '必須'],
      ['1', '顧客コード', '○'],
      ['※ 必須項目は○で表示する', '', ''],
    ])
    const out = md(ws)
    expect(out).toBe(
      '| No | 項目名 | 必須 |\n' +
      '|---|---|---|\n' +
      '| 1 | 顧客コード | ○ |\n\n' +
      '> ※ 必須項目は○で表示する'
    )
  })

  it('verticalMerge: repeat vs empty vs ditto', () => {
    const makeMerged = (): XLSX.WorkSheet => {
      const ws = XLSX.utils.aoa_to_sheet([
        ['No', '区分', '項目名'],
        ['1', '入力', '顧客コード'],
        ['2', '', '顧客名'],
      ])
      ws['!merges'] = [{ s: { r: 1, c: 1 }, e: { r: 2, c: 1 } }]
      return ws
    }
    expect(md(makeMerged(), { verticalMerge: 'repeat' })).toContain('| 2 | 入力 | 顧客名 |')
    expect(md(makeMerged(), { verticalMerge: 'empty' })).toContain('| 2 |  | 顧客名 |')
    expect(md(makeMerged(), { verticalMerge: 'ditto' })).toContain('| 2 | ↑ | 顧客名 |')
  })

  it('alignTables: căn thẳng cột theo độ rộng hiển thị (hỗ trợ cả chữ CJK)', () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['No', 'Tên', 'Ghi chú'],
      ['1', 'An', 'OK'],
      ['10', 'Nguyễn Văn B', 'Hợp lệ'],
    ])
    const out = md(ws, { alignTables: true })
    const lines = out.split('\n')
    expect(lines).toHaveLength(4)
    // Mọi dòng ASCII thuần phải có độ dài ký tự bằng nhau khi đã căn cột
    expect(lines[0].length).toBe(lines[1].length)
    expect(lines[1].length).toBe(lines[2].length)
    expect(lines[2].length).toBe(lines[3].length)
  })
})
