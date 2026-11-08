import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { handleMcpMessage, MCP_TOOLS } from './mcpCore'

const fixture = join(__dirname, '../../../../../test/fixtures/kihon-sekkei.xlsx')
const tmp = mkdtempSync(join(tmpdir(), 'x2m-mcp-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

const docs = join(tmp, 'docs')
mkdirSync(join(docs, 'sub'), { recursive: true })
writeFileSync(join(docs, 'SC001.md'), '# 顧客一覧\n\n## 【項目定義】\n\n| No | 項目名 |\n|---|---|\n| 1 | 顧客コード |\n')
writeFileSync(join(docs, 'sub', 'SC002.md'), '# 受注入力\n\n## 【イベント】\n\n登録ボタン押下\n')

const call = (name: string, args: Record<string, unknown>) =>
  handleMcpMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) as Promise<{
    result: { content: { text: string }[]; isError?: boolean }
  }>

describe('MCP JSON-RPC', () => {
  it('initialize trả về khả năng tools và giữ protocolVersion của client', async () => {
    const res = (await handleMcpMessage({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18' } })) as {
      result: { protocolVersion: string; capabilities: unknown }
    }
    expect(res.result.protocolVersion).toBe('2025-06-18')
    expect(res.result.capabilities).toEqual({ tools: {} })
  })

  it('notification không có phản hồi; method lạ trả lỗi -32601', async () => {
    expect(await handleMcpMessage({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull()
    const res = (await handleMcpMessage({ jsonrpc: '2.0', id: 9, method: 'foo' })) as { error: { code: number } }
    expect(res.error.code).toBe(-32601)
  })

  it('tools/list liệt kê đủ tool, mọi schema đóng (additionalProperties: false)', async () => {
    const res = (await handleMcpMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' })) as { result: { tools: { name: string }[] } }
    expect(res.result.tools.map((t) => t.name)).toEqual(MCP_TOOLS.map((t) => t.name))
    expect(MCP_TOOLS.map((t) => t.name)).toEqual(
      expect.arrayContaining(['build_excel', 'list_sheets', 'preview_sheet', 'outline', 'read_doc', 'convert_excel'])
    )
    for (const t of MCP_TOOLS) expect(t.inputSchema.additionalProperties).toBe(false)
  })
})

describe('MCP tools', () => {
  it('search_docs: hỏi tiếng Việt vẫn ra tài liệu tiếng Nhật, có tiêu đề trích dẫn', async () => {
    const res = await call('search_docs', { root: docs, query: 'mã khách hàng' })
    expect(res.result.isError).toBeUndefined()
    expect(res.result.content[0].text).toContain('=== TÀI LIỆU: SC001.md')
    expect(res.result.content[0].text).toContain('顧客コード')
  })

  // Windows không chặn đọc bằng chmod
  it.skipIf(process.platform === 'win32')('search_docs: một file không đọc được thì bỏ qua, không hỏng cả lượt tìm', async () => {
    const dir = join(tmp, 'broken')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'bad.md'), '# x\n')
    chmodSync(join(dir, 'bad.md'), 0o000)
    writeFileSync(join(dir, 'ok.md'), '# 顧客\n\n顧客コード\n')
    const res = await call('search_docs', { root: dir, query: 'khách hàng' })
    expect(res.result.isError).toBeUndefined()
    expect(res.result.content[0].text).toContain('ok.md')
  })

  it('list_docs đệ quy thư mục con', async () => {
    const res = await call('list_docs', { root: docs })
    expect(res.result.content[0].text.split('\n').sort()).toEqual(['SC001.md', 'sub/SC002.md'])
  })

  it('read_doc chỉ đọc file .md, đường dẫn tương đối bị từ chối', async () => {
    expect((await call('read_doc', { path: join(docs, 'SC001.md') })).result.content[0].text).toContain('顧客一覧')
    expect((await call('read_doc', { path: fixture })).result.isError).toBe(true)
    expect((await call('read_doc', { path: 'SC001.md' })).result.isError).toBe(true)
  })

  it('convert_excel ghi file .md có front-matter', async () => {
    const out = join(tmp, 'out')
    const res = await call('convert_excel', { files: [fixture], out_dir: out, front_matter: true })
    expect(res.result.isError).toBeUndefined()
    expect(readdirSync(out).some((f) => f.endsWith('.md'))).toBe(true)
  })

  it('convert_excel từ chối đường dẫn tương đối (tránh bị hiểu nhầm thành cờ CLI)', async () => {
    const res = await call('convert_excel', { files: ['--no-escape', fixture], out_dir: join(tmp, 'x') })
    expect(res.result.isError).toBe(true)
    expect(res.result.content[0].text).toContain('--no-escape')
  })

  it('convert_excel chỉ nhận file Excel (không đọc được file text bất kỳ)', async () => {
    const res = await call('convert_excel', { files: [join(docs, 'SC001.md')], out_dir: join(tmp, 'y') })
    expect(res.result.isError).toBe(true)
    expect(res.result.content[0].text).toContain('file Excel')
  })

  it('read_doc chia trang theo dòng, báo "dòng X–Y / N" và gợi ý offset tiếp', async () => {
    const big = join(tmp, 'big.md')
    writeFileSync(big, Array.from({ length: 2500 }, (_, i) => `line ${i + 1}`).join('\n') + '\n')
    const p1 = (await call('read_doc', { path: big })).result.content[0].text
    expect(p1).toMatch(/^line 1\n/)
    expect(p1).toContain('line 2000\n\n(dòng 1–2000 / 2500 — còn tiếp, gọi read_doc với offset=2001)')
    const p2 = (await call('read_doc', { path: big, offset: 2499, limit: 10 })).result.content[0].text
    expect(p2).toBe('line 2499\nline 2500\n\n(dòng 2499–2500 / 2500)')
    expect((await call('read_doc', { path: big, offset: 9999 })).result.isError).toBe(true)
    expect((await call('read_doc', { path: big, limit: 0 })).result.isError).toBe(true)
  })

  it('outline: heading kèm số dòng, bỏ heading trong khối code', async () => {
    const f = join(tmp, 'outline.md')
    writeFileSync(f, '# Tựa\n\ntext\n```\n# không phải heading\n```\n## 【項目定義】 ##\n')
    expect((await call('outline', { path: f })).result.content[0].text).toBe('1: # Tựa\n7: ## 【項目定義】')
    expect((await call('outline', { path: fixture })).result.isError).toBe(true)
  })

  it('list_sheets + preview_sheet trên kihon-sekkei.xlsx, không ghi file', async () => {
    const list = (await call('list_sheets', { path: fixture })).result
    expect(list.isError).toBeUndefined()
    const first = list.content[0].text.split('\n')[0].split('\t')
    expect(first[1]).toMatch(/^\d+ dòng$/)
    const prev = (await call('preview_sheet', { path: fixture, sheet: first[0] })).result
    expect(prev.isError).toBeUndefined()
    expect(prev.content[0].text.length).toBeGreaterThan(0)
    expect((await call('preview_sheet', { path: fixture, sheet: 'không-có' })).result.isError).toBe(true)
    expect((await call('list_sheets', { path: join(docs, 'SC001.md') })).result.isError).toBe(true)
    expect((await call('list_sheets', { path: 'kihon-sekkei.xlsx' })).result.isError).toBe(true)
  })

  it('build_excel: round trip đọc lại bằng SheetJS, từ chối ghi đè nếu thiếu overwrite', async () => {
    const out = join(tmp, 'Book.xlsx')
    const res = await call('build_excel', { files: [join(docs, 'SC001.md'), join(docs, 'sub', 'SC002.md')], out_path: out })
    expect(res.result.isError).toBeUndefined()
    expect(XLSX.read(readFileSync(out)).SheetNames.length).toBe(2)
    const again = await call('build_excel', { dir: docs, out_path: out })
    expect(again.result.isError).toBe(true)
    expect(again.result.content[0].text).toContain('đã tồn tại')
    expect((await call('build_excel', { dir: docs, out_path: out, overwrite: true })).result.isError).toBeUndefined()
  })

  it('build_excel từ chối file không phải .md, đường dẫn tương đối, dir là file', async () => {
    const out = join(tmp, 'Bad.xlsx')
    expect((await call('build_excel', { files: [fixture], out_path: out })).result.isError).toBe(true)
    expect((await call('build_excel', { files: ['SC001.md'], out_path: out })).result.isError).toBe(true)
    expect((await call('build_excel', { files: [join(docs, 'SC001.md')], out_path: 'Bad.xlsx' })).result.isError).toBe(true)
    expect((await call('build_excel', { dir: join(docs, 'SC001.md'), out_path: out })).result.isError).toBe(true)
    expect(existsSync(out)).toBe(false)
  })

  it('convert_excel nhận dir: bỏ ~$ và .txt, giữ thư mục con', async () => {
    const src = join(tmp, 'xin')
    mkdirSync(join(src, 'sub'), { recursive: true })
    copyFileSync(fixture, join(src, 'sub', 'k.xlsx'))
    writeFileSync(join(src, '~$x.xlsx'), 'lock')
    writeFileSync(join(src, 'a.txt'), 'x')
    const out = join(tmp, 'xout')
    const res = await call('convert_excel', { dir: src, out_dir: out, per_workbook: true })
    expect(res.result.isError).toBeUndefined()
    expect(readdirSync(out)).toEqual(['sub'])
    expect(readdirSync(join(out, 'sub'))).toEqual(['k.md'])
    expect((await call('convert_excel', { dir: fixture, out_dir: out })).result.isError).toBe(true)
  })

  it('thiếu tham số -> isError; tool lạ -> lỗi JSON-RPC -32602', async () => {
    expect((await call('search_docs', { root: docs })).result.content[0].text).toContain('query')
    expect(await call('nope', {})).toMatchObject({ error: { code: -32602 } })
  })

  it('protocolVersion lạ -> trả bản mới nhất hỗ trợ; batch (mảng) -> -32600', async () => {
    const res = (await handleMcpMessage({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: 'bogus-1999' } })) as {
      result: { protocolVersion: string }
    }
    expect(res.result.protocolVersion).toBe('2025-11-25')
    expect(await handleMcpMessage([{ jsonrpc: '2.0', id: 1, method: 'ping' }])).toMatchObject({ error: { code: -32600 } })
  })
})
