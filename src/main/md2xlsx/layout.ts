// Ước lượng kích thước hiển thị chữ trong ô Excel (spec §5).
// Excel không tự giãn chiều cao ô merge, nên app phải tự tính số dòng.
// Ước lượng được phép dư (thừa khoảng trắng), không được thiếu (chữ bị che).

/** Tách dòng thật của một ô (chấp nhận cả CRLF và CR lẻ). */
export function splitLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/)
}

/** Độ rộng một ký tự (một code point): mã > 0xFF (CJK, toàn角…) tính 2, còn lại tính 1. */
function charWidth(ch: string): number {
  return ch.codePointAt(0)! > 0xff ? 2 : 1
}

/** Độ rộng một dòng. */
function lineWidth(line: string): number {
  let width = 0
  // Duyệt theo code point để cặp surrogate (ký tự ngoài BMP) chỉ tính một ký tự.
  for (const ch of line) width += charWidth(ch)
  return width
}

/** Độ rộng hiển thị của chuỗi; chuỗi nhiều dòng lấy dòng rộng nhất. */
export function displayWidth(s: string): number {
  let max = 0
  for (const line of splitLines(s)) max = Math.max(max, lineWidth(line))
  return max
}

/**
 * Số dòng hiển thị khi chữ tự xuống dòng trong vùng rộng `totalWidth`:
 * Σ theo từng dòng thật của max(1, ⌈độ rộng dòng / totalWidth⌉).
 */
export function estimateLines(text: string, totalWidth: number): number {
  // Phòng tổng độ rộng <= 0/NaN: tránh Infinity/NaN, coi như vùng rộng 1.
  const width = totalWidth > 0 ? totalWidth : 1
  let lines = 0
  for (const line of splitLines(text)) lines += Math.max(1, Math.ceil(lineWidth(line) / width))
  return lines
}

/**
 * Chia `text` thành các khối liên tiếp, mỗi khối hiển thị tối đa `maxLines` dòng trong vùng rộng
 * `totalWidth` (theo estimateLines) và dài tối đa `maxChars` đơn vị UTF-16. Dùng để tách đoạn văn
 * quá cao thành nhiều hàng merge (một hàng Excel cao tối đa 409.5pt).
 *
 * - Dòng thật được xếp nguyên vẹn, tham lam, theo thứ tự; các dòng trong cùng khối nối bằng `\n`.
 * - Một dòng thật tự nó đã vượt giới hạn bị cắt theo độ rộng hiển thị thành các mảnh, mỗi mảnh là
 *   một khối riêng (không cắt giữa cặp surrogate). Nối các mảnh của cùng một dòng bằng chuỗi rỗng.
 * - Luôn trả về ít nhất một khối.
 */
export function splitByLines(text: string, totalWidth: number, maxLines: number, maxChars = Infinity): string[] {
  const width = totalWidth > 0 ? totalWidth : 1
  const blocks: string[] = []
  let cur: string[] = []
  let curLines = 0
  let curChars = 0
  const flush = () => {
    if (cur.length === 0) return
    blocks.push(cur.join('\n'))
    cur = []
    curLines = 0
    curChars = 0
  }

  for (const line of splitLines(text)) {
    const lines = Math.max(1, Math.ceil(lineWidth(line) / width))
    if (lines > maxLines || line.length > maxChars) {
      flush()
      let piece = ''
      let pieceWidth = 0
      for (const ch of line) {
        // Cùng công thức làm tròn với estimateLines để mảnh luôn vừa maxLines.
        const full = Math.ceil((pieceWidth + charWidth(ch)) / width) > maxLines || piece.length + ch.length > maxChars
        if (piece !== '' && full) {
          blocks.push(piece)
          piece = ''
          pieceWidth = 0
        }
        piece += ch
        pieceWidth += charWidth(ch)
      }
      blocks.push(piece)
      continue
    }
    if (cur.length > 0 && (curLines + lines > maxLines || curChars + 1 + line.length > maxChars)) flush()
    curChars += (cur.length > 0 ? 1 : 0) + line.length
    curLines += lines
    cur.push(line)
  }
  flush()
  return blocks.length > 0 ? blocks : ['']
}
