import { describe, expect, it } from 'vitest'
import { friendlyError, NOT_EXCEL_MESSAGE } from './errors'

describe('friendlyError', () => {
  it('lỗi password-protected -> tiếng Việt', () => {
    expect(friendlyError(new Error('File is password-protected'))).toContain('mật khẩu')
    expect(friendlyError(new Error('File is password-protected: ECMA-376 Extensible'))).toContain(
      'mật khẩu'
    )
  })

  it('ENOENT -> tiếng Việt', () => {
    expect(friendlyError(new Error("ENOENT: no such file or directory, open 'x'"))).toContain(
      'Không tìm thấy file'
    )
  })

  it('EACCES/EPERM -> gợi ý file bị khóa', () => {
    expect(friendlyError(new Error('EACCES: permission denied'))).toContain('bị khóa')
    expect(friendlyError(new Error('EPERM: operation not permitted'))).toContain('bị khóa')
  })

  it('EISDIR -> báo là thư mục', () => {
    expect(friendlyError(new Error('EISDIR: illegal operation on a directory'))).toContain('thư mục')
  })

  it('lỗi SheetJS / CFB / zip của file hỏng -> tiếng Việt', () => {
    for (const m of ['Unsupported ZIP file', 'Major Version: Expected 3 or 4 saw 1799', 'Bad compressed size: 0 != 383', 'CFB file size 8 < 512']) {
      expect(friendlyError(new Error(m))).toBe(NOT_EXCEL_MESSAGE)
    }
    // Mã lỗi fs thắng chữ "zip file" trong đường dẫn
    expect(friendlyError(new Error("ENOENT: no such file or directory, open '/a/zip file.xlsx'"))).toContain('Không tìm thấy')
  })

  it('lỗi khác giữ nguyên message', () => {
    expect(friendlyError(new Error('boom'))).toBe('boom')
    expect(friendlyError('raw string')).toBe('raw string')
  })

  it("op 'write': EBUSY/EPERM -> gợi ý đóng file đang mở trong Excel", () => {
    const w = 'Không ghi được file Excel. File có thể đang mở trong Excel — đóng file rồi thử lại.'
    expect(friendlyError(new Error('EBUSY: resource busy or locked'), 'write')).toBe(w)
    expect(friendlyError(new Error('EPERM: operation not permitted, rename'), 'write')).toBe(w)
    expect(friendlyError(new Error('EPERM: x'))).toContain('Không đọc được file') // 'read' giữ nguyên
  })
})
