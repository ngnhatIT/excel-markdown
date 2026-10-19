# Markdown → Excel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm chế độ Markdown → Excel: các file `.md` người dùng chọn được gộp thành một `.xlsx` có style để gửi khách hàng.

**Architecture:** Parse Markdown bằng `marked.lexer` thành mô hình sheet/block thuần (`src/main/md2xlsx/`), ghi bằng exceljs theo bố cục đã duyệt, chạy trong worker utilityProcess hiện có (yêu cầu mới `mdInspect`, `mdToXlsx`). Main chỉ điều phối IPC, hộp thoại ghi đè, Hủy. Renderer thêm công tắc chế độ và màn hình danh sách `.md`.

**Tech Stack:** Electron 44, TypeScript, React 18, electron-vite 3, exceljs 4.4.0 (ghi), jszip 3 (chèn `ignoredErrors`), marked 15 (parse), SheetJS 0.20.3 (chỉ để đọc lại trong test), vitest 5.

**Spec:** `docs/superpowers/specs/2026-10-19-md-to-excel-design.md` (đọc kèm; mục § trong plan trỏ về spec).

## Global Constraints

- exceljs **chỉ để ghi**; không bao giờ dùng exceljs đọc file từ bên ngoài (test được phép load buffer do chính code tạo).
- Main process không nạp exceljs: `out/main/index.js` không có `require("exceljs")`; worker nạp exceljs bằng `import()` động chỉ khi xử lý `mdToXlsx`.
- Output chiều Excel → Markdown không đổi: `test/golden/*.md` và `*.sheets.json` giữ nguyên byte.
- Font mọi ô: `游ゴシック` 10 (code block: `MS Gothic`). Màu: header `FFDDE5F0`, label `FFF2F2F2`, viền mảnh `FF808080`, heading `FF1F3864`, ghi chú/banner nhỏ `FF595959`, link `FF0563C1`.
- Trang in: `paperSize: 9`, `orientation: 'landscape'`, `fitToPage: true`, `fitToWidth: 1`, `fitToHeight: 0`; `showGridLines: false`.
- Link: chỉ `http:`/`https:`/`mailto:` thành hyperlink; link nội bộ `#…` và scheme khác → chữ thuần (exceljs ghi link nội bộ sai cấu trúc — đã kiểm).
- Ô Excel tối đa 32 767 ký tự: dài hơn thì cắt còn 32 767, ký tự cuối là `…`.
- UI tiếng Việt; Windows x64; version 2.2.0.
- Mỗi task: `npm run typecheck` + `npm test` xanh trước khi commit; task đụng UI/IPC chạy thêm `npm run e2e`.

## Review Focus

1. File `.xlsx` đích đang mở trong Excel khi ghi đè → đổi tên file tạm thất bại (`EBUSY`/`EPERM`): báo "Không ghi được file Excel. File có thể đang mở trong Excel — đóng file rồi thử lại.", file cũ nguyên vẹn, không còn `.partial`. (Task 5, Task 7)
2. File `.md` xuống dòng CRLF (Notepad, git `autocrlf`) → kết quả parse giống hệt LF. (Task 4)
3. File `.md` có BOM UTF-8 ở đầu → `# tiêu đề` / `## sheet` vẫn được nhận. (Task 4)
4. Tên sheet chỉ khác hoa/thường (`Sheet` / `sheet`) → Excel coi là trùng và báo lỗi file: phải khử trùng không phân biệt hoa/thường. (Task 2)
5. Mọi file đều rỗng (hoặc chỉ có `# tiêu đề`) → không ghi workbook 0 sheet (file hỏng); báo "Các file Markdown không có nội dung để tạo sheet." (Task 7)

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `src/main/md2xlsx/model.ts` | Type `XCell`, `Block`, `SheetModel`, `ParsedFile` |
| `src/main/md2xlsx/cellValue.ts` | Chữ → giá trị ô (số + numFmt / text) theo §6 |
| `src/main/md2xlsx/names.ts` | Tên sheet hợp lệ + khử trùng; gán tên cho danh sách sheet |
| `src/shared/workbookName.ts` | Tên file `.xlsx` mặc định (dùng ở cả renderer và main) |
| `src/main/md2xlsx/inline.ts` | Token inline của marked → `XCell` (chữ hiển thị + link) |
| `src/main/md2xlsx/parse.ts` | Markdown → `ParsedFile` (tách sheet §7, block §5/§8) |
| `src/main/md2xlsx/layout.ts` | `displayWidth`, `estimateLines` |
| `src/main/md2xlsx/write.ts` | `SheetModel[]` → exceljs Workbook theo §5; `saveWorkbook` (file tạm, `ignoredErrors`, đổi tên) |
| `src/main/md2xlsx/mdHandler.ts` | Xử lý yêu cầu worker `mdInspect` / `mdToXlsx` |
| `src/main/escapeCases.ts` | Danh sách case escape dùng chung cho `escape.test.ts` và `inline.test.ts` |
| sửa `workerProtocol.ts`, `worker.ts`, `index.ts`, `guards.ts`, `errors.ts`, `preload/index.ts`, `types.ts`, `renderer/src/api.ts` | Nối backend |
| `src/renderer/src/hooks/useMdFiles.ts`, `components/MdFileList.tsx`, `components/MdOptionsPanel.tsx`; sửa `App.tsx`, `Header.tsx`, `Footer.tsx`, `ResultsPanel.tsx`, `utils.ts`, `styles.css` | UI chế độ mới |
| `scripts/xlsx-snapshot.ps1` | Mở `.xlsx` bằng Excel (COM), báo nếu Excel phải sửa file, chụp PNG từng sheet |

---

### Task 1: Dependency + quy tắc giá trị ô

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `src/main/md2xlsx/cellValue.ts`, `src/main/md2xlsx/model.ts`
- Test: `src/main/md2xlsx/cellValue.test.ts`

**Interfaces:**
- Produces: `toCellValue(text: string): { value: string | number; numFmt?: string }`; types trong `model.ts`:
  ```ts
  export interface XCell { text: string; link?: string }
  export type Block =
    | { kind: 'banner'; label: string; title: string }
    | { kind: 'table'; header: XCell[]; rows: XCell[][] }
    | { kind: 'meta'; items: { label: string; value: XCell }[] }
    | { kind: 'heading'; text: string }
    | { kind: 'note'; text: string }
    | { kind: 'paragraph'; text: string }
    | { kind: 'code'; lines: string[] }
  export interface SheetModel { name: string; blocks: Block[] }
  export interface ParsedFile { title: string | null; sheets: SheetModel[] }
  ```

- [ ] **Step 1: Cài dependency**

```bash
npm install --save-exact exceljs@4.4.0
npm install jszip@^3.10.1
```
Expected: `package.json` có `"exceljs": "4.4.0"` và `"jszip": "^3.10.1"` trong `dependencies`; `npm audit --omit=dev` chỉ còn cảnh báo moderate của `uuid` (đã chấp nhận ở spec §10).

- [ ] **Step 2: Viết test thất bại `cellValue.test.ts`**

```ts
it.each([
  ['10', 10, undefined], ['-3', -3, undefined], ['0', 0, undefined], ['99999999999', 99999999999, undefined],
  ['1.0', 1, '0.0'], ['1.10', 1.1, '0.00'], ['0.5', 0.5, '0.0'], ['-2.25', -2.25, '0.00'],
  ['1,234', 1234, '#,##0'], ['1,234,567.89', 1234567.89, '#,##0.00'],
  ['50%', 0.5, '0%'], ['12.50%', 0.125, '0.00%'],
])('%s -> số', (text, value, numFmt) => expect(toCellValue(text)).toEqual(numFmt ? { value, numFmt } : { value }))

it.each(['0001', '123456789012', '03-xxxx', '2026/10/01', '#N/A', 'TRUE', '1.2.3', '１２', '1e5', '', '1,23', '.5', '5.'])(
  '%s -> text', (text) => expect(toCellValue(text)).toEqual({ value: text })
)
```

- [ ] **Step 3: Chạy test, xác nhận FAIL** — `npx vitest run src/main/md2xlsx/cellValue.test.ts` → FAIL (module chưa có).

- [ ] **Step 4: Viết `model.ts` (types ở trên) và `toCellValue` trong `cellValue.ts`**

Quy tắc §6: nguyên `^-?(0|[1-9]\d{0,10})$` (≤ 11 chữ số) → số, không numFmt; thập phân `^-?(0|[1-9]\d*)\.(\d+)$` → numFmt `0.` + `0`×(số chữ số thập phân); nhóm nghìn `^-?[1-9]\d{0,2}(,\d{3})+(\.\d+)?$` → `#,##0` (+ `.` + `0`×n nếu có thập phân); phần trăm `^-?(0|[1-9]\d*)(\.\d+)?%$` → giá trị /100, numFmt `0%` hoặc `0.` + `0`×n + `%`. Còn lại → `{ value: text }`.

- [ ] **Step 5: Chạy test, xác nhận PASS** — cùng lệnh → PASS.

- [ ] **Step 6: Commit** — `git add package.json package-lock.json src/main/md2xlsx && git commit -m "feat(md2xlsx): dependency exceljs/jszip + quy tắc giá trị ô"`

---

### Task 2: Tên sheet và tên file mặc định

**Files:**
- Create: `src/main/md2xlsx/names.ts`, `src/shared/workbookName.ts`
- Modify: `tsconfig.node.json`, `tsconfig.web.json` (thêm `"src/shared/**/*"` vào `include`)
- Test: `src/main/md2xlsx/names.test.ts`, `src/shared/workbookName.test.ts`

**Interfaces:**
- Consumes: `SheetModel` (Task 1)
- Produces:
  - `safeSheetName(raw: string, used: Set<string>): string` — `used` chứa tên đã dùng ở dạng chữ thường; hàm tự thêm tên trả về vào `used`.
  - `assignSheetNames(sheets: SheetModel[]): SheetModel[]` — trả bản sao với `name` đã hợp lệ, không trùng.
  - `defaultWorkbookName(files: { path: string; title: string | null }[]): string` (không đuôi).

- [ ] **Step 1: Viết test thất bại**

```ts
// names.test.ts
const fresh = () => new Set<string>()
expect(safeSheetName('a/b:c[1]*?\\', fresh())).toBe('a_b_c_1____')
expect(safeSheetName('x'.repeat(40), fresh())).toHaveLength(31)
expect(safeSheetName('  ', fresh())).toBe('Sheet')
expect(safeSheetName('History', fresh())).toBe('History_')
const used = fresh()
expect(['Sheet', 'sheet', 'SHEET'].map((n) => safeSheetName(n, used))).toEqual(['Sheet', 'sheet (2)', 'SHEET (3)'])
const u2 = fresh(); safeSheetName('y'.repeat(31), u2)
expect(safeSheetName('y'.repeat(31), u2)).toBe('y'.repeat(27) + ' (2)')
expect(assignSheetNames([{ name: 'A', blocks: [] }, { name: 'a', blocks: [] }]).map((s) => s.name)).toEqual(['A', 'a (2)'])

// workbookName.test.ts
expect(defaultWorkbookName([{ path: 'C:\\d\\kihon__画面.md', title: null }, { path: 'C:\\d\\kihon__テーブル.md', title: 'x' }])).toBe('kihon')
expect(defaultWorkbookName([{ path: 'C:\\d\\a__x.md', title: '基本設計書' }, { path: 'C:\\d\\b__y.md', title: null }])).toBe('基本設計書')
expect(defaultWorkbookName([{ path: 'C:\\d\\memo.md', title: null }])).toBe('memo')
expect(defaultWorkbookName([{ path: '/d/a__b__c.md', title: null }])).toBe('a__b')
expect(defaultWorkbookName([])).toBe('workbook')
```

- [ ] **Step 2: Chạy test, xác nhận FAIL** — `npx vitest run src/main/md2xlsx/names.test.ts src/shared/workbookName.test.ts`.

- [ ] **Step 3: Implement**

`safeSheetName`: thay `[\[\]:*?/\\]` bằng `_`, trim, cắt 31 ký tự, rỗng → `Sheet`, `history` (không phân biệt hoa/thường) → thêm `_`; nếu `used` có bản chữ thường → thử ` (2)`, ` (3)`… cắt phần gốc để tổng ≤ 31. `defaultWorkbookName`: nếu **mọi** file (tên không đuôi) có `__` và phần trước `__` **cuối cùng** giống nhau → phần đó; không thì `title` của file đầu nếu khác rỗng; không thì tên file đầu không đuôi; danh sách rỗng → `workbook`. Tách đường dẫn theo cả `\` và `/` (renderer không có `node:path`).

- [ ] **Step 4: Chạy test + `npm run typecheck`, xác nhận PASS.**

- [ ] **Step 5: Commit** — `git commit -m "feat(md2xlsx): tên sheet hợp lệ, tên file mặc định"`

---

### Task 3: Chữ hiển thị của ô (inline)

**Files:**
- Create: `src/main/md2xlsx/inline.ts`, `src/main/escapeCases.ts`
- Modify: `src/main/escape.test.ts` (import `INLINE_CASES`, `UNTOUCHED`, `BLOCK_CASES` từ `escapeCases.ts` thay vì khai báo tại chỗ)
- Test: `src/main/md2xlsx/inline.test.ts`

**Interfaces:**
- Consumes: `XCell`; `escapeMarkdownInline` (`src/main/output.ts`); `marked.lexer`
- Produces: `inlineCell(tokens: Token[] | undefined): XCell` (`Token` = `Tokens.Generic` của marked)

- [ ] **Step 1: Viết test thất bại**

```ts
const cellOf = (src: string) => inlineCell((marked.lexer(`| A |\n|---|\n| ${src} |`)[0] as Tokens.Table).rows[0][0].tokens)
// Đảo chiều Excel -> Markdown: mọi case escape quay về đúng chữ gốc
it.each([...INLINE_CASES, ...UNTOUCHED])('round-trip %s', (s) =>
  expect(cellOf(escapeMarkdownInline(s).replace(/\|/g, '\\|')).text).toBe(s))
expect(cellOf('a<br>　b').text).toBe('a\n　b')
expect(cellOf('**b** *i* ~~d~~ `c`').text).toBe('b i d c')
expect(cellOf('a &amp; b &lt;x&gt; &#x41;&#66;&nbsp;').text).toBe('a & b <x> AB\u00a0')
expect(cellOf('[Spec](https://x.example/a)')).toEqual({ text: 'Spec', link: 'https://x.example/a' })
expect(cellOf('[M](mailto:a@x.example)').link).toBe('mailto:a@x.example')
expect(cellOf('see [Spec](https://x.example/a)')).toEqual({ text: 'see Spec' })
expect(cellOf('[x](file:///C:/a)')).toEqual({ text: 'x' })
expect(cellOf("[参照](#'テーブル定義'!A1)")).toEqual({ text: '参照' })
expect(cellOf('https://x.example')).toEqual({ text: 'https://x.example' })
expect(cellOf('![図](a.png)').text).toBe('図')
expect(inlineCell(undefined)).toEqual({ text: '' })
```

- [ ] **Step 2: Chạy test, xác nhận FAIL** — `npx vitest run src/main/md2xlsx/inline.test.ts`.

- [ ] **Step 3: Implement `inlineCell`**

Theo token: `escape` → `raw.slice(1)`; `br` và `html` dạng `<br>`/`<br/>` → `\n`; `html` khác → `raw`; `strong`/`em`/`del`/`link` → đệ quy `tokens`; `codespan` → `text`; `image` → `text` (alt); `text` có `tokens` → đệ quy, không có → `text`; còn lại → `raw`. Sau cùng giải mã entity HTML (`&amp; &lt; &gt; &quot; &#39; &nbsp;` và `&#NN;`/`&#xHH;`) **chỉ trên phần chữ từ token `text`** (không áp lên chữ từ `escape`). `link` chỉ khi các token không phải khoảng trắng là đúng một `link` và `href` có scheme `http:`/`https:`/`mailto:`.

- [ ] **Step 4: Chạy test (cả `escape.test.ts`), xác nhận PASS.**

- [ ] **Step 5: Commit** — `git commit -m "feat(md2xlsx): chữ hiển thị của ô từ token marked"`

---

### Task 4: Parse Markdown → mô hình sheet

**Files:**
- Create: `src/main/md2xlsx/parse.ts`
- Test: `src/main/md2xlsx/parse.test.ts`

**Interfaces:**
- Consumes: `inlineCell`, types Task 1
- Produces: `parseMarkdownFile(md: string, fileName: string): ParsedFile` — `fileName` là tên file kèm đuôi; tên sheet chưa khử trùng (Task 2 làm).

- [ ] **Step 1: Viết test thất bại**

```ts
const golden = readFileSync(fileURLToPath(new URL('../../../test/golden/kihon-sekkei.xlsx.md', import.meta.url)), 'utf8')
const p = parseMarkdownFile(golden, 'kihon-sekkei.xlsx.md')
expect(p.title).toBe('kihon-sekkei')
expect(p.sheets.map((s) => s.name)).toEqual(['画面項目定義', 'テーブル定義'])
expect(p.sheets[0].blocks.map((b) => b.kind)).toEqual(
  ['banner', 'table', 'meta', 'heading', 'table', 'note', 'heading', 'note', 'paragraph', 'paragraph', 'paragraph', 'paragraph', 'paragraph'])
expect(p.sheets[0].blocks[0]).toEqual({ kind: 'banner', label: '基本設計', title: '画面項目定義書' })
const meta = p.sheets[0].blocks[2] as Extract<Block, { kind: 'meta' }>
expect(meta.items.map((i) => i.label)).toEqual(['機能ID', '機能名', '画面ID', '画面名', '画面遷移'])
expect(meta.items[4].value.text).toBe('メニュー → 顧客検索\n→ 顧客詳細')
expect(p.sheets[0].blocks[7]).toEqual({ kind: 'note', text: '# 見出しではない' })
expect(p.sheets[0].blocks[8]).toEqual({ kind: 'paragraph', text: '1. リストではない 補足' })
expect(p.sheets[1].blocks.map((b) => b.kind)).toEqual(['meta', 'table'])
// §7 tách sheet
expect(parseMarkdownFile('# kihon\n\n## 画面A\n\nx\n\n---\n\n## 画面B\n\ny\n', 'k.md').sheets.map((s) => s.name)).toEqual(['画面A', '画面B'])
const one = parseMarkdownFile('# 画面設計\n\n## 概要\n\na\n\n## 項目\n\nb\n', 'd.md')
expect(one.sheets).toEqual([{ name: '概要', blocks: [{ kind: 'paragraph', text: 'a' }, { kind: 'heading', text: '項目' }, { kind: 'paragraph', text: 'b' }] }])
expect(parseMarkdownFile('x', 'kihon__テーブル定義.md').sheets[0].name).toBe('テーブル定義')
expect(parseMarkdownFile('a\n\n---\n\nb', 'memo.md').sheets.map((s) => s.name)).toEqual(['memo', 'memo'])
expect(parseMarkdownFile('a\n\n---\n', 'memo.md').sheets).toHaveLength(1)
expect(parseMarkdownFile('# T\n', 'memo.md')).toEqual({ title: 'T', sheets: [] })
// §5: banner chỉ khi là block đầu của sheet
expect(parseMarkdownFile('x\n\n> 基本設計：A', 's.md').sheets[0].blocks[1]).toEqual({ kind: 'note', text: '基本設計：A' })
// §8 Markdown viết tay
const g = (md: string) => parseMarkdownFile(md, 's.md').sheets[0].blocks
expect(g('- 項目1\n- 項目2')).toEqual([{ kind: 'paragraph', text: '・項目1' }, { kind: 'paragraph', text: '・項目2' }])
expect(g('- **作成者**: 山田\n- メモ')).toEqual([{ kind: 'meta', items: [{ label: '作成者', value: { text: '山田' } }] }, { kind: 'paragraph', text: '・メモ' }])
expect(g('```\nline1\nline2\n```')).toEqual([{ kind: 'code', lines: ['line1', 'line2'] }])
expect(g('###### h6')).toEqual([{ kind: 'heading', text: 'h6' }])
expect(g('a\nb')).toEqual([{ kind: 'paragraph', text: 'a\nb' }])
// Review Focus 2, 3
expect(parseMarkdownFile(golden.replace(/\n/g, '\r\n'), 'kihon-sekkei.xlsx.md')).toEqual(p)
expect(parseMarkdownFile('\uFEFF# T\n\n## S\n\nx', 'f.md')).toMatchObject({ title: 'T', sheets: [{ name: 'S' }] })
// Không crash với Markdown bất kỳ: 300 chuỗi ghép ngẫu nhiên (seed cố định) từ các mảnh
// '# h', '## s', '---', '> q', '- **L**: v', '  - sub', '| a | b |\n|---|---|\n| 1 | 2 |', '```', '<div>', '', 'text'
```

- [ ] **Step 2: Chạy test, xác nhận FAIL** — `npx vitest run src/main/md2xlsx/parse.test.ts`.

- [ ] **Step 3: Implement `parseMarkdownFile`**

Bỏ BOM đầu chuỗi; `marked.lexer(md)` (marked tự chuẩn hóa CRLF). Token heading cấp 1 đầu tiên (trước nội dung khác) → `title`, bỏ khỏi luồng. Tách phần tại token `hr` cấp ngoài; bỏ phần không có token nội dung. Mỗi phần: token đầu là heading cấp 2 → tên sheet; không có → phần sau `__` cuối của tên file không đuôi, không có `__` → tên file không đuôi. Token → block: `heading` → `heading`; `table` → `table` (header/rows qua `inlineCell`); `blockquote` là block đầu và chữ bắt đầu bằng `基本設計` → `banner` (tách tại `：` đầu tiên, không có thì `title: ''`), không thì `note` (các đoạn nối bằng `\n`); `list`: item có token đầu là `strong` và phần sau rỗng hoặc bắt đầu bằng `:` → item meta (value bỏ `:` và khoảng trắng đầu; list con nối thêm từng dòng bằng `\n`), các item meta liên tiếp gộp **một** block `meta`; item khác → `paragraph` `・` + chữ; `paragraph` → `paragraph` (xuống dòng mềm giữ là `\n`); `code` → `code` (`text.split('\n')`); `html` → `paragraph` (raw đã trim); `space` bỏ qua; khác → `paragraph` raw.

- [ ] **Step 4: Chạy test, xác nhận PASS.**

- [ ] **Step 5: Commit** — `git commit -m "feat(md2xlsx): parse Markdown thành mô hình sheet/block"`

---

### Task 5: Ghi workbook theo bố cục đã duyệt

**Files:**
- Create: `src/main/md2xlsx/layout.ts`, `src/main/md2xlsx/write.ts`
- Modify: `src/main/workerProtocol.ts` (thêm `export const PARTIAL_SUFFIX = '.partial'`)
- Test: `src/main/md2xlsx/layout.test.ts`, `src/main/md2xlsx/write.test.ts`

**Interfaces:**
- Consumes: `SheetModel` (Task 1), `toCellValue` (Task 1); tên sheet đã hợp lệ (Task 2)
- Produces:
  - `displayWidth(s: string): number` (ký tự mã > 0xFF tính 2; chuỗi nhiều dòng lấy dòng rộng nhất)
  - `estimateLines(text: string, totalWidth: number): number` (Σ mỗi dòng thật `max(1, ceil(displayWidth(dòng)/totalWidth))`)
  - `buildWorkbook(sheets: SheetModel[]): ExcelJS.Workbook`
  - `saveWorkbook(wb: ExcelJS.Workbook, outPath: string, deps?: { rename?: (from: string, to: string) => Promise<void> }): Promise<void>` — ghi `outPath + PARTIAL_SUFFIX`, chèn `ignoredErrors`, đổi tên; lỗi → xóa file tạm, ném lại lỗi gốc.
  - `PARTIAL_SUFFIX = '.partial'` export từ `src/main/workerProtocol.ts` (không đặt trong `write.ts`: main import hằng này để dọn khi Hủy, import `write.ts` sẽ kéo exceljs vào main)

- [ ] **Step 1: Viết test thất bại**

```ts
// layout.test.ts
expect(displayWidth('aあ')).toBe(3); expect(displayWidth('ab\nあいう')).toBe(6)
expect(estimateLines('ab', 10)).toBe(1); expect(estimateLines('a'.repeat(25), 10)).toBe(3)
expect(estimateLines('あ'.repeat(6), 10)).toBe(2); expect(estimateLines('a\nb', 10)).toBe(2); expect(estimateLines('', 10)).toBe(1)

// write.test.ts — đọc lại buffer do chính buildWorkbook tạo bằng exceljs (style) và SheetJS (giá trị)
const T = (h: string[], ...rows: string[][]): Block => ({ kind: 'table', header: h.map((text) => ({ text })), rows: rows.map((r) => r.map((text) => ({ text }))) })
const reload = async (sheets: SheetModel[]) => { const b = await buildWorkbook(sheets).xlsx.writeBuffer(); const w = new ExcelJS.Workbook(); await w.xlsx.load(b as ArrayBuffer); return w }
const ws = (await reload([{ name: 'S', blocks: [
  { kind: 'banner', label: '基本設計', title: '画面項目定義書' },
  T(['No', '項目名', 'C', 'D', 'E', 'F', 'G', '備考'], ['1', '顧客コード', '', '', '', '', '1.0', '0001']),
  { kind: 'meta', items: [{ label: '機能ID', value: { text: 'SP01' } }, { label: '画面遷移', value: { text: 'A\nB' } }] },
  { kind: 'heading', text: '【項目定義】' },
  { kind: 'paragraph', text: 'x'.repeat(300) },
  { kind: 'note', text: '※ a\n　b' },
  { kind: 'code', lines: ['c1'] },
] }])).worksheets[0]
// banner: hàng 1; block sau bắt đầu hàng 3
expect(ws.getCell('A1').font).toMatchObject({ name: '游ゴシック', bold: true, size: 10, color: { argb: 'FF595959' } })
expect(ws.getCell('B1').font).toMatchObject({ bold: true, size: 16 }); expect(ws.getRow(1).height).toBe(24)
// bảng hàng 3-4
expect(ws.getCell('A3').fill).toMatchObject({ fgColor: { argb: 'FFDDE5F0' } }); expect(ws.getCell('H3').font.bold).toBe(true)
expect(ws.getCell('C4').border.top).toMatchObject({ style: 'thin', color: { argb: 'FF808080' } })
expect(ws.getCell('B4').alignment).toMatchObject({ wrapText: true, vertical: 'top' })
expect(ws.getCell('A4').value).toBe(1); expect(ws.getCell('G4').value).toBe(1); expect(ws.getCell('G4').numFmt).toBe('0.0'); expect(ws.getCell('H4').value).toBe('0001')
// meta hàng 6-7: value merge B:H (8 cột = bảng rộng nhất), 2 dòng -> cao 30
expect(ws.getCell('A6').fill).toMatchObject({ fgColor: { argb: 'FFF2F2F2' } }); expect(ws.getCell('B6').isMerged && ws.getCell('H6').master.address).toBe('B6')
expect(ws.getRow(7).height).toBe(30)
// heading hàng 9 (không có hàng trống ngay sau heading), paragraph hàng 10
expect(ws.getCell('A9').font).toMatchObject({ bold: true, size: 12, color: { argb: 'FF1F3864' } }); expect(ws.getCell('A9').border.bottom.style).toBe('medium')
expect(ws.getCell('H10').master.address).toBe('A10'); expect(ws.getCell('A10').alignment.wrapText).toBe(true)
expect(ws.getRow(10).height).toBe(15 * estimateLines('x'.repeat(300), /* tổng width A..H */ sumWidths(ws, 1, 8)))
expect(ws.getCell('A12').font.color.argb).toBe('FF595959'); expect(ws.getRow(12).height).toBe(30)
expect(ws.getCell('A14').font.name).toBe('MS Gothic')
// độ rộng cột: min 6, +2, max 60; cột A tính cả nhãn meta ('画面遷移' rộng 8 -> 10)
expect(ws.getColumn(1).width).toBe(10); expect(ws.getColumn(2).width).toBe(12)
expect(ws.pageSetup).toMatchObject({ paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 })
expect(ws.views[0].showGridLines).toBe(false)
// link + cắt 32 767 ký tự
const w2 = (await reload([{ name: 'L', blocks: [T(['A'], ['x']), { kind: 'table', header: [{ text: 'L' }], rows: [[{ text: 'Spec', link: 'https://x.example/a' }], [{ text: 'y'.repeat(40000) }]] }] }])).worksheets[0]
expect(w2.getCell('A5').value).toMatchObject({ text: 'Spec', hyperlink: 'https://x.example/a' }); expect(w2.getCell('A5').font).toMatchObject({ underline: true, color: { argb: 'FF0563C1' } })
expect((w2.getCell('A6').value as string).length).toBe(32767); expect((w2.getCell('A6').value as string).endsWith('…')).toBe(true)
// saveWorkbook
await saveWorkbook(buildWorkbook([{ name: 'S', blocks: [T(['A'], ['0001'])] }]), out)
expect(existsSync(out + '.partial')).toBe(false)
const xml = await (await JSZip.loadAsync(readFileSync(out))).file('xl/worksheets/sheet1.xml')!.async('string')
expect(xml).toContain('<ignoredErrors><ignoredError sqref="A1:XFD1048576" numberStoredAsText="1"/></ignoredErrors>')
expect(xml.indexOf('<ignoredErrors')).toBeGreaterThan(xml.lastIndexOf('<pageSetup'))
expect(XLSX.read(readFileSync(out)).SheetNames).toEqual(['S'])
// Review Focus 1: đổi tên thất bại (file đích đang mở) -> file cũ nguyên, không còn .partial
writeFileSync(out, 'OLD')
const busy = Object.assign(new Error('EBUSY: resource busy or locked, rename'), { code: 'EBUSY' })
await expect(saveWorkbook(buildWorkbook([{ name: 'S', blocks: [] }]), out, { rename: async () => { throw busy } })).rejects.toBe(busy)
expect(readFileSync(out, 'utf8')).toBe('OLD'); expect(existsSync(out + '.partial')).toBe(false)
```
(`sumWidths(ws, from, to)` = tổng `ws.getColumn(c).width` của các cột — helper trong test.)

- [ ] **Step 2: Chạy test, xác nhận FAIL** — `npx vitest run src/main/md2xlsx/layout.test.ts src/main/md2xlsx/write.test.ts`.

- [ ] **Step 3: Implement `layout.ts`**

- [ ] **Step 4: Implement `buildWorkbook` trong `write.ts`**

Các giá trị cố định ở Global Constraints và spec §5. Bố cục: block ghi tuần tự từ hàng 1; **sau mọi block để 1 hàng trống, trừ `heading`**. `span` của sheet = `max(4, số cột của bảng rộng nhất trong sheet)`. Bảng bắt đầu cột A; mọi ô bảng (kể cả rỗng) có viền mảnh 4 cạnh, `wrapText`, `vertical: 'top'`; header đậm + nền. Ô meta: label cột A; value merge B..`span`, viền mọi ô trong vùng merge, `wrapText`; chiều cao `15 × số dòng` khi > 1 dòng. `paragraph`/`note`: merge A..`span`, `wrapText`, không viền, chiều cao `15 × estimateLines(text, Σ width A..span)` (luôn đặt, kể cả 1 dòng = 15). `code`: mỗi dòng một hàng ở cột A, font `MS Gothic`, không merge. Độ rộng cột: tính từ ô bảng **và nhãn meta (cột A)** `min(60, max(6, displayWidth + 2))` — không tính đoạn văn/ghi chú/value meta (merge, tự xuống dòng); cột không có dữ liệu tính độ rộng giữ mặc định của exceljs (≈ 9) — tính độ rộng **trước** khi đặt chiều cao hàng merge. Giá trị ô: `toCellValue` (số kèm `numFmt`), link `{ text, hyperlink }` + font link; text > 32 767 → 32 766 ký tự + `…`.

- [ ] **Step 5: Implement `saveWorkbook`**

`writeBuffer()` → `JSZip.loadAsync` → với mỗi `xl/worksheets/sheet*.xml` chèn đoạn `ignoredErrors` (giá trị đúng như test) **ngay trước** phần tử đầu tiên tồn tại trong `<drawing`, `<legacyDrawing`, `<picture`, `<oleObjects`, `<controls`, `<webPublishItems`, `<tableParts`, `<extLst`, không có thì trước `</worksheet>` (thứ tự phần tử theo schema CT_Worksheet — sai thứ tự Excel sẽ đòi sửa file) → `generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })` → ghi `outPath + PARTIAL_SUFFIX` → `deps.rename ?? fs.promises.rename`. Mọi lỗi: `rm(partial, { force: true })` rồi ném lại.

- [ ] **Step 6: Chạy test, xác nhận PASS.**

- [ ] **Step 7: Commit** — `git commit -m "feat(md2xlsx): ghi workbook theo bố cục đã duyệt, ghi file an toàn"`

---

### Task 6: Golden + round-trip

**Files:**
- Test: `src/main/md2xlsx/golden.test.ts`; Create (snapshot): `test/golden-md2xlsx/*.json`

**Interfaces:**
- Consumes: `parseMarkdownFile`, `assignSheetNames`, `buildWorkbook`, `saveWorkbook`; chiều ngược `convertWorkbook`, `joinWorkbookMarkdown`, `listSheets` (`src/main/converter.ts`), `DEFAULT_OPTIONS`

- [ ] **Step 1: Viết test**

Với mỗi `test/golden/*.md` (Markdown do app tạo):
1. Golden: model → `buildWorkbook` → `writeBuffer` → `XLSX.read` → JSON `{ sheets: [{ name, merges: string[] (sort), cells: { [addr]: { v, t, z?, l? } } }] }` (`l` = `cell.l.Target`; chỉ ô có giá trị) → `toMatchFileSnapshot('../../../test/golden-md2xlsx/<tên file>.json')`.
2. Round-trip: `md₁` → `saveWorkbook` (thư mục tạm) → `md₂ = joinWorkbookMarkdown(base, convertWorkbook(path, names, DEFAULT_OPTIONS))` với `names` = mọi sheet không ẩn từ `listSheets` → `xlsx` → `md₃`; `expect(md₃).toBe(md₂)`; mọi chữ thu từ model của `md₁` (ô bảng, label/value meta, heading, paragraph, note, banner title — bỏ chuỗi rỗng) phải **bằng đúng** một chữ thu cùng cách từ model của `md₂`.

- [ ] **Step 2: Chạy `npx vitest run src/main/md2xlsx/golden.test.ts -u` lần đầu để ghi snapshot, rồi chạy lại không `-u`** → PASS. Mở `test/golden-md2xlsx/kihon-sekkei.xlsx.md.json` kiểm bằng mắt: `G?` có `<null>`, ô `版数` `1.0` là số với `z: "0.0"`, merge meta `B?:H?`.

- [ ] **Step 3: Xác nhận chiều Excel → Markdown không đổi** — `git status test/golden` → không thay đổi.

- [ ] **Step 4: Commit** — `git commit -m "test(md2xlsx): golden + round-trip với Markdown do app tạo"`

---

### Task 7: Worker, IPC, preload

**Files:**
- Create: `src/main/md2xlsx/mdHandler.ts`
- Modify: `src/main/workerProtocol.ts`, `src/main/worker.ts`, `src/main/guards.ts`, `src/main/errors.ts`, `src/main/index.ts`, `src/preload/index.ts`, `src/types.ts`, `src/renderer/src/api.ts`
- Test: `src/main/md2xlsx/mdHandler.test.ts`, `src/main/guards.test.ts`, `src/main/errors.test.ts`

**Interfaces:**
- Consumes: Task 2–5
- Produces:
  - `src/types.ts`: `AppMode = 'excel2md' | 'md2excel'`; `MdInspectResult { title: string | null; sheets: string[]; markdown: string }`; `MdConvertResult = { status: 'done'; outPath: string; sheets: string[] } | { status: 'cancelled' } | { status: 'declined' }`
  - `WorkerRequest` thêm `{ id; type: 'mdInspect'; path: string }` (data `MdInspectResult`) và `{ id; type: 'mdToXlsx'; files: string[]; outPath: string }` (data `{ outPath: string; sheets: string[] }`); `PARTIAL_SUFFIX` đã có từ Task 5 trong cùng file
  - `handleMdRequest(req: MdWorkerRequest): Promise<WorkerResponse>` với `MdWorkerRequest = Extract<WorkerRequest, { type: 'mdInspect' | 'mdToXlsx' }>`
  - `isMarkdownPath(p: unknown): boolean` (`guards.ts`)
  - `friendlyError(err: unknown, op: 'read' | 'write' = 'read'): string`
  - IPC: `dialog:openMarkdownFiles` → `string[]`; `md:inspect (path)` → `MdInspectResult`; `md:convert ({ files: string[]; outDir: string; fileName: string })` → `MdConvertResult`; Hủy dùng lại `excel:cancel`
  - `window.api`: `openMarkdownFiles(): Promise<string[]>`, `inspectMarkdown(path: string): Promise<MdInspectResult>`, `convertMarkdown(p: { files: string[]; outDir: string; fileName: string }): Promise<MdConvertResult>`

- [ ] **Step 1: Viết test thất bại**

```ts
// guards.test.ts
expect(isMarkdownPath('C:\\a\\b.md')).toBe(true); expect(isMarkdownPath('/a/B.MARKDOWN')).toBe(true)
expect(isMarkdownPath('b.md')).toBe(false); expect(isMarkdownPath('C:\\a\\b.xlsx')).toBe(false); expect(isMarkdownPath(1)).toBe(false)
// errors.test.ts
const w = 'Không ghi được file Excel. File có thể đang mở trong Excel — đóng file rồi thử lại.'
expect(friendlyError(new Error('EBUSY: resource busy or locked'), 'write')).toBe(w)
expect(friendlyError(new Error('EPERM: operation not permitted, rename'), 'write')).toBe(w)
expect(friendlyError(new Error('EPERM: x'))).toContain('Không đọc được file') // 'read' giữ nguyên
// mdHandler.test.ts (thư mục tạm; hai file per-sheet tạo từ hai phần của test/golden/kihon-sekkei.xlsx.md)
const r1 = await handleMdRequest({ id: 1, type: 'mdInspect', path: goldenCopy })
expect(r1).toEqual({ id: 1, ok: true, data: { title: 'kihon-sekkei', sheets: ['画面項目定義', 'テーブル定義'], markdown: goldenText } })
expect(await handleMdRequest({ id: 2, type: 'mdInspect', path: fixtureXlsx })).toEqual({ id: 2, ok: false, error: 'Chỉ đọc được file Markdown (.md).' })
const r3 = await handleMdRequest({ id: 3, type: 'mdToXlsx', files: [mdB, mdA], outPath: out })
expect(r3).toEqual({ id: 3, ok: true, data: { outPath: out, sheets: ['テーブル定義', '画面項目定義'] } })
expect(XLSX.readFile(out).SheetNames).toEqual(['テーブル定義', '画面項目定義'])
const r4 = await handleMdRequest({ id: 4, type: 'mdToXlsx', files: [mdA, join(dir, 'missing.md')], outPath: out2 })
expect(r4.ok).toBe(false); expect(!r4.ok && r4.error).toContain('missing.md'); expect(existsSync(out2)).toBe(false); expect(existsSync(out2 + '.partial')).toBe(false)
// Review Focus 5
const empty = join(dir, 'empty.md'); writeFileSync(empty, '# chỉ tiêu đề\n')
expect(await handleMdRequest({ id: 5, type: 'mdToXlsx', files: [empty], outPath: out3 })).toEqual({ id: 5, ok: false, error: 'Các file Markdown không có nội dung để tạo sheet.' })
expect(existsSync(out3)).toBe(false)
expect((await handleMdRequest({ id: 6, type: 'mdToXlsx', files: [mdA], outPath: join(dir, 'x.txt') })).ok).toBe(false)
```

- [ ] **Step 2: Chạy test, xác nhận FAIL** — `npx vitest run src/main/md2xlsx/mdHandler.test.ts src/main/guards.test.ts src/main/errors.test.ts`.

- [ ] **Step 3: Implement `isMarkdownPath`, `friendlyError(..., 'write')`, types, protocol, `handleMdRequest`**

`isMarkdownPath`: string tuyệt đối, đuôi `.md`/`.markdown` (không phân biệt hoa/thường). `handleMdRequest`: kiểm mọi đường dẫn bằng `isMarkdownPath` (lỗi `Chỉ đọc được file Markdown (.md).`), `outPath` tuyệt đối và đuôi `.xlsx`; đọc từng file UTF-8 — lỗi đọc → `Không đọc được file: <tên file>` (kèm `friendlyError`); `parseMarkdownFile` từng file theo thứ tự → nối sheet → `assignSheetNames` → 0 sheet → lỗi Review Focus 5; `const { buildWorkbook, saveWorkbook } = await import('./write')` (import động: worker preview không nạp exceljs); lỗi ghi → `friendlyError(err, 'write')`. `mdInspect` trả tên sheet **đã** qua `assignSheetNames`.

- [ ] **Step 4: Nối worker + main + preload**

`worker.ts`: `type` là `mdInspect`/`mdToXlsx` → `await handleMdRequest(req)`, còn lại giữ `handleRequest(cache, req)`. `index.ts`: `md:inspect` → `previewWorker`; `md:convert` → kiểm `files.every(isMarkdownPath)`; `outPath = join(outDir, safeFileName(fileName.replace(/\.xlsx$/i, '')) + '.xlsx')`; tạo `outDir` + kiểm quyền ghi như `excel:convert`; file tồn tại → `dialog.showMessageBox(mainWindow, { type: 'question', buttons: ['Ghi đè', 'Hủy'], defaultId: 1, cancelId: 1, message: \`File ${basename(outPath)} đã tồn tại. Ghi đè?\` })`, chọn Hủy → `{ status: 'declined' }`; dùng chung cờ `convertRunning`/`convertCancelRequested` và `convertWorker`; `CancelledError` → `rm(outPath + PARTIAL_SUFFIX, { force: true })` → `{ status: 'cancelled' }`; lỗi khác → dọn `.partial`, `logError('md:convert', err)`, trả lỗi. `dialog:openMarkdownFiles`: filter `{ name: 'Markdown', extensions: ['md', 'markdown'] }`. Preload + `api.ts` theo Interfaces.

- [ ] **Step 5: Chạy test + `npm run typecheck` + `npm run build`; kiểm main không nạp exceljs**

```bash
grep -c 'require("exceljs")' out/main/index.js out/main/worker.js
```
Expected: `0` cho cả hai (exceljs chỉ nằm trong chunk ở `out/main/chunks/` được `import()` động). `npm run e2e` vẫn 37/37 PASS.

- [ ] **Step 6: Commit** — `git commit -m "feat(md2xlsx): worker mdInspect/mdToXlsx, IPC md:convert, hỏi ghi đè, Hủy"`

---

### Task 8: Giao diện chế độ Markdown → Excel (+ E2E)

**Files:**
- Create: `src/renderer/src/hooks/useMdFiles.ts`, `src/renderer/src/components/MdFileList.tsx`, `src/renderer/src/components/MdOptionsPanel.tsx`, `src/renderer/src/utils.test.ts`
- Modify: `src/renderer/src/App.tsx`, `components/Header.tsx`, `components/Footer.tsx`, `components/ResultsPanel.tsx`, `utils.ts`, `styles.css`, `scripts/e2e.mjs`

**Interfaces:**
- Consumes: `window.api.openMarkdownFiles/inspectMarkdown/convertMarkdown/cancelConvert`, `defaultWorkbookName` (`src/shared/workbookName.ts`), `AppMode`, `MdInspectResult`, `MdConvertResult`
- Produces:
  - `moveItem<T>(list: T[], index: number, dir: -1 | 1): T[]` (`utils.ts`; ngoài biên → trả bản sao không đổi)
  - `MdFileItem { id: string; path: string; name: string; loading: boolean; error?: string; title: string | null; sheets: string[]; markdown: string }` (`types.ts`)
  - `Header` props thêm `mode: AppMode; onModeChange: (m: AppMode) => void` — hai nút `.x2m-mode-btn` chữ `Excel → Markdown` / `Markdown → Excel`, nút đang chọn có class `active`
  - `Footer` props: bỏ `fileCount`/`checkedCount`, thêm `status: string`, `convertLabel: string`, `canConvert: boolean`. Chế độ Excel truyền đúng chữ cũ (`${n} file, ${m} sheet được chọn`, `Convert ${m} sheet sang Markdown`) để E2E cũ không đổi.
  - `ResultsPanel` prop thêm `unitLabel?: string` (mặc định `file.md`)

- [ ] **Step 1: Viết test thất bại**

`utils.test.ts`: `moveItem(['a','b','c'], 2, -1)` → `['a','c','b']`; `moveItem(['a','b'], 0, -1)` → `['a','b']`; `moveItem(['a','b'], 1, 1)` → `['a','b']`.

`scripts/e2e.mjs` — thêm trước nhóm kiểm CSP cuối (tạo file từ hai phần của `test/golden/kihon-sekkei.xlsx.md`, ghi `kihon-sekkei__テーブル定義.md` và `kihon-sekkei__画面項目定義.md` vào thư mục tạm, thả theo **thứ tự đó**):
- click `Markdown → Excel` → nút có class `active`; vùng trống hiện `Kéo thả file Markdown vào đây`
- thả 2 file → danh sách có 2 file, mỗi file `1 sheet`; preview `.md-body` chứa `TBL_CUSTOMER`
- ô tên file (`input[aria-label="Tên file Excel"]`) có giá trị `kihon-sekkei`
- bấm `button[aria-label="Đưa lên"]` của file thứ 2 → thứ tự tên file `画面項目定義` trước `テーブル定義`
- thả `test/fixtures/kihon-sekkei.xlsx` → toast chứa `chế độ Excel → Markdown`; danh sách vẫn 2 file
- Ctrl+Enter → toast `Đã tạo kihon-sekkei.xlsx`; đọc `outDir/kihon-sekkei.xlsx` bằng SheetJS: `SheetNames` = `['画面項目定義', 'テーブル定義']`; sheet 1 có ô `v === '<null>'` và ô `v === 1 && z === '0.0'`; không file nào trong `outDir` kết thúc `.partial`; panel kết quả chứa `kihon-sekkei.xlsx` và `2 sheet`
- Hủy: tạo `big.md` (bảng 60 000 dòng × 10 cột), dùng danh sách chỉ gồm file này, đổi tên file thành `big` → Ctrl+Enter → bấm `Hủy` → toast `Đã hủy` trong < 2 s; `outDir` không có `big.xlsx` lẫn `big.xlsx.partial`
- click `Excel → Markdown` → danh sách Excel còn nguyên (`File Excel (3)`)

- [ ] **Step 2: Chạy, xác nhận FAIL** — `npx vitest run src/renderer/src/utils.test.ts` FAIL; `npm run e2e` → các kiểm mới FAIL, 37 kiểm cũ PASS.

- [ ] **Step 3: Implement**

- `utils.ts`: `moveItem`.
- `useMdFiles()`: state `MdFileItem[]` + `selectedId`; `addPaths(paths)`: chỉ nhận đuôi `.md`/`.markdown`, bỏ trùng đường dẫn, gọi `inspectMarkdown` từng file (lỗi → `error`); `remove(id)`, `move(id, dir)`, `select(id)`.
- `MdFileList`: tiêu đề `File Markdown (N)`, vùng trống `Kéo thả file Markdown vào đây`; mỗi file: tên, `N sheet` (hoặc `đang đọc...`/lỗi), dòng mờ liệt kê tên sheet, nút `↑` (`aria-label="Đưa lên"`), `↓` (`aria-label="Đưa xuống"`), `×` (`aria-label="Xóa khỏi danh sách"`); click tên → chọn.
- `MdOptionsPanel`: tiêu đề `Tùy chọn`; ô `Tên file Excel` (`aria-label="Tên file Excel"`) + hậu tố `.xlsx`; ghi chú: các file trong danh sách gộp thành một file Excel theo thứ tự danh sách; file trùng tên sẽ hỏi trước khi ghi đè.
- `App.tsx`: `mode` (lưu store khóa `mode`); chế độ `md2excel` hiển thị `MdFileList` / `PreviewPane` (title = tên file, `md` = `markdown` file đang chọn) / `MdOptionsPanel`; tên file mặc định = `defaultWorkbookName(files)` cho tới khi người dùng sửa ô tên. Footer: `status` = `${n} file, ${s} sheet sẽ tạo`, `convertLabel` = `Tạo file Excel (${s} sheet)`, `canConvert` = có ≥ 1 sheet và không file nào đang đọc/lỗi. Convert: `convertMarkdown` → `done` → toast `Đã tạo ${basename(outPath)} (${sheets.length} sheet)` + `ResultsPanel` một dòng (`fileName` = tên `.xlsx`, `filesWritten` = tên sheet, `unitLabel="sheet"`); `cancelled` → toast `Đã hủy tạo file Excel`; `declined` → không làm gì. Chưa có thư mục xuất → hỏi như chế độ Excel.
- Kéo-thả: chế độ `md2excel` thả file Excel → toast `File Excel: chuyển sang chế độ Excel → Markdown để convert`; chế độ `excel2md` thả `.md` → toast `File Markdown: chuyển sang chế độ Markdown → Excel để tạo file Excel`; không tự chuyển chế độ.
- Phím tắt theo chế độ: Ctrl+O chọn file đúng loại; Ctrl+Enter convert đúng chiều; ↑/↓ ở `md2excel` chọn file trước/sau.
- `styles.css`: `.x2m-mode`, `.x2m-mode-btn`, `.x2m-mode-btn.active` theo token màu sẵn có (hai theme).

- [ ] **Step 4: Chạy `npm test`, `npm run typecheck`, `npm run e2e`** → tất cả PASS (37 kiểm cũ + kiểm mới).

- [ ] **Step 5: Commit** — `git commit -m "feat(md2xlsx): giao diện chế độ Markdown -> Excel + E2E"`

---

### Task 9: Kiểm bằng Excel thật, tài liệu, dọn dẹp

**Files:**
- Create: `scripts/xlsx-snapshot.ps1` (lưu UTF-8 **có BOM** — PowerShell 5.1)
- Modify: `README.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, `package.json`, `package-lock.json`
- Delete: thư mục `spike/` (không track), dòng `spike/` trong `.git/info/exclude`

- [ ] **Step 1: Viết `xlsx-snapshot.ps1 -In <xlsx> -OutDir <dir>`**

Excel COM (`Visible = $true`, `DisplayAlerts = $false`), `Workbooks.Open(In, 0, $true)`; nếu `$excel.ActiveWindow.Caption` chứa `Repaired` hoặc `修復` → in `REPAIRED` và `exit 1`; mỗi sheet: `Activate`, chờ 300 ms, `UsedRange.CopyPicture(1, 2)`, `ChartObjects().Add` cùng kích thước, chờ, `Chart.Paste()`, `Chart.Export(OutDir\sheetN.png)`, xóa chart; in `OK <số sheet>`; `finally` `Quit()` + `ReleaseComObject`.

- [ ] **Step 2: Chạy trên output thật và xem ảnh**

Tạo `kihon-sekkei.xlsx` từ `test/golden/kihon-sekkei.xlsx.md` qua app (`npm run dev`, chế độ Markdown → Excel) rồi:
```bash
powershell -ExecutionPolicy Bypass -File scripts/xlsx-snapshot.ps1 -In <đường dẫn tuyệt đối .xlsx> -OutDir <thư mục tạm>
```
Expected: `OK 2`, không có `REPAIRED`. Mở PNG: banner, bảng 版数, meta merge, header bảng có nền + viền, ô `電話番号` 2 dòng giữ `　※`, đoạn văn trải ngang không bị cắt chữ, không tam giác xanh ở `0001`/`1.0`.

- [ ] **Step 3: Kiểm tay hỏi ghi đè** — trong `npm run dev`, tạo file Excel lần 2 cùng tên → hộp thoại `Ghi đè` / `Hủy`; chọn `Hủy` → không có toast lỗi, file cũ giữ nguyên; chọn `Ghi đè` → toast `Đã tạo …`.

- [ ] **Step 4: Tài liệu + version**

`package.json` version `2.2.0` (+ `npm install --package-lock-only`); `CHANGELOG.md` mục `2.2.0` (chế độ Markdown → Excel, exceljs chỉ để ghi, giới hạn round-trip đã biết ở spec §11); `README.md` (tính năng, cách dùng chế độ mới, `xlsx-snapshot.ps1`); `ARCHITECTURE.md` (module `md2xlsx/`, yêu cầu worker mới, IPC `md:*`).

- [ ] **Step 5: Dọn spike** — xóa thư mục `spike/` và dòng `spike/` trong `.git/info/exclude`.

- [ ] **Step 6: Kiểm cuối** — `npm run typecheck`, `npm test`, `npm run e2e` đều PASS; `git status test/golden` sạch.

- [ ] **Step 7: Commit** — `git commit -m "docs: 2.2.0 — chế độ Markdown -> Excel"`
