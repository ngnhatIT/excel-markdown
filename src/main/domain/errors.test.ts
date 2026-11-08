import { describe, expect, it } from 'vitest'
import { codeText, describeError, errorCode, friendlyError, NOT_EXCEL_MESSAGE } from './errors'

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

describe('errorCode / describeError', () => {
  it('lỗi đã biết -> mã E_…; lỗi khác giữ nguyên', () => {
    expect(errorCode(new Error("ENOENT: no such file or directory, open 'x'"))).toBe('E_FILE_NOT_FOUND')
    expect(errorCode(new Error('EBUSY: resource busy'), 'write')).toBe('E_WRITE_LOCKED')
    expect(errorCode(new Error('File is password-protected'))).toBe('E_PASSWORD')
    expect(errorCode(new Error(NOT_EXCEL_MESSAGE))).toBe('E_NOT_EXCEL_FILE') // message từ worker
    expect(errorCode(new Error('E_WORKER_TIMEOUT|120'))).toBe('E_WORKER_TIMEOUT|120')
    expect(errorCode(new Error('boom'))).toBe('boom')
  })

  it('dịch mã theo ngôn ngữ, thay tham số; CLI (friendlyError) vẫn tiếng Việt', () => {
    expect(codeText('E_WORKER_TIMEOUT|120', 'en')).toContain('120 seconds')
    expect(codeText('E_WORKER_CRASHED|3', 'vi')).toContain('(mã 3)')
    expect(codeText('E_UNKNOWN|x', 'ja')).toBe('E_UNKNOWN|x')
    expect(describeError(new Error('EISDIR'), 'ja')).toContain('フォルダー')
    expect(friendlyError(new Error('E_WORKER_TIMEOUT|60'))).toBe('Đọc file quá 60 giây nên đã dừng. File có thể bị hỏng hoặc quá lớn.')
    expect(friendlyError(new Error(NOT_EXCEL_MESSAGE))).toBe(NOT_EXCEL_MESSAGE)
  })
})
