/* Mô hình hiển thị của màn hình So sánh: gom đoạn không đổi dài thành một dòng "ẩn N dòng". Thuần, có test. */
import type { DiffHunk } from '../../../../shared/specDiff'

export type CompareRow = { kind: 'hunk'; hunk: DiffHunk; index: number } | { kind: 'gap'; from: number; count: number }

/** Giữ `context` dòng không đổi quanh mỗi thay đổi; `expanded` = chỉ số hunk đầu của các khoảng đã mở. */
export function compareRows(hunks: DiffHunk[], onlyChanges: boolean, context = 3, expanded: ReadonlySet<number> = new Set()): CompareRow[] {
  if (!onlyChanges) return hunks.map((hunk, index) => ({ kind: 'hunk', hunk, index }))
  const near = new Uint8Array(hunks.length)
  hunks.forEach((h, i) => {
    if (h.kind === 'same') return
    for (let j = Math.max(0, i - context); j <= Math.min(hunks.length - 1, i + context); j++) near[j] = 1
  })
  const rows: CompareRow[] = []
  for (let i = 0; i < hunks.length; ) {
    if (near[i] || hunks[i].kind !== 'same') {
      rows.push({ kind: 'hunk', hunk: hunks[i], index: i })
      i++
      continue
    }
    let j = i
    while (j < hunks.length && !near[j] && hunks[j].kind === 'same') j++
    if (expanded.has(i)) for (let k = i; k < j; k++) rows.push({ kind: 'hunk', hunk: hunks[k], index: k })
    else rows.push({ kind: 'gap', from: i, count: j - i })
    i = j
  }
  return rows
}

/** Chỉ số (trong `hunks`) của đầu mỗi cụm thay đổi liền nhau — dùng cho nút thay đổi trước / sau. */
export function changeStarts(hunks: DiffHunk[]): number[] {
  const out: number[] = []
  hunks.forEach((h, i) => {
    if (h.kind !== 'same' && (i === 0 || hunks[i - 1].kind === 'same')) out.push(i)
  })
  return out
}
