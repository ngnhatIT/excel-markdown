# Kiến trúc ExcelToMarkdown

Electron + TypeScript + React (electron-vite) + Tailwind CSS v4. UI tiếng Việt, 2 theme.

## Luồng dữ liệu

```
Renderer (React) --IPC--> Main (Node) --message--> Worker (utilityProcess, SheetJS)
     ^                      |   ^                        |
     |                      |   +---- Markdown ----------+   Excel -> Markdown
     +-- preview/kết quả ---+--> ghi file .md
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
    window.ts                    # BrowserWindow (sandbox): nhớ vị trí + phóng to (bỏ vị trí nếu màn hình đã rút), chặn điều hướng
    menu.ts, diagnostics.ts      # menu Sửa / Xem / Trợ giúp (Giới thiệu, thư mục log, chẩn đoán, đặt lại cài đặt)
    i18nMain.ts                  # chữ do main hiện (hộp thoại, menu, ghi chú) theo khóa 'lang' của store
    worker.ts                    # điểm vào khác: utilityProcess
    domain/                      # logic thuần, test không cần Electron
      excel/                     # Excel -> Markdown: converter, drawings (ảnh/shape/biểu đồ), output (tên file, escape)
      rag/                       # chia mục, BM25 + từ điển Việt-Nhật, gom tài liệu cho AI
      guards.ts, errors.ts       # kiểm đường dẫn/URL/vị trí cửa sổ; dịch lỗi sang tiếng Việt
    application/ports/           # giao thức main <-> worker (chỉ type + hằng)
    adapters/
      inbound/
        ipc/                     # IPC theo tính năng: system, convert (excel:* + md:*), viewer (mdv:* + ảnh), ai
        worker/                  # xử lý yêu cầu trong worker (+ cache workbook)
      outbound/
        store.ts                 # store.json (ghi tmp rồi rename, chuỗi hóa) + error.log
        llm/                     # client Gemini, Claude (SDK), OpenAI; aiConfig (mã hóa key, chuẩn hóa)
        converterWorker.ts       # client tới utilityProcess (id, tự khởi động lại, Hủy = kill)
        mdOutput.ts              # ghi .md + ảnh
        mdFolder.ts, ragDocCache.ts, xlsxFiles.ts
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

- **Không nạp SheetJS** trong main process.
- `ipc/convert.ts`: hai worker (preview cache 3 workbook / 150 MB file nguồn, convert cache 1; preview
  gửi renderer tối đa 2 000 000 ký tự) để preview không chờ
  convert hàng loạt và Hủy không ảnh hưởng preview. Hai chiều chuyển đổi dùng chung cờ
  `convertRunning` (mỗi lúc một lần convert) và `excel:cancel`. Trước khi ghi, hỏi ghi đè nếu file
  đích đã có (`plannedMdFileNames` tính trước tên `.md`; test giữ nó khớp `workbookMdFiles`).
- `ipc/system.ts`: `store:*` không bao giờ đọc/ghi khóa API Key (`isSecretStoreKey`), giá trị ≤ 1 MB JSON;
  `shell:openPath` chỉ mở thư mục; `log:renderer` nhận lỗi từ ErrorBoundary của renderer.
- Lỗi IPC trả về renderer là mã `E_…` (tham số sau `|`, vd `E_WORKER_TIMEOUT|120`), renderer dịch
  (`i18n/errors.ts`); `domain/errors.ts` (`errorCode` / `describeError`) có cùng chữ cho worker
  (`friendlyError` = tiếng Việt) và lỗi từng file trong kết quả convert.
- Crash: `uncaughtException` / `unhandledRejection` / `child-process-gone` ghi `logs/error.log`
  (quá 512 KB thì chuyển sang `error.1.log`); `render-process-gone` hỏi tải lại cửa sổ.
- `ipc/viewer.ts`: scheme ảnh `x2m-img:` chỉ phục vụ file ảnh nằm trong thư mục đã mở để đọc;
  `mdv:search` chỉ tìm trong thư mục đã mở bằng `mdv:list` (khớp dòng: `domain/mdSearch.ts`).
- `converterWorker.ts`: worker preview có giới hạn 120 giây/yêu cầu (quá thì kill + khởi động lại);
  XML lớp vẽ tìm phần tử bằng `indexOf` (`elements()` trong `drawings.ts`), không dùng regex lười
  `[\s\S]*?` trên XML không tin cậy (O(n²) khi thẻ không đóng).
- `ipc/ai.ts`: API Key mã hóa bằng `safeStorage` (fallback base64 khi OS không có keyring), renderer
  chỉ thấy bản che; mọi thông báo lỗi đi qua `redactApiKey`.

## Worker (`src/main/worker.ts` → `out/main/worker.js`, utilityProcess)

- `workerHandler.ts` — listSheets / preview / convert (thuần, có test).
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

## Quy ước

- Mỗi thay đổi: typecheck + test xanh mới commit. Regression: golden test
  (`src/main/domain/excel/golden.test.ts`, file mẫu `test/fixtures`, output `test/golden`);
  đổi output có chủ ý thì `npm run test:update` và review diff `test/golden`.
- Đổi UI / IPC / main: chạy `npm run e2e` (build + điều khiển app Electron thật qua
  DevTools Protocol, `scripts/e2e.mjs`). Cần màn hình, không chạy trong CI.
- Lịch sử quá trình làm: `docs/history/` (BACKLOG, PROGRESS, AUDIT, PERF).
