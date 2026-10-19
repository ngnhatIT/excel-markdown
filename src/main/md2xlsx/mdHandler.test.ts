/* handleMdRequest: mdInspect / mdToXlsx chạy được không cần Electron (worker chỉ gọi hàm này).
 * Markdown mẫu: test/golden/kihon-sekkei.xlsx.md, tách ở `---` thành hai file per-sheet trong thư mục tạm.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'
import { handleMdRequest } from './mdHandler'

const GOLDEN = fileURLToPath(new URL('../../../test/golden/kihon-sekkei.xlsx.md', import.meta.url))
const fixtureXlsx = fileURLToPath(new URL('../../../test/fixtures/kihon-sekkei.xlsx', import.meta.url))

const dir = mkdtempSync(join(tmpdir(), 'x2m-mdh-'))
const goldenText = readFileSync(GOLDEN, 'utf-8')
const goldenCopy = join(dir, 'golden.md')
const mdA = join(dir, 'a.md')
const mdB = join(dir, 'b.md')

beforeAll(() => {
  copyFileSync(GOLDEN, goldenCopy)
  const [partA, partB] = goldenText.split(/\r?\n---\r?\n/)
  writeFileSync(mdA, partA + '\n', 'utf-8')
  writeFileSync(mdB, partB, 'utf-8')
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('handleMdRequest mdInspect', () => {
  it('trả tiêu đề, tên sheet đã qua assignSheetNames và nguyên văn Markdown', async () => {
    const r = await handleMdRequest({ id: 1, type: 'mdInspect', path: goldenCopy })
    expect(r).toEqual({
      id: 1,
      ok: true,
      data: { title: 'kihon-sekkei', sheets: ['画面項目定義', 'テーブル定義'], markdown: goldenText },
    })
  })

  it('từ chối file không phải Markdown', async () => {
    expect(await handleMdRequest({ id: 2, type: 'mdInspect', path: fixtureXlsx })).toEqual({
      id: 2,
      ok: false,
      error: 'Chỉ đọc được file Markdown (.md).',
    })
  })

  it('tên sheet trùng/ký tự cấm được xử lý như khi ghi (không trả tên thô)', async () => {
    const p = join(dir, 'names.md')
    writeFileSync(p, '## a:b\n\nx\n\n---\n\n## a/b\n\ny\n', 'utf-8')
    const r = await handleMdRequest({ id: 7, type: 'mdInspect', path: p })
    expect(r.ok && (r.data as { sheets: string[] }).sheets).toEqual(['a_b', 'a_b (2)'])
  })

  it('BOM đầu file: bỏ khỏi markdown trả về, tiêu đề vẫn nhận ra', async () => {
    const p = join(dir, 'bom.md')
    writeFileSync(p, '\uFEFF# bom\n\n## S\n\nx\n', 'utf-8')
    const r = await handleMdRequest({ id: 13, type: 'mdInspect', path: p })
    expect(r).toEqual({
      id: 13,
      ok: true,
      data: { title: 'bom', sheets: ['S'], markdown: '# bom\n\n## S\n\nx\n' },
    })
  })

  it('file không phải UTF-8 (Shift_JIS) -> từ chối, nêu tên file, không trả chữ mojibake', async () => {
    const p = join(dir, 'sjis.md')
    // '# ' + 'あ' mã Shift_JIS (0x82 0xA0): giải mã UTF-8 ra U+FFFD
    writeFileSync(p, Buffer.from([0x23, 0x20, 0x82, 0xa0, 0x0a]))
    expect(await handleMdRequest({ id: 14, type: 'mdInspect', path: p })).toEqual({
      id: 14,
      ok: false,
      error: 'File không phải UTF-8: sjis.md. Hãy lưu lại file dạng UTF-8 rồi thử lại.',
    })
  })

  it('file không đọc được -> lỗi nêu tên file', async () => {
    const r = await handleMdRequest({ id: 8, type: 'mdInspect', path: join(dir, 'nope.md') })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toContain('Không đọc được file: nope.md')
  })
})

describe('handleMdRequest mdToXlsx', () => {
  const out = join(dir, 'out.xlsx')
  const out2 = join(dir, 'out2.xlsx')
  const out3 = join(dir, 'out3.xlsx')

  it('ghi sheet theo thứ tự file trong danh sách', async () => {
    const r3 = await handleMdRequest({ id: 3, type: 'mdToXlsx', files: [mdB, mdA], outPath: out })
    expect(r3).toEqual({ id: 3, ok: true, data: { outPath: out, sheets: ['テーブル定義', '画面項目定義'] } })
    expect(XLSX.read(readFileSync(out)).SheetNames).toEqual(['テーブル定義', '画面項目定義'])
    expect(existsSync(out + '.partial')).toBe(false)
  })

  it('khử trùng tên sheet giữa các file', async () => {
    const out4 = join(dir, 'out4.xlsx')
    const r = await handleMdRequest({ id: 9, type: 'mdToXlsx', files: [mdA, mdA], outPath: out4 })
    expect(r).toEqual({ id: 9, ok: true, data: { outPath: out4, sheets: ['画面項目定義', '画面項目定義 (2)'] } })
    expect(XLSX.read(readFileSync(out4)).SheetNames).toEqual(['画面項目定義', '画面項目定義 (2)'])
  })

  it('một file lỗi -> không tạo file Excel (kể cả .partial), báo rõ file nào', async () => {
    const r4 = await handleMdRequest({
      id: 4,
      type: 'mdToXlsx',
      files: [mdA, join(dir, 'missing.md')],
      outPath: out2,
    })
    expect(r4.ok).toBe(false)
    expect(!r4.ok && r4.error).toContain('missing.md')
    expect(existsSync(out2)).toBe(false)
    expect(existsSync(out2 + '.partial')).toBe(false)
  })

  it('một file không phải UTF-8 -> không tạo file Excel, báo rõ file nào', async () => {
    const sjis = join(dir, 'sjis2.md')
    writeFileSync(sjis, Buffer.from([0x82, 0xa0]))
    const out6 = join(dir, 'out6.xlsx')
    expect(await handleMdRequest({ id: 15, type: 'mdToXlsx', files: [mdA, sjis], outPath: out6 })).toEqual({
      id: 15,
      ok: false,
      error: 'File không phải UTF-8: sjis2.md. Hãy lưu lại file dạng UTF-8 rồi thử lại.',
    })
    expect(existsSync(out6)).toBe(false)
    expect(existsSync(out6 + '.partial')).toBe(false)
  })

  it('không có nội dung để tạo sheet -> lỗi rõ ràng, không tạo file', async () => {
    const empty = join(dir, 'empty.md')
    writeFileSync(empty, '# chỉ tiêu đề\n', 'utf-8')
    expect(await handleMdRequest({ id: 5, type: 'mdToXlsx', files: [empty], outPath: out3 })).toEqual({
      id: 5,
      ok: false,
      error: 'Các file Markdown không có nội dung để tạo sheet.',
    })
    expect(existsSync(out3)).toBe(false)
  })

  it('outPath không phải .xlsx tuyệt đối -> từ chối', async () => {
    expect((await handleMdRequest({ id: 6, type: 'mdToXlsx', files: [mdA], outPath: join(dir, 'x.txt') })).ok).toBe(
      false
    )
    expect((await handleMdRequest({ id: 10, type: 'mdToXlsx', files: [mdA], outPath: 'rel.xlsx' })).ok).toBe(false)
    expect(existsSync(join(dir, 'x.txt'))).toBe(false)
  })

  it('đường dẫn đầu vào không phải .md -> từ chối, không tạo file', async () => {
    const out5 = join(dir, 'out5.xlsx')
    const r = await handleMdRequest({ id: 11, type: 'mdToXlsx', files: [mdA, fixtureXlsx], outPath: out5 })
    expect(r).toEqual({ id: 11, ok: false, error: 'Chỉ đọc được file Markdown (.md).' })
    expect(existsSync(out5)).toBe(false)
  })

  it('ghi thất bại -> trả lỗi, không còn .partial', async () => {
    // outPath là một thư mục: bước đổi tên .partial -> outPath thất bại, .partial phải được dọn
    const blocker = join(dir, 'blocker.xlsx')
    mkdirSync(blocker)
    const r = await handleMdRequest({ id: 12, type: 'mdToXlsx', files: [mdA], outPath: blocker })
    expect(r.ok).toBe(false)
    expect(existsSync(blocker + '.partial')).toBe(false)
  })
})
