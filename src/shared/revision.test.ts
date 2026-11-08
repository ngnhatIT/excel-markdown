import { describe, expect, it } from 'vitest'
import { diffSpecMarkdown } from './specDiff'
import { revisionRows, revisionTable } from './revision'

const tbl = (rows: string[][]): string =>
  '## 顧客検索\n\n### 【項目定義】\n\n| No | 項目ID | 項目名 | 型 |\n|---|---|---|---|\n' + rows.map((r, i) => `| ${i + 1} | ${r.join(' | ')} |`).join('\n') + '\n'

describe('改訂履歴 từ diff', () => {
  const oldMd = tbl([['C01', '顧客コード', '文字列'], ['C02', '顧客名', '文字列'], ['C03', 'FAX', '文字列']]) + '\n### 【備考】\n\n旧仕様\n'
  const newMd = tbl([['C01', '顧客コード', '文字列'], ['C09', 'メール', '文字列'], ['C02', '顧客名称', '文字列']]) + '\n### 【備考】\n\n新仕様\n'
  const diff = diffSpecMarkdown(oldMd, newMd)

  it('mỗi mục một dòng, nêu tên dòng thêm / xóa / sửa và cột đổi (tiếng Nhật)', () => {
    const rows = revisionRows(diff, 'ja')
    expect(rows).toHaveLength(2)
    expect(rows[0].place).toContain('【項目定義】')
    expect(rows[0].content).toContain('行追加 1件（C09）')
    expect(rows[0].content).toContain('行削除 1件（C03）')
    expect(rows[0].content).toMatch(/行変更 1件（C02: 項目名）/)
    expect(rows[1].content).toBe('記述変更 1件')
  })

  it('tiếng Việt / Anh', () => {
    expect(revisionRows(diff, 'vi')[0].content).toContain('Thêm 1 dòng (C09)')
    expect(revisionRows(diff, 'en')[1].content).toBe('1 description line(s) changed')
  })

  it('bảng Markdown (escape |) và TSV dán Excel; 版数/日付/改訂者 chỉ ở dòng đầu', () => {
    const rows = [{ place: 'A › B', content: 'x|y' }, { place: 'C', content: 'z\nw' }]
    const meta = { version: '1.2', date: '2026/11/08', author: '山田' }
    const md = revisionTable(rows, meta, 'ja', 'md').split('\n')
    expect(md[0]).toBe('| 版数 | 改訂日 | 改訂者 | 改訂箇所 | 改訂内容 |')
    expect(md[2]).toBe('| 1.2 | 2026/11/08 | 山田 | A › B | x\\|y |')
    expect(md[3]).toBe('|  |  |  | C | z<br>w |')
    expect(revisionTable(rows, meta, 'ja', 'tsv').split('\n')[2]).toBe('\t\t\tC\tz w')
  })

  it('không có thay đổi -> không có dòng', () => {
    expect(revisionRows(diffSpecMarkdown(oldMd, oldMd))).toEqual([])
  })
})
