import { describe, expect, it } from 'vitest'
import type { DiffHunk } from '../../../../shared/specDiff'
import { changeStarts, compareRows } from './compareView'

const same = (n: number): DiffHunk => ({ kind: 'same', oldLine: n, newLine: n, oldText: 'x', newText: 'x', sectionPath: '' })
const add = (n: number): DiffHunk => ({ kind: 'add', newLine: n, newText: 'y', sectionPath: '' })

describe('compareRows', () => {
  const hunks = [...Array.from({ length: 10 }, (_, i) => same(i + 1)), add(11), add(12), ...Array.from({ length: 10 }, (_, i) => same(i + 13))]

  it('chỉ thay đổi: giữ 3 dòng ngữ cảnh, gom phần còn lại thành khoảng ẩn', () => {
    const rows = compareRows(hunks, true)
    expect(rows[0]).toEqual({ kind: 'gap', from: 0, count: 7 })
    expect(rows.filter((r) => r.kind === 'hunk')).toHaveLength(3 + 2 + 3)
    expect(rows[rows.length - 1]).toEqual({ kind: 'gap', from: 15, count: 7 })
  })

  it('mở một khoảng ẩn; tắt chỉ thay đổi thì hiện hết', () => {
    expect(compareRows(hunks, true, 3, new Set([0])).filter((r) => r.kind === 'gap')).toHaveLength(1)
    expect(compareRows(hunks, false)).toHaveLength(hunks.length)
  })

  it('không có thay đổi -> một khoảng ẩn duy nhất', () => {
    expect(compareRows([same(1), same(2)], true)).toEqual([{ kind: 'gap', from: 0, count: 2 }])
  })
})

describe('changeStarts', () => {
  it('đầu mỗi cụm thay đổi liền nhau', () => {
    expect(changeStarts([same(1), add(2), add(3), same(4), add(5)])).toEqual([1, 4])
  })
})
