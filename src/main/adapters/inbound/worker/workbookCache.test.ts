import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { mkdtempSync, utimesSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WorkbookCache, createWorkbookCache } from './workbookCache'
import { convertSheetInWorkbook } from '../../../domain/excel/converter'
import { readWorkbook } from '../../outbound/xlsxFiles'
import { DEFAULT_OPTIONS } from '../../../../shared/types'

function fakeDeps() {
  const files: Record<string, { mtimeMs: number; size: number }> = {}
  let loads = 0
  return {
    files,
    loads: () => loads,
    deps: {
      load: (p: string) => {
        loads++
        return { p, n: loads }
      },
      stat: (p: string) => {
        const f = Object.entries(files).find(([k]) => p.endsWith(k))?.[1]
        if (!f) throw Object.assign(new Error('ENOENT: ' + p), { code: 'ENOENT' })
        return f
      },
    },
  }
}

describe('WorkbookCache', () => {
  it('file không đổi -> dùng lại, không parse lại', () => {
    const f = fakeDeps()
    f.files['a.xlsx'] = { mtimeMs: 1, size: 10 }
    const c = new WorkbookCache(3, f.deps)
    const a1 = c.get('a.xlsx')
    expect(c.get('a.xlsx')).toBe(a1)
    expect(f.loads()).toBe(1)
  })

  it('mtime hoặc size đổi -> parse lại', () => {
    const f = fakeDeps()
    f.files['a.xlsx'] = { mtimeMs: 1, size: 10 }
    const c = new WorkbookCache(3, f.deps)
    c.get('a.xlsx')
    f.files['a.xlsx'] = { mtimeMs: 2, size: 10 }
    c.get('a.xlsx')
    f.files['a.xlsx'] = { mtimeMs: 2, size: 11 }
    c.get('a.xlsx')
    expect(f.loads()).toBe(3)
    expect(c.size).toBe(1)
  })

  it('LRU: vượt max thì bỏ file dùng lâu nhất', () => {
    const f = fakeDeps()
    for (const n of ['a', 'b', 'c']) f.files[n + '.xlsx'] = { mtimeMs: 1, size: 1 }
    const c = new WorkbookCache(2, f.deps)
    c.get('a.xlsx')
    c.get('b.xlsx')
    c.get('a.xlsx') // a mới dùng -> b là cũ nhất
    c.get('c.xlsx') // đẩy b ra
    expect(c.size).toBe(2)
    expect(f.loads()).toBe(3)
    c.get('a.xlsx')
    expect(f.loads()).toBe(3) // a vẫn còn
    c.get('b.xlsx')
    expect(f.loads()).toBe(4) // b phải parse lại
  })

  it('ngân sách dung lượng: tổng file nguồn vượt maxBytes thì bỏ file cũ, file vừa dùng luôn giữ', () => {
    const f = fakeDeps()
    f.files['a.xlsx'] = { mtimeMs: 1, size: 60 }
    f.files['b.xlsx'] = { mtimeMs: 1, size: 60 }
    f.files['big.xlsx'] = { mtimeMs: 1, size: 500 }
    const c = new WorkbookCache(3, f.deps, 100)
    c.get('a.xlsx')
    c.get('b.xlsx') // 120 > 100 -> bỏ a
    expect(c.size).toBe(1)
    c.get('b.xlsx')
    expect(f.loads()).toBe(2)
    c.get('big.xlsx') // một mình vượt ngân sách: vẫn giữ, bỏ b
    expect(c.size).toBe(1)
    c.get('big.xlsx')
    expect(f.loads()).toBe(3)
    f.files['big.xlsx'] = { mtimeMs: 2, size: 10 } // đổi file: trừ dung lượng cũ, cộng mới
    c.get('big.xlsx')
    c.get('a.xlsx')
    expect(c.size).toBe(2)
  })

  it('file không tồn tại -> ném lỗi ENOENT (friendlyError xử lý)', () => {
    const c = new WorkbookCache(2, fakeDeps().deps)
    expect(() => c.get('missing.xlsx')).toThrow(/ENOENT/)
  })

  it('file thật: ghi đè nội dung mới -> cache trả nội dung mới', () => {
    const p = join(mkdtempSync(join(tmpdir(), 'x2m-cache-')), 'a.xlsx')
    const write = (v: string): void => {
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['No', 'A'], ['1', v]]), 'S')
      XLSX.writeFile(wb, p)
    }
    const c = createWorkbookCache(2, readWorkbook)
    write('cũ')
    expect(convertSheetInWorkbook(c.get(p), 'S', DEFAULT_OPTIONS)).toContain('| 1 | cũ |')
    expect(c.get(p)).toBe(c.get(p))
    write('mới')
    // Đảm bảo mtime khác kể cả khi ghi trong cùng một tick đồng hồ
    const t = statSync(p).mtime
    utimesSync(p, t, new Date(t.getTime() + 2000))
    expect(convertSheetInWorkbook(c.get(p), 'S', DEFAULT_OPTIONS)).toContain('| 1 | mới |')
  })
})
