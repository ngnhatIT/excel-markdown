import { describe, expect, it } from 'vitest'
import { defaultWorkbookName } from './workbookName'

describe('defaultWorkbookName', () => {
  it('mọi file có __ và tiền tố cuối giống nhau -> tiền tố', () => {
    expect(
      defaultWorkbookName([
        { path: 'C:\\d\\kihon__画面.md', title: null },
        { path: 'C:\\d\\kihon__テーブル.md', title: 'x' }
      ])
    ).toBe('kihon')
  })

  it('tiền tố khác nhau -> title của file đầu', () => {
    expect(
      defaultWorkbookName([
        { path: 'C:\\d\\a__x.md', title: '基本設計書' },
        { path: 'C:\\d\\b__y.md', title: null }
      ])
    ).toBe('基本設計書')
  })

  it('không có __ -> tên file đầu không đuôi', () => {
    expect(defaultWorkbookName([{ path: 'C:\\d\\memo.md', title: null }])).toBe('memo')
  })

  it('nhiều __ -> lấy phần trước __ cuối cùng; đường dẫn dạng /', () => {
    expect(defaultWorkbookName([{ path: '/d/a__b__c.md', title: null }])).toBe('a__b')
  })

  it('danh sách rỗng -> workbook', () => {
    expect(defaultWorkbookName([])).toBe('workbook')
  })

  it('title rỗng/khoảng trắng -> bỏ qua, dùng tên file', () => {
    expect(
      defaultWorkbookName([
        { path: 'C:\\d\\a__x.md', title: '  ' },
        { path: 'C:\\d\\b__y.md', title: null }
      ])
    ).toBe('a__x')
  })
})
