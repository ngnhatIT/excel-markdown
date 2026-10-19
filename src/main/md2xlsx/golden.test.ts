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
import { convertWorkbook, joinWorkbookMarkdown, listSheets } from '../converter'
import { DEFAULT_OPTIONS } from '../../types'
import type { SheetModel } from './model'
import { assignSheetNames } from './names'
import { parseMarkdownFile } from './parse'
import { buildWorkbook, saveWorkbook } from './write'

const INPUT_DIR = fileURLToPath(new URL('../../../test/golden/', import.meta.url))
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
        `../../../test/golden-md2xlsx/${f}.json`
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
