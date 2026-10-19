// Ước lượng kích thước hiển thị chữ trong ô Excel (spec §5).
// Excel không tự giãn chiều cao ô merge, nên app phải tự tính số dòng.
// Ước lượng được phép dư (thừa khoảng trắng), không được thiếu (chữ bị che).

/** Tách dòng thật của một ô (chấp nhận cả CRLF và CR lẻ). */
export function splitLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/)
}

/** Độ rộng một dòng: ký tự mã > 0xFF (CJK, toàn角…) tính 2, còn lại tính 1. */
function lineWidth(line: string): number {
  let width = 0
  // Duyệt theo code point để cặp surrogate (ký tự ngoài BMP) chỉ tính một ký tự.
  for (const ch of line) width += ch.codePointAt(0)! > 0xff ? 2 : 1
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
