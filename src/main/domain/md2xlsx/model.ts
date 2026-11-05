// Mô hình trung gian giữa bộ phân tích Markdown và bộ ghi Excel.

/** Một ô: chữ hiển thị + liên kết tuỳ chọn (chỉ http/https/mailto mới thành hyperlink). */
export interface XCell {
  text: string
  link?: string
}

export type Block =
  | { kind: 'banner'; label: string; title: string }
  | { kind: 'table'; header: XCell[]; rows: XCell[][] }
  | { kind: 'meta'; items: { label: string; value: XCell }[] }
  | { kind: 'heading'; text: string }
  | { kind: 'note'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'code'; lines: string[] }

/** Một sheet Excel: tên + danh sách khối nội dung theo thứ tự. */
export interface SheetModel {
  name: string
  blocks: Block[]
}

/** Kết quả phân tích một file Markdown. */
export interface ParsedFile {
  title: string | null
  sheets: SheetModel[]
}
