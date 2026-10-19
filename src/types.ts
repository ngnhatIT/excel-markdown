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
  filesWritten: string[]
  error?: string
}

export interface ApiResult<T> {
  ok: boolean
  data?: T
  error?: string
}
