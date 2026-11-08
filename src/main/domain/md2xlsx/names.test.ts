import { describe, expect, it } from 'vitest'
import type { SheetModel } from './model'
import { assignSheetNames, nameAndLinkSheets, safeSheetName } from './names'

const fresh = () => new Set<string>()

describe('safeSheetName', () => {
  it('thay ký tự cấm bằng _', () => {
    expect(safeSheetName('a/b:c[1]*?\\', fresh())).toBe('a_b_c_1____')
  })

  it('cắt còn 31 ký tự', () => {
    expect(safeSheetName('x'.repeat(40), fresh())).toHaveLength(31)
  })

  it('tên rỗng sau trim -> Sheet', () => {
    expect(safeSheetName('  ', fresh())).toBe('Sheet')
  })

  it('History (không phân biệt hoa/thường) -> thêm _', () => {
    expect(safeSheetName('History', fresh())).toBe('History_')
    expect(safeSheetName('history', fresh())).toBe('history_')
  })

  it("dấu nháy đơn ở đầu/cuối -> _ (Excel/exceljs từ chối)", () => {
    expect(safeSheetName("'abc'", fresh())).toBe('_abc_')
    expect(safeSheetName("'", fresh())).toBe('_')
    // dấu nháy ở giữa giữ nguyên
    expect(safeSheetName("a'b", fresh())).toBe("a'b")
  })

  it("phép cắt 31 ký tự để lộ dấu nháy ở cuối -> vẫn không kết thúc bằng '", () => {
    const out = safeSheetName('x'.repeat(30) + "'y", fresh())
    expect(out.endsWith("'")).toBe(false)
    expect(out).toBe('x'.repeat(30) + '_')
  })

  it('phép cắt để lại khoảng trắng ở cuối -> trim lại sau khi cắt', () => {
    expect(safeSheetName('x'.repeat(30) + ' y', fresh())).toBe('x'.repeat(30))
  })

  it('trùng không phân biệt hoa/thường -> thêm hậu tố (n)', () => {
    const used = fresh()
    expect(['Sheet', 'sheet', 'SHEET'].map((n) => safeSheetName(n, used))).toEqual([
      'Sheet',
      'sheet (2)',
      'SHEET (3)'
    ])
  })

  it('trùng khi đã đủ 31 ký tự -> cắt phần gốc để tổng <= 31', () => {
    const used = fresh()
    safeSheetName('y'.repeat(31), used)
    const second = safeSheetName('y'.repeat(31), used)
    expect(second).toBe('y'.repeat(27) + ' (2)')
    expect(second.length).toBeLessThanOrEqual(31)
  })

  it('bỏ ký tự cấm của XML 1.0 trước khi trim/cắt/khử trùng', () => {
    expect(safeSheetName('A\uFFFEB', fresh())).toBe('AB')
    expect(safeSheetName('A\uFFFFB\u0001C\u000BD\u001FE', fresh())).toBe('ABCDE')
  })

  it('tên chỉ gồm ký tự cấm XML -> Sheet', () => {
    expect(safeSheetName('\u0001', fresh())).toBe('Sheet')
    expect(safeSheetName('\uFFFE \u0002', fresh())).toBe('Sheet')
  })

  it('hai tên chỉ khác ký tự cấm XML vẫn được khử trùng sau khi bỏ ký tự', () => {
    const used = fresh()
    expect(safeSheetName('X\u0002', used)).toBe('X')
    expect(safeSheetName('X\u0003', used)).toBe('X (2)')
  })

  it('tự thêm tên trả về vào used (chữ thường)', () => {
    const used = fresh()
    safeSheetName('Abc', used)
    expect(used.has('abc')).toBe(true)
  })
})

describe('assignSheetNames', () => {
  it('trả bản sao với tên hợp lệ, không trùng', () => {
    const input = [
      { name: 'A', blocks: [] },
      { name: 'a', blocks: [] }
    ]
    const out = assignSheetNames(input)
    expect(out.map((s) => s.name)).toEqual(['A', 'a (2)'])
    // không sửa đầu vào
    expect(input.map((s) => s.name)).toEqual(['A', 'a'])
    expect(out[0]).not.toBe(input[0])
  })
})


describe('nameAndLinkSheets: link sang sheet khác', () => {
  const cell = (link: string) => ({ text: 'x', link })
  const tbl = (...links: string[]): SheetModel['blocks'][number] => ({ kind: 'table', header: [{ text: 'h' }], rows: links.map((l) => [cell(l)]) })

  it('#slug -> sheet cùng file; x.md -> sheet đầu của file trong lần tạo; không giải được -> bỏ link', () => {
    const a: SheetModel[] = [
      { name: '一覧', blocks: [tbl('#テーブル定義', '#none', 'b__Detail.md', './sub/../b__Detail.md#x', 'zzz.md'), { kind: 'paragraph', text: 'p', link: '#it-s' }] },
      { name: 'テーブル定義', blocks: [] },
      { name: "It's", blocks: [] }
    ]
    const b: SheetModel[] = [{ name: 'Detail', blocks: [] }, { name: 'Second', blocks: [] }]
    const named = nameAndLinkSheets([
      { path: '/w/b__List.md', sheets: a },
      { path: '/w/b__Detail.md', sheets: b }
    ])
    expect(named.map((s) => s.name)).toEqual(['一覧', 'テーブル定義', "It's", 'Detail', 'Second'])
    const rows = (named[0].blocks[0] as Extract<SheetModel['blocks'][number], { kind: 'table' }>).rows
    expect(rows.map((r) => r[0].link)).toEqual(["'テーブル定義'!A1", undefined, "'Detail'!A1", "'Detail'!A1", undefined])
    expect(named[0].blocks[1]).toEqual({ kind: 'paragraph', text: 'p', link: "'It''s'!A1" })
  })

  it('tên sheet có dấu câu: nhận slug kiểu GitHub (ab-一覧) và slug kiểu cũ (a-b-一覧)', () => {
    const s: SheetModel[] = [{ name: 'X', blocks: [tbl('#ab-一覧', '#a-b-一覧')] }, { name: 'A&B 一覧', blocks: [] }]
    const rows = (nameAndLinkSheets([{ path: 'a.md', sheets: s }])[0].blocks[0] as Extract<SheetModel['blocks'][number], { kind: 'table' }>).rows
    expect(rows.map((r) => r[0].link)).toEqual(["'A&B 一覧'!A1", "'A&B 一覧'!A1"])
  })

  it('link ngoài giữ nguyên; tên sheet có `!` -> bỏ link (exceljs không ghi được)', () => {
    const s: SheetModel[] = [{ name: 'A', blocks: [tbl('https://x.example', '#b-c')] }, { name: 'B!C', blocks: [] }]
    const rows = (nameAndLinkSheets([{ path: 'a.md', sheets: s }])[0].blocks[0] as Extract<SheetModel['blocks'][number], { kind: 'table' }>).rows
    expect(rows.map((r) => r[0].link)).toEqual(['https://x.example', undefined])
  })
})
