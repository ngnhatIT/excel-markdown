/** Thông báo lỗi thô (lỗi không cần dịch, vd lỗi dialog/store, hoặc worker đã dịch sẵn). */
export const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/** File không phải Excel (đổi đuôi, tải dở, hỏng): xlsxFiles.readWorkbook ném, friendlyError trả về. */
export const NOT_EXCEL_MESSAGE =
  'File không phải Excel hợp lệ hoặc đã bị hỏng (có thể chỉ bị đổi đuôi hoặc tải về chưa xong). Hãy mở thử bằng Excel rồi lưu lại.'

/** Lỗi thô của SheetJS / CFB / zip khi file hỏng (vd "Unsupported ZIP file", "Major Version: Expected 3 or 4 saw 1799"). */
const CORRUPT_RE =
  /Unsupported ZIP|Corrupted zip|zip file|CFB file|Major Version|Header Signature|Bad compressed size|End of data reached|Unsupported file|Invalid HTML/i

export type ErrLang = 'vi' | 'en' | 'ja'

/** Mã lỗi `E_…` (tham số sau dấu `|`, vd `E_WORKER_TIMEOUT|120`) -> chữ theo ngôn ngữ.
 * Renderer có bản dịch riêng của cùng các mã (i18n/errors.ts); bảng này cho CLI/MCP (tiếng Việt)
 * và lỗi từng file trong kết quả convert (main dịch theo ngôn ngữ giao diện). */
const ERROR_TEXT: Record<string, Record<ErrLang, string>> = {
  E_WRITE_LOCKED: {
    vi: 'Không ghi được file Excel. File có thể đang mở trong Excel — đóng file rồi thử lại.',
    en: 'Cannot write the Excel file. It may be open in Excel — close it and try again.',
    ja: 'Excel ファイルを書き込めません。Excel で開いている可能性があります。閉じてから再試行してください。',
  },
  E_PASSWORD: {
    vi: 'File có mật khẩu nên không đọc được. Hãy mở bằng Excel, gỡ mật khẩu rồi thử lại.',
    en: 'The file is password-protected. Open it in Excel, remove the password and try again.',
    ja: 'パスワード付きのファイルは読み込めません。Excel でパスワードを解除してから再試行してください。',
  },
  E_FILE_NOT_FOUND: {
    vi: 'Không tìm thấy file. Có thể file đã bị di chuyển, đổi tên hoặc xóa.',
    en: 'File not found. It may have been moved, renamed or deleted.',
    ja: 'ファイルが見つかりません。移動・名前変更・削除された可能性があります。',
  },
  E_FILE_LOCKED: {
    vi: 'Không đọc được file. File có thể đang mở trong Excel hoặc bị khóa bởi chương trình khác.',
    en: 'Cannot read the file. It may be open in Excel or locked by another program.',
    ja: 'ファイルを読み込めません。Excel で開いているか、他のプログラムがロックしている可能性があります。',
  },
  E_IS_DIR: {
    vi: 'Đường dẫn là thư mục, không phải file Excel.',
    en: 'The path is a folder, not an Excel file.',
    ja: 'パスはフォルダーで、Excel ファイルではありません。',
  },
  E_NOT_EXCEL_FILE: {
    vi: NOT_EXCEL_MESSAGE,
    en: 'Not a valid Excel file or the file is corrupted (it may just be renamed or not fully downloaded). Try opening it in Excel and saving it again.',
    ja: '有効な Excel ファイルではないか、破損しています（拡張子の変更やダウンロード途中の可能性）。Excel で開いて保存し直してください。',
  },
  E_WORKER_CRASHED: {
    vi: 'Tiến trình đọc Excel dừng bất thường (mã {0}). File có thể quá lớn hoặc bị hỏng; hãy thử lại.',
    en: 'The Excel reader process stopped unexpectedly (code {0}). The file may be too large or corrupted; please try again.',
    ja: 'Excel 読み込みプロセスが異常終了しました（コード {0}）。ファイルが大きすぎるか破損している可能性があります。再試行してください。',
  },
  E_WORKER_TIMEOUT: {
    vi: 'Đọc file quá {0} giây nên đã dừng. File có thể bị hỏng hoặc quá lớn.',
    en: 'Reading the file took longer than {0} seconds and was stopped. The file may be corrupted or too large.',
    ja: 'ファイルの読み込みが {0} 秒を超えたため中止しました。ファイルが破損しているか大きすぎる可能性があります。',
  },
}

const CODE_RE = /^(E_[A-Z_]+)(?:\|([\s\S]*))?$/

/** Lỗi kỹ thuật (fs, SheetJS...) -> mã `E_…` cho các trường hợp đã biết; còn lại giữ nguyên message.
 * `op`: 'read' (đọc file, mặc định) hoặc 'write' (ghi file Excel đầu ra). */
export function errorCode(err: unknown, op: 'read' | 'write' = 'read'): string {
  const msg = errText(err)
  if (CODE_RE.test(msg)) return msg // đã là mã (worker dừng / quá giờ)
  if (op === 'write' && /EBUSY|EPERM|EACCES/.test(msg)) return 'E_WRITE_LOCKED'
  if (/password-protected/i.test(msg)) return 'E_PASSWORD'
  if (/ENOENT/.test(msg)) return 'E_FILE_NOT_FOUND'
  if (/EACCES|EPERM/.test(msg)) return 'E_FILE_LOCKED'
  if (/EISDIR/.test(msg)) return 'E_IS_DIR'
  // Sau mã lỗi fs: đường dẫn trong lỗi ENOENT... có thể chứa chữ "zip file"
  if (msg === NOT_EXCEL_MESSAGE || CORRUPT_RE.test(msg)) return 'E_NOT_EXCEL_FILE'
  return msg
}

/** Chữ của mã `E_…` (có tham số) theo `lang`; không phải mã đã biết thì trả nguyên văn. */
export function codeText(codeOrMsg: string, lang: ErrLang): string {
  const m = CODE_RE.exec(codeOrMsg)
  const text = m ? ERROR_TEXT[m[1]]?.[lang] : undefined
  return text === undefined ? codeOrMsg : text.replace('{0}', m?.[2] ?? '')
}

/** Lỗi -> câu dễ hiểu theo ngôn ngữ `lang`. */
export const describeError = (err: unknown, lang: ErrLang, op: 'read' | 'write' = 'read'): string =>
  codeText(errorCode(err, op), lang)

/** Chuyển lỗi kỹ thuật (SheetJS...) thành thông báo tiếng Việt dễ hiểu (CLI, MCP, worker Markdown → Excel).
 * IPC trả `errorCode` để renderer dịch theo ngôn ngữ giao diện. */
export const friendlyError = (err: unknown, op: 'read' | 'write' = 'read'): string => describeError(err, 'vi', op)
