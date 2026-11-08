/* Tô sáng từ khóa tìm kiếm trong bản render bằng CSS Custom Highlight API (không sửa DOM). */
import { foldText } from '../../../shared/textFold'

const NAME = 'x2m-search'

/** Mọi vị trí của các từ khóa (không phân biệt hoa thường) trong chữ của `root`, theo thứ tự tài liệu. */
export function findTextRanges(root: Element, terms: string[]): Range[] {
  const ranges: Range[] = []
  const low = terms.map(foldText).filter((t) => t !== '')
  if (low.length === 0) return ranges
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = foldText(n.nodeValue ?? '')
    const found: [number, number][] = []
    for (const t of low) for (let i = text.indexOf(t); i >= 0; i = text.indexOf(t, i + t.length)) found.push([i, i + t.length])
    for (const [s, e] of found.sort((a, b) => a[0] - b[0])) {
      const r = document.createRange()
      r.setStart(n, s)
      r.setEnd(n, e)
      ranges.push(r)
    }
  }
  return ranges
}

export function setSearchHighlight(ranges: Range[]): void {
  // Trình duyệt không có Highlight API: chỉ cuộn, không tô
  if (typeof Highlight === 'undefined' || !CSS.highlights) return
  if (ranges.length === 0) CSS.highlights.delete(NAME)
  else CSS.highlights.set(NAME, new Highlight(...ranges))
}
