import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { marked } from 'marked'
import * as os from 'node:os'
import * as path from 'node:path'
import * as fs from 'node:fs'
import {
  sheetToMarkdown,
  listSheets,
  convertSheet,
  convertWorkbook,
  safeFileName,
  dedupeFileName,
  joinWorkbookMarkdown,
} from './converter'
import type { ConvertOptions } from '../types'

const OPTS: ConvertOptions = {
  skipDelSheets: true,
  skipEmptySheets: true,
  includeSheetTitle: true,
  multiline: 'br',
  detectTwoColTables: false,
  escapeMarkdown: true,
  range: '',
  showFormulas: false,
  frontMatter: false,
  chunkRows: 0,
}

/** Tạo worksheet từ mảng 2D, kèm merge ranges (zero-based, dạng SheetJS). */
function makeWs(
  aoa: (string | number | boolean | null)[][],
  merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = []
): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  if (merges.length > 0) ws['!merges'] = merges as XLSX.Range[]
  return ws
}

const md = (aoa: (string | number | boolean | null)[][], name = 'Sheet1', opts = OPTS) =>
  sheetToMarkdown(makeWs(aoa), name, opts)

describe('banner 基本設計', () => {
  it('render banner + khối version', () => {
    const out = md([
      ['基本設計', '画面レイアウト', '版数', '作成日', '作成者'],
      ['', '', '1.0', '2026/01/01', '山田'],
      ['', '', '1.1', '2026/02/01', '鈴木'],
    ])
    expect(out).toContain('> 基本設計：画面レイアウト')
    expect(out).toContain('| 版数 | 作成日 | 作成者 |')
    expect(out).toContain('| 1.0 | 2026/01/01 | 山田 |')
    expect(out).toContain('| 1.1 | 2026/02/01 | 鈴木 |')
  })

  it('banner không có version labels', () => {
    const out = md([['基本設計'], [''], ['機能ID', 'X001']])
    expect(out).toContain('> 基本設計\n')
    expect(out).toContain('- **機能ID**: X001')
  })

  it('docTitle trùng tên sheet thì bỏ suffix', () => {
    const out = md([['基本設計', 'Sheet1']], 'Sheet1')
    expect(out.endsWith('> 基本設計')).toBe(true)
    expect(out).not.toContain('基本設計：')
  })

  it('version inline trên dòng meta: tách đúng cột', () => {
    const out = md([
      ['基本設計', '画面レイアウト', '版数', '作成日', '作成者'],
      ['機能ID', 'F001', '1.0', '2026/01/01', '山田'],
      ['機能名', 'マスタ'],
    ])
    expect(out).toContain('| 版数 | 作成日 | 作成者 |')
    expect(out).toContain('| 1.0 | 2026/01/01 | 山田 |')
    expect(out).toContain('- **機能ID**: F001')
    expect(out).toContain('- **機能名**: マスタ')
  })

  it('merge 2D trên dòng banner không rò xuống dòng dưới', () => {
    const ws = makeWs(
      [['基本設計', '', ''], ['', '', ''], ['機能ID', 'X001']],
      [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }]
    )
    const out = sheetToMarkdown(ws, 'S', OPTS)
    expect(out).toContain('> 基本設計')
    expect(out).toContain('- **機能ID**: X001')
    // "基本設計" chỉ xuất hiện đúng 1 lần (dòng banner), không rò xuống
    expect(out.split('\n').filter((l) => l.includes('基本設計'))).toHaveLength(1)
  })
})

describe('meta 機能ID/画面ID/...', () => {
  it('một dòng nhiều cặp meta', () => {
    const out = md([['機能ID', 'SPMT00151', '機能名', '仕入先マスタ']])
    expect(out).toContain('- **機能ID**: SPMT00151')
    expect(out).toContain('- **機能名**: 仕入先マスタ')
  })

  it('giá trị số đứng đầu thành "N. text"', () => {
    const out = md([['画面ID', '010', '画面レイアウト']])
    expect(out).toContain('- **画面ID**: 010. 画面レイアウト')
  })

  it('dòng nối tiếp (ô đầu rỗng) thành sub-bullet', () => {
    const out = md([
      ['画面遷移', 'A画面→B画面'],
      ['', '(遷移条件: ボタン押下)'],
    ])
    expect(out).toContain('- **画面遷移**: A画面→B画面')
    expect(out).toContain('  - (遷移条件: ボタン押下)')
  })

  it('dòng 1 ô ngay sau meta thành sub-bullet', () => {
    const out = md([['画面遷移', 'A→B'], ['条件あり']])
    expect(out).toContain('- **画面遷移**: A→B')
    expect(out).toContain('  - 条件あり')
  })

  it('hai dòng meta cùng label liên tiếp: dòng 2 thành sub-bullet', () => {
    const out = md([
      ['画面ID', '001', 'A'],
      ['画面ID', '002', 'B'],
    ])
    expect(out).toContain('- **画面ID**: 001. A')
    expect(out).toContain('  - 002. B')
  })

  it('merge dọc lan label meta xuống dòng dưới', () => {
    const ws = makeWs(
      [
        ['画面遷移', 'A→B'],
        ['', '条件あり'],
      ],
      [{ s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }]
    )
    const out = sheetToMarkdown(ws, 'S', OPTS)
    expect(out).toContain('- **画面遷移**: A→B')
    expect(out).toContain('  - 条件あり')
  })
})

describe('dòng trống sau sub-bullet meta', () => {
  const NO_TITLE = { ...OPTS, includeSheetTitle: false }
  const META = [
    ['画面遷移', 'A'],
    ['', 'B'],
  ]
  /** HTML của block nằm trong <li> nào không (bị list nuốt mất). */
  const insideLi = (out: string, tag: string): boolean =>
    new RegExp('<li>(?:(?!</li>)[\\s\\S])*<' + tag + '[\\s>]').test(marked.parse(out, { async: false }) as string)

  it('bảng ngay sau sub-bullet (Excel không có dòng trống): tách khỏi list', () => {
    const out = md([...META, ['No', '項目', '値'], ['1', 'x', 'y']], 'S', NO_TITLE)
    expect(out).toBe('- **画面遷移**: A\n  - B\n\n| No | 項目 | 値 |\n|---|---|---|\n| 1 | x | y |')
    expect(insideLi(out, 'table')).toBe(false)
  })

  it('section 【...】 ngay sau sub-bullet: heading tách khỏi list', () => {
    const out = md([...META, ['【項目定義】']], 'S', NO_TITLE)
    expect(out).toBe('- **画面遷移**: A\n  - B\n\n### 【項目定義】')
    expect(insideLi(out, 'h3')).toBe(false)
  })

  it('đoạn văn sau sub-bullet + dòng trống: không bị nối lazy vào bullet', () => {
    const out = md([...META, [], ['テキスト', 'x']], 'S', NO_TITLE)
    expect(out).toBe('- **画面遷移**: A\n  - B\n\nテキスト x')
    expect(marked.parse(out, { async: false })).toContain('<p>テキスト x</p>')
  })

  it('quote sau sub-bullet + dòng trống', () => {
    const out = md([...META, [], ['ノート']], 'S', NO_TITLE)
    expect(out).toBe('- **画面遷移**: A\n  - B\n\n> ノート')
  })

  it('sub-bullet nhiều cột (continuation) rồi bảng', () => {
    const out = md([['画面遷移', 'A'], ['', 'B', 'C'], ['No', '項目', '値'], ['1', 'x', 'y']], 'S', NO_TITLE)
    expect(out).toContain('  - B C\n\n| No |')
  })

  it('không thêm dòng trống thừa giữa các sub-bullet liên tiếp', () => {
    expect(md([...META, ['', 'C']], 'S', NO_TITLE)).toBe('- **画面遷移**: A\n  - B\n  - C')
  })
})

describe('bảng No/№/項番', () => {
  it('nhận diện header No và render bảng', () => {
    const out = md([
      ['No', '項目', '内容'],
      ['1', '氏名', '山田'],
      ['2', '年齢', '30'],
    ])
    expect(out).toContain('| No | 項目 | 内容 |')
    expect(out).toContain('| 1 | 氏名 | 山田 |')
  })

  it('mặc định KHÔNG nhận diện bảng 2 cột', () => {
    const out = md([
      ['Họ tên', 'Tuổi'],
      ['An', '20'],
    ])
    expect(out).not.toContain('| Họ tên | Tuổi |')
    expect(out).toContain('An 20')
  })

  it('bật detectTwoColTables: bảng 2 cột thành bảng Markdown', () => {
    const out = md(
      [
        ['Họ tên', 'Tuổi'],
        ['An', '20'],
        ['Bình', '25'],
      ],
      'S',
      { ...OPTS, detectTwoColTables: true }
    )
    expect(out).toContain('| Họ tên | Tuổi |')
    expect(out).toContain('| An | 20 |')
    expect(out).toContain('| Bình | 25 |')
  })

  it('bỏ cột trống toàn bảng', () => {
    const out = md([
      ['No', '', '項目'],
      ['1', '', '氏名'],
    ])
    expect(out).toContain('| No | 項目 |')
    expect(out).not.toContain('|  |')
  })

  it('section 【...】 cắt bảng và thành heading', () => {
    const out = md([
      ['No', '項目'],
      ['1', 'a'],
      ['【項目定義】'],
      ['No', '項目'],
      ['1', 'b'],
    ])
    expect(out).toContain('### 【項目定義】')
    expect(out.match(/\| No \| 項目 \|/g)).toHaveLength(2)
  })

  it('section ■... cũng thành heading', () => {
    const out = md([['■備考']])
    expect(out).toContain('### ■備考')
  })

  it('dòng 1 ô trong bảng (không phải section) thành dòng nối tiếp', () => {
    const out = md([['No', '項目'], ['1', '説明'], ['続きの説明']])
    expect(out).toContain('| 続きの説明 |  |')
  })

  it('ô nhiều dòng: br vs space', () => {
    const br = md([['No', '項目'], ['1', 'a\nb']], 'S', { ...OPTS, multiline: 'br' })
    expect(br).toContain('a<br>b')
    const sp = md([['No', '項目'], ['1', 'a\nb']], 'S', { ...OPTS, multiline: 'space' })
    expect(sp).toContain('a b')
    expect(sp).not.toContain('<br>')
  })

  it('escape dấu | trong ô', () => {
    const out = md([['No', '項目'], ['1', 'a|b']])
    expect(out).toContain('a\\|b')
  })

  it('ô chỉ chứa | -> escape, không rách bảng', () => {
    const out = md([['No', '項目'], ['1', '|'], ['2', 'a|b|c']], 'S', {
      ...OPTS,
      includeSheetTitle: false,
    })
    const lines = out.split('\n').filter((l) => l.startsWith('|'))
    // đếm pipe CHƯA escape: bảng hợp lệ khi mọi dòng có cùng số cột
    const cols = (l: string) => l.split(/(?<!\\)\|/).length
    for (const l of lines) expect(cols(l)).toBe(cols(lines[0]))
    expect(out).toContain('| 1 | \\| |')
  })

  it('giá trị công thức đã cache', () => {
    const ws = makeWs([['x']])
    ws['B1'] = { t: 'n', f: 'A1', v: 42 } as XLSX.CellObject
    ws['!ref'] = 'A1:B1'
    const out = sheetToMarkdown(ws, 'S', { ...OPTS, includeSheetTitle: false })
    expect(out).toContain('42')
  })
})

describe('hyperlink', () => {
  it('cell có hyperlink -> [text](url)', () => {
    const ws = makeWs([['Xem thêm']])
    ws['A1'] = { t: 's', v: 'Xem thêm', l: { Target: 'https://example.com' } } as XLSX.CellObject
    const out = sheetToMarkdown(ws, 'S', { ...OPTS, includeSheetTitle: false })
    expect(out).toContain('[Xem thêm](https://example.com)')
  })

  it('text trùng URL thì giữ nguyên, không lồng link', () => {
    const ws = makeWs([['x']])
    ws['A1'] = { t: 's', v: 'https://example.com', l: { Target: 'https://example.com' } } as XLSX.CellObject
    const out = sheetToMarkdown(ws, 'S', { ...OPTS, includeSheetTitle: false })
    expect(out).toContain('https://example.com')
    expect(out).not.toContain('](')
  })

  it('hyperlink trong bảng vẫn hợp lệ', () => {
    const ws = makeWs([
      ['No', 'Tài liệu'],
      ['1', 'Spec'],
    ])
    ws['B2'] = { t: 's', v: 'Spec', l: { Target: 'https://spec.local/s1' } } as XLSX.CellObject
    const out = sheetToMarkdown(ws, 'S', { ...OPTS, includeSheetTitle: false })
    expect(out).toContain('| 1 | [Spec](https://spec.local/s1) |')
  })
})

describe('tiêu đề trên bảng', () => {
  it('dòng 1 ô ngay trên bảng -> ### heading', () => {
    const out = md([['Danh sách nhân viên'], ['No', 'Tên'], ['1', 'An']], 'S', {
      ...OPTS,
      includeSheetTitle: false,
    })
    expect(out).toContain('### Danh sách nhân viên')
    expect(out).toContain('| No | Tên |')
  })

  it('dòng 1 ô không trên bảng -> quote như cũ', () => {
    const out = md([['Ghi chú chung'], ['Đoạn văn bản thường']], 'S', {
      ...OPTS,
      includeSheetTitle: false,
    })
    expect(out).toContain('> Ghi chú chung')
    expect(out).toContain('> Đoạn văn bản thường')
  })
})

describe('ô lỗi Excel', () => {
  it('ô lỗi render nguyên văn (#DIV/0!, #N/A...)', () => {
    const ws = makeWs([['ok']])
    ws['B1'] = { t: 'e', v: '#DIV/0!' } as XLSX.CellObject
    ws['C1'] = { t: 'e', v: '#N/A' } as XLSX.CellObject
    ws['!ref'] = 'A1:C1'
    const out = sheetToMarkdown(ws, 'S', { ...OPTS, includeSheetTitle: false })
    expect(out).toContain('#DIV/0!')
    expect(out).toContain('#N/A')
  })

  it('ô lỗi trong bảng không rách bảng', () => {
    const ws = makeWs([
      ['No', 'Giá trị'],
      ['1', 'x'],
    ])
    ws['B2'] = { t: 'e', v: '#REF!' } as XLSX.CellObject
    const out = sheetToMarkdown(ws, 'S', { ...OPTS, includeSheetTitle: false })
    expect(out).toContain('| 1 | #REF! |')
  })
})

describe('ô boolean', () => {
  it('boolean -> TRUE/FALSE', () => {
    const out = md([[true, false]], 'S', { ...OPTS, includeSheetTitle: false })
    expect(out).toContain('TRUE')
    expect(out).toContain('FALSE')
  })
})

describe('dòng ragged (số cột lệch)', () => {
  it('dòng ngắn được pad, dòng dài không rách bảng', () => {
    const out = md(
      [
        ['No', 'A', 'B'],
        ['1', 'x'],
        ['2', 'y', 'z', 'EXTRA1', 'EXTRA2'],
        ['3'],
      ],
      'S',
      { ...OPTS, includeSheetTitle: false }
    )
    const lines = out.split('\n').filter((l) => l.startsWith('|'))
    expect(lines).toHaveLength(5) // header + separator + 3 dòng
    for (const l of lines) {
      expect(l.split('|').length).toBe(lines[0].split('|').length)
    }
    expect(out).toContain('| 1 | x |  |')
    expect(out).toContain('EXTRA1')
  })
})

describe('ô whitespace', () => {
  it('ô chỉ chứa khoảng trắng coi như rỗng', () => {
    // dòng toàn whitespace -> sheet rỗng
    expect(md([['   ', '\t'], ['　', ' ']])).toBe('')
    // ô whitespace trong bảng -> ô trống
    const out = md([['No', 'A'], ['1', '   ']], 'S', { ...OPTS, includeSheetTitle: false })
    expect(out).toContain('| 1 |  |')
  })

  it('giữ khoảng trắng toàn角 giữa chữ và thụt lề dòng 2; space ASCII vẫn gộp', () => {
    const rows = [['No', 'A'], ['1', '全角　　スペース  ascii'], ['2', '一行目\n　　二行目']]
    const br = md(rows, 'S', { ...OPTS, includeSheetTitle: false })
    expect(br).toContain('| 1 | 全角　　スペース ascii |')
    expect(br).toContain('| 2 | 一行目<br>　　二行目 |')
    const sp = md(rows, 'S', { ...OPTS, includeSheetTitle: false, multiline: 'space' })
    expect(sp).toContain('| 2 | 一行目 　　二行目 |')
  })

  it('khoảng trắng toàn角 đầu/cuối ô vẫn bị trim (nhận diện label không đổi)', () => {
    expect(md([['　機能ID　', 'X1']], 'S', { ...OPTS, includeSheetTitle: false })).toBe('- **機能ID**: X1')
  })
})

describe('!ref thiếu', () => {
  it('ws không có !ref nhưng có cell -> vẫn convert', () => {
    const ws = makeWs([
      ['No', 'A'],
      ['1', 'x'],
    ])
    delete ws['!ref']
    const out = sheetToMarkdown(ws, 'S', { ...OPTS, includeSheetTitle: false })
    expect(out).toContain('| No | A |')
    expect(out).toContain('| 1 | x |')
  })

  it('ws không có !ref và không có cell -> rỗng', () => {
    const ws: XLSX.WorkSheet = {}
    expect(sheetToMarkdown(ws, 'S', OPTS)).toBe('')
  })
})

describe('!ref phình (Excel ghi dimension theo vùng có định dạng)', () => {
  it('1 ô nhưng !ref A1:AZ300000: nhanh, output như !ref chuẩn', () => {
    const ws = makeWs([['No', 'A'], ['1', 'x']])
    const exact = sheetToMarkdown(ws, 'S', OPTS)
    ws['!ref'] = 'A1:AZ300000'
    const t0 = Date.now()
    const out = sheetToMarkdown(ws, 'S', OPTS)
    expect(Date.now() - t0).toBeLessThan(1000) // trước đây ~12 s, ~400 MB heap
    expect(out).toBe(exact)
  })

  it('fuzz 200 grid: !ref phình thêm dòng/cột trống không đổi output', () => {
    let seed = 7
    const rand = (n: number): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed % n
    }
    const pool = ['', '', '', 'No', '項目', 'x', '機能ID', '【sec】', '基本設計', '1', 'a\nb', '■n']
    for (let k = 0; k < 200; k++) {
      const rows = 1 + rand(10)
      const cols = 1 + rand(6)
      const aoa = Array.from({ length: rows }, () => Array.from({ length: cols }, () => pool[rand(pool.length)]))
      // Merge nằm trong vùng dữ liệu (Excel luôn tính ô merge vào dimension)
      const ms = rand(rows)
      const merges = rand(2) === 0 ? [{ s: { r: ms, c: 0 }, e: { r: ms + rand(rows - ms), c: 0 } }] : []
      const ws = makeWs(aoa, merges)
      const exact = sheetToMarkdown(ws, 'S', OPTS)
      ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows + 500, c: cols + 30 } })
      expect(sheetToMarkdown(ws, 'S', OPTS)).toBe(exact)
    }
  })

  it('góc trên-trái của !ref giữ nguyên: banner ở cột B khi !ref bắt đầu từ B', () => {
    const ws: XLSX.WorkSheet = {
      B2: { t: 's', v: '基本設計' },
      C2: { t: 's', v: '画面定義書' },
      '!ref': 'B2:Z9999',
    }
    expect(sheetToMarkdown(ws, 'S', { ...OPTS, includeSheetTitle: false })).toBe('> 基本設計：画面定義書')
  })

  it('merge dọc vượt ra ngoài !ref: không crash, chỉ lan trong vùng quét', () => {
    const ws = makeWs([['No', 'A'], ['1', 'x'], ['2', '']], [{ s: { r: 1, c: 1 }, e: { r: 50, c: 1 } }])
    const out = sheetToMarkdown(ws, 'S', { ...OPTS, includeSheetTitle: false })
    expect(out).toContain('| 2 | x |')
  })

  it('listSheets đếm dòng theo nội dung thật, không theo !ref phình', () => {
    const wb = XLSX.utils.book_new()
    const ws = makeWs([['a'], ['b'], ['c']])
    ws['!ref'] = 'A1:CZ40000'
    XLSX.utils.book_append_sheet(wb, ws, 'S')
    const p = path.join(os.tmpdir(), 'x2m-bigref-' + Date.now() + '.xlsx')
    XLSX.writeFile(wb, p)
    try {
      expect(listSheets(p, true)).toEqual([{ name: 'S', rows: 3, hidden: false }])
    } finally {
      fs.unlinkSync(p)
    }
  })
})

describe('A14: continuation + detectTwoColTables', () => {
  it('dòng 2 cột (ô đầu rỗng) sau meta: tắt -> sub-bullet, bật -> mở bảng', () => {
    const rows: (string | null)[][] = [
      ['画面ID', '001', ''],
      ['', 'Tên', 'Tuổi'],
      ['', 'An', '20'],
    ]
    const off = md(rows, 'S', { ...OPTS, includeSheetTitle: false })
    expect(off).toContain('  - Tên Tuổi')
    expect(off).not.toContain('| Tên | Tuổi |')

    const on = md(rows, 'S', { ...OPTS, includeSheetTitle: false, detectTwoColTables: true })
    expect(on).toContain('| Tên | Tuổi |')
    expect(on).toContain('| An | 20 |')
    expect(on).not.toContain('  - Tên Tuổi')
  })
})

describe('A8: header ô đầu rỗng', () => {
  it('header [rỗng, A, B, C] -> nhận diện bảng, bỏ cột đầu trống', () => {
    const out = md(
      [
        ['', 'Tên', 'Tuổi', 'Ghi chú'],
        ['', 'An', '20', 'x'],
      ],
      'S',
      { ...OPTS, includeSheetTitle: false }
    )
    expect(out).toContain('| Tên | Tuổi | Ghi chú |')
    expect(out).toContain('| An | 20 | x |')
  })
})

describe('A10: bảng rất rộng', () => {
  it('bảng 60 cột vẫn hợp lệ', () => {
    const header = ['No', ...Array.from({ length: 59 }, (_, i) => 'C' + (i + 1))]
    const row = ['1', ...Array.from({ length: 59 }, (_, i) => 'v' + (i + 1))]
    const out = md([header, row], 'S', { ...OPTS, includeSheetTitle: false })
    const lines = out.split('\n').filter((l) => l.startsWith('|'))
    expect(lines).toHaveLength(3)
    const cols = (l: string) => l.split(/(?<!\\)\|/).length
    for (const l of lines) expect(cols(l)).toBe(62) // 60 cột + 2 biên
    expect(out).toContain('| v59 |')
  })
})

describe('A6: format số đặc biệt', () => {
  it('số âm format kế toán -> (1,235); scientific -> 1.23E+08', () => {
    const ws = makeWs([['x']])
    ws['A1'] = { t: 'n', v: -1234.5, z: '#,##0_);[Red](#,##0)' } as XLSX.CellObject
    ws['B1'] = { t: 'n', v: 123456789, z: '0.00E+00' } as XLSX.CellObject
    ws['!ref'] = 'A1:B1'
    const out = sheetToMarkdown(ws, 'S', { ...OPTS, includeSheetTitle: false })
    expect(out).toContain('(1,235)')
    expect(out).toContain('1.23E+08')
  })
})

describe('A7: ô ngày giờ', () => {
  it('format yyyy/mm/dd hh:mm giữ cả ngày lẫn giờ', () => {
    const ws = makeWs([['x']])
    const serial = 45939 + 14.5 / 24
    ws['A1'] = { t: 'n', v: serial, z: 'yyyy/mm/dd hh:mm' } as XLSX.CellObject
    ws['!ref'] = 'A1:A1'
    const out = sheetToMarkdown(ws, 'S', { ...OPTS, includeSheetTitle: false })
    expect(out).toMatch(/\d{4}\/\d{2}\/\d{2} 14:30/)
  })
})

describe('B7: array formula', () => {
  it('array formula dùng cached values', () => {
    const ws = makeWs([[1, 2]])
    ws['A2'] = { t: 'n', v: 2, F: 'A2:B2' } as XLSX.CellObject
    ws['B2'] = { t: 'n', v: 4, F: 'A2:B2' } as XLSX.CellObject
    ws['!ref'] = 'A1:B2'
    const out = sheetToMarkdown(ws, 'S', { ...OPTS, includeSheetTitle: false })
    expect(out).toContain('2')
    expect(out).toContain('4')
  })
})

describe('B1: file hỏng', () => {
  it('file rác / 0-byte: không crash, convert ra rỗng hoặc lỗi sạch', () => {
    for (const bytes of [Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]), Buffer.alloc(0)]) {
      const p = path.join(os.tmpdir(), `b1-${Date.now()}-${Math.random()}.xlsx`)
      fs.writeFileSync(p, bytes)
      let sheets: { name: string }[] = []
      expect(() => {
        sheets = listSheets(p, false)
      }).not.toThrow()
      const res = convertWorkbook(
        p,
        sheets.map((x) => x.name),
        OPTS
      )
      expect(Array.isArray(res)).toBe(true)
      fs.unlinkSync(p)
    }
  })
})

describe('fuzz', () => {
  it('100 grid ngẫu nhiên: không crash, bảng không rách', () => {
    let seed = 42
    const rand = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 4294967296
    }
    const pool = [
      '', '', 'No', '名前', '値', 'a|b', 'x\ny', '【test】', '機能ID', '123', ' ', '■note',
      'https://x.y', '項目', '備考',
    ]
    for (let iter = 0; iter < 100; iter++) {
      const rows = 1 + Math.floor(rand() * 12)
      const cols = 1 + Math.floor(rand() * 6)
      const aoa: (string | null)[][] = []
      for (let r = 0; r < rows; r++) {
        const row: (string | null)[] = []
        for (let c = 0; c < cols; c++) row.push(pool[Math.floor(rand() * pool.length)])
        aoa.push(row)
      }
      const opts: ConvertOptions = {
        ...OPTS,
        detectTwoColTables: rand() < 0.5,
        multiline: rand() < 0.5 ? 'br' : 'space',
      }
      let out = ''
      expect(() => {
        out = sheetToMarkdown(makeWs(aoa), 'Fuzz', opts)
      }).not.toThrow()
      const colsOf = (l: string): number => l.split(/(?<!\\)\|/).length
      for (const block of out.split('\n\n')) {
        const lines = block.split('\n').filter((l) => l.startsWith('|'))
        if (lines.length >= 2) {
          for (const l of lines) expect(colsOf(l)).toBe(colsOf(lines[0]))
        }
      }
    }
  })
})

describe('joinWorkbookMarkdown', () => {
  it('nối các sheet bằng --- và bỏ sheet rỗng', () => {
    const md = joinWorkbookMarkdown('report', [
      { sheet: 'A', markdown: '## A\n\nhello' },
      { sheet: 'B', markdown: '   \n ' },
      { sheet: 'C', markdown: '## C\n\nworld' },
    ])
    expect(md).toBe('# report\n\n## A\n\nhello\n\n---\n\n## C\n\nworld\n')
    expect(md).not.toContain('---\n\n---')
  })
})

describe('bổ sung I1', () => {
  it('header № cũng nhận diện bảng', () => {
    const out = md([['№', '項目'], ['1', 'a']], 'S', { ...OPTS, includeSheetTitle: false })
    expect(out).toContain('| № | 項目 |')
  })

  it('meta label không có giá trị -> không có dấu hai chấm', () => {
    const out = md([['更新種別']], 'S', { ...OPTS, includeSheetTitle: false })
    expect(out).toContain('- **更新種別**')
    expect(out).not.toContain('- **更新種別**:')
  })

  it('khối version dừng ở dòng lạ không chứa version', () => {
    const out = md(
      [
        ['基本設計', 'Doc', '版数'],
        ['Ghi chú tự do ở đây'],
        ['1.0'],
      ],
      'S',
      { ...OPTS, includeSheetTitle: false }
    )
    expect(out).toContain('> Ghi chú tự do ở đây')
  })

  it('meta nhiều dòng -> <br> trong giá trị', () => {
    const out = md([['備考', 'dòng 1\ndòng 2']], 'S', { ...OPTS, includeSheetTitle: false })
    // 備考 không phải meta label -> thành text thường với <br>
    expect(out).toContain('dòng 1<br>dòng 2')
  })
})

describe('B6: file .xlsm', () => {
  it('.xlsm (kể cả khi có macro) convert giá trị bình thường', () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      wb,
      makeWs([
        ['No', 'Tên'],
        ['1', 'An'],
      ]),
      'Sheet1'
    )
    const p = path.join(os.tmpdir(), `b6-${Date.now()}.xlsm`)
    XLSX.writeFile(wb, p)
    const sheets = listSheets(p, false)
    expect(sheets.map((x) => x.name)).toEqual(['Sheet1'])
    const res = convertWorkbook(p, ['Sheet1'], OPTS)
    expect(res[0].markdown).toContain('| No | Tên |')
    expect(res[0].markdown).toContain('| 1 | An |')
    fs.unlinkSync(p)
  })
})

describe('B5: file .xls (BIFF8)', () => {
  it('.xls convert tương đương .xlsx', () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      wb,
      makeWs([
        ['No', 'Tên'],
        ['1', 'An'],
      ]),
      'Sheet1'
    )
    const p = path.join(os.tmpdir(), `b5-${Date.now()}.xls`)
    XLSX.writeFile(wb, p, { bookType: 'xls' })
    const sheets = listSheets(p, false)
    expect(sheets.map((x) => x.name)).toEqual(['Sheet1'])
    const res = convertWorkbook(p, ['Sheet1'], OPTS)
    expect(res[0].markdown).toContain('| No | Tên |')
    expect(res[0].markdown).toContain('| 1 | An |')
    fs.unlinkSync(p)
  })
})

describe('B8: công thức liên sheet', () => {
  it('formula tham chiếu sheet khác dùng cached value', () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, makeWs([['Đơn giá']]), 'Data')
    const ws2 = makeWs([['Thành tiền']])
    ws2['A2'] = { t: 'n', f: 'Data!A1*2', v: 200 } as XLSX.CellObject
    ws2['!ref'] = 'A1:A2'
    XLSX.utils.book_append_sheet(wb, ws2, 'Calc')
    const p = path.join(os.tmpdir(), `b8-${Date.now()}.xlsx`)
    XLSX.writeFile(wb, p)
    const res = convertWorkbook(p, ['Calc'], OPTS)
    expect(res[0].markdown).toContain('200')
    expect(res[0].markdown).not.toContain('Data!A1')
    fs.unlinkSync(p)
  })
})

describe('A15: nhiều bảng cách dòng trống', () => {
  it('2 bảng cách nhau bởi dòng trống -> 2 bảng riêng, không dính', () => {
    const out = md(
      [
        ['No', 'A'],
        ['1', 'x'],
        [],
        ['No', 'B'],
        ['1', 'y'],
      ],
      'S',
      { ...OPTS, includeSheetTitle: false }
    )
    const tables = out.split('\n\n').filter((b) => b.includes('| No |'))
    expect(tables).toHaveLength(2)
    expect(tables[0]).toContain('| 1 | x |')
    expect(tables[1]).toContain('| 1 | y |')
  })
})

describe('merge dọc trong header bảng', () => {
  it('không tạo dòng ma từ header lan xuống', () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['No', 'Tên'],
      ['', ''],
      ['1', 'An'],
    ])
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }]
    const out = sheetToMarkdown(ws, 'S', { ...OPTS, includeSheetTitle: false })
    expect(out).toContain('| No | Tên |')
    expect(out).toContain('| 1 | An |')
    expect(out).not.toContain('| No |  |')
  })
})

describe('B4: file không đọc được', () => {
  it('đường dẫn là thư mục -> lỗi gọn, không crash', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b4-'))
    expect(() => convertWorkbook(dir, ['Sheet1'], OPTS)).toThrow()
    fs.rmdirSync(dir)
  })

  it('file không tồn tại -> lỗi gọn', () => {
    expect(() =>
      convertWorkbook('/tmp/khong-ton-tai-xyz-123.xlsx', ['Sheet1'], OPTS)
    ).toThrow()
  })
})

describe('hyperlink trong meta', () => {
  it('giá trị meta có hyperlink -> [text](url)', () => {
    const ws = XLSX.utils.aoa_to_sheet([['画面ID', 'SPOR01']])
    ws['B1'].l = { Target: 'https://example.com/spec' }
    const out = sheetToMarkdown(ws, 'S', { ...OPTS, includeSheetTitle: false })
    expect(out).toContain('- **画面ID**: [SPOR01](https://example.com/spec)')
  })
})

describe('section + bảng', () => {
  it('■ section trước bảng: section thành heading, bảng render đúng', () => {
    const out = md(
      [
        ['■処理順序1'],
        ['No', 'Tên', 'Ghi chú'],
        ['1', 'An', 'ok'],
      ],
      'S',
      { ...OPTS, includeSheetTitle: false }
    )
    expect(out).toContain('### ■処理順序1')
    expect(out).toContain('| No | Tên | Ghi chú |')
    expect(out).toContain('| 1 | An | ok |')
  })
})

describe('banner trùng tên sheet', () => {
  it('docTitle trùng sheetName -> không lặp tiêu đề', () => {
    const out = md([['基本設計', 'MySheet']], 'MySheet', {
      ...OPTS,
      includeSheetTitle: false,
    })
    expect(out).toContain('> 基本設計')
    expect(out).not.toContain('MySheet')
  })
})

describe('sheet chỉ có banner', () => {
  it('banner đơn độc không crash, có quote 基本設計', () => {
    const out = md([['基本設計', 'Tài liệu X']], 'S', { ...OPTS, includeSheetTitle: false })
    expect(out).toContain('> 基本設計')
  })
})

describe('hiệu năng', () => {
  it('sheet 1000 dòng convert dưới 2 giây', () => {
    const aoa: string[][] = [['No', 'Tên', 'Giá trị']]
    for (let i = 1; i <= 1000; i++) aoa.push([String(i), 'Tên ' + i, String(i * 100)])
    const t0 = Date.now()
    const out = md(aoa, 'S', { ...OPTS, includeSheetTitle: false })
    const dt = Date.now() - t0
    expect(out).toContain('| 1000 | Tên 1000 | 100000 |')
    expect(dt).toBeLessThan(2000)
  })
})

describe('sheet rỗng / tiêu đề', () => {
  it('sheet rỗng trả về rỗng', () => {
    expect(md([])).toBe('')
    expect(md([['', ''], ['', '']])).toBe('')
  })

  it('includeSheetTitle=false thì không có ## tên sheet', () => {
    const out = md([['機能ID', 'X']], 'MySheet', { ...OPTS, includeSheetTitle: false })
    expect(out).not.toContain('## MySheet')
  })
})

describe('listSheets / convertWorkbook', () => {
  const tmpFile = (names: string[]): string => {
    const wb = XLSX.utils.book_new()
    for (const n of names) XLSX.utils.book_append_sheet(wb, makeWs([['a']]), n)
    const p = path.join(os.tmpdir(), `t-${Date.now()}-${Math.random()}.xlsx`)
    XLSX.writeFile(wb, p)
    return p
  }

  it('convertSheet: sheet không tồn tại -> lỗi tiếng Việt rõ ràng', () => {
    const p = tmpFile(['A'])
    expect(() => convertSheet(p, 'KhôngCó', OPTS)).toThrow('Không tìm thấy sheet')
    fs.unlinkSync(p)
  })

  it('bỏ qua sheet DEL_ khi skipDelSheets=true', () => {
    const p = tmpFile(['A', 'DEL_x', 'B'])
    const names = listSheets(p, true).map((s) => s.name)
    expect(names).toEqual(['A', 'B'])
    const all = listSheets(p, false).map((s) => s.name)
    expect(all).toEqual(['A', 'DEL_x', 'B'])
  })

  it('phát hiện sheet ẩn (hidden)', () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, makeWs([['a']]), 'Visible')
    XLSX.utils.book_append_sheet(wb, makeWs([['b']]), 'Hidden1')
    wb.Workbook = { Sheets: [{ Hidden: 0 }, { Hidden: 1 }] } as XLSX.WorkBook['Workbook']
    const p = path.join(os.tmpdir(), `t-${Date.now()}-${Math.random()}.xlsx`)
    XLSX.writeFile(wb, p)
    const sheets = listSheets(p, false)
    expect(sheets.find((s) => s.name === 'Visible')!.hidden).toBe(false)
    expect(sheets.find((s) => s.name === 'Hidden1')!.hidden).toBe(true)
  })

  it('convertWorkbook bỏ sheet rỗng khi skipEmptySheets=true', () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, makeWs([['機能ID', 'X']]), 'A')
    XLSX.utils.book_append_sheet(wb, makeWs([]), 'Empty')
    const p = path.join(os.tmpdir(), `t-${Date.now()}-${Math.random()}.xlsx`)
    XLSX.writeFile(wb, p)
    const res = convertWorkbook(p, ['A', 'Empty'], OPTS)
    expect(res.map((r) => r.sheet)).toEqual(['A'])
  })
})

describe('dedupeFileName', () => {
  it('tên chưa dùng thì giữ nguyên', () => {
    const used = new Set<string>()
    expect(dedupeFileName('report.md', used)).toBe('report.md')
    expect(used.has('report.md')).toBe(true)
  })

  it('tên trùng thì thêm hậu tố (2), (3)...', () => {
    const used = new Set<string>()
    expect(dedupeFileName('report.md', used)).toBe('report.md')
    expect(dedupeFileName('report.md', used)).toBe('report (2).md')
    expect(dedupeFileName('report.md', used)).toBe('report (3).md')
  })

  it('hậu tố chèn trước extension', () => {
    const used = new Set<string>(['a__Sheet1.md'])
    expect(dedupeFileName('a__Sheet1.md', used)).toBe('a__Sheet1 (2).md')
  })
})

describe('safeFileName', () => {
  it('thay ký tự cấm Windows', () => {
    expect(safeFileName('a/b:c*d?e"f<g>h|i')).toBe('a_b_c_d_e_f_g_h_i')
  })

  it('bỏ dấu chấm/khoảng trắng ở cuối tên', () => {
    expect(safeFileName('báo cáo. ')).toBe('báo cáo')
    expect(safeFileName('...')).toBe('sheet')
    expect(safeFileName('a. . ')).toBe('a')
  })

  it('tên reserved Windows -> thêm prefix _', () => {
    expect(safeFileName('CON')).toBe('_CON')
    expect(safeFileName('nul.md')).toBe('_nul.md')
    expect(safeFileName('COM1')).toBe('_COM1')
    expect(safeFileName('console')).toBe('console')
    expect(safeFileName('null')).toBe('null')
  })

  it('cắt tối đa 80 ký tự, rỗng thành sheet', () => {
    expect(safeFileName('x'.repeat(100))).toHaveLength(80)
    expect(safeFileName('')).toBe('sheet')
    expect(safeFileName('   ')).toBe('sheet')
  })
})
