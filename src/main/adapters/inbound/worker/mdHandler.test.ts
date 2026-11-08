/* handleMdRequest: mdInspect / mdToXlsx chạy được không cần Electron (worker chỉ gọi hàm này).
 * Markdown mẫu: test/golden/kihon-sekkei.xlsx.md, tách ở `---` thành hai file per-sheet trong thư mục tạm.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import JSZip from 'jszip'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'
import { handleMdRequest } from './mdHandler'

const GOLDEN = fileURLToPath(new URL('../../../../../test/golden/kihon-sekkei.xlsx.md', import.meta.url))
const fixtureXlsx = fileURLToPath(new URL('../../../../../test/fixtures/kihon-sekkei.xlsx', import.meta.url))

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

  it('một file rỗng trong danh sách -> lỗi nêu tên file, không tạo file (không lặng lẽ thiếu sheet)', async () => {
    const empty = join(dir, 'empty.md')
    writeFileSync(empty, '\n\n', 'utf-8')
    expect(await handleMdRequest({ id: 5, type: 'mdToXlsx', files: [mdA, empty], outPath: out3 })).toEqual({
      id: 5,
      ok: false,
      error: 'File không có nội dung: empty.md. Hãy bỏ file khỏi danh sách hoặc thêm nội dung rồi thử lại.',
    })
    expect(existsSync(out3)).toBe(false)
  })

  it('file chỉ có `# tiêu đề` vẫn thành một sheet (tiêu đề là heading)', async () => {
    const only = join(dir, 'kihon__新規.md')
    writeFileSync(only, '# 新規\n', 'utf-8')
    const out = join(dir, 'only-title.xlsx')
    const r = await handleMdRequest({ id: 51, type: 'mdToXlsx', files: [mdA, only], outPath: out })
    expect(r.ok && (r.data as { sheets: string[] }).sheets).toEqual(['画面項目定義', '新規'])
    expect(XLSX.read(readFileSync(out)).Sheets['新規'].A1.v).toBe('新規')
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

describe('handleMdRequest mdToXlsx: ảnh và link sang file khác', () => {
  // PNG 1×1 hợp lệ (header IHDR 3×2 để kiểm kích thước đọc từ header)
  const png = (w: number, h: number) => {
    const b = Buffer.alloc(33)
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0)
    b.writeUInt32BE(13, 8)
    b.write('IHDR', 12, 'latin1')
    b.writeUInt32BE(w, 16)
    b.writeUInt32BE(h, 20)
    return b
  }
  const root = join(dir, 'img')
  const docs = join(root, 'docs')
  beforeAll(() => {
    mkdirSync(join(docs, 'book_images'), { recursive: true })
    writeFileSync(join(docs, 'book_images', 'image 1.png'), png(160, 45))
    writeFileSync(join(root, 'secret.png'), png(10, 10))
    writeFileSync(join(docs, 'fake.png'), 'not a png')
    writeFileSync(join(docs, 'big.png'), Buffer.concat([png(10, 10), Buffer.alloc(10 * 1024 * 1024)]))
    try {
      symlinkSync(join(root, 'secret.png'), join(docs, 'link.png'))
    } catch {
      // Windows không có quyền tạo symlink: bỏ qua phần đó
    }
  })

  it('ảnh tương đối trong thư mục .md được nhúng; ra ngoài / tuyệt đối / scheme / giả / quá cỡ -> giữ chữ alt', async () => {
    const md = join(docs, 'book__画面.md')
    writeFileSync(
      md,
      [
        '## 画面',
        '![ok (A1:B2)](book_images/image%201.png)',
        '![up](../secret.png)',
        `![abs](${join(root, 'secret.png').replace(/\\/g, '/')})`,
        '![asset](x2m-asset:image1.png)',
        '![fake](fake.png)',
        '![big](big.png)',
        '![link](link.png)',
        '![txt](book__画面.md)',
      ].join('\n\n'),
      'utf-8'
    )
    const out = join(dir, 'img.xlsx')
    expect((await handleMdRequest({ id: 60, type: 'mdToXlsx', files: [md], outPath: out })).ok).toBe(true)
    const zip = await JSZip.loadAsync(readFileSync(out))
    expect(Object.keys(zip.files).filter((f) => /^xl\/media\/./.test(f))).toEqual(['xl/media/image1.png'])
    const drawing = await zip.file('xl/drawings/drawing1.xml')!.async('string')
    // 160×45px -> 3 hàng 20px; ảnh đặt ở hàng 1 (row 0)
    expect(drawing).toContain('<xdr:row>0</xdr:row>')
    expect(drawing).toContain(`cx="${160 * 9525}" cy="${45 * 9525}"`)
    const ws = XLSX.read(readFileSync(out)).Sheets['画面']
    const texts = Object.keys(ws).filter((k) => !k.startsWith('!')).map((k) => ws[k].v)
    expect(texts).toEqual(['up', 'abs', 'asset', 'fake', 'big', 'link', 'txt'])
    // ảnh dành 3 hàng + 1 hàng trống: chữ alt đầu tiên ở A5
    expect(ws.A5.v).toBe('up')
  })

  it('link [x](file.md) tới file trong cùng lần tạo -> hyperlink nội bộ tới sheet đầu của file đó', async () => {
    const a = join(root, 'book__一覧.md')
    const b = join(root, 'book__詳細 画面.md')
    writeFileSync(a, '| No | 画面 |\n|---|---|\n| 1 | [詳細](book__%E8%A9%B3%E7%B4%B0%20%E7%94%BB%E9%9D%A2.md) |\n| 2 | [外](other.md) |\n', 'utf-8')
    writeFileSync(b, '## 詳細 画面\n\nx\n', 'utf-8')
    const out = join(dir, 'links.xlsx')
    expect((await handleMdRequest({ id: 61, type: 'mdToXlsx', files: [a, b], outPath: out })).ok).toBe(true)
    const ws = XLSX.read(readFileSync(out)).Sheets['一覧']
    expect(ws.B2.l?.Target).toBe("#'詳細 画面'!A1")
    expect(ws.B3.l).toBeUndefined()
    // quan hệ External thừa của exceljs đã bị bỏ
    const rels = await (await JSZip.loadAsync(readFileSync(out))).file('xl/worksheets/_rels/sheet1.xml.rels')?.async('string')
    expect(rels ?? '').not.toContain('TargetMode="External"')
  })
})
