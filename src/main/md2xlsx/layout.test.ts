import { describe, expect, it } from 'vitest'
import { displayWidth, estimateLines } from './layout'

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
