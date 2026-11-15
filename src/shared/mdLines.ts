/* Quét dòng Markdown dùng chung (khối code, heading ATX, dòng phân cách bảng) + chuẩn hóa nhãn, ô TSV.
 * Mọi hàm chạy tuyến tính theo độ dài dòng: các regex cũ dạng `(.*?)\s*#*\s*$` quay lui bậc ba
 * với dòng có hàng nghìn khoảng trắng và làm treo tiến trình main. */

/** Trạng thái khối code sau `line` ('' = ngoài khối); undefined nếu `line` không phải dòng ``` / ~~~. */
export function fenceAfter(fence: string, line: string): string | undefined {
  const f = /^ {0,3}(`{3,}|~{3,})/.exec(line)
  if (!f) return undefined
  if (!fence) return f[1]
  return f[1][0] === fence[0] && f[1].length >= fence.length ? '' : fence
}

/** Heading ATX (`## Tiêu đề ##`): cấp + chữ, đã bỏ dãy `#` đóng (chỉ khi đứng sau khoảng trắng, như CommonMark). */
export function atxHeading(line: string): { level: number; text: string } | null {
  const m = /^ {0,3}(#{1,6})(?:\s|$)/.exec(line)
  if (!m) return null
  const text = line.slice(m[0].length).trim()
  let end = text.length
  while (end > 0 && text[end - 1] === '#') end--
  const closed = end < text.length && (end === 0 || /\s/.test(text[end - 1]))
  return { level: m[1].length, text: closed ? text.slice(0, end).trimEnd() : text }
}

/** Dòng phân cách bảng (`|---|:--:|`). */
export const isDelimRow = (line: string): boolean => /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/.test(line.trim())

/** Chuẩn hóa nhãn để so alias: NFKC, chữ thường, bỏ khoảng trắng / `*` / chú thích trong ngoặc. */
export const normLabel = (s: string): string =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[\s*_`]/g, '')

/** Ô TSV: tab / xuống dòng thành khoảng trắng. */
export const tsvCell = (s: string): string => s.replace(/[\t\r\n]+/g, ' ')
