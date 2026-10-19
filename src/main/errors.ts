/** Chuyển lỗi kỹ thuật (SheetJS...) thành thông báo tiếng Việt dễ hiểu. */
export function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (/password-protected/i.test(msg)) {
    return 'File có mật khẩu nên không đọc được. Hãy mở bằng Excel, gỡ mật khẩu rồi thử lại.'
  }
  if (/ENOENT/.test(msg)) {
    return 'Không tìm thấy file. Có thể file đã bị di chuyển, đổi tên hoặc xóa.'
  }
  if (/EACCES|EPERM/.test(msg)) {
    return 'Không đọc được file. File có thể đang mở trong Excel hoặc bị khóa bởi chương trình khác.'
  }
  if (/EISDIR/.test(msg)) {
    return 'Đường dẫn là thư mục, không phải file Excel.'
  }
  return msg
}
