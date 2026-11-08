import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PARTIAL_SUFFIX } from '../../application/ports/workerProtocol'
import { estimateLines } from './layout'
import type { Block, SheetModel } from './model'
import { safeSheetName } from './names'
import { parseMarkdownFile } from './parse'
import { buildWorkbook, injectIgnoredErrors, LINE_HEIGHT, MAX_ROW_HEIGHT } from './write'
import { saveWorkbook } from '../../adapters/outbound/xlsxWriter'

const T = (h: string[], ...rows: string[][]): Block => ({
  kind: 'table',
  header: h.map((text) => ({ text })),
  rows: rows.map((r) => r.map((text) => ({ text })))
})
const reload = async (sheets: SheetModel[]) => {
  const b = await buildWorkbook(sheets).xlsx.writeBuffer()
  const w = new ExcelJS.Workbook()
  await w.xlsx.load(b as ArrayBuffer)
  return w
}
/** Chiều cao mỗi dòng 游ゴシック 10 tự giãn trong Excel thật (đo bằng COM autofit): 16.5pt. */
const LINE = 16.5
/** Độ rộng Excel hiển thị cho cột không được đặt width (exceljs không ghi <col> cho cột mặc định). */
const EXCEL_DEFAULT_WIDTH = 8.43
const sumWidths = (ws: ExcelJS.Worksheet, from: number, to: number) => {
  let sum = 0
  for (let c = from; c <= to; c++) sum += ws.getColumn(c).width ?? EXCEL_DEFAULT_WIDTH
  return sum
}
/** Đọc lại giá trị bằng SheetJS từ buffer do chính buildWorkbook tạo. */
const sheetJsText = async (sheets: SheetModel[], addr: string) => {
  const b = await buildWorkbook(sheets).xlsx.writeBuffer()
  const wb = XLSX.read(Buffer.from(b as ArrayBuffer))
  return wb.Sheets[wb.SheetNames[0]][addr]?.v as string | undefined
}

let dir: string
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'md2xlsx-write-'))
})
afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('buildWorkbook: bố cục', () => {
  let ws: ExcelJS.Worksheet
  beforeAll(async () => {
    ws = (
      await reload([
        {
          name: 'S',
          blocks: [
            { kind: 'banner', label: '基本設計', title: '画面項目定義書' },
            T(['No', '項目名', 'C', 'D', 'E', 'F', 'G', '備考'], ['1', '顧客コード', '', '', '', '', '1.0', '0001']),
            {
              kind: 'meta',
              items: [
                { label: '機能ID', value: { text: 'SP01' } },
                { label: '画面遷移', value: { text: 'A\nB' } }
              ]
            },
            { kind: 'heading', text: '【項目定義】' },
            { kind: 'paragraph', text: 'x'.repeat(300) },
            { kind: 'note', text: '※ a\n　b' },
            { kind: 'code', lines: ['c1'] }
          ]
        }
      ])
    ).worksheets[0]
  })

  it('banner ở hàng 1: nhãn xám đậm 10pt, tiêu đề đậm 16pt, cao 24', () => {
    expect(ws.getCell('A1').font).toMatchObject({ name: '游ゴシック', bold: true, size: 10, color: { argb: 'FF595959' } })
    expect(ws.getCell('B1').font).toMatchObject({ bold: true, size: 16 })
    expect(ws.getCell('A1').value).toBe('基本設計')
    expect(ws.getCell('B1').value).toBe('画面項目定義書')
    expect(ws.getRow(1).height).toBe(24)
  })

  it('bảng ở hàng 3-4: header đậm + nền, viền mảnh, wrap, số có numFmt, mã giữ chữ', () => {
    expect(ws.getCell('A3').fill).toMatchObject({ fgColor: { argb: 'FFDDE5F0' } })
    expect(ws.getCell('H3').font.bold).toBe(true)
    expect(ws.getCell('C4').border.top).toMatchObject({ style: 'thin', color: { argb: 'FF808080' } })
    expect(ws.getCell('B4').alignment).toMatchObject({ wrapText: true, vertical: 'top' })
    expect(ws.getCell('A4').value).toBe(1)
    expect(ws.getCell('G4').value).toBe(1)
    expect(ws.getCell('G4').numFmt).toBe('0.0')
    expect(ws.getCell('H4').value).toBe('0001')
    expect(ws.getCell('B4').font).toMatchObject({ name: '游ゴシック', size: 10 })
  })

  it('meta ở hàng 6-7: value merge B:H, viền mọi ô, 2 dòng cao 30', () => {
    expect(ws.getCell('A6').fill).toMatchObject({ fgColor: { argb: 'FFF2F2F2' } })
    expect(ws.getCell('A6').font.bold).toBe(true)
    expect(ws.getCell('B6').isMerged && ws.getCell('H6').master.address).toBe('B6')
    expect(ws.getCell('H6').border.right).toMatchObject({ style: 'thin' })
    expect(ws.getCell('D7').border.bottom).toMatchObject({ style: 'thin' })
    expect(ws.getCell('B7').alignment.wrapText).toBe(true)
    expect(ws.getRow(7).height).toBe(33)
    expect(ws.getRow(6).height).toBeUndefined()
  })

  it('heading hàng 9 (không có hàng trống sau) merge A:H, gạch dưới cả vùng merge; paragraph hàng 10 merge A:H', () => {
    expect(ws.getCell('A9').font).toMatchObject({ bold: true, size: 12, color: { argb: 'FF1F3864' } })
    expect(ws.getCell('A9').border.bottom).toMatchObject({ style: 'medium', color: { argb: 'FF1F3864' } })
    expect(ws.getCell('H9').master.address).toBe('A9')
    expect(ws.getCell('H9').border.bottom).toMatchObject({ style: 'medium', color: { argb: 'FF1F3864' } })
    expect(ws.getCell('A9').alignment).toMatchObject({ wrapText: true, vertical: 'top' })
    // 游ゴシック 12 đậm: Excel tự giãn 19.5pt mỗi dòng
    expect(ws.getRow(9).height).toBe(19.5)
    expect(ws.getCell('H10').master.address).toBe('A10')
    expect(ws.getCell('A10').alignment.wrapText).toBe(true)
    expect(ws.getCell('A10').border.top).toBeUndefined()
    expect(ws.getRow(10).height).toBe(LINE * estimateLines('x'.repeat(300), sumWidths(ws, 1, 8)))
  })

  it('note: chữ xám, 2 dòng cao 30; code: MS Gothic, một dòng một hàng, merge A:H, tự xuống dòng', () => {
    expect(ws.getCell('A12').font.color?.argb).toBe('FF595959')
    expect(ws.getRow(12).height).toBe(33)
    expect(ws.getCell('A14').font.name).toBe('MS Gothic')
    expect(ws.getCell('A14').value).toBe('c1')
    expect(ws.getCell('H14').master.address).toBe('A14')
    expect(ws.getCell('A14').alignment).toMatchObject({ wrapText: true, vertical: 'top' })
    // MS Gothic 10 một dòng: Excel AutoFit 15pt (chiều cao tối thiểu của hàng)
    expect(ws.getRow(14).height).toBe(15)
  })

  it('độ rộng cột: min 6, +2, max 60; cột A tính cả nhãn meta', () => {
    expect(ws.getColumn(1).width).toBe(10)
    expect(ws.getColumn(2).width).toBe(12)
    expect(ws.getColumn(3).width).toBe(6)
  })

  it('trang in và lưới', () => {
    expect(ws.pageSetup).toMatchObject({ paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 })
    expect(ws.views[0].showGridLines).toBe(false)
  })
})

describe('buildWorkbook: link, độ dài, ký tự cấm', () => {
  it('link http(s) thành hyperlink có font link; ô > 32 767 ký tự bị cắt, kết thúc bằng …', async () => {
    const w2 = (
      await reload([
        {
          name: 'L',
          blocks: [
            T(['A'], ['x']),
            {
              kind: 'table',
              header: [{ text: 'L' }],
              rows: [[{ text: 'Spec', link: 'https://x.example/a' }], [{ text: 'y'.repeat(40000) }]]
            }
          ]
        }
      ])
    ).worksheets[0]
    expect(w2.getCell('A5').value).toMatchObject({ text: 'Spec', hyperlink: 'https://x.example/a' })
    expect(w2.getCell('A5').font).toMatchObject({ underline: true, color: { argb: 'FF0563C1' } })
    expect((w2.getCell('A6').value as string).length).toBe(32767)
    expect((w2.getCell('A6').value as string).endsWith('…')).toBe(true)
  })

  it('mailto cũng là hyperlink; scheme khác và link nội bộ ghi chữ thuần', async () => {
    const ws = (
      await reload([
        {
          name: 'L',
          blocks: [
            {
              kind: 'table',
              header: [{ text: 'H' }],
              rows: [
                [{ text: 'mail', link: 'mailto:a@x.example' }],
                [{ text: 'file', link: 'file:///c:/x' }],
                [{ text: 'js', link: 'javascript:alert(1)' }],
                [{ text: 'in', link: "#'Sheet'!A1" }]
              ]
            }
          ]
        }
      ])
    ).worksheets[0]
    expect(ws.getCell('A2').value).toMatchObject({ hyperlink: 'mailto:a@x.example' })
    for (const [addr, text] of [
      ['A3', 'file'],
      ['A4', 'js'],
      ['A5', 'in']
    ]) {
      expect(ws.getCell(addr).value).toBe(text)
      expect(ws.getCell(addr).font.underline).toBeFalsy()
    }
  })

  it('cắt không để lại nửa cặp surrogate', async () => {
    // 32 765 ký tự thường + 😀 (2 đơn vị) nằm đúng ranh giới cắt
    const text = 'a'.repeat(32765) + '😀' + 'b'.repeat(10)
    const v = (await reload([{ name: 'S', blocks: [T(['H'], [text])] }])).worksheets[0].getCell('A2').value as string
    expect(v.length).toBeLessThanOrEqual(32767)
    expect(v.endsWith('…')).toBe(true)
    expect(v).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/)
  })

  it('ký tự cấm XML 1.0 không lọt vào file (C0 do exceljs bỏ, U+FFFE/U+FFFF do write.ts bỏ)', async () => {
    const dirty = 'a\u0001b\u000Bc\u0008d\u001Fe\uFFFEf\uFFFFg\tz'
    const sheets: SheetModel[] = [
      {
        name: 'S',
        blocks: [
          { kind: 'banner', label: dirty, title: dirty },
          T([dirty], [dirty]),
          { kind: 'meta', items: [{ label: dirty, value: { text: dirty } }] },
          { kind: 'heading', text: dirty },
          { kind: 'note', text: dirty },
          { kind: 'paragraph', text: dirty },
          { kind: 'code', lines: [dirty] }
        ]
      }
    ]
    const buf = Buffer.from((await buildWorkbook(sheets).xlsx.writeBuffer()) as ArrayBuffer)
    const zip = await JSZip.loadAsync(buf)
    for (const name of Object.keys(zip.files).filter((n) => n.endsWith('.xml') || n.endsWith('.rels'))) {
      const xml = await zip.file(name)!.async('string')
      expect(xml, name).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/)
    }
    // Đọc lại được và chữ còn nguyên phần hợp lệ (Tab giữ lại).
    expect(await sheetJsText(sheets, 'A1')).toBe('abcdefg\tz')
    const w = new ExcelJS.Workbook()
    await w.xlsx.load(buf as unknown as ExcelJS.Buffer)
    expect(w.worksheets[0].getCell('A3').value).toBe('abcdefg\tz')
  })

  it('link có ký tự cấm trong URL cũng được làm sạch', async () => {
    const sheets: SheetModel[] = [
      {
        name: 'S',
        blocks: [
          T(['H'], ['x']),
          { kind: 'table', header: [{ text: 'L' }], rows: [[{ text: 'a\uFFFEb', link: 'https://x.example/\u0001a\uFFFF' }]] }
        ]
      }
    ]
    const zip = await JSZip.loadAsync(Buffer.from((await buildWorkbook(sheets).xlsx.writeBuffer()) as ArrayBuffer))
    const rels = await zip.file('xl/worksheets/_rels/sheet1.xml.rels')!.async('string')
    expect(rels).toContain('Target="https://x.example/a"')
  })
})

describe('buildWorkbook: đầu vào biên', () => {
  it('sheet không có block vẫn ghi được; nhiều sheet giữ tên và thứ tự', async () => {
    const wb = await reload([
      { name: 'Trống', blocks: [] },
      { name: 'Hai', blocks: [T(['A'], ['x'])] }
    ])
    expect(wb.worksheets.map((s) => s.name)).toEqual(['Trống', 'Hai'])
    expect(wb.worksheets[0].pageSetup).toMatchObject({ fitToPage: true })
    expect(wb.worksheets[0].views[0].showGridLines).toBe(false)
  })

  it("note/paragraph rỗng hoặc '・' không làm hỏng; hàng vẫn cao 16.5", async () => {
    const ws = (
      await reload([
        {
          name: 'S',
          blocks: [
            { kind: 'note', text: '' },
            { kind: 'paragraph', text: '・' },
            { kind: 'note', text: '' },
            { kind: 'heading', text: 'H' }
          ]
        }
      ])
    ).worksheets[0]
    expect(ws.getRow(1).height).toBe(16.5)
    expect(ws.getCell('A3').value).toBe('・')
    expect(ws.getRow(3).height).toBe(16.5)
    expect(ws.getRow(5).height).toBe(16.5)
    expect(ws.getCell('A7').value).toBe('H')
  })

  it('span tối thiểu 4: meta/paragraph merge tới cột D khi bảng hẹp', async () => {
    const ws = (
      await reload([
        {
          name: 'S',
          blocks: [
            T(['A', 'B'], ['1', '2']),
            { kind: 'meta', items: [{ label: 'L', value: { text: 'v' } }] },
            { kind: 'paragraph', text: 'p' }
          ]
        }
      ])
    ).worksheets[0]
    // hàng 1-2 bảng, 3 trống, 4 meta, 5 trống, 6 paragraph
    expect(ws.getCell('D4').master.address).toBe('B4')
    expect(ws.getCell('D6').master.address).toBe('A6')
    expect(ws.getCell('E6').isMerged).toBe(false)
    // cột C, D không có dữ liệu: giữ mặc định, không ghi độ rộng
    expect(ws.getColumn(3).width).toBeUndefined()
    expect(ws.getColumn(4).width).toBeUndefined()
  })

  it('bảng có hàng ngắn hơn header: ô thiếu vẫn có viền; ô rỗng không có giá trị', async () => {
    const ws = (await reload([{ name: 'S', blocks: [T(['A', 'B', 'C'], ['1'])] }])).worksheets[0]
    expect(ws.getCell('C2').border.left).toMatchObject({ style: 'thin' })
    expect(ws.getCell('C2').value).toBeNull()
  })

  it('cột rộng tối đa 60', async () => {
    const ws = (await reload([{ name: 'S', blocks: [T(['H'], ['x'.repeat(100)])] }])).worksheets[0]
    expect(ws.getColumn(1).width).toBe(60)
  })

  it('đoạn văn dài: chiều cao theo tổng độ rộng các cột merge', async () => {
    const text = 'あ'.repeat(200)
    const ws = (await reload([{ name: 'S', blocks: [T(['H', 'I'], ['1', '2']), { kind: 'paragraph', text }] }])).worksheets[0]
    // span = 4 (cột C, D không có dữ liệu: mặc định 8.43)
    const total = sumWidths(ws, 1, 4)
    expect(total).toBeCloseTo(6 + 6 + 2 * 8.43)
    expect(ws.getRow(4).height).toBe(LINE * estimateLines(text, total))
    // 14 chữ toàn角 (28 đơn vị) mỗi dòng trong 28.86 -> 15 dòng
    expect(ws.getRow(4).height).toBe(15 * LINE)
  })

  it('cột tính ra rộng đúng 9 (exceljs coi là mặc định, không ghi <col>) được tính như cột mặc định 8.43', async () => {
    // cột A: 'abcdefg' -> 7 + 2 = 9; B..D mặc định. Vùng merge A:D = 4 × 8.43 = 33.72, không phải 9 + 3 × 8.43 = 34.29:
    // 17 chữ toàn角 (34 đơn vị) vừa một dòng nếu tính 9, phải là 2 dòng.
    const ws = (await reload([{ name: 'S', blocks: [T(['abcdefg'], ['x']), { kind: 'paragraph', text: 'あ'.repeat(17) }] }]))
      .worksheets[0]
    expect(ws.getColumn(1).width).toBeUndefined()
    expect(ws.getRow(4).height).toBe(2 * LINE)
  })

  it('meta: value căn trái (số không bị đẩy sang mép phải vùng merge)', async () => {
    const ws = (
      await reload([
        {
          name: 'S',
          blocks: [{ kind: 'meta', items: [{ label: '版数', value: { text: '1.0' } }, { label: 'L', value: { text: 'abc' } }] }]
        }
      ])
    ).worksheets[0]
    expect(ws.getCell('B1').value).toBe(1)
    expect(ws.getCell('B1').numFmt).toBe('0.0')
    expect(ws.getCell('B1').alignment).toMatchObject({ horizontal: 'left', vertical: 'top', wrapText: true })
    expect(ws.getCell('B2').alignment.horizontal).toBe('left')
  })

  it('meta: hàng có chiều cao do app đặt thì đủ cao cho cả nhãn dài (ô nhãn tự xuống dòng)', async () => {
    // cột A tối đa 60: 80 chữ 'W' cần 3 dòng; value 2 dòng
    const ws = (
      await reload([{ name: 'S', blocks: [{ kind: 'meta', items: [{ label: 'W'.repeat(80), value: { text: 'a\nb' } }] }] }])
    ).worksheets[0]
    expect(ws.getColumn(1).width).toBe(60)
    expect(ws.getRow(1).height).toBe(3 * LINE)
  })

  it('meta: nhãn in đậm nên tính theo bề rộng glyph đậm (đậm rộng hơn, vd i: 3 -> 4px)', async () => {
    // 200 chữ 'i' trong cột 60: chữ thường vừa 2 dòng, chữ đậm cần 3 dòng
    const ws = (
      await reload([{ name: 'S', blocks: [{ kind: 'meta', items: [{ label: 'i'.repeat(200), value: { text: 'a\nb' } }] }] }])
    ).worksheets[0]
    expect(estimateLines('i'.repeat(200), 60)).toBe(2)
    expect(ws.getRow(1).height).toBe(3 * LINE)
  })

  it('meta value một dòng dài vẫn đủ cao theo độ rộng vùng merge', async () => {
    const text = 'x'.repeat(100)
    const ws = (await reload([{ name: 'S', blocks: [{ kind: 'meta', items: [{ label: 'L', value: { text } }] }] }])).worksheets[0]
    // cột A = 6 (nhãn 'L'), B..D không có dữ liệu = 8.43 mặc định => vùng value rộng 25.29
    expect(ws.getRow(1).height).toBe(LINE * estimateLines(text, 3 * 8.43))
    expect(ws.getRow(1).height).toBe(66)
  })

  it('khối rỗng không để lại hàng trống thừa', async () => {
    const ws = (
      await reload([{ name: 'S', blocks: [{ kind: 'meta', items: [] }, { kind: 'code', lines: [] }, { kind: 'heading', text: 'H' }] }])
    ).worksheets[0]
    expect(ws.getCell('A1').value).toBe('H')
  })

  it('code giữ khoảng trắng đầu dòng', async () => {
    const sheets: SheetModel[] = [{ name: 'S', blocks: [{ kind: 'code', lines: ['  indented', '', 'x'] }] }]
    const ws = (await reload(sheets)).worksheets[0]
    expect(ws.getCell('A1').value).toBe('  indented')
    expect(ws.getCell('A3').value).toBe('x')
  })
})

describe('buildWorkbook: độ rộng cột A và tên sheet', () => {
  it('nhãn banner tính vào độ rộng cột A (bảng chỉ có No/1 vẫn rộng 10); tiêu đề (cột B) thì không', async () => {
    const ws = (
      await reload([{ name: 'S', blocks: [{ kind: 'banner', label: '基本設計', title: '画面項目定義書' }, T(['No'], ['1'])] }])
    ).worksheets[0]
    expect(ws.getColumn(1).width).toBe(10)
    expect(ws.getColumn(2).width).toBeUndefined()
  })

  it('tên sheet bẩn đi qua safeSheetName: workbook.xml sạch, exceljs đọc lại được, không trùng tên', async () => {
    const used = new Set<string>()
    const names = ['A\uFFFEB', '\u0001', 'X\u0002', 'X\u0003'].map((n) => safeSheetName(n, used))
    expect(names).toEqual(['AB', 'Sheet', 'X', 'X (2)'])
    const sheets = names.map((name) => ({ name, blocks: [T(['H'], ['v'])] }))
    const buf = Buffer.from((await buildWorkbook(sheets).xlsx.writeBuffer()) as ArrayBuffer)
    const xml = await (await JSZip.loadAsync(buf)).file('xl/workbook.xml')!.async('string')
    expect(xml).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/)
    expect(xml.match(/<sheet /g)).toHaveLength(4)
    const w = new ExcelJS.Workbook()
    await w.xlsx.load(buf as unknown as ExcelJS.Buffer)
    expect(w.worksheets.map((s) => s.name)).toEqual(names)
  })
})

describe('buildWorkbook: đoạn văn/ghi chú quá cao được tách qua nhiều hàng', () => {
  const MAX_LINES = Math.floor(MAX_ROW_HEIGHT / LINE_HEIGHT)
  /** Giá trị cột A của các hàng liên tiếp có chữ, bắt đầu từ `from`. */
  const consecutive = (ws: ExcelJS.Worksheet, from: number) => {
    const rows: { row: number; text: string }[] = []
    for (let r = from; ws.getCell(r, 1).value !== null; r++) rows.push({ row: r, text: ws.getCell(r, 1).value as string })
    return rows
  }

  it('LINE_HEIGHT đo bằng Excel thật là 16.5 nên mỗi hàng chứa tối đa 24 dòng', () => {
    expect(LINE_HEIGHT).toBe(16.5)
    expect(MAX_LINES).toBe(24)
  })

  it.each(['paragraph', 'note'] as const)('%s 60 dòng ngắn -> ceil(60/MAX_LINES) hàng merge liền nhau, đủ chữ', async (kind) => {
    const lines = Array.from({ length: 60 }, (_, i) => `dòng ${i}`)
    const ws = (await reload([{ name: 'S', blocks: [{ kind, text: lines.join('\n') }, { kind: 'heading', text: 'H' }] }])).worksheets[0]
    const rows = consecutive(ws, 1)
    expect(rows).toHaveLength(Math.ceil(60 / MAX_LINES))
    const expectedCounts = [MAX_LINES, MAX_LINES, 60 - 2 * MAX_LINES]
    rows.forEach(({ row, text }, i) => {
      expect(text.split('\n')).toHaveLength(expectedCounts[i])
      expect(ws.getRow(row).height).toBe(LINE_HEIGHT * expectedCounts[i])
      expect(ws.getRow(row).height as number).toBeLessThanOrEqual(MAX_ROW_HEIGHT)
      // merge A..D, cùng style, tự xuống dòng
      expect(ws.getCell(row, 4).master.address).toBe(`A${row}`)
      expect(ws.getCell(row, 1).alignment).toMatchObject({ wrapText: true, vertical: 'top' })
      expect(ws.getCell(row, 1).font.color?.argb).toBe(kind === 'note' ? 'FF595959' : undefined)
    })
    expect(rows.map((r) => r.text).join('\n')).toBe(lines.join('\n'))
    // một hàng trống sau mảnh cuối, heading ngay sau đó
    expect(ws.getCell(rows.length + 1, 1).value).toBeNull()
    expect(ws.getCell(rows.length + 2, 1).value).toBe('H')
  })

  it('một dòng 20 000 ký tự -> nhiều hàng liền nhau, mỗi hàng không quá cao, nối lại ra bản gốc', async () => {
    const text = 'x'.repeat(20000)
    const ws = (await reload([{ name: 'S', blocks: [{ kind: 'paragraph', text }, { kind: 'heading', text: 'H' }] }])).worksheets[0]
    const rows = consecutive(ws, 1)
    expect(rows.length).toBeGreaterThan(1)
    const total = sumWidths(ws, 1, 4)
    for (const { row, text: piece } of rows) {
      expect(ws.getRow(row).height).toBe(LINE_HEIGHT * estimateLines(piece, total))
      expect(ws.getRow(row).height as number).toBeLessThanOrEqual(MAX_ROW_HEIGHT)
    }
    // dòng gốc không có xuống dòng nên nối các mảnh bằng chuỗi rỗng
    expect(rows.map((r) => r.text).join('')).toBe(text)
    expect(ws.getCell(rows.length + 2, 1).value).toBe('H')
  })

  it('cắt dòng dài không làm vỡ cặp surrogate trong file', async () => {
    const text = '😀'.repeat(3000)
    const ws = (await reload([{ name: 'S', blocks: [{ kind: 'note', text }] }])).worksheets[0]
    const rows = consecutive(ws, 1)
    expect(rows.length).toBeGreaterThan(1)
    expect(rows.map((r) => r.text).join('')).toBe(text)
    for (const { text: piece } of rows) expect(piece).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/)
  })

  it('đoạn văn vừa một hàng thì không tách', async () => {
    const lines = Array.from({ length: MAX_LINES }, (_, i) => `l${i}`)
    const ws = (await reload([{ name: 'S', blocks: [{ kind: 'paragraph', text: lines.join('\n') }, { kind: 'heading', text: 'H' }] }])).worksheets[0]
    expect(consecutive(ws, 1)).toHaveLength(1)
    expect(ws.getRow(1).height).toBe(LINE_HEIGHT * MAX_LINES)
    expect(ws.getCell('A3').value).toBe('H')
  })

  it('dòng code cao hơn 409.5pt -> nhiều hàng merge liền nhau (mỗi hàng ≤ 409.5pt, nối lại ra dòng gốc); dòng sau ở hàng kế', async () => {
    const long = 'x'.repeat(6000)
    const ws = (await reload([{ name: 'S', blocks: [{ kind: 'code', lines: ['a', long, 'b'] }, { kind: 'heading', text: 'H' }] }]))
      .worksheets[0]
    const rows = consecutive(ws, 1)
    expect(rows[0].text).toBe('a')
    expect(rows[rows.length - 1].text).toBe('b')
    const pieces = rows.slice(1, -1)
    expect(pieces.length).toBeGreaterThan(1)
    expect(pieces.map((p) => p.text).join('')).toBe(long)
    const total = sumWidths(ws, 1, 4)
    for (const { row, text } of rows) {
      expect(ws.getRow(row).height as number).toBeLessThanOrEqual(MAX_ROW_HEIGHT)
      // MS Gothic 10: Excel AutoFit 15pt cho 1 dòng, n dòng (n >= 2) không quá 12n + 1.5
      expect(ws.getRow(row).height).toBe(Math.max(15, 12 * estimateLines(text, total, 'code') + 1.5))
      expect(ws.getCell(row, 4).master.address).toBe(`A${row}`)
      expect(ws.getCell(row, 1).font.name).toBe('MS Gothic')
    }
    // mảnh đầy dùng gần hết một hàng (không cắt quá vụn)
    expect(ws.getRow(pieces[0].row).height as number).toBeGreaterThan(MAX_ROW_HEIGHT - 24)
    expect(ws.getCell(rows.length + 2, 1).value).toBe('H')
  })

  it('heading cao hơn 409.5pt -> nhiều hàng merge liền nhau, chỉ hàng cuối có gạch dưới', async () => {
    const text = '見出し'.repeat(700)
    const ws = (await reload([{ name: 'S', blocks: [{ kind: 'heading', text }, { kind: 'paragraph', text: 'p' }] }])).worksheets[0]
    const rows = consecutive(ws, 1)
    const pieces = rows.slice(0, -1)
    expect(rows[rows.length - 1].text).toBe('p')
    expect(pieces.length).toBeGreaterThan(1)
    expect(pieces.map((p) => p.text).join('')).toBe(text)
    pieces.forEach(({ row }, i) => {
      expect(ws.getRow(row).height as number).toBeLessThanOrEqual(MAX_ROW_HEIGHT)
      expect(ws.getCell(row, 1).font).toMatchObject({ bold: true, size: 12 })
      expect(ws.getCell(row, 4).master.address).toBe(`A${row}`)
      expect(ws.getCell(row, 1).border?.bottom?.style).toBe(i === pieces.length - 1 ? 'medium' : undefined)
    })
  })

  it('ô value của meta vẫn là một ô, cao tối đa MAX_ROW_HEIGHT (không tách)', async () => {
    const text = Array.from({ length: 40 }, (_, i) => `v${i}`).join('\n')
    const ws = (
      await reload([{ name: 'S', blocks: [{ kind: 'meta', items: [{ label: 'L', value: { text } }] }, { kind: 'heading', text: 'H' }] }])
    ).worksheets[0]
    expect(ws.getRow(1).height).toBe(MAX_ROW_HEIGHT)
    expect(ws.getCell('B1').value).toBe(text)
    expect(ws.getCell('A3').value).toBe('H')
  })
})

describe('buildWorkbook: chiều cao hàng merge không thấp hơn AutoFit của Excel thật', () => {
  /*
   * Số đo bằng Excel 16 thật (COM, 96 DPI): đặt cùng chữ vào một cột nháp rộng đúng bằng vùng merge, cùng font,
   * wrapText, rồi AutoFit; giá trị là chiều cao AutoFit (pt). Chữ bị che nếu app đặt thấp hơn.
   * - golden: sheet 1 của test/golden/kihon-sekkei.xlsx.md + các mẫu (đoạn văn A:H = 509.3pt, value meta B:H = 456.8pt)
   * - narrow: sheet chỉ có các mẫu (span 4: A = 6, B..D mặc định; đoạn văn 175.5pt, value meta 144pt)
   * Cách đo và bảng đầy đủ: .superpowers/sdd/2026-10-19-md-to-excel/final-fix-report.md.
   */
  const SQL =
    'SELECT CUSTOMER_ID, CUSTOMER_NAME, PHONE_NUMBER, REGISTERED_DATE FROM TBL_CUSTOMER WHERE DELETE_FLG = 0 AND STATUS_CODE IN (1, 2, 3) ORDER BY CUSTOMER_ID, REGISTERED_DATE DESC'
  const IDENT =
    '※ 顧客コード（CUST_CD）は TBL_CUSTOMER.CUST_CD と一致すること。ERR_CODE: E0001, E0002, E0003, E0004, E0005, E0006, E0007, E0008 を返す。DELETE_FLG = 1 のデータは対象外'
  /**
   * Mẫu có dấu '-' (review sau đợt sửa heading/code): Excel xuống dòng sau mỗi dấu '-', nên chuỗi nhiều đoạn
   * `xxx-` cần nhiều dòng hơn một từ liền (trước khi sửa: 25 hàng bị che). Mẫu dùng cho cả đoạn văn, heading và code.
   */
  const seg = (n: number, k: number, ch = 'a', sep = '-') =>
    Array.from({ length: k }, () => ch.repeat(n - 1) + sep).join('')
  const HYPHEN_TEXTS = [
    seg(10, 40),
    seg(14, 30),
    seg(18, 25),
    seg(22, 20),
    seg(26, 18),
    seg(30, 16),
    seg(40, 12),
    seg(18, 25, 'W'),
    seg(18, 25, 'i'),
    ...['/', '?', ',', '.', ')', '!', '%', ';', '|'].map((sep) => seg(16, 25, 'x', sep)),
    "id IN ('3f2504e0-4f89-11d3-9a0c-0305e82c3301','6ba7b810-9dad-11d1-80b4-00c04fd430c8','6ba7b811-9dad-11d1-80b4-00c04fd430c8','6ba7b812-9dad-11d1-80b4-00c04fd430c8')",
    'curl -X POST https://api.example.com/v1/customers/search-by-name-and-phone-number?include-deleted=false&page-size=100&sort-order=desc&fields=customer-id,customer-name,phone-number,email-address',
    '.customer-search-result-table-header-cell-highlighted-primary-background-color-variant-dark-mode-enabled-responsive-layout-wrapper { display: none; }',
    '検索-' + '顧客情報-一覧表示-'.repeat(20),
    'ABC-' + 'カタカナ-ひらがな-'.repeat(20),
    '2026-10-19 '.repeat(20).trimEnd(),
    '03-1234-5678, '.repeat(15).trimEnd(),
    'xxxxxxxx--'.repeat(30),
    '-option -flag --long-option=value '.repeat(8).trimEnd(),
    'aaaaaaaaaaaaaaa -bbbbbbbbbbbbbbb - '.repeat(8).trimEnd(),
    '-' + 'a'.repeat(60) + '-' + 'b'.repeat(60),
    '\u2010\u2013\u2014\u2011'.repeat(30)
  ]
  /**
   * Excel AutoFit (pt) của cả chuỗi: [đoạn văn golden, narrow, heading golden, narrow, code golden, narrow].
   * 409.5 = giới hạn AutoFit (Excel cần ít nhất 409.5): app tách thành nhiều hàng, tổng chiều cao phải >= 409.5.
   */
  // prettier-ignore
  const HYPHEN_EXCEL: number[][] = [
    [82.5, 231, 117, 390, 60, 168],
    [82.5, 247.5, 117, 409.5, 60, 180],
    [82.5, 409.5, 136.5, 409.5, 60, 300],
    [82.5, 330, 136.5, 390, 60, 240],
    [99, 297, 175.5, 409.5, 72, 216],
    [99, 264, 156, 409.5, 72, 192],
    [99, 396, 234, 409.5, 72, 288],
    [148.5, 409.5, 253.5, 409.5, 60, 300],
    [49.5, 115.5, 78, 253.5, 60, 300],
    [66, 181.5, 117, 331.5, 60, 156],
    [66, 198, 117, 331.5, 60, 156],
    [66, 181.5, 117, 312, 60, 156],
    [66, 181.5, 117, 312, 60, 156],
    [66, 181.5, 117, 331.5, 60, 156],
    [66, 181.5, 117, 331.5, 60, 156],
    [66, 198, 117, 351, 60, 156],
    [66, 181.5, 117, 331.5, 60, 156],
    [66, 181.5, 117, 331.5, 60, 156],
    [33, 82.5, 58.5, 175.5, 24, 84],
    [49.5, 132, 58.5, 195, 36, 108],
    [33, 82.5, 39, 136.5, 24, 60],
    [66, 231, 97.5, 273, 60, 168],
    [66, 231, 97.5, 273, 48, 168],
    [49.5, 115.5, 58.5, 175.5, 36, 96],
    [49.5, 115.5, 58.5, 156, 36, 96],
    [49.5, 165, 97.5, 292.5, 48, 120],
    [49.5, 132, 78, 214.5, 36, 120],
    [66, 264, 78, 312, 48, 192],
    [33, 99, 39, 136.5, 24, 60],
    [33, 99, 58.5, 136.5, 24, 60]
  ]
  /** Mẫu '-' của một kiểu: cột k (0 đoạn văn, 2 heading, 4 code) của HYPHEN_EXCEL. */
  const hyphen = (k: number) =>
    HYPHEN_TEXTS.map((text, i) => ({ text, golden: HYPHEN_EXCEL[i][k], narrow: HYPHEN_EXCEL[i][k + 1] }))
  const PARAGRAPHS: { text: string; golden: number; narrow: number }[] = [
    { text: SQL, golden: 49.5, narrow: 148.5 },
    { text: IDENT, golden: 33, narrow: 99 },
    { text: 'ABCDEFGHIJ'.repeat(30), golden: 66, narrow: 198 },
    { text: '0123456789'.repeat(20), golden: 49.5, narrow: 115.5 },
    { text: 'W'.repeat(120), golden: 49.5, narrow: 115.5 },
    { text: 'MW '.repeat(60).trimEnd(), golden: 49.5, narrow: 132 },
    {
      text: 'WWWWWWWWWWWWWWW MMMMMMMMMMMMMMMMMMM WWWWWWWWWWWWWWWWWWWWWW MMMMMMMMMMMMMMMM WWWWWWWWWWWWWWWWWWWWWWWWWWWW MMMMMMMMMMMMM',
      golden: 49.5,
      narrow: 148.5
    },
    { text: '顧客IDはCUSTOMER_IDで管理し、顧客名はCUSTOMER_NAMEで管理する。'.repeat(4), golden: 49.5, narrow: 148.5 },
    { text: 'm'.repeat(80) + ' ' + 'w'.repeat(80), golden: 66, narrow: 132 },
    { text: '%%%%%%%%%% @@@@@@@@@@ ########## &&&&&&&&&& ++++++++++ =========='.repeat(3), golden: 66, narrow: 165 },
    { text: 'ＡＢＣＤＥＦ１２３４５６ｱｲｳｴｵｶｷｸｹｺ ×÷±° '.repeat(6).trimEnd(), golden: 49.5, narrow: 198 },
    {
      text: '行1: SELECT * FROM TBL_A\n行2: UPDATE TBL_B SET FLG = 1 WHERE ID IN (SELECT ID FROM TBL_C WHERE STATUS = 9)\n行3: 完了',
      golden: 49.5,
      narrow: 82.5
    },
    {
      text: 'CUSTOMER_ID CUSTOMER_NAME PHONE_NUMBER EMAIL_ADDRESS POSTAL_CODE ADDRESS_LINE1 ADDRESS_LINE2 REGISTERED_AT UPDATED_AT',
      golden: 33,
      narrow: 82.5
    },
    { text: 'mixed ' + 'カタカナ'.repeat(10) + ' and ABCDEFGHIJKLMNOPQRSTUVWXYZ ' + 'ひらがな'.repeat(12), golden: 49.5, narrow: 148.5 },
    { text: '※ CUST_CD は TBL_CUSTOMER.CUST_CD と一致すること。'.repeat(6), golden: 66, narrow: 214.5 },
    // Emoji và ký tự rộng hơn 1em (đo lại sau review: trước khi sửa app đặt 16.5 / 49.5 / 82.5 / 33 -> chữ bị che)
    { text: '\u2705'.repeat(40), golden: 33, narrow: 66 },
    { text: '\u2705 検索 \u274C 削除 \u2B50 重要 \u2728 新規 \u2753 要確認 '.repeat(4).trimEnd(), golden: 33, narrow: 82.5 },
    { text: '進捗: ' + '\u2705'.repeat(20) + ' 完了 ' + '\u274C'.repeat(10) + ' 未完了 ' + '\u2B50'.repeat(5), golden: 33, narrow: 82.5 },
    { text: '\u26A0\uFE0F 注意: ' + '\u26A0\uFE0F'.repeat(30), golden: 49.5, narrow: 82.5 },
    { text: '\u23F0\u231B\u26A1\u26D4\u2B1B\u2B55\u2795\u2614'.repeat(8), golden: 33, narrow: 99 },
    { text: '\uFDFD'.repeat(20), golden: 49.5, narrow: 165 },
    { text: '\u27F6 \u2192 \u2328 \u23F1 \u2E3B '.repeat(10).trimEnd(), golden: 33, narrow: 82.5 },
    {
      text: '\u{1F468}\u200D\u{1F469}\u200D\u{1F467} \u{1F44D}\u{1F3FD} \u{1F1EF}\u{1F1F5} 1\uFE0F\u20E3 '.repeat(8).trimEnd(),
      golden: 16.5,
      narrow: 49.5
    },
    { text: '\u{1F600}'.repeat(60), golden: 33, narrow: 82.5 },
    ...hyphen(0)
  ]
  const META: { text: string; golden: number; narrow: number }[] = [
    {
      text: 'SELECT CUSTOMER_ID, CUSTOMER_NAME, PHONE_NUMBER, REGISTERED_DATE FROM TBL_CUSTOMER WHERE DELETE_FLG = 0 ORDER BY CUSTOMER_ID',
      golden: 33,
      narrow: 115.5
    },
    { text: 'CUSTOMER_ID, CUSTOMER_NAME, PHONE_NUMBER, EMAIL_ADDRESS, POSTAL_CODE', golden: 16.5, narrow: 82.5 },
    { text: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ ABCDEFGHIJKLMNOPQRSTUVWXYZ', golden: 16.5, narrow: 66 },
    { text: '0123456789'.repeat(7), golden: 16.5, narrow: 49.5 },
    { text: IDENT, golden: 33, narrow: 132 },
    { text: 'TBL_CUSTOMER / TBL_ORDER / TBL_ORDER_DETAIL / TBL_PRODUCT / TBL_STOCK', golden: 16.5, narrow: 82.5 },
    {
      text: '\u2705 対応済み \u274C 未対応 \u2B50 優先 \u2728 新機能 \u2753 要確認 \u2705 対応済み \u274C 未対応 \u2B50 優先 \u2728 新機能 \u2753 要確認 \u2705 対応済み \u274C 未対応',
      golden: 33,
      narrow: 82.5
    },
    { text: '\u26A0\uFE0F'.repeat(30), golden: 33, narrow: 82.5 }
  ]
  /** Heading (游ゴシック 12 đậm) và dòng code (MS Gothic 10) dài: merge A..span, tự xuống dòng (cùng cách đo). */
  const SQL_300 =
    "SELECT CUSTOMER_ID, CUSTOMER_NAME, PHONE_NUMBER, EMAIL_ADDRESS, POSTAL_CODE, ADDRESS_LINE1, ADDRESS_LINE2, REGISTERED_AT, UPDATED_AT FROM TBL_CUSTOMER WHERE DELETE_FLG = 0 AND STATUS_CODE IN (1, 2, 3) AND REGISTERED_AT >= '2026-01-01' ORDER BY CUSTOMER_ID, REGISTERED_AT DESC LIMIT 100 OFFSET 0; -- 1"
  const HEADINGS: { text: string; golden: number; narrow: number }[] = [
    { text: '【' + '画面項目定義の詳細説明とレイアウト仕様について'.repeat(3) + '】', golden: 39, narrow: 117 },
    { text: '■ Section ' + 'ABCDEFGHIJ'.repeat(12), golden: 58.5, narrow: 136.5 },
    { text: '1.2.3 ' + 'mmmmmmmmmm wwwwwwwwww '.repeat(6).trimEnd(), golden: 58.5, narrow: 234 },
    { text: '見出し \u2705 完了 \u274C 未完了 \u2B50 重要 '.repeat(4).trimEnd(), golden: 39, narrow: 117 },
    { text: 'iiiiiiiiii llllllllll '.repeat(10).trimEnd(), golden: 39, narrow: 97.5 },
    ...hyphen(2)
  ]
  const CODE: { text: string; golden: number; narrow: number }[] = [
    { text: SQL_300, golden: 48, narrow: 132 },
    { text: 'i'.repeat(200), golden: 36, narrow: 84 },
    { text: '    // ' + 'コメント：顧客情報を検索して一覧に表示する。'.repeat(4), golden: 36, narrow: 84 },
    { text: 'const longIdentifierName_' + 'x'.repeat(150) + ' = 1', golden: 36, narrow: 84 },
    { text: 'l'.repeat(80) + ' ' + 'i'.repeat(80) + ' ' + '.'.repeat(80), golden: 36, narrow: 108 },
    { text: '\u2705'.repeat(60), golden: 24, narrow: 60 },
    ...hyphen(4)
  ]
  const samples = (): Block[] => [
    ...PARAGRAPHS.map(({ text }): Block => ({ kind: 'paragraph', text })),
    { kind: 'meta', items: META.map(({ text }, i) => ({ label: `M${i + 1}`, value: { text } })) },
    ...HEADINGS.map(({ text }): Block => ({ kind: 'heading', text })),
    { kind: 'code', lines: CODE.map(({ text }) => text) }
  ]
  const golden = parseMarkdownFile(
    readFileSync(fileURLToPath(new URL('../../../../test/golden/kihon-sekkei.xlsx.md', import.meta.url)), 'utf8'),
    'kihon-sekkei.xlsx.md'
  ).sheets[0]

  type Kind = 'text' | 'heading' | 'code'
  /** Loại hàng theo font của ô: heading 12pt, code MS Gothic, còn lại đoạn văn / ghi chú / value meta. */
  const kindOf = (cell: ExcelJS.Cell): Kind =>
    cell.font?.size === 12 ? 'heading' : cell.font?.name === 'MS Gothic' ? 'code' : 'text'
  /**
   * Các hàng loại `kind` chứa `text` ở cột `col`: một ô chính, hoặc các mảnh liền nhau khi chữ quá cao bị tách
   * (nối bằng chuỗi rỗng, hoặc xuống dòng nếu tách giữa các dòng thật).
   */
  const rowsOf = (ws: ExcelJS.Worksheet, col: number, text: string, kind: Kind = 'text'): number[] => {
    const valueAt = (r: number): string | null => {
      const cell = ws.getCell(r, col)
      // ô phụ của vùng merge trả về giá trị của ô chính: chỉ xét ô chính; cùng chữ có thể là đoạn văn/heading/code
      if (cell.master.address !== cell.address || typeof cell.value !== 'string' || kindOf(cell) !== kind) return null
      return cell.value
    }
    for (let r = 1; r <= ws.rowCount; r++) {
      for (const sep of ['', '\n']) {
        let acc = valueAt(r)
        if (acc === null || !text.startsWith(acc)) break
        const rows = [r]
        while (acc !== text) {
          const next = valueAt(r + rows.length)
          if (next === null || !text.startsWith(acc + sep + next)) break
          acc += sep + next
          rows.push(r + rows.length)
        }
        if (acc === text) return rows
      }
    }
    throw new Error('không thấy ô: ' + text.slice(0, 30))
  }
  /** Tổng chiều cao hiển thị các hàng chứa `text`; hàng không đặt chiều cao thì Excel tự giãn = 1 dòng. */
  const heightOf = (ws: ExcelJS.Worksheet, col: number, text: string, kind: Kind = 'text'): number =>
    rowsOf(ws, col, text, kind).reduce((sum, r) => sum + (ws.getRow(r).height ?? LINE), 0)

  it.each([
    ['golden', () => [...golden.blocks, ...samples()]],
    ['narrow', () => samples()]
  ] as const)('%s: mọi mẫu (SQL, định danh, chữ hoa, …) cao >= AutoFit', async (sheet, blocks) => {
    const ws = (await reload([{ name: 'S', blocks: blocks() }])).worksheets[0]
    const got = [
      ...PARAGRAPHS.map((s) => ({ text: s.text.slice(0, 30), excel: s[sheet], app: heightOf(ws, 1, s.text) })),
      ...META.map((s) => ({ text: 'meta ' + s.text.slice(0, 25), excel: s[sheet], app: heightOf(ws, 2, s.text) })),
      ...HEADINGS.map((s) => ({ text: 'heading ' + s.text.slice(0, 22), excel: s[sheet], app: heightOf(ws, 1, s.text, 'heading') })),
      ...CODE.map((s) => ({ text: 'code ' + s.text.slice(0, 25), excel: s[sheet], app: heightOf(ws, 1, s.text, 'code') }))
    ]
    expect(got.filter((g) => g.app < g.excel)).toEqual([])
  })

  it.each([
    ['golden', () => [...golden.blocks, ...samples()], 8],
    ['narrow', () => samples(), 4]
  ] as const)('%s: heading và dòng code dài merge A..span, tự xuống dòng (không tràn ra ngoài vùng in)', async (_, blocks, span) => {
    const ws = (await reload([{ name: 'S', blocks: blocks() }])).worksheets[0]
    const all = [...HEADINGS.map((s) => [s.text, 'heading'] as const), ...CODE.map((s) => [s.text, 'code'] as const)]
    for (const [text, kind] of all) {
      for (const r of rowsOf(ws, 1, text, kind)) {
        expect(ws.getCell(r, span).master.address, text.slice(0, 20)).toBe(`A${r}`)
        expect(ws.getCell(r, span + 1).isMerged, text.slice(0, 20)).toBe(false)
        expect(ws.getCell(r, 1).alignment, text.slice(0, 20)).toMatchObject({ wrapText: true, vertical: 'top' })
      }
    }
  })
})

describe('injectIgnoredErrors: đúng vị trí theo schema CT_Worksheet', () => {
  const IGNORED = '<ignoredErrors><ignoredError sqref="A1:XFD1048576" numberStoredAsText="1"/></ignoredErrors>'
  const wrap = (inner: string) => `<?xml version="1.0"?><worksheet><sheetData/>${inner}</worksheet>`

  it('không có phần tử theo sau: chèn trước </worksheet>, sau pageSetup', () => {
    const out = injectIgnoredErrors(wrap('<pageSetup a="1"/>'))
    expect(out).toBe(wrap('<pageSetup a="1"/>' + IGNORED))
  })

  it.each(['drawing', 'legacyDrawing', 'picture', 'oleObjects', 'controls', 'webPublishItems', 'tableParts', 'extLst'])(
    'chèn trước <%s> khi có',
    (tag) => {
      const out = injectIgnoredErrors(wrap(`<pageSetup a="1"/><${tag} r:id="rId1"/>`))
      expect(out).toBe(wrap(`<pageSetup a="1"/>${IGNORED}<${tag} r:id="rId1"/>`))
    }
  )

  it('có nhiều phần tử theo sau: chèn trước phần tử đứng đầu theo thứ tự tài liệu', () => {
    const out = injectIgnoredErrors(wrap('<pageSetup/><legacyDrawing r:id="a"/><tableParts count="1"/><extLst/>'))
    expect(out).toBe(wrap(`<pageSetup/>${IGNORED}<legacyDrawing r:id="a"/><tableParts count="1"/><extLst/>`))
  })

  it('sheetData rỗng dạng <sheetData/> hoặc <sheetData></sheetData> đều chèn đúng chỗ', () => {
    const a = '<worksheet><sheetData/><pageSetup/><tableParts count="1"/></worksheet>'
    expect(injectIgnoredErrors(a)).toBe(a.replace('<tableParts', IGNORED + '<tableParts'))
    const b = '<worksheet><sheetData></sheetData><pageSetup/></worksheet>'
    expect(injectIgnoredErrors(b)).toBe(b.replace('</worksheet>', IGNORED + '</worksheet>'))
  })

  it('XML không có </worksheet> thì giữ nguyên', () => {
    expect(injectIgnoredErrors('<foo/>')).toBe('<foo/>')
  })
})

describe('saveWorkbook', () => {
  it('ghi file hợp lệ, chèn ignoredErrors sau pageSetup, không còn .partial', async () => {
    const out = join(dir, 'ok.xlsx')
    await saveWorkbook(buildWorkbook([{ name: 'S', blocks: [T(['A'], ['0001'])] }]), out)
    expect(existsSync(out + '.partial')).toBe(false)
    expect(existsSync(out + PARTIAL_SUFFIX)).toBe(false)
    const xml = await (await JSZip.loadAsync(readFileSync(out))).file('xl/worksheets/sheet1.xml')!.async('string')
    expect(xml).toContain('<ignoredErrors><ignoredError sqref="A1:XFD1048576" numberStoredAsText="1"/></ignoredErrors>')
    expect(xml.indexOf('<ignoredErrors')).toBeGreaterThan(xml.lastIndexOf('<pageSetup'))
    expect(XLSX.read(readFileSync(out)).SheetNames).toEqual(['S'])
  })

  it('mọi sheet đều được chèn ignoredErrors; file vẫn đọc lại được bằng exceljs', async () => {
    const out = join(dir, 'multi.xlsx')
    await saveWorkbook(
      buildWorkbook([
        { name: 'A', blocks: [T(['H'], ['x'])] },
        { name: 'B', blocks: [] }
      ]),
      out
    )
    const zip = await JSZip.loadAsync(readFileSync(out))
    for (const f of ['xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']) {
      const xml = await zip.file(f)!.async('string')
      expect(xml.match(/<ignoredErrors>/g)).toHaveLength(1)
      expect(xml.indexOf('<ignoredErrors')).toBeGreaterThan(xml.lastIndexOf('<pageSetup'))
    }
    const w = new ExcelJS.Workbook()
    await w.xlsx.readFile(out)
    expect(w.worksheets.map((s) => s.name)).toEqual(['A', 'B'])
  })

  it('có hyperlink và bảng exceljs: ignoredErrors đứng sau hyperlinks/pageSetup, trước tableParts', async () => {
    const wb = buildWorkbook([
      { name: 'S', blocks: [{ kind: 'table', header: [{ text: 'L' }], rows: [[{ text: 'Spec', link: 'https://x.example/a' }]] }] }
    ])
    wb.worksheets[0].addTable({ name: 'T1', ref: 'D1', columns: [{ name: 'c1' }], rows: [['v']] })
    const out = join(dir, 'table.xlsx')
    await saveWorkbook(wb, out)
    const xml = await (await JSZip.loadAsync(readFileSync(out))).file('xl/worksheets/sheet1.xml')!.async('string')
    expect(xml.indexOf('<tableParts')).toBeGreaterThan(-1)
    expect(xml.indexOf('<ignoredErrors')).toBeGreaterThan(xml.indexOf('<hyperlinks'))
    expect(xml.indexOf('<ignoredErrors')).toBeGreaterThan(xml.lastIndexOf('<pageSetup'))
    expect(xml.indexOf('<ignoredErrors')).toBeLessThan(xml.indexOf('<tableParts'))
  })

  it('ghi đè file đích có sẵn', async () => {
    const out = join(dir, 'overwrite.xlsx')
    writeFileSync(out, 'OLD')
    await saveWorkbook(buildWorkbook([{ name: 'S', blocks: [T(['A'], ['1'])] }]), out)
    expect(XLSX.read(readFileSync(out)).SheetNames).toEqual(['S'])
    expect(existsSync(out + PARTIAL_SUFFIX)).toBe(false)
  })

  it('đổi tên thất bại (file đích đang mở): file cũ nguyên, không còn .partial, ném lại lỗi gốc', async () => {
    const out = join(dir, 'busy.xlsx')
    writeFileSync(out, 'OLD')
    const busy = Object.assign(new Error('EBUSY: resource busy or locked, rename'), { code: 'EBUSY' })
    await expect(
      saveWorkbook(buildWorkbook([{ name: 'S', blocks: [] }]), out, {
        rename: async () => {
          throw busy
        }
      })
    ).rejects.toBe(busy)
    expect(readFileSync(out, 'utf8')).toBe('OLD')
    expect(existsSync(out + '.partial')).toBe(false)
  })

  it('ghi .partial thất bại (thư mục không tồn tại): ném lỗi, không để lại gì', async () => {
    const out = join(dir, 'no-such-dir', 'x.xlsx')
    await expect(saveWorkbook(buildWorkbook([{ name: 'S', blocks: [] }]), out)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(existsSync(out + PARTIAL_SUFFIX)).toBe(false)
  })
})
