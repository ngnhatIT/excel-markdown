/* So khớp chữ khi tìm kiếm: không phân biệt hoa thường và hiragana / katakana (てーぶる ↔ テーブル).
 * Giữ nguyên độ dài chuỗi (thay 1 ký tự bằng 1 ký tự) để vị trí khớp dùng lại được trên chuỗi gốc. */
export function foldText(s: string): string {
  return s.toLowerCase().replace(/[ぁ-ゖゝゞ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
}
