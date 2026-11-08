import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx'
import { expandExcelInputs, parseArgs, runCli, USAGE, workbookTextconv } from './cliCore'
import pkg from '../../../../../package.json'

const fixture = join(__dirname, '../../../../../test/fixtures/excel-authored.xlsx')
const tmp = mkdtempSync(join(tmpdir(), 'x2m-cli-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

describe('parseArgs', () => {
  it('đọc cờ và giá trị', () => {
    const a = parseArgs(['a.xlsx', '-o', 'out', '--range', 'A1:B2', '--chunk', '5', '--formulas', '--front-matter'])
    expect(a.files).toEqual(['a.xlsx'])
    expect(a.outDir).toBe('out')
    expect(a.options).toMatchObject({ range: 'A1:B2', chunkRows: 5, showFormulas: true, frontMatter: true })
  })
  it('báo lỗi rõ ràng', () => {
    expect(() => parseArgs(['-o', 'x'])).toThrow('Chưa có file')
    expect(() => parseArgs(['a.xlsx'])).toThrow('-o')
    expect(() => parseArgs(['a.xlsx', '-o', 'x', '--bogus'])).toThrow('--bogus')
    expect(() => parseArgs(['a.xlsx', '-o', 'x', '--chunk', '-1'])).toThrow('--chunk')
    expect(() => parseArgs(['a.xlsx', '-o'])).toThrow('Thiếu giá trị')
  })
})

describe('runCli', () => {
  it('per-sheet: ghi .md có front-matter', async () => {
    const out = join(tmp, 'ps')
    expect(await runCli([fixture, '-o', out, '--front-matter'], () => {})).toBe(0)
    const files = readdirSync(out)
    expect(files.length).toBeGreaterThan(0)
    expect(readFileSync(join(out, files[0]), 'utf-8')).toMatch(/^---\nsource: "excel-authored.xlsx"\nsheet: /)
  })
  it('per-workbook: một file', async () => {
    const out = join(tmp, 'pw')
    expect(await runCli([fixture, '-o', out, '--per-workbook'], () => {})).toBe(0)
    expect(readdirSync(out)).toEqual(['excel-authored.md'])
  })
  it('file hỏng -> mã thoát 1, không ném', async () => {
    const logs: string[] = []
    expect(await runCli([join(tmp, 'khong-co.xlsx'), '-o', join(tmp, 'e')], (s) => logs.push(s))).toBe(1)
    expect(logs[0]).toContain('LỖI')
    expect(logs[0]).toContain('Không tìm thấy file')
  })
  it('lỗi từng file dịch tiếng Việt (file text đổi đuôi .xlsx)', async () => {
    const bad = join(tmp, 'text.xlsx')
    writeFileSync(bad, 'this is not excel')
    const logs: string[] = []
    expect(await runCli([bad, '-o', join(tmp, 'e2')], (s) => logs.push(s))).toBe(1)
    expect(logs).toEqual([`LỖI ${bad}: File không phải Excel hợp lệ hoặc đã bị hỏng (có thể chỉ bị đổi đuôi hoặc tải về chưa xong). Hãy mở thử bằng Excel rồi lưu lại.`])
  })
  it('--help / -h in USAGE, --version / -v in phiên bản, mã thoát 0', async () => {
    for (const f of ['--help', '-h']) {
      const logs: string[] = []
      expect(await runCli([f], (s) => logs.push(s))).toBe(0)
      expect(logs).toEqual([USAGE])
    }
    for (const f of ['--version', '-v']) {
      const logs: string[] = []
      expect(await runCli([f], (s) => logs.push(s))).toBe(0)
      expect(logs).toEqual([pkg.version])
    }
  })
  it('--no-clobber: bỏ qua workbook đã có đầu ra (BỎ QUA), mặc định vẫn ghi đè', async () => {
    const out = join(tmp, 'nc')
    expect(await runCli([fixture, '-o', out, '--per-workbook'], () => {})).toBe(0)
    writeFileSync(join(out, 'excel-authored.md'), 'sửa tay')
    const logs: string[] = []
    expect(await runCli([fixture, '-o', out, '--per-workbook', '--no-clobber'], (s) => logs.push(s))).toBe(0)
    expect(logs).toEqual([`BỎ QUA ${fixture}: đã có excel-authored.md`])
    expect(readFileSync(join(out, 'excel-authored.md'), 'utf-8')).toBe('sửa tay')
    expect(await runCli([fixture, '-o', out, '--per-workbook'], () => {})).toBe(0)
    expect(readFileSync(join(out, 'excel-authored.md'), 'utf-8')).not.toBe('sửa tay')
  })
})

describe('thư mục đầu vào (Excel → Markdown)', () => {
  it('mở rộng đệ quy, bỏ ~$ / file khác / thư mục ẩn / node_modules, giữ cấu trúc thư mục con', async () => {
    const src = join(tmp, 'in')
    for (const d of ['sub', '.hidden', 'node_modules']) mkdirSync(join(src, d), { recursive: true })
    copyFileSync(fixture, join(src, 'b.xlsx'))
    copyFileSync(fixture, join(src, 'sub', 'a.xlsx'))
    copyFileSync(fixture, join(src, '.hidden', 'h.xlsx'))
    copyFileSync(fixture, join(src, 'node_modules', 'n.xlsx'))
    writeFileSync(join(src, '~$b.xlsx'), 'lock')
    writeFileSync(join(src, 'note.txt'), 'x')
    expect((await expandExcelInputs([src])).map((f) => f.file)).toEqual([join(src, 'b.xlsx'), join(src, 'sub', 'a.xlsx')])

    const out = join(tmp, 'dirout')
    const logs: string[] = []
    expect(await runCli([src, '-o', out, '--per-workbook'], (s) => logs.push(s))).toBe(0)
    expect(logs).toEqual(['b.md', 'sub/a.md'])
    expect(readdirSync(join(out, 'sub'))).toEqual(['a.md'])
  })
})

describe('md2xlsx (Markdown → Excel)', () => {
  const md = join(__dirname, '../../../../../test/fixtures/handwritten.md')

  it('ghi .xlsx đọc lại được bằng SheetJS; đã có thì từ chối trừ khi --overwrite', async () => {
    const out = join(tmp, 'md', 'Book.xlsx')
    mkdirSync(join(tmp, 'md'), { recursive: true })
    expect(await runCli(['md2xlsx', md, '-o', out], () => {})).toBe(0)
    expect(XLSX.read(readFileSync(out)).SheetNames.length).toBeGreaterThan(0)
    const logs: string[] = []
    expect(await runCli(['md2xlsx', md, '-o', out], (s) => logs.push(s))).toBe(1)
    expect(logs[0]).toContain('đã tồn tại')
    expect(await runCli(['md2xlsx', md, '-o', out, '--overwrite'], () => {})).toBe(0)
    expect(existsSync(out + '.partial')).toBe(false)
  })

  it('thư mục .md theo thứ tự đường dẫn; file không phải .md bị từ chối', async () => {
    const dir = join(tmp, 'mddir')
    mkdirSync(join(dir, 'z'), { recursive: true })
    writeFileSync(join(dir, 'z', 'b.md'), '## Bsheet\n\ntext\n')
    writeFileSync(join(dir, 'a.md'), '## Asheet\n\ntext\n')
    writeFileSync(join(dir, 'skip.txt'), 'x')
    const out = join(tmp, 'mddir.xlsx')
    expect(await runCli(['md2xlsx', dir, '-o', out], () => {})).toBe(0)
    expect(XLSX.read(readFileSync(out)).SheetNames).toEqual(['Asheet', 'Bsheet'])
    const logs: string[] = []
    expect(await runCli(['md2xlsx', join(dir, 'skip.txt'), '-o', join(tmp, 'bad.xlsx')], (s) => logs.push(s))).toBe(1)
    expect(logs[0]).toContain('Markdown')
  })

  it('thiếu -o / không có file -> ném lỗi đối số', async () => {
    await expect(runCli(['md2xlsx', md])).rejects.toThrow('-o')
    await expect(runCli(['md2xlsx', '-o', 'x.xlsx'])).rejects.toThrow('Chưa có file')
  })
})

describe('textconv (git diff driver)', () => {
  const ui = join(__dirname, '../../../../../test/fixtures/ui-drawings.xlsx')

  it('Markdown cả workbook, không phụ thuộc tên file (git đưa file tạm), ảnh kèm sha1 nội dung', () => {
    const dir = mkdtempSync(join(tmpdir(), 'x2m-tc-'))
    const tmpName = join(dir, 'Xa1b2c_ui.xlsx')
    copyFileSync(ui, tmpName)
    const text = workbookTextconv(tmpName)
    expect(text).toBe(workbookTextconv(ui))
    expect(text).toContain('## 画面レイアウト')
    expect(text).toContain('## 画面遷移図')
    expect(text).toMatch(/\]\(image1\.png#sha1=[0-9a-f]{12}\)/)
    expect(text).not.toContain('x2m-asset:')
    expect(text).not.toContain('Xa1b2c')
  })

  it('file không phải Excel: mã thoát 1, lỗi chỉ ra stderr, stdout trống', async () => {
    const md = join(tmp, 'README.md')
    writeFileSync(md, '# Không phải Excel\n')
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    try {
      expect(await runCli(['textconv', md], () => {})).toBe(1)
      expect(out).not.toHaveBeenCalled()
      expect(String(err.mock.calls[0][0])).toContain('File không phải Excel hợp lệ')
    } finally {
      out.mockRestore()
      err.mockRestore()
    }
  })

  it('link sang sheet khác không lộ token nội bộ', () => {
    const text = workbookTextconv(fixture)
    expect(text).toContain('[参照](#%E3%83%86%E3%83%BC%E3%83%96%E3%83%AB%E5%AE%9A%E7%BE%A9)')
    expect(text).not.toContain('x2m-sheet:')
  })
})
