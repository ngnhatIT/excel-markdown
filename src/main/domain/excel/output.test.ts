import { describe, expect, it } from 'vitest'
import { plannedMdFileNames, workbookMdFiles, type SheetResult } from './output'

const OPTS = { escapeMarkdown: true, frontMatter: false }

/** Tên thật `workbookMdFiles` ghi khi mọi sheet có nội dung (trường hợp ghi nhiều file nhất). */
function actualNames(specs: { base: string; sheets: string[] }[], perWorkbook: boolean): string[] {
  const used = new Set<string>()
  return specs.flatMap((s) => {
    const sheets: SheetResult[] = s.sheets.map((sheet) => ({ sheet, markdown: 'x' }))
    return workbookMdFiles(s.base, s.base + '.xlsx', sheets, OPTS, perWorkbook, used).map((f) => f.name)
  })
}

describe('plannedMdFileNames', () => {
  // Hai file cùng tên ở hai thư mục, sheet trùng tên, ký tự cấm, tên reserved của Windows
  const specs = [
    { base: 'spec', sheets: ['S1', 'S/2', 'CON'] },
    { base: 'spec', sheets: ['S1'] },
    { base: 'other', sheets: [] },
  ]
  it('khớp tên workbookMdFiles ghi (per-sheet): đổi một bên mà quên bên kia thì hỏi ghi đè sai', () => {
    expect(plannedMdFileNames(specs, false)).toEqual(actualNames(specs, false))
  })
  it('khớp tên workbookMdFiles ghi (per-workbook)', () => {
    const withSheets = specs.filter((s) => s.sheets.length > 0)
    expect(plannedMdFileNames(withSheets, true)).toEqual(actualNames(withSheets, true))
  })
})
