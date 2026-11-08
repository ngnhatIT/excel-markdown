// Mô hình trung gian giữa bộ phân tích Markdown và bộ ghi Excel.

/** Một đoạn chữ cùng định dạng trong ô (rich text). */
export interface Run {
  text: string
  bold?: boolean
  italic?: boolean
  strike?: boolean
  code?: boolean
}

/** Căn ngang cột bảng theo dòng phân cách `:---:` / `---:` / `:---`. */
export type Align = 'left' | 'center' | 'right' | null

/**
 * Một ô: chữ hiển thị + liên kết tuỳ chọn. `link`: http/https/mailto thành hyperlink; `#slug` / `x.md` là link
 * nội bộ chờ giải (linkSheets) thành `'Sheet'!A1`. `runs`: chỉ có khi ô có định dạng (đậm/nghiêng/gạch/code);
 * nối `runs` ra đúng `text`. `note`: ghi chú Excel (từ dòng `〔コメント〕`).
 */
export interface XCell {
  text: string
  link?: string
  runs?: Run[]
  note?: string
}

/** Ảnh đã đọc từ đĩa (adapter điền vào block image). */
export interface ImageData {
  data: Buffer
  extension: 'png' | 'jpeg'
  width: number
  height: number
}

export type Block =
  | { kind: 'banner'; label: string; title: string }
  | {
      kind: 'table'
      header: XCell[]
      rows: XCell[][]
      align?: Align[]
      /** Danh sách thả xuống (từ dòng `〔入力規則〕`) áp cho cột `col` (0 = cột A) của mọi hàng dữ liệu. */
      validations?: { col: number; values: string[] }[]
    }
  | { kind: 'meta'; items: { label: string; value: XCell }[] }
  | { kind: 'heading'; text: string }
  | { kind: 'note'; text: string; link?: string }
  | { kind: 'paragraph'; text: string; link?: string }
  /** Ảnh đứng riêng một đoạn: `src` thô trong Markdown; `image` do adapter điền khi đọc được, không có thì ghi `alt`. */
  | { kind: 'image'; alt: string; src: string; image?: ImageData }
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
