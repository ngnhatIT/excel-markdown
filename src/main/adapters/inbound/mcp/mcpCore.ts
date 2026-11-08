/* MCP server (stdio, JSON-RPC 2.0): đưa converter + bộ tìm kiếm tài liệu cho Claude Code, Codex CLI, Claude Desktop, Cursor...
 * Các agent đó chạy bằng gói đăng ký của người dùng nên không cần API key trong app. Thuần, test được không cần Electron. */
import { isAbsolute } from 'node:path'
import { DEFAULT_OPTIONS } from '../../../../shared/types'
import { convertSheetInWorkbook, listSheetsInWorkbook } from '../../../domain/excel/converter'
import { isExcelPath, isMarkdownPath, isOpenableDirectory } from '../../../domain/guards'
import { collectRagDocuments, RAG_MAX_FILES } from '../../../domain/rag/collect'
import { buildRagContext } from '../../../domain/rag/retriever'
import { listMarkdownFiles, readMarkdownFile } from '../../outbound/mdFolder'
import { loadRagDocumentCached } from '../../outbound/ragDocCache'
import { readWorkbook } from '../../outbound/xlsxFiles'
import { buildExcel, runCli } from '../cli/cliCore'
import pkg from '../../../../../package.json'

const SERVER_INFO = { name: 'excel-markdown', version: pkg.version }

/** Số dòng mặc định mỗi lần read_doc. */
const READ_DOC_LIMIT = 2000
/** preview_sheet dài hơn thì cắt (ảnh nhúng data: có thể rất lớn). */
const PREVIEW_MAX_CHARS = 200_000

export const MCP_TOOLS = [
  {
    name: 'convert_excel',
    description:
      'Chuyển file Excel (.xlsx/.xlsm/.xls) sang Markdown, mỗi sheet một file (hoặc gộp cả workbook). Hiểu tài liệu 基本設計: banner, meta 画面ID/機能ID, bảng 項番, header 2 tầng, ô merge, ghi chú ※. Bật front_matter khi kết quả dùng cho AI/RAG. Cần "files" hoặc "dir" (hoặc cả hai).',
    inputSchema: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string' }, description: 'Đường dẫn tuyệt đối tới các file Excel' },
        dir: { type: 'string', description: 'Thư mục tuyệt đối: convert mọi file Excel bên trong (đệ quy, giữ cấu trúc thư mục con ở out_dir)' },
        out_dir: { type: 'string', description: 'Thư mục tuyệt đối để ghi file .md' },
        per_workbook: { type: 'boolean', description: 'Gộp mọi sheet của một file vào một .md' },
        front_matter: { type: 'boolean', description: 'Thêm YAML front-matter (file nguồn, sheet, meta)' },
        chunk_rows: { type: 'integer', minimum: 0, description: 'Tách bảng dài mỗi N dòng, lặp lại header (0 = tắt)' },
        range: { type: 'string', description: 'Chỉ convert vùng ô, vd A1:F40' },
      },
      required: ['out_dir'],
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
    description: `Đọc nguyên văn một file Markdown theo trang (mặc định ${READ_DOC_LIMIT} dòng). Cuối kết quả ghi "dòng X–Y / N"; còn dòng thì gọi lại với offset tiếp theo. Dùng "outline" trước để nhảy tới đúng mục.`,
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Đường dẫn tuyệt đối tới file .md' },
        offset: { type: 'integer', minimum: 1, description: 'Dòng bắt đầu (tính từ 1, mặc định 1)' },
        limit: { type: 'integer', minimum: 1, description: `Số dòng tối đa (mặc định ${READ_DOC_LIMIT})` },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'outline',
    description: 'Mục lục của một file Markdown: các heading (#…######) kèm số dòng, bỏ qua heading trong khối code. Dùng với offset của read_doc.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Đường dẫn tuyệt đối tới file .md' } },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_sheets',
    description: 'Liệt kê sheet của một file Excel: tên, số dòng có dữ liệu, sheet ẩn. Không ghi gì.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Đường dẫn tuyệt đối tới file Excel' } },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'preview_sheet',
    description: `Xem trước Markdown của một sheet Excel (cùng engine với convert_excel), không ghi file. Kết quả dài hơn ${PREVIEW_MAX_CHARS} ký tự bị cắt.`,
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Đường dẫn tuyệt đối tới file Excel' },
        sheet: { type: 'string', description: 'Tên sheet (lấy từ list_sheets)' },
      },
      required: ['path', 'sheet'],
      additionalProperties: false,
    },
  },
  {
    name: 'build_excel',
    description:
      'Gộp các file Markdown thành một file Excel (.xlsx) bố cục tài liệu 基本設計 (mỗi file / `##` / `---` thành sheet). Thư mục thì lấy mọi .md bên trong theo thứ tự đường dẫn. File đích đã có thì từ chối, trừ khi overwrite: true. Cần "files" hoặc "dir".',
    inputSchema: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string' }, description: 'Đường dẫn tuyệt đối tới các file .md, theo thứ tự sheet' },
        dir: { type: 'string', description: 'Thư mục tuyệt đối chứa file .md (đệ quy)' },
        out_path: { type: 'string', description: 'Đường dẫn tuyệt đối file .xlsx sẽ ghi' },
        overwrite: { type: 'boolean', description: 'Cho phép ghi đè file đã có (mặc định false)' },
      },
      required: ['out_path'],
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
const strList = (a: Args, k: string): string[] => {
  const v = a[k]
  return Array.isArray(v) ? v.filter((f): f is string => typeof f === 'string') : []
}
/** Tham số `dir` (tuỳ chọn): phải là thư mục tuyệt đối đang tồn tại. Không kiểm thì một file bất kỳ
 * (vd ~/.ssh/...) truyền vào `dir` sẽ bị đọc như một file đầu vào. */
const optDir = async (a: Args): Promise<string[]> => {
  if (a.dir === undefined) return []
  const dir = absDir(a, 'dir')
  if (!(await isOpenableDirectory(dir))) throw new Error('"dir" phải là thư mục tuyệt đối đang tồn tại: ' + dir)
  return [dir]
}
const posInt = (a: Args, k: string, def: number): number => {
  const v = a[k]
  if (v === undefined) return def
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) throw new Error(`"${k}" phải là số nguyên >= 1`)
  return v
}
const mdPath = (a: Args): string => {
  const path = str(a, 'path')
  if (!isMarkdownPath(path)) throw new Error('"path" phải là đường dẫn tuyệt đối tới file .md/.markdown')
  return path
}
const excelPath = (a: Args): string => {
  const path = str(a, 'path')
  // SheetJS đọc được cả file text: chỉ nhận đuôi Excel
  if (!isExcelPath(path)) throw new Error('"path" phải là đường dẫn tuyệt đối tới file Excel (.xlsx/.xlsm/.xls)')
  return path
}
const splitLines = (text: string): string[] => {
  const lines = text.split(/\r?\n/)
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

/** Heading ATX dạng "dòng: ## tiêu đề" (dòng tính từ 1); bỏ dòng trong khối code ``` / ~~~. */
export function markdownOutline(text: string): string[] {
  const out: string[] = []
  let fence = ''
  splitLines(text).forEach((line, i) => {
    const f = /^ {0,3}(`{3,}|~{3,})/.exec(line)
    if (f) {
      if (!fence) fence = f[1]
      else if (f[1][0] === fence[0] && f[1].length >= fence.length) fence = ''
      return
    }
    if (fence) return
    const h = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/.exec(line)
    if (h) out.push(`${i + 1}: ${h[1]} ${h[2]}`)
  })
  return out
}

async function callTool(name: string, a: Args): Promise<string> {
  switch (name) {
    case 'convert_excel': {
      const files = strList(a, 'files')
      // Đường dẫn tuyệt đối không bao giờ bắt đầu bằng '-', nên không bị parseArgs hiểu nhầm thành cờ
      // Chỉ file Excel: SheetJS đọc được cả file text, không chặn thì tool đọc được file bất kỳ (vd ~/.ssh/...)
      const bad = files.find((f) => !isExcelPath(f))
      if (bad !== undefined) throw new Error(`"files" phải là đường dẫn tuyệt đối tới file Excel (.xlsx/.xlsm/.xls): ${bad}`)
      // Thư mục: runCli chỉ lấy file có đuôi Excel bên trong
      const inputs = [...files, ...(await optDir(a))]
      if (inputs.length === 0) throw new Error('Thiếu tham số "files" hoặc "dir"')
      const argv = [...inputs, '-o', absDir(a, 'out_dir')]
      if (a.per_workbook === true) argv.push('--per-workbook')
      if (a.front_matter === true) argv.push('--front-matter')
      if (typeof a.chunk_rows === 'number') argv.push('--chunk', String(a.chunk_rows))
      if (typeof a.range === 'string' && a.range.trim()) argv.push('--range', a.range)
      const logs: string[] = []
      const code = await runCli(argv, (s) => logs.push(s))
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
      const path = mdPath(a)
      const offset = posInt(a, 'offset', 1)
      const limit = posInt(a, 'limit', READ_DOC_LIMIT)
      const lines = splitLines(await readMarkdownFile(path))
      const n = lines.length
      if (offset > n) throw new Error(`"offset" (${offset}) vượt quá số dòng của file (${n})`)
      const end = Math.min(n, offset - 1 + limit)
      const more = end < n ? ` — còn tiếp, gọi read_doc với offset=${end + 1}` : ''
      return `${lines.slice(offset - 1, end).join('\n')}\n\n(dòng ${offset}–${end} / ${n}${more})`
    }
    case 'outline':
      return markdownOutline(await readMarkdownFile(mdPath(a))).join('\n') || '(không có heading)'
    case 'list_sheets': {
      const sheets = listSheetsInWorkbook(readWorkbook(excelPath(a)), false)
      return sheets.map((s) => `${s.name}\t${s.rows} dòng${s.hidden ? '\t(ẩn)' : ''}`).join('\n') || '(không có sheet)'
    }
    case 'preview_sheet': {
      const path = excelPath(a)
      const md = convertSheetInWorkbook(readWorkbook(path), str(a, 'sheet'), DEFAULT_OPTIONS)
      if (md.length <= PREVIEW_MAX_CHARS) return md
      return md.slice(0, PREVIEW_MAX_CHARS) + `\n\n(…đã cắt: ${md.length} ký tự, chỉ hiện ${PREVIEW_MAX_CHARS}. Dùng convert_excel để lấy đủ.)`
    }
    case 'build_excel': {
      const files = strList(a, 'files')
      // Chỉ file .md (mdHandler cũng kiểm; chặn sớm để báo lỗi rõ)
      const bad = files.find((f) => !isMarkdownPath(f))
      if (bad !== undefined) throw new Error(`"files" phải là đường dẫn tuyệt đối tới file .md/.markdown: ${bad}`)
      const inputs = [...files, ...(await optDir(a))]
      if (inputs.length === 0) throw new Error('Thiếu tham số "files" hoặc "dir"')
      const out = absDir(a, 'out_path')
      if (!/\.xlsx$/i.test(out)) throw new Error('"out_path" phải có đuôi .xlsx')
      const res = await buildExcel(inputs, out, a.overwrite === true)
      return `Đã ghi ${res.outPath} (${res.sheets.length} sheet):\n` + res.sheets.join('\n')
    }
    default:
      throw new UnknownToolError('Không có tool: ' + name)
  }
}

class UnknownToolError extends Error {}

/** Phiên bản giao thức MCP hỗ trợ, mới nhất ở cuối. */
const PROTOCOL_VERSIONS = ['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25']

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
  // Batch (mảng) không hỗ trợ: phải trả lỗi, im lặng thì client chờ mãi
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail(null, -32600, 'Invalid Request')
  const msg = raw as RpcMessage
  if (msg.id === undefined) return null
  switch (msg.method) {
    case 'initialize':
      return ok(msg.id, {
        // Client xin phiên bản lạ -> trả phiên bản mới nhất mình hỗ trợ (spec MCP), không lặp lại bản lạ
        protocolVersion: PROTOCOL_VERSIONS.includes(msg.params?.protocolVersion ?? '')
          ? msg.params?.protocolVersion
          : PROTOCOL_VERSIONS[PROTOCOL_VERSIONS.length - 1],
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
        if (err instanceof UnknownToolError) return fail(msg.id, -32602, err.message)
        return ok(msg.id, { content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }], isError: true })
      }
    default:
      return fail(msg.id, -32601, 'Method not found: ' + msg.method)
  }
}
