import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { DEFAULT_OPTIONS } from '../../../../shared/types'
import { CancelledError } from '../../../application/ports/workerProtocol'
import type { SheetResult } from '../../../domain/excel/output'
import { capPreview, runExcelConvert, type ExcelConvertDeps } from './excelConvert'

const tmp = mkdtempSync(join(tmpdir(), 'x2m-conv-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

/** File Excel giả: chỉ cần tồn tại (worker được thay bằng `convert` giả). */
function excel(name: string): string {
  const p = join(tmp, name)
  writeFileSync(p, 'x')
  return p
}

function deps(over: Partial<ExcelConvertDeps> = {}): ExcelConvertDeps & { progress: number[]; asked: string[] } {
  const progress: number[] = []
  const asked: string[] = []
  return {
    convert: async (_p, sheets): Promise<SheetResult[]> => sheets.map((sheet) => ({ sheet, markdown: '# ' + sheet })),
    confirmOverwrite: async (m) => (asked.push(m), true),
    isCancelled: () => false,
    onProgress: (p) => progress.push(p.done),
    logError: () => undefined,
    progress,
    asked,
    ...over,
  }
}

const payload = (outDir: string, files: { path: string; sheets: string[] }[]) => ({
  files,
  outDir,
  options: DEFAULT_OPTIONS,
  outputMode: 'per-sheet' as const,
})

describe('runExcelConvert', () => {
  it('ghi mỗi sheet một file, tiến độ chạy tới cuối kể cả file thiếu', async () => {
    const out = join(tmp, 'o1')
    const d = deps()
    const res = await runExcelConvert(payload(out, [{ path: excel('a.xlsx'), sheets: ['S1'] }, { path: join(tmp, 'mat.xlsx'), sheets: ['S1'] }]), d)
    expect(res.ok && res.data.map((r) => r.ok)).toEqual([true, false])
    expect(readFileSync(join(out, 'a__S1.md'), 'utf-8')).toBe('# S1\n')
    expect(d.progress).toEqual([1, 2])
    expect(d.asked).toEqual([])
  })

  it('file .md đã có: hỏi ghi đè; chọn Hủy thì không ghi gì', async () => {
    const out = join(tmp, 'o2')
    await runExcelConvert(payload(out, [{ path: excel('b.xlsx'), sheets: ['S1'] }]), deps())
    writeFileSync(join(out, 'b__S1.md'), 'sửa tay')
    const d = deps({ confirmOverwrite: async () => false })
    const res = await runExcelConvert(payload(out, [{ path: excel('b.xlsx'), sheets: ['S1', 'S2'] }]), d)
    expect(res.ok && res.data[0].cancelled).toBe(true)
    expect(readFileSync(join(out, 'b__S1.md'), 'utf-8')).toBe('sửa tay')
    expect(existsSync(join(out, 'b__S2.md'))).toBe(false)
  })

  it('Hủy giữa chừng: file đang chạy và file sau thành "Đã hủy", tiến độ vẫn đủ', async () => {
    const out = join(tmp, 'o3')
    let cancelled = false
    const d = deps({
      isCancelled: () => cancelled,
      convert: async () => {
        cancelled = true
        throw new CancelledError()
      },
    })
    const res = await runExcelConvert(payload(out, [{ path: excel('c.xlsx'), sheets: ['S1'] }, { path: excel('d.xlsx'), sheets: ['S1'] }]), d)
    expect(res.ok && res.data.map((r) => r.cancelled)).toEqual([true, true])
    expect(d.progress).toEqual([1, 2])
  })

  it('lỗi đọc Excel: báo lỗi file đó, file sau vẫn chạy', async () => {
    const out = join(tmp, 'o4')
    let n = 0
    const d = deps({
      convert: async (_p, sheets) => {
        if (n++ === 0) throw new Error('ENOENT: no such file')
        return sheets.map((sheet) => ({ sheet, markdown: 'x' }))
      },
    })
    const res = await runExcelConvert(payload(out, [{ path: excel('e.xlsx'), sheets: ['S1'] }, { path: excel('f.xlsx'), sheets: ['S1'] }]), d)
    expect(res.ok && res.data.map((r) => r.ok)).toEqual([false, true])
    expect(res.ok && res.data[0].error).toContain('Không tìm thấy file')
  })
})

describe('capPreview', () => {
  const note = (shown: number, total: number): string => `cắt ${shown}/${total}`

  it('ngắn hơn giới hạn: giữ nguyên', () => {
    expect(capPreview('abc', 10, note)).toBe('abc')
  })

  it('dài hơn: cắt ở đầu dòng gần nhất, thêm ghi chú blockquote', () => {
    const md = 'dòng 1\ndòng 2\ndòng 3\n'
    expect(capPreview(md, 10, note)).toBe('dòng 1\n\n> cắt 6/21\n')
  })

  it('dòng đầu quá dài (không có xuống dòng phù hợp): cắt đúng giới hạn', () => {
    expect(capPreview('x'.repeat(30), 10, note)).toBe('x'.repeat(10) + '\n\n> cắt 10/30\n')
  })
})
