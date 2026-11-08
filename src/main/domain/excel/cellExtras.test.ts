import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import { readWorkbook } from '../../adapters/outbound/xlsxFiles'
import { DEFAULT_OPTIONS } from '../../../shared/types'
import { listRules } from './cellExtras'
import { convertSheetInWorkbook, convertSheetsInWorkbook } from './converter'
import { workbookMdFiles } from './output'

const FIXTURE = fileURLToPath(new URL('../../../../test/fixtures/ui-drawings.xlsx', import.meta.url))

/** ui-drawings.xlsx + chèn vào sheet 画面遷移図: gạch ngang một phần / cả ô, link sang sheet khác, 入力規則. */
async function buildBook(): Promise<string> {
  const zip = await JSZip.loadAsync(readFileSync(FIXTURE))
  const edit = async (path: string, f: (s: string) => string): Promise<void> => {
    zip.file(path, f(await zip.file(path)!.async('string')))
  }
  // font 2 gạch ngang, font 3 `val="0"` (không gạch); xf 4 -> font 2, xf 5 -> font 3
  await edit('xl/styles.xml', (s) =>
    s
      .replace('</fonts>', '<font><strike/></font><font><strike val="0"/></font></fonts>')
      .replace('</cellXfs>', '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0"/></cellXfs>')
  )
  let rich = 0
  await edit('xl/sharedStrings.xml', (s) => {
    rich = (s.match(/<si>/g) ?? []).length
    return s.replace('</sst>', '<si><r><rPr><strike/></rPr><t>旧仕様</t></r><r><t xml:space="preserve"> 新仕様 1~2</t></r></si></sst>')
  })
  await edit('xl/workbook.xml', (s) =>
    s.replace(
      '</sheets>',
      `</sheets><definedNames><definedName name="選択肢">'画面遷移図'!$F$7:$F$8</definedName><definedName name="一覧">'画面レイアウト'!$A$1</definedName></definedNames>`
    )
  )
  const rows =
    `<row r="3"><c r="A3" t="s"><v>${rich}</v></c></row>` +
    '<row r="4"><c r="A4" s="4" t="inlineStr"><is><t>旧 a~b</t></is></c><c r="B4" s="5" t="inlineStr"><is><t>残る</t></is></c><c r="C4" s="4"/></row>' +
    '<row r="5"><c r="A5" t="inlineStr"><is><t>参照</t></is></c></row>' +
    '<row r="6"><c r="A6" t="inlineStr"><is><t>一覧へ</t></is></c></row>' +
    '<row r="7"><c r="F7" t="inlineStr"><is><t>はい</t></is></c></row>' +
    '<row r="8"><c r="F8" t="inlineStr"><is><t>いいえ</t></is></c></row>'
  const dv =
    '<dataValidations count="4">' +
    '<dataValidation type="list" allowBlank="1" sqref="C2:C50"><formula1>"入力,選択"</formula1></dataValidation>' +
    '<dataValidation type="list" sqref="D2:D9 E2"><formula1>$F$7:$F$8</formula1></dataValidation>' +
    '<dataValidation type="list" sqref="H2"><formula1>選択肢</formula1></dataValidation>' +
    '<dataValidation type="whole" sqref="G2"><formula1>1</formula1></dataValidation></dataValidations>' +
    `<hyperlinks><hyperlink ref="A5" location="'画面レイアウト'!A1" display="参照"/><hyperlink ref="A6" location="一覧" display="一覧へ"/></hyperlinks>`
  await edit('xl/worksheets/sheet2.xml', (s) =>
    s.replace('<dimension ref="A1:A1"/>', '<dimension ref="A1:H8"/>').replace('</sheetData>', rows + '</sheetData>' + dv)
  )
  const file = join(mkdtempSync(join(tmpdir(), 'x2m-extras-')), 'book.xlsx')
  writeFileSync(file, await zip.generateAsync({ type: 'nodebuffer' }))
  return file
}

describe('gạch ngang, link sheet, 入力規則 qua readWorkbook', async () => {
  const wb = readWorkbook(await buildBook())
  const sheets = convertSheetsInWorkbook(wb, ['画面レイアウト', '画面遷移図'], DEFAULT_OPTIONS)
  const flow = sheets[1].markdown

  it('gạch ngang một phần (rich text) và cả ô (style); `val="0"` không gạch; `~` trong chữ được escape', () => {
    expect(flow).toContain('> ~~旧仕様~~ 新仕様 1\\~2')
    expect(flow).toContain('~~旧 a\\~b~~ 残る')
  })

  it('入力規則: danh sách trực tiếp, vùng ô, tên định nghĩa; bỏ type khác list', () => {
    expect(flow).toContain('- 〔入力規則 C2:C50〕入力 / 選択')
    expect(flow).toContain('- 〔入力規則 D2:D9 E2〕はい / いいえ')
    expect(flow).toContain('- 〔入力規則 H2〕はい / いいえ')
    expect(flow).not.toContain('入力規則 G2')
  })

  it('入力規則 ngoài vùng `range` bị bỏ như comment', () => {
    const [clipped] = convertSheetsInWorkbook(wb, ['画面遷移図'], { ...DEFAULT_OPTIONS, range: 'A3:H8' })
    expect(clipped.markdown).not.toContain('入力規則')
  })

  it('gộp workbook: link tới heading của sheet trong cùng file', () => {
    const [f] = workbookMdFiles('book', 'book.xlsx', sheets, DEFAULT_OPTIONS, true, new Set())
    expect(f.text).toContain('[参照](#画面レイアウト)')
    expect(f.text).toContain('[一覧へ](#画面レイアウト)') // tên định nghĩa -> sheet
  })

  it('mỗi sheet một file: link tới tên file .md đã đặt trong lần ghi này', () => {
    const files = workbookMdFiles('book', 'book.xlsx', sheets, DEFAULT_OPTIONS, false, new Set(['book__画面レイアウト.md']))
    expect(files.map((f) => f.name)).toEqual(['book__画面レイアウト (2).md', 'book__画面遷移図.md'])
    expect(files[1].text).toContain('[参照](book__画面レイアウト%20%282%29.md)')
  })

  it('sheet đích không được convert, hoặc preview một sheet: chỉ còn chữ', () => {
    const only = convertSheetsInWorkbook(wb, ['画面遷移図'], DEFAULT_OPTIONS)
    for (const perWorkbook of [true, false]) {
      const [f] = workbookMdFiles('book', 'book.xlsx', only, DEFAULT_OPTIONS, perWorkbook, new Set())
      expect(f.text).toMatch(/^> 参照$/m)
      expect(f.text).not.toContain('x2m-sheet:')
    }
    expect(convertSheetInWorkbook(wb, '画面遷移図', DEFAULT_OPTIONS)).toMatch(/^> 参照$/m)
  })
})

describe('listRules', () => {
  it('bản x14 (sqref và công thức trong phần tử con), tham chiếu sheet khác', () => {
    const ws = XLSX.utils.aoa_to_sheet([['A'], ['B']])
    const wb = { SheetNames: ['S', 'マスタ'], Sheets: { S: XLSX.utils.aoa_to_sheet([[]]), マスタ: ws } } as XLSX.WorkBook
    const xml =
      '<x14:dataValidations><x14:dataValidation type="list"><x14:formula1><xm:f>\'マスタ\'!$A$1:$A$9</xm:f></x14:formula1>' +
      '<xm:sqref>B2:B5</xm:sqref></x14:dataValidation><x14:dataValidation type="list"><x14:formula1><xm:f>INDIRECT($A2)</xm:f></x14:formula1><xm:sqref>C2</xm:sqref></x14:dataValidation>'
    expect(listRules(xml, wb, 'S')).toEqual([
      { ref: 'B2:B5', row: 1, col: 1, values: ['A', 'B'], formula: "'マスタ'!$A$1:$A$9" },
      { ref: 'C2', row: 1, col: 2, values: [], formula: 'INDIRECT($A2)' },
    ])
  })

  it('tham chiếu cả cột ($A:$A) -> lấy giá trị tới dòng có dữ liệu', () => {
    const wb = { SheetNames: ['S', 'L'], Sheets: { S: XLSX.utils.aoa_to_sheet([[]]), L: XLSX.utils.aoa_to_sheet([['x'], ['y']]) } } as XLSX.WorkBook
    const xml = '<dataValidation type="list" sqref="A2"><formula1>L!$A:$A</formula1></dataValidation>'
    expect(listRules(xml, wb, 'S')[0].values).toEqual(['x', 'y'])
  })

  it('tham chiếu ký tự ngoài Unicode (&#x110000;) không làm lỗi: thay bằng ký tự thay thế', () => {
    const wb = { SheetNames: ['S'], Sheets: { S: XLSX.utils.aoa_to_sheet([[]]) } } as XLSX.WorkBook
    const xml = '<dataValidation type="list" sqref="A1"><formula1>"a&#x110000;,b"</formula1></dataValidation>'
    expect(listRules(xml, wb, 'S')[0].values).toEqual(['a\ufffd', 'b'])
  })

  it('thẻ không đóng không treo', () => {
    expect(listRules('<dataValidation type="list" sqref="A1">'.repeat(20000), { SheetNames: [], Sheets: {} }, 'S')).toEqual([])
  })
})
