# Cấu hình dự án dùng chung (`x2m.json`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Một file `x2m.json` trong thư mục tài liệu quy định tùy chọn convert và luật nhận diện cho cả đội; app, CLI, MCP cùng đọc.

**Architecture:** Parse/validate thuần trong `src/shared/projectConfig.ts`; tìm file (đi lên thư mục cha, dừng ở `.git`) trong một adapter outbound của main. Luật truyền vào `buildSpecIndex` (lưu trên `SpecIndex.project` để `crudMatrix` dùng) và `diffSpecMarkdown` dưới dạng tham số tùy chọn: không truyền = hành vi cũ. Renderer lấy cấu hình qua IPC `config:find` và tự gộp tùy chọn convert.

**Tech Stack:** TypeScript, Electron (main / preload / renderer React), vitest.

**Spec:** `docs/superpowers/specs/2026-11-15-team-config-design.md`

## Global Constraints

- Không có `x2m.json` → mọi kết quả giống hệt trước (golden test hiện có không đổi).
- Tên file: `x2m.json`. Tối đa 256 KB. UTF-8, cho phép BOM, JSON chuẩn.
- `rules.*`: mảng chuỗi, mỗi chuỗi 1–40 ký tự, tối đa 200 mục mỗi danh sách; so khớp sau `NFKC` + chữ thường; không regex.
- `convert`: mọi khóa của `ConvertOptions` trừ `range`.
- Sai thì bỏ phần sai + cảnh báo, không bao giờ throw ra ngoài.
- `textconv` và `workbookMarkdownForDiff` không đổi.
- Chữ hiển thị có đủ vi / en / ja.

## Review Focus

- JSON hỏng / mảng thay vì object / `rules.crudVerbs` là mảng → cảnh báo, config rỗng (Task 1).
- Chữ mơ hồ chứa ký tự regex (`(仮)`, `*`) → khớp nguyên văn, không lỗi (Task 3).
- `x2m.json` là thư mục, hoặc không đọc được (EACCES) → coi như không có, cảnh báo (Task 2).
- Sửa `x2m.json` khi đang mở bản đồ thiết kế → lần tính sau dùng luật mới (cache key, Task 6).
- `diffKeyColumns` khai cột không duy nhất → rơi về luật cũ như hiện nay (Task 4).

---

### Task 1: Parse và kiểm `x2m.json`

**Files:**
- Create: `src/shared/projectConfig.ts`
- Test: `src/shared/projectConfig.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const PROJECT_CONFIG_FILE = 'x2m.json'
  export const PROJECT_CONFIG_MAX_BYTES = 256 * 1024
  export type CrudOp = 'C' | 'R' | 'U' | 'D'   // re-export từ specIndex nếu tránh được vòng import; nếu không, khai ở đây và specIndex import từ đây
  export interface ProjectRules {
    ambiguousWords: string[]; screenIdLabels: string[]; transitionLabels: string[]
    crudVerbs: Record<CrudOp, string[]>; diffKeyColumns: string[]
  }
  export interface ProjectConfig { convert: Partial<ConvertOptions>; rules: ProjectRules }
  export interface FoundProjectConfig { path: string; config: ProjectConfig; warnings: string[] }
  export const EMPTY_RULES: ProjectRules
  export function parseProjectConfig(text: string): { config: ProjectConfig; warnings: string[] }
  ```
  Chuỗi trong `rules` được lưu đã `normalize('NFKC').toLowerCase().trim()`. Cảnh báo là chuỗi tiếng Việt ngắn có tên khóa (vd `rules.screenIdLabels[3]: quá 40 ký tự, bỏ qua`).

- [ ] **Step 1: Viết test** `parseProjectConfig`:
  - `'{}'` → `config.convert` là `{}`, `rules` bằng `EMPTY_RULES`, `warnings` rỗng.
  - BOM + `{"convert":{"frontMatter":true,"chunkRows":50}}` → `convert` đúng `{ frontMatter: true, chunkRows: 50 }`.
  - `{"convert":{"range":"A1:B2","chunkRows":-1,"multiline":"x","foo":1}}` → `convert` rỗng, 4 cảnh báo (range không cho phép, chunkRows sai, multiline sai, khóa lạ).
  - `'not json'`, `'[]'`, `'null'` → config rỗng, đúng 1 cảnh báo.
  - `{"rules":{"screenIdLabels":["画面コード","",  "x".repeat(41), 5]}}` → `['画面コード']`, 3 cảnh báo.
  - 201 mục → giữ 200, 1 cảnh báo.
  - `{"rules":{"crudVerbs":{"C":["起票"],"X":["a"]}}}` → `crudVerbs.C = ['起票']`, các op khác `[]`, 1 cảnh báo.
  - `{"rules":{"crudVerbs":["a"]}}` → 1 cảnh báo, crudVerbs rỗng.
  - `ＡＢＣ` trong danh sách → lưu `abc`.
- [ ] **Step 2:** `npx vitest run src/shared/projectConfig.test.ts` → FAIL (module chưa có).
- [ ] **Step 3:** Viết `parseProjectConfig`. Kiểm kiểu từng khóa `convert` theo `DEFAULT_OPTIONS` (boolean/number nguyên ≥ 0/enum `multiline: 'br'|'space'`, `verticalMerge: 'repeat'|'empty'|'ditto'`).
- [ ] **Step 4:** Chạy lại → PASS.
- [ ] **Step 5:** Commit `feat(config): parse x2m.json`.

### Task 2: Tìm file trên đĩa

**Files:**
- Create: `src/main/adapters/outbound/projectConfigFile.ts`
- Test: `src/main/adapters/outbound/projectConfigFile.test.ts`

**Interfaces:**
- Consumes: `parseProjectConfig`, `PROJECT_CONFIG_FILE`, `PROJECT_CONFIG_MAX_BYTES`, `FoundProjectConfig`.
- Produces: `findProjectConfig(startDir: string): Promise<FoundProjectConfig | null>`

- [ ] **Step 1: Test** (thư mục tạm qua `mkdtemp`):
  - `root/x2m.json` + start `root/a/b` → `path === join(root,'x2m.json')`.
  - `root/.git/` + `root/x2m.json` không có, cha của root có `x2m.json` → `null` (dừng ở `.git`).
  - Không có gì tới gốc ổ đĩa → `null` (start là thư mục tạm không có `.git` phía trên: dùng `root/.git` làm chặn để test xác định).
  - `x2m.json` là thư mục → bỏ qua, đi tiếp lên trên.
  - File 300 KB → trả `FoundProjectConfig` với config rỗng và 1 cảnh báo "quá lớn".
  - `startDir` tương đối → `null`.
- [ ] **Step 2:** Chạy → FAIL.
- [ ] **Step 3:** Hiện thực: `stat` từng ứng viên, chỉ nhận `isFile()`; `.git` là file hoặc thư mục đều tính là gốc repo; lỗi đọc khác ENOENT → trả config rỗng + cảnh báo.
- [ ] **Step 4:** PASS. **Step 5:** Commit `feat(config): find x2m.json upward`.

### Task 3: Luật trong bản đồ thiết kế (画面ID, 遷移, mơ hồ, CRUD)

**Files:**
- Modify: `src/shared/specIndex.ts` (`buildSpecIndex` dòng ~182, nhãn dòng 240-249, mơ hồ dòng ~442, `SpecIndex` dòng 87, `crudOpsOf`/`crudMatrix` dòng ~621-670)
- Test: `src/shared/specIndex.test.ts`

**Interfaces:**
- Consumes: `ProjectRules`, `FoundProjectConfig`.
- Produces:
  - `SpecIndex.project?: { path: string; warnings: string[]; rules: ProjectRules }`
  - `buildSpecIndex(input: SpecDoc[], project?: SpecIndex['project']): SpecIndex`
  - `crudOpsOf(text: string, extra?: ProjectRules['crudVerbs']): CrudOp[]`; `crudMatrix(index)` dùng `index.project?.rules.crudVerbs`.

- [ ] **Step 1: Test:**
  - `- **画面コード**: S01` + `- **遷移先**: S02` với rules thêm hai nhãn → có screen `S01` và transition `S01→S02`; không rules → không có screen.
  - Dòng `要調整のこと` trong tài liệu có 画面ID, rules `ambiguousWords: ['要調整']` → issue `ambiguous-term` subject `要調整`; chữ `(仮)` với dòng `名称(仮)` → khớp, không throw.
  - `crudOpsOf('伝票を起票する', { C: ['起票'], R: [], U: [], D: [] })` → `['C']`; không extra → `[]`.
  - `crudMatrix` trên index có `project.rules.crudVerbs.C = ['起票']` → ô C cho bảng được nhắc trong dòng `起票`.
  - Không truyền `project` → `index.project` là `undefined` (golden/test cũ không đổi).
- [ ] **Step 2:** FAIL. **Step 3:** Hiện thực: nhãn so `normLabel(m[1])` với `Set` có sẵn ∪ rules (rules đã chuẩn hóa; nếu `normLabel` khác phép NFKC+lowercase thì chuẩn hóa rules bằng `normLabel` tại chỗ). Mơ hồ: kiểm `AMBIGUOUS_RE` trước, nếu không khớp thì tìm từ rules bằng `includes` trên `plain(line).normalize('NFKC').toLowerCase()`, subject là từ gốc trong rules. CRUD: `CRUD_VERBS[op].test(t) || extra[op].some(w => lower.includes(w))`.
- [ ] **Step 4:** `npx vitest run src/shared` → PASS. **Step 5:** Commit `feat(config): project rules in spec index`.

### Task 4: Cột khóa khi so sánh 新旧

**Files:**
- Modify: `src/shared/specDiff.ts` (`Ctx` dòng 370, `diffTable` dòng ~426-432, `diffSpecMarkdown` dòng 574)
- Test: `src/shared/specDiff.test.ts`

**Interfaces:**
- Produces: `diffSpecMarkdown(oldMd: string, newMd: string, rules?: Pick<ProjectRules, 'diffKeyColumns'>): SpecDiff`; `Ctx.keyColumns: string[]`.

- [ ] **Step 1: Test:** bảng có cột `項目コード` (duy nhất) và không có cột ID nào khác; chèn một dòng giữa bảng, đổi thứ tự hai dòng → với `{ diffKeyColumns: ['項目コード'] }` báo đúng 1 dòng thêm, khóa `項目コード=…`; không rules → hành vi cũ (assert theo kết quả hiện tại). Cột khai báo không duy nhất → kết quả giống không rules.
- [ ] **Step 2:** FAIL. **Step 3:** Cột khai báo xét trước `ID_PRIORITY`, so tên cột sau NFKC + lowercase + trim. **Step 4:** PASS. **Step 5:** Commit `feat(config): diff key columns`.

### Task 5: CLI và MCP

**Files:**
- Modify: `src/main/adapters/inbound/cli/cliCore.ts` (`parseArgs` dòng 70, `loadSpecIndex` dòng 201, convert dòng ~349, `USAGE`)
- Modify: `src/main/adapters/inbound/mcp/mcpCore.ts` (`convert_excel` dòng 244-265, `impact` 341, `crud` 352; lint nếu có tool)
- Test: `src/main/adapters/inbound/cli/cliCore.test.ts`, test MCP hiện có

**Interfaces:**
- Consumes: `findProjectConfig`, `buildSpecIndex(docs, project)`.
- Produces:
  - `parseArgs(argv: string[], base: ConvertOptions = DEFAULT_OPTIONS): CliArgs`; `CliArgs.noConfig: boolean`.
  - `loadSpecIndex(root: string): Promise<SpecIndex>` (gắn `project` khi tìm thấy).
  - `configNote(found: FoundProjectConfig | null): string[]` — dòng `CẤU HÌNH <path>` + mỗi cảnh báo `CẤU HÌNH ⚠ <warning>`; rỗng khi null.

- [ ] **Step 1: Test:**
  - `parseArgs(['a.xlsx','-o','o'], { ...DEFAULT_OPTIONS, frontMatter: true })` → `options.frontMatter === true`; thêm `--no-escape` → `escapeMarkdown === false`.
  - `parseArgs([..., '--no-config'])` → `noConfig === true`.
  - `runCli` convert với `outDir/x2m.json` `{"convert":{"frontMatter":true}}` → file `.md` bắt đầu bằng `---`; log có dòng bắt đầu `CẤU HÌNH `. Với `--no-config` → không front-matter, không dòng `CẤU HÌNH`.
  - `runCli(['lint', dir])` với `x2m.json` khai `screenIdLabels` → đếm đúng số màn hình.
  - MCP `convert_excel`: dòng `CẤU HÌNH` không bị tính là file đã ghi, và xuất hiện trong chữ kết quả; `impact`/`crud` có dòng `Cấu hình dự án: <path>` khi có file.
- [ ] **Step 2:** FAIL. **Step 3:** Convert: parse lần một để lấy `-o`, `findProjectConfig(resolve(outDir))` (bỏ khi `--no-config`), parse lại với `base = {...DEFAULT_OPTIONS, ...config.convert}`; ghi `configNote` qua `log` trước khi convert. `lint`/`impact`/`crud` CLI in `configNote` ra stderr (stdout của impact/crud là dữ liệu). **Step 4:** PASS. **Step 5:** Commit `feat(config): x2m.json in CLI and MCP`.

### Task 6: IPC trong app

**Files:**
- Modify: `src/main/adapters/inbound/ipc/system.ts` (thêm `config:find`, `config:open`)
- Modify: `src/main/adapters/inbound/ipc/viewer.ts` (`mdv:specIndex` dòng ~250)
- Modify: `src/preload/index.ts`, `src/renderer/src/lib/api.ts` (kiểu `window.api`)

**Interfaces:**
- Produces (renderer):
  - `window.api.configFind(dir: string): Promise<FoundProjectConfig | null>` — main kiểm `isOpenableDirectory(dir)`, sai → `null`.
  - `window.api.configOpen(path: string): Promise<void>` — main chỉ mở khi `basename(path) === 'x2m.json'` và `path` đúng là kết quả `config:find` gần nhất (giữ `Set` các path đã trả).
  - `SpecIndex.project` có mặt khi thư mục mở có cấu hình.

- [ ] **Step 1:** Test thuần (nếu tách được hàm kiểm) cho điều kiện `configOpen`; còn lại kiểm bằng typecheck + e2e tay ở Task 7.
- [ ] **Step 2:** `mdv:specIndex`: gọi `findProjectConfig(root)`; khóa cache = khóa cũ + `JSON.stringify(found)`; truyền `project` vào `buildSpecIndex`.
- [ ] **Step 3:** `npm run typecheck` sạch. **Step 4:** Commit `feat(config): config IPC`.

### Task 7: Giao diện

**Files:**
- Modify: `src/renderer/src/App.tsx` (state `options`/`outDir` dòng 72-74, `usePreview` dòng 398), `src/renderer/src/features/excel2md/useExcelConvert.ts` (dòng ~54), `src/renderer/src/features/excel2md/OptionsPanel.tsx`
- Modify: `src/renderer/src/features/compare/useCompare.ts` (`diffSpecMarkdown` call), `ComparePane.tsx`
- Modify: `src/renderer/src/features/viewer/SpecMapPane.tsx` (hiện `index.project`)
- Modify: `src/renderer/src/i18n/{vi,en,ja}.ts`

**Interfaces:**
- Consumes: `configFind`, `configOpen`, `SpecIndex.project`, `diffSpecMarkdown(old, new, rules)`.

- [ ] **Step 1:** App: `projectCfg` state, tìm lại khi `outDir` đổi; `effectiveOptions = { ...options, ...projectCfg?.config.convert }` dùng cho preview và truyền vào `useExcelConvert`. `useExcelConvert`: sau `ensureOutDir()` gọi lại `configFind(dir)` và gộp trước khi gửi `convert`.
- [ ] **Step 2:** OptionsPanel nhận `locked: Set<keyof ConvertOptions>` + `configPath`; control bị khóa `disabled` + `title`; dải chú thích "Theo x2m.json của dự án" + nút mở file + cảnh báo nếu có. Preset bị vô hiệu khi có khóa nào bị khóa.
- [ ] **Step 3:** Compare: `configFind(dirname(newPath))` khi bản mới đổi (dirname làm ở main hoặc bằng cắt chuỗi `/`/`\\`); truyền `rules` vào `diffSpecMarkdown`; dòng chú thích khi có.
- [ ] **Step 4:** SpecMapPane: dòng nhỏ "Cấu hình dự án: x2m.json" + cảnh báo khi `index.project`.
- [ ] **Step 5:** i18n 3 ngôn ngữ; `src/renderer/src/i18n/i18n.test.ts` kiểm đủ khóa → chạy `npx vitest run src/renderer`.
- [ ] **Step 6:** `npm run typecheck && npm test && npm run build`. Chạy app (`npm run dev`), thư mục xuất có `x2m.json` → control bị khóa, preview có front-matter. Commit `feat(config): x2m.json in UI`.

### Task 8: Tài liệu

- [ ] README: mục "Cấu hình dự án (x2m.json)" (ví dụ đầy đủ từ spec, bảng tìm ở đâu, `--no-config`, không áp dụng cho textconv). CHANGELOG: mục `Unreleased`.
- [ ] Commit `docs: x2m.json`.
