/* Tìm theo nội dung trong file Markdown (chế độ Đọc Markdown). Thuần, test không cần Electron. */
import type { MdSearchHit } from '../../shared/types'

/** Độ dài tối đa đoạn trích của một dòng khớp. */
const SNIPPET_MAX = 160

/** Từ khóa: tách theo khoảng trắng, không phân biệt hoa thường; dòng khớp phải chứa mọi từ khóa. */
export function searchTerms(query: string): string[] {
  return [...new Set(query.toLowerCase().split(/\s+/).filter((t) => t !== ''))]
}

/** Các dòng của `md` chứa mọi từ khóa, kèm heading gần nhất phía trên (để nhảy tới đúng mục). */
export function searchMarkdownText(md: string, terms: string[], max = 20): MdSearchHit[] {
  const hits: MdSearchHit[] = []
  if (terms.length === 0) return hits
  let heading: string | undefined
  const lines = md.split(/\r?\n/)
  for (let i = 0; i < lines.length && hits.length < max; i++) {
    const line = lines[i]
    const h = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line)
    if (h) heading = h[1].replace(/\\([#*~_`[\]()<>|-])/g, '$1').trim()
    const low = line.toLowerCase()
    if (!terms.every((t) => low.includes(t))) continue
    const text = line.trim()
    // Dòng dài: cắt quanh từ khóa đầu tiên để kết quả vẫn thấy chỗ khớp
    const at = text.toLowerCase().indexOf(terms[0])
    const start = text.length > SNIPPET_MAX ? Math.max(0, Math.min(at - 40, text.length - SNIPPET_MAX)) : 0
    const snippet = (start > 0 ? '…' : '') + text.slice(start, start + SNIPPET_MAX) + (start + SNIPPET_MAX < text.length ? '…' : '')
    hits.push({ line: i + 1, text: snippet, ...(heading ? { heading } : {}) })
  }
  return hits
}
