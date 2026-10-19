import { describe, expect, it } from 'vitest'
import { displayWidth, estimateLines, splitByLines } from './layout'

describe('displayWidth', () => {
  it('ký tự mã > 0xFF tính 2, còn lại tính 1', () => {
    expect(displayWidth('aあ')).toBe(3)
    expect(displayWidth('abc')).toBe(3)
    expect(displayWidth('')).toBe(0)
  })

  it('chuỗi nhiều dòng lấy dòng rộng nhất', () => {
    expect(displayWidth('ab\nあいう')).toBe(6)
    expect(displayWidth('abcdef\nあ')).toBe(6)
    expect(displayWidth('ab\r\nあいう')).toBe(6)
  })

  it('cặp surrogate (ký tự ngoài BMP) tính một ký tự rộng 2, không phải 4', () => {
    expect(displayWidth('😀')).toBe(2)
    expect(displayWidth('a😀')).toBe(3)
  })
})

describe('estimateLines', () => {
  it('một dòng ngắn là 1 dòng; dòng dài chia theo tổng độ rộng', () => {
    expect(estimateLines('ab', 10)).toBe(1)
    expect(estimateLines('a'.repeat(25), 10)).toBe(3)
    expect(estimateLines('あ'.repeat(6), 10)).toBe(2)
  })

  it('cộng dồn từng dòng thật; dòng trống vẫn chiếm 1 dòng', () => {
    expect(estimateLines('a\nb', 10)).toBe(2)
    expect(estimateLines('', 10)).toBe(1)
    expect(estimateLines('a\n\nb', 10)).toBe(3)
    expect(estimateLines('a'.repeat(25) + '\nb', 10)).toBe(4)
  })

  it('đúng biên: vừa khít không thêm dòng', () => {
    expect(estimateLines('a'.repeat(10), 10)).toBe(1)
    expect(estimateLines('a'.repeat(11), 10)).toBe(2)
  })

  it('tổng độ rộng không hợp lệ không sinh Infinity/NaN', () => {
    expect(Number.isFinite(estimateLines('abc', 0))).toBe(true)
    expect(estimateLines('abc', 0)).toBeGreaterThanOrEqual(1)
  })
})

describe('splitByLines', () => {
  // Nửa cặp surrogate (cao không có thấp theo sau, hoặc thấp không có cao đứng trước).
  const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/

  it('văn bản vừa trong giới hạn -> một khối nguyên vẹn', () => {
    expect(splitByLines('a\nb\nc', 10, 24)).toEqual(['a\nb\nc'])
    expect(splitByLines('', 10, 24)).toEqual([''])
  })

  it('60 dòng ngắn, tối đa 24 dòng mỗi khối -> 24 + 24 + 12; nối lại bằng xuống dòng ra bản gốc', () => {
    const lines = Array.from({ length: 60 }, (_, i) => `l${i}`)
    const rows = splitByLines(lines.join('\n'), 10, 24)
    expect(rows.map((r) => r.split('\n').length)).toEqual([24, 24, 12])
    expect(rows.join('\n')).toBe(lines.join('\n'))
  })

  it('dòng bị wrap tính theo estimateLines: ghép nguyên dòng thật, không cắt dòng đi vừa', () => {
    // mỗi dòng 25 ký tự / rộng 10 = 3 dòng hiển thị; tối đa 7 -> 2 dòng thật mỗi khối (6 <= 7 < 9)
    const lines = Array.from({ length: 5 }, () => 'a'.repeat(25))
    const rows = splitByLines(lines.join('\n'), 10, 7)
    expect(rows.map((r) => r.split('\n').length)).toEqual([2, 2, 1])
    for (const r of rows) expect(estimateLines(r, 10)).toBeLessThanOrEqual(7)
  })

  it('một dòng tự nó vượt giới hạn -> cắt theo độ rộng hiển thị, mỗi mảnh vừa maxLines, nối lại ra bản gốc', () => {
    const line = 'x'.repeat(20000)
    const rows = splitByLines(line, 33.72, 24)
    expect(rows.length).toBeGreaterThan(1)
    for (const r of rows) expect(estimateLines(r, 33.72)).toBeLessThanOrEqual(24)
    expect(rows.join('')).toBe(line)
  })

  it('dòng quá dài nằm giữa các dòng ngắn: dòng ngắn ở khối riêng, thứ tự không đổi', () => {
    const rows = splitByLines('a\n' + 'x'.repeat(5000) + '\nb', 33.72, 24)
    expect(rows[0]).toBe('a')
    expect(rows[rows.length - 1]).toBe('b')
    expect(rows.slice(1, -1).join('')).toBe('x'.repeat(5000))
  })

  it('cắt dòng dài không làm vỡ cặp surrogate; ký tự rộng 2 vẫn vừa giới hạn', () => {
    const line = '😀'.repeat(3000) + 'あ'.repeat(3000)
    const rows = splitByLines(line, 33.72, 24)
    expect(rows.join('')).toBe(line)
    for (const r of rows) {
      expect(r).not.toMatch(lone)
      expect(estimateLines(r, 33.72)).toBeLessThanOrEqual(24)
    }
  })

  it('maxChars: khối không vượt số ký tự tối đa (ghép dòng và cắt dòng dài)', () => {
    const rows = splitByLines(['aaaa', 'bbbb', 'cccc'].join('\n'), 1000, 24, 9)
    expect(rows).toEqual(['aaaa\nbbbb', 'cccc'])
    const cut = splitByLines('y'.repeat(25), 1000, 24, 10)
    expect(cut.map((r) => r.length)).toEqual([10, 10, 5])
    expect(cut.join('')).toBe('y'.repeat(25))
  })

  it('tổng độ rộng không hợp lệ không treo', () => {
    expect(splitByLines('abc', 0, 24).join('')).toBe('abc')
  })
})
