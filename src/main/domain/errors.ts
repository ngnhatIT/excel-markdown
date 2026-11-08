/** Thông báo lỗi thô (lỗi không cần dịch, vd lỗi dialog/store, hoặc worker đã dịch sẵn). */
export const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/** File không phải Excel (đổi đuôi, tải dở, hỏng): xlsxFiles.readWorkbook ném, friendlyError trả về. */
export const NOT_EXCEL_MESSAGE =
  'File không phải Excel hợp lệ hoặc đã bị hỏng (có thể chỉ bị đổi đuôi hoặc tải về chưa xong). Hãy mở thử bằng Excel rồi lưu lại.'

/** Lỗi thô của SheetJS / CFB / zip khi file hỏng (vd "Unsupported ZIP file", "Major Version: Expected 3 or 4 saw 1799"). */
const CORRUPT_RE =
  /Unsupported ZIP|Corrupted zip|zip file|CFB file|Major Version|Header Signature|Bad compressed size|End of data reached|Unsupported file|Invalid HTML/i

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
  // Sau mã lỗi fs: đường dẫn trong lỗi ENOENT... có thể chứa chữ "zip file"
  if (CORRUPT_RE.test(msg)) return NOT_EXCEL_MESSAGE
  return msg
}
