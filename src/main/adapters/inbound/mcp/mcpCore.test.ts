import { chmodSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
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

  it('tools/list liệt kê đủ 4 tool', async () => {
    const res = (await handleMcpMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' })) as { result: { tools: { name: string }[] } }
    expect(res.result.tools.map((t) => t.name)).toEqual(MCP_TOOLS.map((t) => t.name))
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

  it('tool lạ hoặc thiếu tham số -> isError, không ném', async () => {
    expect((await call('nope', {})).result.isError).toBe(true)
    expect((await call('search_docs', { root: docs })).result.content[0].text).toContain('query')
  })
})
