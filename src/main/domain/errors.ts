/** Thông báo lỗi thô (lỗi không cần dịch, vd lỗi dialog/store, hoặc worker đã dịch sẵn). */
export const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/** Chuyển lỗi kỹ thuật (SheetJS...) thành thông báo tiếng Việt dễ hiểu.
 * `op`: 'read' (đọc file, mặc định) hoặc 'write' (ghi file Excel đầu ra). */
export function friendlyError(err: unknown, op: 'read' | 'write' = 'read'): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (op === 'write' && /EBUSY|EPERM|EACCES/.test(msg)) {
    return 'Không ghi được file Excel. File có thể đang mở trong Excel — đóng file rồi thử lại.'
  }
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
