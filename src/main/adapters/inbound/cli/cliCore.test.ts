import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx'
import { expandExcelInputs, parseArgs, runCli, USAGE } from './cliCore'
import { workbookMarkdownForDiff as workbookTextconv } from '../../outbound/workbookText'
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

describe('ddl (テーブル定義書 → DDL / JSON / ER)', () => {
  const tableMd = join(__dirname, '../../../../../test/fixtures/table-def.md')
  const kihon = join(__dirname, '../../../../../test/fixtures/kihon-sekkei.xlsx')
  const capture = async (argv: string[]): Promise<{ code: number; out: string; err: string }> => {
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    try {
      const code = await runCli(argv, () => {})
      return { code, out: out.mock.calls.map((c) => String(c[0])).join(''), err: err.mock.calls.map((c) => String(c[0])).join('') }
    } finally {
      out.mockRestore()
      err.mockRestore()
    }
  }

  it('file .md -> DDL postgres ra stdout; Excel convert trong bộ nhớ; thư mục .md', async () => {
    const pg = await capture(['ddl', tableMd, '--dialect', 'postgres'])
    expect(pg.code).toBe(0)
    expect(pg.out).toContain('CREATE TABLE M_CUSTOMER (')
    expect(pg.out).toContain("COMMENT ON TABLE T_ORDER IS '受注明細';")
    const xlsx = await capture(['ddl', kihon])
    expect(xlsx.out).toContain('-- 顧客マスタ / kihon-sekkei.xlsx\nCREATE TABLE TBL_CUSTOMER (')
    const dir = join(tmp, 'ddl-dir')
    mkdirSync(join(dir, 'sub'), { recursive: true })
    copyFileSync(tableMd, join(dir, 'sub', 'a.md'))
    const json = JSON.parse((await capture(['ddl', dir, '--format', 'json'])).out) as { source: string; tableName: string }[]
    expect(json.map((d) => `${d.source}:${d.tableName}`)).toEqual(['sub/a.md:M_CUSTOMER', 'sub/a.md:T_ORDER'])
  })

  it('--format mermaid -o: ghi file, log đường dẫn', async () => {
    const outFile = join(tmp, 'er.mmd')
    const logs: string[] = []
    expect(await runCli(['ddl', tableMd, '--format', 'mermaid', '-o', outFile], (s) => logs.push(s))).toBe(0)
    expect(readFileSync(outFile, 'utf-8')).toContain('T_ORDER }o--|| M_CUSTOMER : "customer_id"')
    expect(logs[0]).toContain('(2 bảng)')
  })

  it('không có bảng định nghĩa / file lạ -> mã 1, lỗi ra stderr; cờ sai -> ném', async () => {
    const empty = join(tmp, 'empty.md')
    writeFileSync(empty, '# x\n')
    const r = await capture(['ddl', empty])
    expect(r).toMatchObject({ code: 1, out: '' })
    expect(r.err).toContain('Không tìm thấy')
    expect((await capture(['ddl', join(tmp, 'a.txt')])).err).toContain('Chỉ nhận file .md')
    await expect(runCli(['ddl', tableMd, '--dialect', 'db2'])).rejects.toThrow('--dialect')
    await expect(runCli(['ddl', tableMd, '--format', 'xml'])).rejects.toThrow('--format')
    await expect(runCli(['ddl'])).rejects.toThrow('Chưa có file')
  })
})

describe('impact / lint (Bản đồ thiết kế + 影響調査)', () => {
  const specDir = join(__dirname, '../../../../../test/fixtures/specmap')
  const capture = async (argv: string[]): Promise<{ code: number; out: string; log: string; err: string }> => {
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const logs: string[] = []
    try {
      const code = await runCli(argv, (s) => logs.push(s))
      return { code, out: out.mock.calls.map((c) => String(c[0])).join(''), log: logs.join('\n'), err: err.mock.calls.map((c) => String(c[0])).join('') }
    } finally {
      out.mockRestore()
      err.mockRestore()
    }
  }

  it('impact: báo cáo theo tài liệu, có màn hình bị ảnh hưởng; không khớp -> mã 1', async () => {
    const r = await capture(['impact', specDir, 'TBL_CUSTOMER.CUST_CD'])
    expect(r.code).toBe(0)
    expect(r.out).toContain('影響調査: TBL_CUSTOMER.CUST_CD (cột)')
    expect(r.out).toContain('  * SCR010 顧客検索画面')
    expect(r.out).toContain('screens/SCR010_search.md\n  16: [tham chiếu] | 1 | 顧客コード |')
    expect(r.out).toContain('  21: [tham chiếu] - 検索キー: TBL_CUSTOMER.CUST_CD（前方一致）')
    const none = await capture(['impact', specDir, 'KHONG_CO'])
    expect(none.code).toBe(1)
    expect(none.out).toContain('Không tìm thấy')
  })

  it('lint: một dòng mỗi lỗi dạng file:dòng, có lỗi -> mã 1 (dùng trong CI); thư mục sạch -> 0', async () => {
    const r = await capture(['lint', specDir])
    expect(r.code).toBe(1)
    expect(r.log).toContain('screens/old/SCR010_v1.md:5: error: 画面ID trùng: SCR010 (đã định nghĩa ở screens/SCR010_search.md:7)')
    expect(r.log).toContain('screens/SCR010_search.md:22: error: Cột không có trong テーブル定義: TBL_CUSTOMER.CUST_KANA')
    // ô rẽ nhánh 権限あり？ không bị báo là màn hình thiếu
    expect(r.log).not.toContain('権限あり？')
    expect(r.log).toContain('2 lỗi, 2 cảnh báo')
    const clean = join(tmp, 'spec-clean')
    mkdirSync(clean, { recursive: true })
    writeFileSync(join(clean, 'a.md'), '- **画面ID**: A001\n- **画面遷移**: → A001\n')
    expect((await capture(['lint', clean])).code).toBe(0)
  })

  it('đối số sai -> ném; thư mục không có -> mã 1, lỗi ra stderr', async () => {
    await expect(runCli(['impact', specDir])).rejects.toThrow('Dùng: cli impact')
    await expect(runCli(['lint'])).rejects.toThrow('Dùng: cli lint')
    await expect(runCli(['lint', specDir, '--x'])).rejects.toThrow('Tuỳ chọn không hợp lệ')
    await expect(runCli(['impact', specDir, 'x'.repeat(201)])).rejects.toThrow('1–200')
    const r = await capture(['lint', join(tmp, 'khong-co')])
    expect(r.code).toBe(1)
    expect(r.err).toContain('Không phải thư mục')
  })
})
