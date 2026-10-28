/* Shared types between main, preload and renderer */

export interface ConvertOptions {
  /** Them "## Ten sheet" truoc moi sheet */
  includeSheetTitle: boolean
  /** Bo qua sheet ten bat dau bang DEL_ */
  skipDelSheets: boolean
  /** Bo qua sheet rong */
  skipEmptySheets: boolean
  /** O nhieu dong: 'br' -> <br>, 'space' -> gop 1 dong */
  multiline: 'br' | 'space'
  /** Nhận diện bảng 2 cột (mặc định tắt để giữ hành vi cũ trên tài liệu 基本設計) */
  detectTwoColTables: boolean
  /** Escape ký tự Markdown/HTML trong ô (`<null>`, `*x*`, `# x`...) để bản render
   * hiển thị đúng nội dung ô. Tắt khi ô Excel cố ý chứa cú pháp Markdown. */
  escapeMarkdown: boolean
}

export const DEFAULT_OPTIONS: ConvertOptions = {
  includeSheetTitle: true,
  skipDelSheets: true,
  skipEmptySheets: true,
  multiline: 'br',
  detectTwoColTables: false,
  escapeMarkdown: true,
}

export type OutputMode = 'per-sheet' | 'per-workbook'

export interface SheetInfo {
  name: string
  rows: number
  checked: boolean
  /** Sheet bị ẩn trong Excel */
  hidden: boolean
}

export interface FileItem {
  id: string
  path: string
  name: string
  sheets: SheetInfo[]
  loading: boolean
  error?: string
}

export interface ConvertFileSpec {
  path: string
  sheets: string[]
}

export interface ConvertResultItem {
  fileName: string
  ok: boolean
  /** File chưa convert vì người dùng bấm Hủy */
  cancelled?: boolean
  filesWritten: string[]
  error?: string
}

export interface ApiResult<T> {
  ok: boolean
  data?: T
  error?: string
}

/** Chế độ làm việc của app: Excel → Markdown (mặc định), Markdown → Excel hoặc Đọc Markdown. */
export type AppMode = 'excel2md' | 'md2excel' | 'mdview'

/** Các file Markdown trong một thư mục (chế độ Đọc Markdown). */
export interface MdFolderListing {
  /** Thư mục gốc (đường dẫn tuyệt đối) */
  root: string
  /** Đường dẫn tương đối từ `root`, phân cách `/` */
  files: string[]
  /** mtime (ms) theo đường dẫn tương đối trong `files`; file không stat được thì thiếu khóa */
  mtimes: Record<string, number>
  /** Quá nhiều file nên dừng quét giữa chừng */
  truncated: boolean
}

/** Kết quả đọc nhanh một file Markdown (preview + danh sách sheet sẽ tạo). */
export interface MdInspectResult {
  /** `# tiêu đề` đầu file (dùng cho tên file Excel mặc định); null nếu không có */
  title: string | null
  /** Tên sheet đã hợp lệ/không trùng trong riêng file này */
  sheets: string[]
  /** Nội dung Markdown nguyên văn để hiển thị preview */
  markdown: string
}

/** Một file trong danh sách chế độ Markdown → Excel (thứ tự danh sách = thứ tự sheet). */
export interface MdFileItem {
  id: string
  path: string
  name: string
  /** Đang đọc nhanh file (inspectMarkdown) */
  loading: boolean
  error?: string
  /** `# tiêu đề` đầu file; null nếu không có */
  title: string | null
  /** Tên sheet sẽ tạo từ file này */
  sheets: string[]
  /** Nội dung nguyên văn để preview */
  markdown: string
}

/** Kết quả Markdown → Excel. `declined`: người dùng chọn không ghi đè file đã có. */
export type MdConvertResult =
  | { status: 'done'; outPath: string; sheets: string[] }
  | { status: 'cancelled' }
  | { status: 'declined' }
