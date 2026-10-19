import { describe, expect, it } from 'vitest'
import { assignSheetNames, safeSheetName } from './names'

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
