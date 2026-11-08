# Kiến trúc ExcelToMarkdown

Electron + TypeScript + React (electron-vite) + Tailwind CSS v4. UI tiếng Việt, 2 theme.

## Luồng dữ liệu

```
Renderer (React) --IPC--> Main (Node) --message--> Worker (utilityProcess, SheetJS / exceljs)
     ^                      |   ^                        |
     |                      |   +---- Markdown ----------+   Excel -> Markdown
     +-- preview/kết quả ---+--> ghi file .md
     |                      |   +---- .xlsx (đã ghi) ----+   Markdown -> Excel
     |                      +--> hỏi ghi đè (dialog)
     |                      +--> RAG (chấm điểm tài liệu) --> Gemini / Claude / OpenAI   Trợ lý AI
```

Renderer không đụng filesystem: mọi đọc/ghi đi qua IPC, main kiểm mọi đường dẫn từ renderer
(`domain/guards.ts`). Parse Excel (dữ liệu không tin cậy) chạy trong utilityProcess riêng.

## Cấu trúc thư mục

```
src/
  shared/                        # thuần, dùng chung main + renderer (không import module Node riêng)
    types.ts                     # type + hằng chung (ConvertOptions, AI_PROVIDERS...)
    workbookName.ts, mdView.ts, guideHtml.ts
  preload/index.ts               # bridge tối thiểu qua contextBridge (window.api)
  main/
    index.ts                     # vòng đời app, một instance, mở file từ argv; đăng ký IPC
    window.ts                    # BrowserWindow: nhớ vị trí (bỏ nếu màn hình đã rút), chặn điều hướng
    cli.ts, mcp.ts, worker.ts    # điểm vào khác: CLI, MCP server (stdio), utilityProcess
    domain/                      # logic thuần, test không cần Electron
      excel/                     # Excel -> Markdown: converter, drawings (ảnh/shape/biểu đồ), output (tên file, escape)
      md2xlsx/                   # Markdown -> Excel: parse, inline, cellValue, names, layout, write
      rag/                       # chia mục, BM25 + từ điển Việt-Nhật, gom tài liệu cho AI
      guards.ts, errors.ts       # kiểm đường dẫn/URL/vị trí cửa sổ; dịch lỗi sang tiếng Việt
    application/ports/           # giao thức main <-> worker (chỉ type + hằng)
    adapters/
      inbound/
        ipc/                     # IPC theo tính năng: system, convert (excel:* + md:*), viewer (mdv:* + ảnh), ai
        cli/, mcp/, worker/      # CLI, MCP JSON-RPC, xử lý yêu cầu trong worker (+ cache workbook)
      outbound/
        store.ts                 # store.json (ghi tmp rồi rename, chuỗi hóa) + error.log
        llm/                     # client Gemini, Claude (SDK), OpenAI; aiConfig (mã hóa key, chuẩn hóa)
        converterWorker.ts       # client tới utilityProcess (id, tự khởi động lại, Hủy = kill)
        mdOutput.ts              # ghi .md + ảnh (app và CLI dùng chung)
        mdFolder.ts, ragDocCache.ts, xlsxFiles.ts, xlsxWriter.ts
  shared/ (thêm)                 # thuần, test bằng vitest, dùng chung main + renderer
    specDiff.ts                  # So sánh 新旧: diff theo sheet -> mục -> dòng bảng (khóa ID), inline diff, báo cáo
    revision.ts                  # dòng 改訂履歴 từ SpecDiff (Markdown / TSV)
    tableDef.ts                  # テーブル定義書 -> TableDef -> DDL (5 dialect) / ER Mermaid / JSON
    specIndex.ts                 # Bản đồ thiết kế: màn hình, 遷移, bảng, tham chiếu, 影響調査, 整合性チェック
    translate.ts, textFold.ts    # prompt + nhận diện ngôn ngữ cho Dịch nhanh; so khớp không phân biệt hoa thường / かな
  renderer/src/
    App.tsx                      # layout + chuyển chế độ + nối các feature
    features/
      excel2md/                  # FileList, OptionsPanel, useFiles, usePreview, useExcelConvert
      md2excel/                  # MdFileList, MdOptionsPanel, useMdFiles, useMdConvert
      viewer/                    # MdTreeList, useMdViewer
      ai/                        # AiChatPanel
    components/                  # UI dùng chung: Header, Footer, PreviewPane, ResultsPanel, SidePanel, Toasts, icons
    hooks/useShortcuts.ts
    lib/                         # api (kiểu window.api), sanitize (lọc HTML), mermaid, ui (class Tailwind), utils
```

Quy tắc phụ thuộc: `domain/` không import Electron hay adapter; `adapters/inbound` gọi domain và
`adapters/outbound`; chỉ `index.ts` ghép mọi thứ. Code mới cần Electron để ở adapter, logic để ở domain
(hoặc file thuần trong adapter như `aiConfig.ts`) để test được.

## Main process

- **Không nạp SheetJS, không nạp exceljs** (`out/main/index.js` không được chứa `require("exceljs")`).
- `ipc/convert.ts`: hai worker (preview cache 3 workbook, convert cache 1) để preview không chờ
  convert hàng loạt và Hủy không ảnh hưởng preview. Hai chiều chuyển đổi dùng chung cờ
  `convertRunning` (mỗi lúc một lần convert) và `excel:cancel`. Trước khi ghi, hỏi ghi đè nếu file
  đích đã có (`plannedMdFileNames` tính trước tên `.md`; test giữ nó khớp `workbookMdFiles`).
  Markdown → Excel: worker ghi `.partial` rồi đổi tên; Hủy/lỗi dọn `.partial`.
- `ipc/system.ts`: `store:*` không bao giờ đọc/ghi khóa API Key (`isSecretStoreKey`); `shell:openPath`
  chỉ mở thư mục.
- `ipc/viewer.ts`: scheme ảnh `x2m-img:` chỉ phục vụ file ảnh nằm trong thư mục đã mở để đọc;
  `mdv:search` chỉ tìm trong thư mục đã mở bằng `mdv:list` (khớp dòng: `domain/mdSearch.ts`).
- `converterWorker.ts`: worker preview có giới hạn 120 giây/yêu cầu (quá thì kill + khởi động lại);
  XML lớp vẽ tìm phần tử bằng `indexOf` (`elements()` trong `drawings.ts`), không dùng regex lười
  `[\s\S]*?` trên XML không tin cậy (O(n²) khi thẻ không đóng).
- `ipc/ai.ts`: API Key mã hóa bằng `safeStorage` (fallback base64 khi OS không có keyring), renderer
  chỉ thấy bản che; mọi thông báo lỗi đi qua `redactApiKey`.

## Worker (`src/main/worker.ts` → `out/main/worker.js`, utilityProcess)

- `workerHandler.ts` — listSheets / preview / convert (thuần, có test).
- `mdHandler.ts` — `mdInspect` / `mdToXlsx`, không bao giờ ném (lỗi thành `ok: false` tiếng Việt).
  **exceljs chỉ được nạp bằng import động khi có `mdToXlsx`.**
- `workbookCache.ts` — LRU workbook đã parse, kiểm mtime + size mỗi lần lấy.

## Engine converter (tóm tắt)

1. `sheetToGrid`: đọc cell trong `effectiveRange` (góc trên-trái theo `!ref`, góc
   dưới-phải cắt về ô có nội dung cuối — `!ref` của Excel có thể phình theo vùng định
   dạng) thành string[][], escape Markdown/HTML inline từng ô (`escapeMarkdownInline`),
   lan merge **dọc** (trừ dòng banner).
2. `sheetToMarkdown`: duyệt từng dòng —
   banner 基本設計 → quote + bảng version;
   dòng meta (機能ID/画面ID/...) → bullet, dòng nối tiếp → sub-bullet;
   `【...】`/`■...` → `###`; dòng 1 ô trên bảng → `###`;
   bảng (No/№/項番 hoặc heuristic) → bảng Markdown, bỏ cột trống;
   còn lại → quote/text. Block mới sau sub-bullet luôn cách 1 dòng trống.
3. Ô: hyperlink → `[text](url)`, nhiều dòng → `<br>`, `|` → `\|`,
   công thức → giá trị cache, lỗi → nguyên văn; text đứng đầu dòng (đoạn văn, quote,
   sub-bullet) escape thêm cú pháp block (`# `, `> `, `- `, `1. `, `---`).
   Khoảng trắng ASCII gộp, toàn角 (U+3000) giữ.

## Engine Markdown → Excel (`src/main/domain/md2xlsx/`, tóm tắt)

Thuần Node (test được không cần Electron); `write.ts` là module duy nhất nạp exceljs.
Thiết kế và quyết định: `docs/superpowers/specs/2026-10-19-md-to-excel-design.md`.

| Module | Việc |
|---|---|
| `model.ts` | Mô hình trung gian: `SheetModel` { tên, `Block[]` } với block banner / table / meta / heading / note / paragraph / code; `XCell` (chữ + link tuỳ chọn). |
| `inline.ts` | Token inline của `marked` → chữ hiển thị của ô (chiều ngược của `escapeMarkdownInline`); cả ô là một link http/https/mailto thì giữ link. |
| `cellValue.ts` | Quy tắc giá trị ô: `10` số, `1.0`/`1.10` số + format `0.0`/`0.00`, `1,234` → `#,##0`, `1,234.50` → `#,##0.00` (số chữ số thập phân theo chữ), `12.50%` → số/100 + `0.00%`; `0001`, số > 11 chữ số, ngày, `#N/A`... giữ text. |
| `parse.ts` | `parseMarkdownFile(md, fileName)` → `{ title, sheets }`: tách sheet (ranh giới file và `---` ngoài cùng, `##` đầu phần là tên sheet), nhận banner 基本設計, bảng, meta `**label**:`/`**label**：` (chỉ trong list không đánh số; list đánh số luôn giữ `N. `), section, ghi chú, đoạn văn, list, code; `<br>` trong khối HTML thành xuống dòng. Không crash với Markdown bất kỳ. |
| `names.ts` | `assignSheetNames`: tên sheet hợp lệ (ký tự cấm `[]:*?/\` và `'` ở đầu/cuối thành `_`; ký tự điều khiển cấm của XML bị bỏ; ≤ 31 ký tự; không trùng → ` (2)`; `History` → `History_`). |
| `layout.ts` | Độ rộng hiển thị cho độ rộng cột (CJK = 2); ước lượng số dòng của ô merge theo kiểu chữ (`body` 游ゴシック 10, `bold` nhãn meta, `heading` 游ゴシック 12 đậm, `code` MS Gothic 10 đơn cách — bề rộng glyph đo bằng Excel thật; mô phỏng Excel xuống dòng sau khoảng trắng và sau dấu `-` (một dấu `-` cuối dòng được treo)); `splitByLines` tách đoạn quá cao thành nhiều hàng. |
| `glyphTable.ts` | Dữ liệu đo (sinh bằng `scripts/measure-glyphs`, không sửa tay): ký tự BMP ngoài ASCII mà Excel hiển thị rộng hơn 1em (⟶ ⸻ U+FDFD, chữ Ấn/Đông Nam Á…); `layout.ts` cộng thêm emoji `\p{Emoji_Presentation}` (✅ ❌ ⭐ ⌛…) tính 20px. |
| `write.ts` | `buildWorkbook(sheets)` ghi bố cục (font 游ゴシック 10, màu, viền, merge, wrap, A4 ngang vừa 1 trang rộng; chiều cao dòng = **16.5pt × số dòng**, đo bằng Excel thật; heading và từng dòng code cũng merge A..cột cuối + tự xuống dòng (heading 19.5pt/dòng, code MS Gothic 12pt/dòng + 1.5, tối thiểu 15) để không bị cắt khi in; hàng ≤ 409.5pt nên đoạn / heading / dòng code dài tách thành nhiều hàng merge liền nhau). `saveWorkbook` chèn `ignoredErrors` (không tam giác xanh) vào XML từng sheet bằng JSZip, ghi `.partial` rồi đổi tên. |
| `mdHandler.ts` | `handleMdRequest`: `mdInspect` / `mdToXlsx`. Một file lỗi (không đọc được, hoặc không phải UTF-8) → dừng, chưa ghi gì. |

Luồng `mdToXlsx`: đọc + parse từng file theo thứ tự danh sách → `assignSheetNames` trên toàn bộ
sheet (trùng tên giữa các file cũng thành `Tên (2)`) → `buildWorkbook` → `saveWorkbook`.

Ràng buộc: exceljs 4.4.0 **chỉ để ghi** file do app tạo, không bao giờ đọc file ngoài (test
chỉ đọc lại buffer do chính code tạo, bằng SheetJS). `out/main/index.js` không được chứa
`require("exceljs")`. Output Excel → Markdown (`test/golden/*.md`, `*.sheets.json`) không đổi.

Kiểm bằng Excel thật: `scripts/xlsx-snapshot.ps1` (xem README) mở file bằng COM, báo
`REPAIRED` nếu Excel đòi sửa file, và chụp ảnh từng sheet để review bố cục.

## Quy ước

- Mỗi thay đổi: typecheck + test xanh mới commit. Regression: golden test
  (`src/main/domain/excel/golden.test.ts`, file mẫu `test/fixtures`, output `test/golden`);
  đổi output có chủ ý thì `npm run test:update` và review diff `test/golden`.
  Chiều Markdown → Excel: `src/main/domain/md2xlsx/golden.test.ts` (golden JSON `test/golden-md2xlsx`
  + round-trip với Markdown do app tạo); **không** sửa `test/golden` để chiều này ổn định hơn.
- Đổi UI / IPC / main: chạy `npm run e2e` (build + điều khiển app Electron thật qua
  DevTools Protocol, `scripts/e2e.mjs`). Cần màn hình, không chạy trong CI.
- Lịch sử quá trình làm: `docs/history/` (BACKLOG, PROGRESS, AUDIT, PERF).
