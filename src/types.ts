/* Shared types between main, preload and renderer */

export type VerticalMergeMode = 'repeat' | 'empty' | 'ditto'

export interface ConvertOptions {
  /** Them "## Ten sheet" truoc moi sheet */
  includeSheetTitle: boolean
  /** Bo qua sheet ten bat dau bang DEL_ */
  skipDelSheets: boolean
  /** Bo qua sheet rong */
  skipEmptySheets: boolean
  /** O nhieu dong: 'br' -> <br>, 'space' -> gop 1 dong */
  multiline: 'br' | 'space'
  /** Nhận diện bảng 2 cột (mặc định tắt để giữ hành vi cũ trên tài liệu 基本設計) */
  detectTwoColTables: boolean
  /** Escape ký tự Markdown/HTML trong ô (`<null>`, `*x*`, `# x`...) để bản render
   * hiển thị đúng nội dung ô. Tắt khi ô Excel cố ý chứa cú pháp Markdown. */
  escapeMarkdown: boolean
  /** Chỉ convert vùng này của mỗi sheet (vd `A1:F40`); rỗng/không hợp lệ = cả sheet */
  range: string
  /** Ô công thức: thêm `=công thức` dạng code cạnh giá trị cache */
  showFormulas: boolean
  /** Thêm YAML front-matter (file nguồn, sheet) đầu file .md — tiện cho RAG/LLM */
  frontMatter: boolean
  /** Bảng dài hơn N dòng thì tách khối, lặp lại header (0 = tắt) */
  chunkRows: number
  /** Cách xử lý ô gộp dọc (vertical merge): lặp lại giá trị ('repeat'), để trống ('empty'), hoặc ký hiệu '↑' ('ditto') */
  verticalMerge?: VerticalMergeMode
  /** Căn thẳng độ rộng cột trong mã nguồn bảng Markdown */
  alignTables?: boolean
}

export const DEFAULT_OPTIONS: ConvertOptions = {
  includeSheetTitle: true,
  skipDelSheets: true,
  skipEmptySheets: true,
  multiline: 'br',
  detectTwoColTables: false,
  escapeMarkdown: true,
  range: '',
  showFormulas: false,
  frontMatter: false,
  chunkRows: 0,
  verticalMerge: 'repeat',
  alignTables: false,
}

export type OutputMode = 'per-sheet' | 'per-workbook'

export interface SheetInfo {
  name: string
  rows: number
  checked: boolean
  /** Sheet bị ẩn trong Excel */
  hidden: boolean
}

export interface FileItem {
  id: string
  path: string
  name: string
  sheets: SheetInfo[]
  loading: boolean
  error?: string
}

export interface ConvertFileSpec {
  path: string
  sheets: string[]
}

export interface ConvertResultItem {
  fileName: string
  ok: boolean
  /** File chưa convert vì người dùng bấm Hủy */
  cancelled?: boolean
  filesWritten: string[]
  error?: string
}

export interface ApiResult<T> {
  ok: boolean
  data?: T
  error?: string
}

/** Chế độ làm việc của app: Excel → Markdown (mặc định), Markdown → Excel hoặc Đọc Markdown. */
export type AppMode = 'excel2md' | 'md2excel' | 'mdview'

/** Các file Markdown trong một thư mục (chế độ Đọc Markdown). */
export interface MdFolderListing {
  /** Thư mục gốc (đường dẫn tuyệt đối) */
  root: string
  /** Đường dẫn tương đối từ `root`, phân cách `/` */
  files: string[]
  /** mtime (ms) theo đường dẫn tương đối trong `files`; file không stat được thì thiếu khóa */
  mtimes: Record<string, number>
  /** Quá nhiều file nên dừng quét giữa chừng */
  truncated: boolean
}

/** Kết quả đọc nhanh một file Markdown (preview + danh sách sheet sẽ tạo). */
export interface MdInspectResult {
  /** `# tiêu đề` đầu file (dùng cho tên file Excel mặc định); null nếu không có */
  title: string | null
  /** Tên sheet đã hợp lệ/không trùng trong riêng file này */
  sheets: string[]
  /** Nội dung Markdown nguyên văn để hiển thị preview */
  markdown: string
}

/** Một file trong danh sách chế độ Markdown → Excel (thứ tự danh sách = thứ tự sheet). */
export interface MdFileItem {
  id: string
  path: string
  name: string
  /** Đang đọc nhanh file (inspectMarkdown) */
  loading: boolean
  error?: string
  /** `# tiêu đề` đầu file; null nếu không có */
  title: string | null
  /** Tên sheet sẽ tạo từ file này */
  sheets: string[]
  /** Nội dung nguyên văn để preview */
  markdown: string
}

/** Kết quả Markdown → Excel. `declined`: người dùng chọn không ghi đè file đã có. */
export type MdConvertResult =
  | { status: 'done'; outPath: string; sheets: string[] }
  | { status: 'cancelled' }
  | { status: 'declined' }

/* --------------------------- Trợ lý AI (RAG, nhiều nhà cung cấp) --------------------------- */

export type AiModelId = string
export type AiProvider = 'gemini' | 'claude' | 'openai'
export const AI_PROVIDER_IDS: AiProvider[] = ['gemini', 'claude', 'openai']

/** Thông tin hiển thị + model mặc định của từng nhà cung cấp (danh sách đầy đủ lấy từ API bằng nút ↻). */
export const AI_PROVIDERS: Record<AiProvider, { label: string; defaultModel: AiModelId; suggested: AiModelId[]; keyHint: string; site: string }> = {
  gemini: {
    label: 'Gemini',
    defaultModel: 'gemini-2.5-flash',
    suggested: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    keyHint: 'Dán Gemini API Key (AIza...)',
    site: 'aistudio.google.com',
  },
  claude: {
    label: 'Claude',
    defaultModel: 'claude-opus-5-5',
    suggested: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'],
    keyHint: 'Dán Claude API Key (sk-ant-...)',
    site: 'console.anthropic.com',
  },
  openai: {
    label: 'OpenAI / Codex',
    defaultModel: 'gpt-5',
    suggested: ['gpt-5'],
    keyHint: 'Dán OpenAI API Key (sk-...)',
    site: 'platform.openai.com',
  },
}

export const DEFAULT_AI_MODEL: AiModelId = AI_PROVIDERS.gemini.defaultModel
export const DEFAULT_AI_PROVIDER: AiProvider = 'gemini'
/** Mức ngữ cảnh tối đa mỗi câu hỏi (token ước lượng): càng lớn càng ít sót nhưng càng tốn tiền. */
export const AI_CONTEXT_LEVELS = [32_000, 120_000, 250_000] as const
export type AiScope = 'folder' | 'active'

export interface RagCitation {
  filePath: string
  relPath: string
  sheetName: string
  sectionTitle: string
}

export interface AiChatTurn {
  role: 'user' | 'model'
  text: string
}

export interface AiConfigInfo {
  provider: AiProvider
  hasKey: boolean
  maskedKey: string
  model: AiModelId
  contextTokens: number
  /** Key đã che của từng nhà cung cấp ('' = chưa có) */
  keys: Record<AiProvider, string>
}

export interface AiSetConfigPayload {
  provider?: AiProvider
  apiKey?: string
  model?: AiModelId
  contextTokens?: number
}

export interface AiAskRequest {
  question: string
  scope: AiScope
  provider?: AiProvider
  model?: AiModelId
  rootDir?: string | null
  relFiles?: string[]
  looseFiles?: string[]
  activeFilePath?: string | null
  activeMarkdown?: string
  pastedMarkdown?: string | null
  history?: AiChatTurn[]
}

export interface AiUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  /** Số token đầu vào đọc từ cache của nhà cung cấp (rẻ hơn nhiều) */
  cachedTokens?: number
}

export interface AiAskResponse {
  answer: string
  citations: RagCitation[]
  mode: 'full-active' | 'full-folder' | 'parent-rag'
  docCount: number
  usage?: AiUsage
}
