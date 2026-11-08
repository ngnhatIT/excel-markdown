/* MCP server (stdio, JSON-RPC 2.0): đưa converter + bộ tìm kiếm tài liệu cho Claude Code, Codex CLI, Claude Desktop, Cursor...
 * Các agent đó chạy bằng gói đăng ký của người dùng nên không cần API key trong app. Thuần, test được không cần Electron. */
import { isAbsolute } from 'node:path'
import { isMarkdownPath } from '../../../domain/guards'
import { collectRagDocuments, RAG_MAX_FILES } from '../../../domain/rag/collect'
import { buildRagContext } from '../../../domain/rag/retriever'
import { listMarkdownFiles, readMarkdownFile } from '../../outbound/mdFolder'
import { loadRagDocumentCached } from '../../outbound/ragDocCache'
import { runCli } from '../cli/cliCore'
import pkg from '../../../../../package.json'

const SERVER_INFO = { name: 'excel-markdown', version: pkg.version }

export const MCP_TOOLS = [
  {
    name: 'convert_excel',
    description:
      'Chuyển file Excel (.xlsx/.xlsm/.xls) sang Markdown, mỗi sheet một file (hoặc gộp cả workbook). Hiểu tài liệu 基本設計: banner, meta 画面ID/機能ID, bảng 項番, header 2 tầng, ô merge, ghi chú ※. Bật front_matter khi kết quả dùng cho AI/RAG.',
    inputSchema: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string' }, description: 'Đường dẫn tuyệt đối tới các file Excel' },
        out_dir: { type: 'string', description: 'Thư mục tuyệt đối để ghi file .md' },
        per_workbook: { type: 'boolean', description: 'Gộp mọi sheet của một file vào một .md' },
        front_matter: { type: 'boolean', description: 'Thêm YAML front-matter (file nguồn, sheet, meta)' },
        chunk_rows: { type: 'integer', minimum: 0, description: 'Tách bảng dài mỗi N dòng, lặp lại header (0 = tắt)' },
        range: { type: 'string', description: 'Chỉ convert vùng ô, vd A1:F40' },
      },
      required: ['files', 'out_dir'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_docs',
    description: 'Liệt kê mọi file Markdown (đệ quy) trong một thư mục tài liệu.',
    inputSchema: {
      type: 'object',
      properties: { root: { type: 'string', description: 'Thư mục tuyệt đối' } },
      required: ['root'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_docs',
    description:
      'Tìm trong thư mục tài liệu Markdown và trả về nguyên văn các file/mục liên quan nhất tới câu hỏi (BM25 + chữ Nhật 2-gram + từ điển Việt↔Nhật như "khách hàng"↔顧客). Thư mục nhỏ thì trả nguyên văn toàn bộ. Mỗi khối có tiêu đề "=== TÀI LIỆU: file | MỤC: ... ===" để trích dẫn.',
    inputSchema: {
      type: 'object',
      properties: {
        root: { type: 'string', description: 'Thư mục tuyệt đối chứa file .md' },
        query: { type: 'string', description: 'Câu hỏi hoặc từ khóa (Việt / Nhật / Anh)' },
        max_tokens: { type: 'integer', minimum: 4000, maximum: 250000, description: 'Ngữ cảnh tối đa trả về (mặc định 32000)' },
      },
      required: ['root', 'query'],
      additionalProperties: false,
    },
  },
  {
    name: 'read_doc',
    description: 'Đọc nguyên văn một file Markdown.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Đường dẫn tuyệt đối tới file .md' } },
      required: ['path'],
      additionalProperties: false,
    },
  },
]

type Args = Record<string, unknown>

const str = (a: Args, k: string): string => {
  const v = a[k]
  if (typeof v !== 'string' || v.trim() === '') throw new Error(`Thiếu tham số "${k}"`)
  return v
}
const absDir = (a: Args, k: string): string => {
  const v = str(a, k)
  if (!isAbsolute(v)) throw new Error(`"${k}" phải là đường dẫn tuyệt đối`)
  return v
}

async function callTool(name: string, a: Args): Promise<string> {
  switch (name) {
    case 'convert_excel': {
      const files = Array.isArray(a.files) ? a.files.filter((f): f is string => typeof f === 'string') : []
      if (files.length === 0) throw new Error('Thiếu tham số "files"')
      // Đường dẫn tuyệt đối không bao giờ bắt đầu bằng '-', nên không bị parseArgs hiểu nhầm thành cờ
      const rel = files.find((f) => !isAbsolute(f))
      if (rel !== undefined) throw new Error(`"files" phải là đường dẫn tuyệt đối: ${rel}`)
      const argv = [...files, '-o', absDir(a, 'out_dir')]
      if (a.per_workbook === true) argv.push('--per-workbook')
      if (a.front_matter === true) argv.push('--front-matter')
      if (typeof a.chunk_rows === 'number') argv.push('--chunk', String(a.chunk_rows))
      if (typeof a.range === 'string' && a.range.trim()) argv.push('--range', a.range)
      const logs: string[] = []
      const code = runCli(argv, (s) => logs.push(s))
      if (code !== 0) throw new Error('Có file lỗi:\n' + logs.join('\n'))
      return `Đã ghi ${logs.length} file vào ${a.out_dir}:\n` + logs.join('\n')
    }
    case 'list_docs': {
      const { files, truncated } = await listMarkdownFiles(absDir(a, 'root'))
      return files.join('\n') + (truncated ? '\n(…danh sách bị cắt bớt)' : '') || '(không có file Markdown)'
    }
    case 'search_docs': {
      const root = absDir(a, 'root')
      const query = str(a, 'query')
      const maxTokens = typeof a.max_tokens === 'number' ? Math.min(250_000, Math.max(4_000, a.max_tokens)) : undefined
      const { files } = await listMarkdownFiles(root, RAG_MAX_FILES)
      const { docs } = await collectRagDocuments({ question: query, scope: 'folder', rootDir: root, relFiles: files }, loadRagDocumentCached)
      const ctx = buildRagContext(docs, query, { scope: 'folder', maxContextTokens: maxTokens })
      if (!ctx.contextText) return 'Không tìm thấy nội dung Markdown nào trong thư mục.'
      const how = ctx.mode === 'parent-rag' ? 'các file khớp nhất' : 'toàn bộ thư mục'
      return `(${how}: ${ctx.docCount} file, ~${ctx.tokensEst} token)\n\n${ctx.contextText}`
    }
    case 'read_doc': {
      const path = str(a, 'path')
      if (!isAbsolute(path) || !isMarkdownPath(path)) throw new Error('"path" phải là đường dẫn tuyệt đối tới file .md/.markdown')
      return readMarkdownFile(path)
    }
    default:
      throw new Error('Không có tool: ' + name)
  }
}

interface RpcMessage {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: { protocolVersion?: string; name?: string; arguments?: Args }
}

const ok = (id: RpcMessage['id'], result: unknown): Record<string, unknown> => ({ jsonrpc: '2.0', id, result })
const fail = (id: RpcMessage['id'], code: number, message: string): Record<string, unknown> => ({
  jsonrpc: '2.0',
  id: id ?? null,
  error: { code, message },
})

/** Xử lý một message JSON-RPC; trả về null với notification (không có id). */
export async function handleMcpMessage(raw: unknown): Promise<Record<string, unknown> | null> {
  if (!raw || typeof raw !== 'object') return fail(null, -32600, 'Invalid Request')
  const msg = raw as RpcMessage
  if (msg.id === undefined) return null
  switch (msg.method) {
    case 'initialize':
      return ok(msg.id, {
        protocolVersion: msg.params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      })
    case 'ping':
      return ok(msg.id, {})
    case 'tools/list':
      return ok(msg.id, { tools: MCP_TOOLS })
    case 'tools/call':
      try {
        const text = await callTool(msg.params?.name ?? '', msg.params?.arguments ?? {})
        return ok(msg.id, { content: [{ type: 'text', text }] })
      } catch (err) {
        return ok(msg.id, { content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }], isError: true })
      }
    default:
      return fail(msg.id, -32601, 'Method not found: ' + msg.method)
  }
}
