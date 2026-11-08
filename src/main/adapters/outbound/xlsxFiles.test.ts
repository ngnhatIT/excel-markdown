import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { NOT_EXCEL_MESSAGE } from '../../domain/errors'
import { looksLikeExcel, readWorkbook } from './xlsxFiles'

const fixtures = join(__dirname, '../../../../test/fixtures')
const tmp = mkdtempSync(join(tmpdir(), 'x2m-xlsx-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

const write = (name: string, data: string | Buffer): string => {
  const p = join(tmp, name)
  writeFileSync(p, data)
  return p
}

describe('readWorkbook: kiểm chữ ký file trước SheetJS', () => {
  it('file text đổi đuôi .xlsx / .xls, file .md -> lỗi tiếng Việt (không thành "Sheet1" chứa rác)', () => {
    expect(() => readWorkbook(write('t.xlsx', 'this is not excel'))).toThrow(NOT_EXCEL_MESSAGE)
    expect(() => readWorkbook(write('t.xls', 'this is not excel'))).toThrow(NOT_EXCEL_MESSAGE)
    expect(() => readWorkbook(write('README.md', '# Tiêu đề\n'))).toThrow(NOT_EXCEL_MESSAGE)
  })

  it('xlsx cụt / xls hỏng header -> lỗi tiếng Việt, không lộ lỗi thô SheetJS', () => {
    const xlsx = readFileSync(join(fixtures, 'excel-authored.xlsx'))
    expect(() => readWorkbook(write('cut.xlsx', xlsx.subarray(0, 5000)))).toThrow(NOT_EXCEL_MESSAGE)
    const xls = Buffer.from(readFileSync(join(fixtures, 'excel-authored.xls')))
    xls[26] = 7 // Major Version 1799
    expect(() => readWorkbook(write('ver.xls', xls))).toThrow(NOT_EXCEL_MESSAGE)
  })

  it('Excel 2003 XML (.xls có BOM) vẫn đọc được; fixture thật đọc được', () => {
    const xml =
      '\uFEFF<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
      '<Worksheet ss:Name="A"><Table><Row><Cell><Data ss:Type="String">xin chào</Data></Cell></Row></Table></Worksheet></Workbook>'
    expect(readWorkbook(write('x2003.xls', xml)).SheetNames).toEqual(['A'])
    expect(readWorkbook(join(fixtures, 'excel-authored.xlsx')).SheetNames.length).toBeGreaterThan(0)
    expect(readWorkbook(join(fixtures, 'excel-authored.xls')).SheetNames.length).toBeGreaterThan(0)
  })

  it('looksLikeExcel: .xlsx nhận zip và CFB (file có mật khẩu), không nhận `<`; .xls nhận `<` UTF-16', () => {
    const cfb = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
    expect(looksLikeExcel(Buffer.from('PK\x03\x04', 'latin1'), 'a.xlsm')).toBe(true)
    expect(looksLikeExcel(cfb, 'a.xlsx')).toBe(true)
    expect(looksLikeExcel(Buffer.from('<html>'), 'a.xlsx')).toBe(false)
    expect(looksLikeExcel(Buffer.from('\uFEFF<?xml', 'utf16le'), 'a.xls')).toBe(true)
    expect(looksLikeExcel(Buffer.alloc(0), 'a.xls')).toBe(false)
  })
})
