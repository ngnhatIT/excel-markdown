/* Golden + round-trip cho chiều Markdown -> Excel, với Markdown do chính app tạo (test/golden/*.md).
 * - Golden: mô hình -> buildWorkbook -> đọc lại bằng SheetJS -> JSON so với test/golden-md2xlsx.
 *   Đổi bố cục/giá trị ô có chủ ý thì chạy `npm run test:update` rồi review diff của
 *   test/golden-md2xlsx trước khi commit. KHÔNG sửa test/golden: đó là output chiều Excel -> Markdown.
 * - Round-trip: md₁ -> xlsx -> md₂ (chiều Excel -> Markdown của app) -> xlsx -> md₃; md₃ phải bằng md₂ và
 *   mọi chữ của mô hình md₁ phải còn nguyên ở mô hình md₂.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'
import { joinWorkbookMarkdown } from '../excel/converter'
import { convertWorkbook, listSheets } from '../../adapters/outbound/xlsxFiles'
import { DEFAULT_OPTIONS } from '../../../types'
import type { SheetModel } from './model'
import { assignSheetNames } from './names'
import { parseMarkdownFile } from './parse'
import { buildWorkbook } from './write'
import { saveWorkbook } from '../../adapters/outbound/xlsxWriter'

const INPUT_DIR = fileURLToPath(new URL('../../../../test/golden/', import.meta.url))
const files = readdirSync(INPUT_DIR).filter((f) => f.endsWith('.md'))

interface CellDump {
  v: string | number | boolean
  t: string
  z?: string
  l?: string
}
interface SheetDump {
  name: string
  merges: string[]
  cells: Record<string, CellDump>
}

/** Mô hình -> buffer .xlsx -> SheetJS -> JSON ổn định (ô theo thứ tự dòng rồi cột, chỉ ô có giá trị). */
async function dumpWorkbook(sheets: SheetModel[]): Promise<{ sheets: SheetDump[] }> {
  const buf = (await buildWorkbook(assignSheetNames(sheets)).xlsx.writeBuffer()) as ArrayBuffer
  // cellNF: giữ định dạng số (`z`); `General` là mặc định nên không ghi vào JSON (vắng `z` = General).
  const wb = XLSX.read(Buffer.from(buf), { cellNF: true })
  return {
    sheets: wb.SheetNames.map((name) => {
      const ws = wb.Sheets[name]
      const merges = (ws['!merges'] ?? []).map((r) => XLSX.utils.encode_range(r)).sort()
      const addrs = Object.keys(ws)
        .filter((k) => !k.startsWith('!') && ws[k].v !== undefined)
        .sort((a, b) => {
          const ca = XLSX.utils.decode_cell(a)
          const cb = XLSX.utils.decode_cell(b)
          return ca.r - cb.r || ca.c - cb.c
        })
      const cells: Record<string, CellDump> = {}
      for (const addr of addrs) {
        const c = ws[addr]
        const dump: CellDump = { v: c.v as CellDump['v'], t: c.t }
        if (c.z !== undefined && c.z !== 'General') dump.z = c.z
        if (c.l?.Target !== undefined) dump.l = c.l.Target
        cells[addr] = dump
      }
      return { name, merges, cells }
    })
  }
}

/** Mọi chữ hiển thị của mô hình: ô bảng, label/value meta, heading, paragraph, note, banner title; bỏ chuỗi rỗng. */
function collectTexts(sheets: SheetModel[]): string[] {
  const out: string[] = []
  for (const sheet of sheets) {
    for (const b of sheet.blocks) {
      switch (b.kind) {
        case 'table':
          for (const row of [b.header, ...b.rows]) out.push(...row.map((c) => c.text))
          break
        case 'meta':
          for (const item of b.items) out.push(item.label, item.value.text)
          break
        case 'heading':
        case 'note':
        case 'paragraph':
          out.push(b.text)
          break
        case 'banner':
          out.push(b.title)
          break
        case 'code':
          break
      }
    }
  }
  return out.filter((t) => t !== '')
}

/** collectTexts + những chữ khác cũng phải ghi ra ô (dòng code, nhãn banner): dùng cho kiểm tra "mọi chữ được giữ". */
function allCellTexts(sheet: SheetModel): string[] {
  const out = collectTexts([sheet])
  for (const b of sheet.blocks) {
    if (b.kind === 'code') out.push(...b.lines)
    if (b.kind === 'banner') out.push(b.label)
  }
  return out.filter((t) => t !== '')
}

/**
 * Chữ đọc lại (SheetJS) của từng sheet: chữ hiển thị (`w`, đã theo number format) của mọi ô, cộng chuỗi nối các
 * ô liền nhau ở cột A bằng `\n` và bằng chuỗi rỗng (đoạn văn quá cao được tách thành nhiều hàng merge).
 */
function readBackTexts(buf: Buffer): Set<string>[] {
  const wb = XLSX.read(buf)
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name]
    const texts = new Set<string>()
    const colA: (string | null)[] = []
    for (const addr of Object.keys(ws).filter((k) => !k.startsWith('!'))) {
      const c = ws[addr]
      if (c.v === undefined) continue
      const text = String(c.w ?? c.v)
      texts.add(text)
      const { r, c: col } = XLSX.utils.decode_cell(addr)
      if (col === 0) colA[r] = text
    }
    for (let r = 0; r < colA.length; r++) {
      let byLine = colA[r]
      let byChar = colA[r]
      for (let k = r + 1; byLine != null && k < colA.length && colA[k] != null; k++) {
        byLine += '\n' + colA[k]
        byChar += colA[k]!
        texts.add(byLine)
        texts.add(byChar!)
      }
    }
    return texts
  })
}

/** Chữ của mô hình không tìm thấy trong ô đọc lại, theo từng sheet (rỗng = không mất chữ nào). */
function lostTexts(sheets: SheetModel[], back: Set<string>[]): { sheet: number; text: string }[] {
  return sheets.flatMap((s, i) => allCellTexts(s).filter((t) => !back[i]?.has(t)).map((text) => ({ sheet: i, text })))
}

function countBy(texts: string[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const t of texts) m.set(t, (m.get(t) ?? 0) + 1)
  return m
}

describe('golden md2xlsx: Markdown do app tạo', () => {
  let tmp = ''
  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'md2xlsx-golden-'))
  })
  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  /** Markdown -> file .xlsx thật (đường ghi an toàn của app) -> Markdown, đúng như chiều Excel -> Markdown của app. */
  async function toMarkdown(md: string, fileName: string, tag: string): Promise<string> {
    const parsed = parseMarkdownFile(md, fileName)
    const out = join(tmp, `${tag}.xlsx`)
    await saveWorkbook(buildWorkbook(assignSheetNames(parsed.sheets)), out)
    // Giống mặc định của UI: sheet ẩn không được tick.
    const names = listSheets(out, DEFAULT_OPTIONS.skipDelSheets)
      .filter((s) => !s.hidden)
      .map((s) => s.name)
    return joinWorkbookMarkdown(parsed.title ?? 'workbook', convertWorkbook(out, names, DEFAULT_OPTIONS))
  }

  it('có file mẫu', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  for (const f of files) {
    const md = readFileSync(join(INPUT_DIR, f), 'utf8')

    it(`${f}: golden`, async () => {
      const dump = await dumpWorkbook(parseMarkdownFile(md, f).sheets)
      await expect(JSON.stringify(dump, null, 2) + '\n').toMatchFileSnapshot(
        `../../../../test/golden-md2xlsx/${f}.json`
      )
    })

    it(`${f}: round-trip`, async () => {
      const tag = f.replace(/[^\w.-]/g, '_')
      const md2 = await toMarkdown(md, f, `${tag}.1`)
      const md3 = await toMarkdown(md2, f, `${tag}.2`)
      // Lần chuyển thứ hai không đổi gì nữa (idempotent).
      expect(md3).toBe(md2)

      // Mọi chữ của md₁ còn nguyên, đúng một-một, ở md₂ (so sánh tuyệt đối, không chuẩn hoá).
      const t1 = collectTexts(parseMarkdownFile(md, f).sheets)
      const t2 = collectTexts(parseMarkdownFile(md2, f).sheets)
      expect(t1.length).toBeGreaterThan(0)
      const c1 = countBy(t1)
      const c2 = countBy(t2)
      const diff = [...c1].flatMap(([text, n]) => ((c2.get(text) ?? 0) === n ? [] : [{ text, md1: n, md2: c2.get(text) ?? 0 }]))
      expect(diff).toEqual([])
    })
  }
})

/** Markdown -> mô hình -> .xlsx (buffer) -> chữ đọc lại bằng SheetJS. */
async function mdToReadBack(md: string, fileName: string): Promise<{ sheets: SheetModel[]; back: Set<string>[] }> {
  const sheets = assignSheetNames(parseMarkdownFile(md, fileName).sheets)
  if (sheets.length === 0) return { sheets, back: [] }
  const buf = Buffer.from((await buildWorkbook(sheets).xlsx.writeBuffer()) as ArrayBuffer)
  return { sheets, back: readBackTexts(buf) }
}

describe('Markdown bất kỳ (spec §11): không crash, mọi chữ được giữ trong file Excel', () => {
  it('fuzz 300 chuỗi ghép ngẫu nhiên (seed cố định): parse -> ghi -> đọc lại không mất chữ', async () => {
    const pieces = [
      '# h',
      '## s',
      '### 見出し',
      '---',
      '> q',
      '> 1. 引用',
      '- **L**: v',
      '- **ラベル**：値',
      '  - sub',
      '  1. 番号',
      '1. **初期表示**: 画面',
      '2. item',
      '- 項目',
      '| a | b |\n|---|---|\n| 1 | 2.50 |',
      '```',
      '<div>',
      '<br>',
      '<!-- c -->',
      '[x](https://a.example)',
      '\\*esc\\* `code` **b**',
      '',
      'text 0001'
    ]
    const seps = ['\n', '\n\n', '\n  ', '\r\n']
    // mulberry32: PRNG xác định để test lặp lại được
    let a = 0x5eed2b1
    const rnd = (): number => {
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const pick = <T>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)]
    const failures: { md: string; lost: unknown }[] = []
    for (let i = 0; i < 300; i++) {
      const n = 1 + Math.floor(rnd() * 12)
      let md = ''
      for (let j = 0; j < n; j++) md += pick(pieces) + pick(seps)
      const { sheets, back } = await mdToReadBack(md, 'fuzz.md')
      expect(back.length, JSON.stringify(md)).toBe(sheets.length)
      const lost = lostTexts(sheets, back)
      if (lost.length > 0) failures.push({ md, lost })
    }
    expect(failures).toEqual([])
  })

  it('mẫu viết tay (heading nhiều cấp, list có số, quote, bảng, code, <br>): không mất chữ', async () => {
    const md = readFileSync(fileURLToPath(new URL('../../../../test/fixtures/handwritten.md', import.meta.url)), 'utf8')
    const { sheets, back } = await mdToReadBack(md, 'handwritten.md')
    expect(sheets.map((s) => s.name)).toEqual(['概要', '変更履歴'])
    // mẫu đủ lớn để kiểm có ý nghĩa
    expect(allCellTexts(sheets[0]).length).toBeGreaterThan(15)
    expect(lostTexts(sheets, back)).toEqual([])
    // chữ người đọc Markdown thấy (kiểm độc lập với mô hình: parse làm mất chữ cũng bị bắt)
    const expected = [
      'この文書は手書きの Markdown サンプルです。\n改行も含みます。',
      '1. 目的',
      '1.1 対象画面',
      '・顧客検索画面',
      '・基本情報タブ',
      // list đánh số giữ số, không thành meta (Ruling 18)
      '1. 初期表示: 画面を表示する',
      '2. 検索: 条件で検索する',
      '3. 結果を一覧に表示する',
      // list con đánh số trong value meta / trong ghi chú giữ `N. ` (Ruling 18)
      '1. 検索\n2. 表示\n補足',
      '仕様書',
      '※ 注意事項\n1. 必須項目を確認する\n2. 保存する',
      '全角 50 文字\nカナ可',
      '12.50%',
      'SELECT CUSTOMER_ID, CUSTOMER_NAME',
      '  FROM TBL_CUSTOMER',
      // `<br>` trong khối HTML là xuống dòng, không lọt vào ô
      '次の段落'
    ]
    expect(expected.filter((t) => !back[0].has(t))).toEqual([])
    // không còn cú pháp Markdown/HTML lọt vào ô (spec §4)
    const leaked = back.flatMap((s) => [...s].filter((t) => /<br\s*\/?>|\*\*|<!--/i.test(t)))
    expect(leaked).toEqual([])
    expect(['初版', '検索条件を追加', '小見出し', '最後の段落です。'].filter((t) => !back[1].has(t))).toEqual([])
  })
})
