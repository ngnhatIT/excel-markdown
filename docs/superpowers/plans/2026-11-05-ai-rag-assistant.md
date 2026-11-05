# Trợ lý AI (Gemini RAG) & Nâng cấp Chuẩn AI/RAG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tích hợp khung Trợ lý AI (Gemini RAG) vào cột bên phải của chế độ Đọc Markdown (hỏi đáp đa file ưu tiên chất lượng, trích dẫn bấm được nhảy tới đúng mục/bảng, dịch/tóm tắt nhanh, nén token không mất dữ liệu) và nâng cấp preset AI/RAG ở chiều Excel → Markdown.

**Architecture:** Toàn bộ xử lý RAG (`chunker.ts`, `glossary.ts`, `retriever.ts`), cache tài liệu theo `mtime`, lưu trữ API key (`safeStorage`) và gọi HTTPS tới Gemini API (`geminiClient.ts`) nằm ở tiến trình `main` (thuần TypeScript, 0 thêm dependency ngoài, giữ nguyên CSP chặn mạng ở `renderer`). Chế độ Đọc Markdown dùng `AiChatPanel` ở cột phải (dựa trên `SidePanel` sẵn có) và kết nối với `PreviewPane` để mở file + cuộn tới đúng heading/bảng khi bấm trích dẫn.

**Tech Stack:** Electron 44, React 18, TypeScript 5.7, marked, vitest (`npm test`).

**Spec:** `docs/superpowers/specs/2026-11-05-ai-rag-assistant-design.md`

## Global Constraints

- Không thêm bất kỳ dependency mới nào vào `package.json` (dùng `fetch` của Node 20+ trong `main` và `safeStorage` của Electron).
- Giữ nguyên tuyệt đối byte-for-byte các golden test mặc định (`test/golden/*.md`, `test/golden-md2xlsx/*.json`) khi `options.frontMatter` ở mặc định (`false`).
- Bảo mật API Key: Không bao giờ trả raw API Key về renderer (renderer chỉ nhận `hasKey: boolean`, `maskedKey: string`, `model: AiModelId`) và mọi thông báo lỗi/log phải đi qua `redactApiKey` để xóa `?key=...` và chuỗi API key.
- Ưu tiên chất lượng trả lời:
  - Không cắt ngang bảng hay lược bỏ bảng lịch sử `版数` / ghi chú `※` khi nén lossless.
  - Khi `scope === 'active'`, luôn gửi 100% `fullContent` của file đang xem (trừ khi file đơn lẻ vượt quá `60_000` tokens ước lượng).
  - Khi `scope === 'folder'` và tổng `tokensEst` của mọi file đang mở `<= 32_000`, luôn gửi 100% toàn văn tất cả các file (`mode: 'full-folder'`).
  - Khi `scope === 'folder'` và tổng `tokensEst > 32_000`, dùng cơ chế `parent-rag`: đính kèm Sơ đồ danh mục thư mục + nạp nguyên vẹn `fullContent` của các file điểm cao nhất rồi tới các `RagSection` liên quan trong trần `32_000` tokens.
- Lịch sử hội thoại gửi kèm tối đa 6 lượt hỏi–đáp gần nhất (`12` messages), không lặp lại khối `<context>` của các lượt cũ.
- Comment và chuỗi giao diện bằng tiếng Việt, đồng bộ với code hiện có.

## Review Focus

- Lỗi mạng hoặc lỗi Gemini API (400/403 API key sai, 429 hết quota) có chứa URL kèm `?key=AIza...`: `redactApiKey` phải xóa sạch key khỏi chuỗi lỗi trước khi ghi `error.log` hoặc hiển thị lên UI.
- Bấm trích dẫn của một file khác với file đang mở trong `PreviewPane`: phải đợi file mới nạp xong (`viewer.doc.path` khớp file trích dẫn và `loading === false`) rồi mới cuộn tới heading/bảng.
- File Markdown không có bất kỳ heading `##` hay `###` nào, hoặc file rỗng / chỉ có khoảng trắng: `parseMarkdownForRag` vẫn tạo được 1 section mặc định `'Tổng quan'` mà không crash hay chia cho 0 trong BM25.
- Người dùng bấm nút **Dừng** (hoặc gửi câu hỏi mới) khi câu hỏi trước đang chờ Gemini phản hồi: `AbortController` hủy ngay request cũ, không ghi đè câu trả lời cũ lên lượt mới.
- Sheet Excel thông thường không có banner `基本設計` và không có `META_LABELS`: `frontMatter({ source, sheet })` giữ nguyên đầu ra 2 dòng `source` và `sheet` như cũ để không làm gãy unit test hiện có.

---

### Task 1: Nâng cấp Preset `AI / RAG` — Làm giàu YAML Front-matter & Hiển thị trong Xem trước

**Files:**
- Modify: `src/main/output.ts`, `src/main/converter.ts`, `src/main/workerHandler.ts`, `src/main/index.ts`, `src/main/cliCore.ts`
- Test: `src/main/proOptions.test.ts`, `src/main/workerHandler.test.ts`

**Interfaces:**
- Produces:
  - Trong `src/main/output.ts`: `export type FrontMatterValue = string | string[] | Record<string, string>` và mở rộng `frontMatter(fields: Record<string, FrontMatterValue>): string` (bỏ qua các khóa có giá trị `undefined` hoặc object rỗng).
  - Trong `src/main/converter.ts`: `export function extractSheetMeta(ws: WorkSheet, sheetName: string): { title?: string; meta?: Record<string, string> }` (lấy `title` từ dòng banner `基本設計` nếu khác `sheetName`, và gom các cặp `META_LABELS` đầu sheet thành `Record<string, string>`).
  - Trong `src/main/converter.ts`: `SheetResult` trong `src/main/output.ts` thêm trường tùy chọn `title?: string` và `meta?: Record<string, string>`, được gán trong `convertSheetsInWorkbook`.
  - Trong `src/main/workerHandler.ts`: nhánh `case 'preview'` khi `req.options.frontMatter === true` trả về `frontMatter({ source: basename(req.path), sheet: req.sheet, ...extractSheetMeta(ws, req.sheet) }) + md`.

- [ ] **Step 1: Write the failing test** trong `src/main/proOptions.test.ts` và `src/main/workerHandler.test.ts`

Thêm vào `src/main/proOptions.test.ts`:
```ts
import { extractSheetMeta } from './converter'

describe('extractSheetMeta & enriched frontMatter', () => {
  it('trích xuất title từ banner 基本設計 và các cặp META_LABELS', () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['基本設計', '画面項目定義書（顧客一覧）'],
      ['機能ID', 'FN01', '画面ID', 'SC001'],
      ['No', '項目名', '型'],
      ['1', '顧客コード', 'VARCHAR'],
    ])
    expect(extractSheetMeta(ws, '顧客一覧')).toEqual({
      title: '画面項目定義書（顧客一覧）',
      meta: { 機能ID: 'FN01', 画面ID: 'SC001' },
    })
  })

  it('sheet bảng thường không có banner/meta -> trả object rỗng, frontMatter giữ nguyên 2 dòng', () => {
    const extra = extractSheetMeta(grid(), 'S')
    expect(extra).toEqual({})
    expect(frontMatter({ source: 'a.xlsx', sheet: 'S', ...extra })).toBe(
      '---\nsource: "a.xlsx"\nsheet: "S"\n---\n\n'
    )
  })
})
```
Và thêm test vào `src/main/workerHandler.test.ts` kiểm tra request `preview` với `options: { ...DEFAULT_OPTIONS, frontMatter: true }` trả về chuỗi bắt đầu bằng `---\nsource: `.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/proOptions.test.ts src/main/workerHandler.test.ts`
Expected: FAIL (`extractSheetMeta is not a function` và `preview` thiếu `---`).

- [ ] **Step 3: Implement `extractSheetMeta` và gắn `frontMatter` vào `preview` / `convert` / `cliCore`**

1. Trong `src/main/output.ts`: mở rộng `frontMatter` nhận `Record<string, FrontMatterValue | undefined>`, bỏ qua các entry có `v === undefined` hoặc object rỗng `{}`.
2. Trong `src/main/converter.ts`: cài đặt `extractSheetMeta(ws, sheetName)` đọc `sheetToGrid(ws, false)`, kiểm tra dòng đầu nếu có `DOC_KIND` (`基本設計`) thì lấy `title`, quét các dòng `isMetaRow` lấy `parseMetaPairs` gán vào `meta`. Gắn `...extractSheetMeta(ws, sn)` vào từng phần tử `SheetResult` trong `convertSheetsInWorkbook`.
3. Trong `src/main/workerHandler.ts`: ở `case 'preview'`, nếu `req.options.frontMatter` bật thì ghép `frontMatter({ source: basename(req.path), sheet: req.sheet, ...extractSheetMeta(wb.Sheets[req.sheet], req.sheet) })` vào trước kết quả `convertSheetInWorkbook` (nếu kết quả khác rỗng).
4. Trong `src/main/index.ts` (nhánh `per-sheet`) và `src/main/cliCore.ts`: truyền thêm `title: s.title, meta: s.meta` vào `frontMatter({ source: ..., sheet: s.sheet, title: s.title, meta: s.meta })`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/proOptions.test.ts src/main/workerHandler.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/output.ts src/main/converter.ts src/main/workerHandler.ts src/main/index.ts src/main/cliCore.ts src/main/proOptions.test.ts src/main/workerHandler.test.ts
git commit -m "feat(rag): enrich YAML front-matter with spec metadata and show in preview"
```

---

### Task 2: Bộ phân tích tài liệu Markdown & Nén không mất dữ liệu (`src/main/rag/chunker.ts`)

**Files:**
- Create: `src/main/rag/chunker.ts`
- Test: `src/main/rag/chunker.test.ts`

**Interfaces:**
- Produces:
  - `export interface RagSection { id: string; filePath: string; relPath: string; sheetName: string; sectionTitle: string; metaHeader: string; content: string; tokensEst: number }`
  - `export interface RagDocument { filePath: string; relPath: string; mtime: number; metaHeader: string; outline: string[]; fullContent: string; tokensEst: number; sections: RagSection[] }`
  - `export function estimateTokens(text: string): number` (`Math.max(1, Math.ceil(text.length / 3))` cho chuỗi không rỗng, `0` cho chuỗi rỗng)
  - `export function compressMarkdownLossless(md: string): string`
  - `export function parseMarkdownForRag(filePath: string, relPath: string, rawMd: string, mtime = 0): RagDocument`

- [ ] **Step 1: Write the failing test** trong `src/main/rag/chunker.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { compressMarkdownLossless, parseMarkdownForRag } from './chunker'

describe('compressMarkdownLossless', () => {
  it('thu gọn khoảng trắng căn cột bảng và dòng trống thừa nhưng giữ nguyên 100% dữ liệu, bảng 版数 và ghi chú ※', () => {
    const raw = [
      '## 顧客一覧',
      '',
      '',
      '> 基本設計：画面項目定義書',
      '',
      '| 版数   | 作成日     | 作成者   |',
      '| ------ | ---------- | -------- |',
      '| 1.0    | 2026/10/01 | 山田     |',
      '',
      '- **機能ID**: FN01',
      '- **画面ID**: SC001',
      '',
      '### 【項目定義】',
      '| No   | 項目名       | 必須 |',
      '| ---- | ------------ | ---- |',
      '| 1    | 顧客コード   | ○    |',
      '',
      '> ※ 必須項目は○で示す',
    ].join('\n')

    const compressed = compressMarkdownLossless(raw)
    expect(compressed).toContain('| 版数 | 作成日 | 作成者 |\n|---|---|---|\n| 1.0 | 2026/10/01 | 山田 |')
    expect(compressed).toContain('| No | 項目名 | 必須 |\n|---|---|---|\n| 1 | 顧客コード | ○ |')
    expect(compressed).toContain('> ※ 必須項目は○で示す')
    expect(compressed).not.toContain('\n\n\n')
    expect(compressed.length).toBeLessThan(raw.length)
  })
})

describe('parseMarkdownForRag', () => {
  it('trích xuất metaHeader, outline và tách các RagSection theo ## / ### mà không cắt bảng', () => {
    const md = [
      '---',
      'source: "spec.xlsx"',
      'sheet: "SC001"',
      '---',
      '## SC001_顧客一覧',
      '> 基本設計：画面項目定義書',
      '- **機能ID**: FN01',
      '- **画面ID**: SC001',
      '### 【項目定義】',
      '| No | 項目名 |',
      '|---|---|',
      '| 1 | 顧客コード |',
      '### 【イベント定義】',
      '| No | イベント名 |',
      '|---|---|',
      '| 1 | 検索ボタン押下 |',
    ].join('\n')

    const doc = parseMarkdownForRag('/abs/SC001.md', 'SC001.md', md, 123)
    expect(doc.metaHeader).toContain('SC001.md')
    expect(doc.metaHeader).toContain('機能ID: FN01')
    expect(doc.metaHeader).toContain('画面ID: SC001')
    expect(doc.outline).toEqual(['SC001_顧客一覧', '【項目定義】', '【イベント定義】'])
    expect(doc.sections.map((s) => s.sectionTitle)).toEqual(['Tổng quan', '【項目定義】', '【イベント定義】'])
    expect(doc.sections[1].content).toContain('| 1 | 顧客コード |')
  })

  it('file không có heading hoặc file rỗng không crash', () => {
    const doc = parseMarkdownForRag('/a.md', 'a.md', 'Chỉ có chữ thuần')
    expect(doc.sections).toHaveLength(1)
    expect(doc.sections[0].sectionTitle).toBe('Tổng quan')
    const empty = parseMarkdownForRag('/e.md', 'e.md', '   ')
    expect(empty.sections).toHaveLength(0)
    expect(empty.tokensEst).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/rag/chunker.test.ts`
Expected: FAIL (`Cannot find module './chunker'`).

- [ ] **Step 3: Implement `src/main/rag/chunker.ts`**

Viết `compressMarkdownLossless` và `parseMarkdownForRag`:
- Dòng bảng `^\|.*\|$` được tách theo pipe chưa escape `(?<!\\)\|`, trim từng ô; nếu mọi ô chỉ gồm `[-:\s]+` (dòng phân cách bảng) thì chuẩn hóa thành `|---|---|...`, ngược lại nối bằng `' | '`.
- Gộp `\n{3,}` thành `\n\n`.
- Quét dòng `> 基本設計：...` và các dòng `- **Label**: Value` đầu tài liệu để tạo `metaHeader` dạng `[${relPath} | ...]` (tối đa 220 ký tự).
- Tách `sections` mỗi khi gặp `^##\s+(.+)` (cập nhật `sheetName`, mở section `'Tổng quan'`) hoặc `^###\s+(.+)` (mở section mới với tên heading đã bỏ ký tự escape).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/rag/chunker.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/rag/chunker.ts src/main/rag/chunker.test.ts
git commit -m "feat(rag): add lossless markdown compressor and structural document parser"
```

---

### Task 3: Bộ tìm kiếm lai BM25 + CJK 2-gram + Từ điển Việt–Nhật (`src/main/rag/glossary.ts`, `src/main/rag/retriever.ts`)

**Files:**
- Create: `src/main/rag/glossary.ts`, `src/main/rag/retriever.ts`
- Test: `src/main/rag/retriever.test.ts`

**Interfaces:**
- Consumes: Task 2 (`RagDocument`, `RagSection`, `estimateTokens`).
- Produces:
  - Trong `src/main/rag/glossary.ts`: `export function expandViJaQueryTerms(query: string): string[]` (trả về danh sách các thuật ngữ tiếng Nhật/Anh bổ sung khớp với câu hỏi tiếng Việt).
  - Trong `src/main/rag/retriever.ts`:
    - `export interface RagCitation { filePath: string; relPath: string; sheetName: string; sectionTitle: string }`
    - `export interface RagContextResult { mode: 'full-active' | 'full-folder' | 'parent-rag'; contextText: string; citations: RagCitation[]; tokensEst: number; docCount: number }`
    - `export const DEFAULT_MAX_CONTEXT_TOKENS = 32_000`
    - `export function tokenizeMultiLang(text: string): string[]` (tách từ Latin/Việt chữ thường + tách unigram & bigram cho dãy ký tự CJK `[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]`)
    - `export function buildRagContext(docs: RagDocument[], query: string, opts: { scope: 'folder' | 'active'; activeFilePath?: string; maxContextTokens?: number }): RagContextResult`

- [ ] **Step 1: Write the failing test** trong `src/main/rag/retriever.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { parseMarkdownForRag } from './chunker'
import { buildRagContext, tokenizeMultiLang } from './retriever'

describe('tokenizeMultiLang & glossary expansion', () => {
  it('tách từ tiếng Việt, mã kỹ thuật và 2-gram tiếng Nhật', () => {
    const tokens = tokenizeMultiLang('Màn hình SC001 顧客一覧')
    expect(tokens).toContain('màn')
    expect(tokens).toContain('sc001')
    expect(tokens).toContain('顧客')
    expect(tokens).toContain('一覧')
  })
})

describe('buildRagContext (Quality-First)', () => {
  const doc1 = parseMarkdownForRag(
    '/dir/SC001.md',
    'SC001.md',
    '## SC001\n- **画面ID**: SC001\n### 【項目定義】\n| No | 項目名 | 必須 | 入力チェック |\n|---|---|---|---|\n| 1 | 顧客コード | ○ | 半角英数10桁 |\n| 2 | 顧客名 | - | 50文字以内 |'
  )
  const doc2 = parseMarkdownForRag(
    '/dir/TBL001.md',
    'TBL001.md',
    '## TBL001\n- **テーブルID**: TBL_ORDER\n### 【カラム定義】\n| No | カラム名 | 型 |\n|---|---|---|\n| 1 | ORDER_ID | BIGINT |'
  )

  it('scope = active: trả về 100% toàn văn file đang xem (full-active)', () => {
    const res = buildRagContext([doc1, doc2], 'Tóm tắt file này', {
      scope: 'active',
      activeFilePath: '/dir/SC001.md',
    })
    expect(res.mode).toBe('full-active')
    expect(res.contextText).toContain('顧客コード')
    expect(res.contextText).not.toContain('ORDER_ID')
    expect(res.citations[0].relPath).toBe('SC001.md')
  })

  it('scope = folder khi tổng token <= maxContextTokens: nạp 100% toàn bộ các file (full-folder)', () => {
    const res = buildRagContext([doc1, doc2], 'Có những bảng và màn hình nào?', {
      scope: 'folder',
      maxContextTokens: 32_000,
    })
    expect(res.mode).toBe('full-folder')
    expect(res.contextText).toContain('SC001.md')
    expect(res.contextText).toContain('TBL001.md')
    expect(res.docCount).toBe(2)
  })

  it('scope = folder khi vượt ngưỡng token: dùng BM25 + từ điển Việt-Nhật chọn đúng file khách hàng (parent-rag)', () => {
    // Đặt maxContextTokens nhỏ để kích hoạt nhánh parent-rag
    const res = buildRagContext([doc1, doc2], 'Điều kiện kiểm tra bắt buộc của khách hàng ở màn hình nào?', {
      scope: 'folder',
      maxContextTokens: doc1.tokensEst + 40,
    })
    expect(res.mode).toBe('parent-rag')
    expect(res.contextText).toContain('顧客コード')
    expect(res.citations[0].relPath).toBe('SC001.md')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/rag/retriever.test.ts`
Expected: FAIL (`Cannot find module './retriever'`).

- [ ] **Step 3: Implement `src/main/rag/glossary.ts` và `src/main/rag/retriever.ts`**

1. Trong `glossary.ts`: định nghĩa bảng ánh xạ từ khóa tiếng Việt/Anh sang các từ khóa tiếng Nhật tương ứng trong tài liệu `基本設計` (`màn hình` → `['画面', '表示', '項目']`, `khách hàng` → `['顧客', '取引先', 'カスタマ']`, `bắt buộc` → `['必須']`, `kiểm tra` → `['入力チェック', 'チェック', '条件', '桁数']`, `bảng` → `['テーブル', 'マスタ', 'カラム', '項目定義']`, `lỗi` → `['エラー', 'メッセージ']`, `nút`/`sự kiện` → `['イベント', 'ボタン', '処理', '押下']`, `chuyển màn hình` → `['画面遷移', '遷移']`, `api` → `['api', 'if', '連携', 'エンドポイント']`, `người dùng`/`quyền` → `['ユーザ', '権限', 'ロール', 'ログイン']`).
2. Trong `retriever.ts`: cài đặt `tokenizeMultiLang`, hàm chấm điểm BM25 (`k1 = 1.5, b = 0.75`) + thưởng điểm khi khớp chính xác mã định danh (`SC001`, `FN01`...) và cài đặt 3 nhánh `full-active`, `full-folder`, `parent-rag` theo đúng đặc tả §6.2. Mỗi đoạn/file đưa vào `contextText` được bọc thẻ `=== TÀI LIỆU: ${relPath} | MỤC: ${sectionTitle} ===` để Gemini trích dẫn chính xác.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/rag/retriever.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/rag/glossary.ts src/main/rag/retriever.ts src/main/rag/retriever.test.ts
git commit -m "feat(rag): add hybrid BM25/CJK retriever with Vietnamese-Japanese spec glossary"
```

---

### Task 4: Client gọi Gemini API, Bảo mật API Key & IPC Handlers

**Files:**
- Create: `src/main/rag/geminiClient.ts`, `src/main/rag/geminiClient.test.ts`
- Modify: `src/types.ts`, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/src/api.ts`

**Interfaces:**
- Consumes: Task 2 (`parseMarkdownForRag`, `RagDocument`), Task 3 (`buildRagContext`, `RagCitation`).
- Produces:
  - Trong `src/types.ts`:
    ```ts
    export type AiModelId = 'gemini-2.5-flash' | 'gemini-2.5-pro'
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
      hasKey: boolean
      maskedKey: string
      model: AiModelId
    }
    export interface AiAskRequest {
      question: string
      scope: AiScope
      model?: AiModelId
      rootDir?: string | null
      relFiles?: string[]
      looseFiles?: string[]
      activeFilePath?: string | null
      activeMarkdown?: string
      history?: AiChatTurn[]
    }
    export interface AiAskResponse {
      answer: string
      citations: RagCitation[]
      mode: 'full-active' | 'full-folder' | 'parent-rag'
      docCount: number
      usage?: {
        promptTokens: number
        completionTokens: number
        totalTokens: number
      }
    }
    ```
  - Trong `src/main/rag/geminiClient.ts`:
    - `export function redactApiKey(text: string, apiKey?: string): string`
    - `export function maskApiKey(apiKey: string): string` (vd `'AIza...9xYz'`, rỗng nếu chưa có)
    - `export function buildGeminiRequestBody(question: string, contextText: string, history: AiChatTurn[]): object`
    - `export function extractCitationsFromAnswer(answer: string, available: RagCitation[]): { cleanAnswer: string; citations: RagCitation[] }`
    - `export async function callGeminiApi(opts: { apiKey: string; model: AiModelId; question: string; contextText: string; history: AiChatTurn[]; availableCitations: RagCitation[]; signal?: AbortSignal }): Promise<{ answer: string; citations: RagCitation[]; usage?: AiAskResponse['usage'] }>`
  - Trong `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/src/api.ts`:
    - IPC `ai:getConfig` → `window.api.aiGetConfig(): Promise<AiConfigInfo>`
    - IPC `ai:setConfig` → `window.api.aiSetConfig(payload: { apiKey?: string; model?: AiModelId }): Promise<AiConfigInfo>`
    - IPC `ai:ask` → `window.api.aiAsk(req: AiAskRequest): Promise<AiAskResponse>`
    - IPC `ai:cancel` → `window.api.aiCancel(): Promise<void>`

- [ ] **Step 1: Write the failing test** trong `src/main/rag/geminiClient.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import {
  buildGeminiRequestBody,
  extractCitationsFromAnswer,
  maskApiKey,
  redactApiKey,
} from './geminiClient'

describe('redactApiKey & maskApiKey', () => {
  it('xóa sạch ?key=... và chuỗi apiKey khỏi thông báo lỗi URL/log', () => {
    const key = 'AIzaSySecretKey123456789'
    const rawErr = `Fetch failed: https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key} (token=${key})`
    const safe = redactApiKey(rawErr, key)
    expect(safe).not.toContain(key)
    expect(safe).toContain('key=***')
  })

  it('maskApiKey chỉ hiện 4 ký tự đầu và 4 ký tự cuối', () => {
    expect(maskApiKey('AIzaSySecretKey1234')).toBe('AIza••••1234')
    expect(maskApiKey('')).toBe('')
  })
})

describe('buildGeminiRequestBody & extractCitationsFromAnswer', () => {
  it('giữ tối đa 6 lượt hỏi-đáp gần nhất (12 messages) và không lặp lại context cũ', () => {
    const history = Array.from({ length: 16 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'model') as 'user' | 'model',
      text: `msg-${i}`,
    }))
    const body = buildGeminiRequestBody('Câu hỏi mới', '=== TÀI LIỆU: A.md ===\nNội dung', history) as {
      contents: { role: string; parts: { text: string }[] }[]
    }
    // 12 history messages + 1 current user message = 13
    expect(body.contents).toHaveLength(13)
    expect(body.contents[0].parts[0].text).toBe('msg-4')
    expect(body.contents[12].parts[0].text).toContain('Câu hỏi mới')
  })

  it('trích xuất đúng trích dẫn từ thẻ [[relPath | sectionTitle]] trong câu trả lời của Gemini', () => {
    const pool = [
      { filePath: '/a/SC001.md', relPath: 'SC001.md', sheetName: 'SC001', sectionTitle: '【項目定義】' },
      { filePath: '/a/SC002.md', relPath: 'SC002.md', sheetName: 'SC002', sectionTitle: '【画面遷移】' },
    ]
    const ans = 'Trường này bắt buộc nhập [[SC001.md | 【項目定義】]].'
    const res = extractCitationsFromAnswer(ans, pool)
    expect(res.citations).toEqual([pool[0]])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/rag/geminiClient.test.ts`
Expected: FAIL (`Cannot find module './geminiClient'`).

- [ ] **Step 3: Implement `src/main/rag/geminiClient.ts`, types, IPC handlers và preload bridge**

1. Thêm các kiểu `AiModelId`, `AiScope`, `RagCitation`, `AiChatTurn`, `AiConfigInfo`, `AiAskRequest`, `AiAskResponse` vào `src/types.ts`.
2. Cài đặt `src/main/rag/geminiClient.ts`:
   - Dùng `fetch` gọi `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`.
   - Dịch các mã lỗi HTTP (`400`/`403` → `'API Key không hợp lệ hoặc không có quyền truy cập.'`, `429` → `'Đã vượt giới hạn quota Gemini API (429), vui lòng thử lại sau ít giây.'`) và luôn bọc mọi lỗi qua `redactApiKey`.
3. Trong `src/main/index.ts`:
   - Dùng `safeStorage.isEncryptionAvailable()` (từ `'electron'`) để mã hóa/giải mã `aiApiKeyEnc` trong `store.json` (fallback base64 nếu môi trường Linux/CI không có keyring).
   - Duy trì `Map<string, RagDocument>` cache theo `filePath` + `mtimeMs` (tối đa 500 file) để không phải parse lại những file `.md` không đổi giữa các câu hỏi.
   - Đăng ký 4 IPC handlers: `ai:getConfig`, `ai:setConfig`, `ai:ask` (có `AbortController` lưu ở biến `aiAbort`), `ai:cancel`.
4. Expose 4 hàm tương ứng trong `src/preload/index.ts` và khai báo kiểu trong `src/renderer/src/api.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/rag/geminiClient.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/main/rag/geminiClient.ts src/main/rag/geminiClient.test.ts src/main/index.ts src/preload/index.ts src/renderer/src/api.ts
git commit -m "feat(rag): add Gemini API client, secure key storage, and IPC bridge"
```

---

### Task 5: Giao diện `AiChatPanel`, Cuộn tới Trích dẫn trong `PreviewPane` & Ghép vào `App.tsx`

**Files:**
- Create: `src/renderer/src/components/AiChatPanel.tsx`
- Modify: `src/renderer/src/components/PreviewPane.tsx`, `src/renderer/src/App.tsx`, `src/renderer/src/styles.css`

**Interfaces:**
- Consumes: Task 4 (`window.api.aiGetConfig`, `window.api.aiSetConfig`, `window.api.aiAsk`, `window.api.aiCancel`, types in `src/types.ts`).
- Produces:
  - Trong `src/renderer/src/components/PreviewPane.tsx`: thêm prop tùy chọn `scrollTarget?: { heading: string; seq: number } | null`. Khi `scrollTarget` thay đổi và `!loading && md`, tìm phần tử `h1..h4` hoặc `table` trong `.md-body` có `textContent` chứa `scrollTarget.heading` và gọi `scrollIntoView({ behavior: 'smooth', block: 'start' })`.
  - Trong `src/renderer/src/components/AiChatPanel.tsx`: component `AiChatPanel` đặt trong `SidePanel`, nhận danh sách file từ `viewer` (`root`, `relFiles`, `loose`, `doc`), callback `onJumpToCitation(c: RagCitation)` và trạng thái thu gọn/độ rộng cột phải.

- [ ] **Step 1: Cập nhật `PreviewPane.tsx` hỗ trợ `scrollTarget`**

Trong `src/renderer/src/components/PreviewPane.tsx`, thêm prop `scrollTarget?: { heading: string; seq: number } | null` vào `Props` và thêm `useEffect` lắng nghe `[scrollTarget, loading, html]`: khi `!loading && html && scrollTarget?.heading`, tìm heading `h1, h2, h3, h4` trong `.md-body` khớp tên mục (hoặc cuộn lên đầu `.md-body` nếu là `'Tổng quan'`), đồng thời tự mở rộng preview (`setExpanded(true)`) nếu mục nằm ở phần bị ẩn quá 300 dòng.

- [ ] **Step 2: Tạo `src/renderer/src/components/AiChatPanel.tsx` và bổ sung CSS trong `src/renderer/src/styles.css`**

Cài đặt `AiChatPanel`:
- Nút `🔑 API Key` mở khung cấu hình inline (input password cho Gemini API Key, nút Lưu / Xóa key, chọn model `Gemini 2.5 Flash (Nhanh)` hoặc `Gemini 2.5 Pro (Sâu)`).
- Công tắc phạm vi ngữ cảnh: `Cả thư mục (N file)` và `Chỉ file đang xem`.
- 3 nút tác vụ nhanh (Quick Actions):
  - `📋 Tóm tắt nghiệp vụ`
  - `🌐 Dịch sang tiếng Việt`
  - `🔍 Kiểm tra thiếu sót`
- Khung danh sách tin nhắn: render câu trả lời qua `marked.parse` + `sanitizeHtml`, hiển thị các chip trích dẫn `📍 relPath › sectionTitle` bấm được, badge chế độ ngữ cảnh (`Toàn văn` / `RAG`) + số token `⚡ N tokens`, nút `Copy`.
- Ô nhập câu hỏi: `Enter` để gửi, `Shift+Enter` xuống dòng, nút `Gửi` / `Dừng` (gọi `window.api.aiCancel()`).

- [ ] **Step 3: Ghép `AiChatPanel` vào nhánh `isView` trong `src/renderer/src/App.tsx`**

Trong `src/renderer/src/App.tsx`:
- Thêm state `scrollTarget` (`{ heading: string; seq: number } | null`).
- Khi bấm trích dẫn `onJumpToCitation(c)`: nếu `c.filePath !== PASTE_PATH && c.filePath !== viewerPath`, gọi `await viewerSelect(c.filePath)` (hoặc `viewerOpenFiles([c.filePath])`), sau đó cập nhật `setScrollTarget({ heading: c.sectionTitle, seq: Date.now() })`.
- Trong nhánh `isView` (`appMode === 'mdview'`), render thanh kéo `x2m-resizer` và `<AiChatPanel>` bên phải `<main className="x2m-main">`.

- [ ] **Step 4: Run typecheck, unit tests và build để xác nhận toàn bộ hệ thống hoạt động**

Run: `npm run typecheck && npm test && npm run build`
Expected: PASS toàn bộ typecheck, toàn bộ unit tests (bao gồm golden tests) và build thành công cả `main`, `preload`, `renderer`.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/AiChatPanel.tsx src/renderer/src/components/PreviewPane.tsx src/renderer/src/App.tsx src/renderer/src/styles.css
git commit -m "feat(ui): add AI RAG assistant panel in Markdown viewer mode with clickable citations"
```
