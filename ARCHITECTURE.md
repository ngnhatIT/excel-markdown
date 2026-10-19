# Kiến trúc ExcelToMarkdown

Electron + TypeScript + React (electron-vite). UI tiếng Việt, 2 theme.

## Luồng dữ liệu

```
Renderer (React) --IPC--> Main (Node) --message--> Worker (utilityProcess, SheetJS)
     ^                      |   ^                        |
     |                      |   +---- Markdown ----------+
     +-- preview/kết quả ---+--> ghi file .md
```

- **Renderer** (`src/renderer/`): chọn file, tick sheet, xem preview (rendered/source),
  chỉnh options, bấm convert / Hủy. Không đụng filesystem trực tiếp.
  - `App.tsx` — state chính + ghép component.
  - `components/` — Header, FileList, PreviewPane, ResultsPanel, OptionsPanel, Footer,
    Toasts, icons.
  - `hooks/` — `useFiles` (file + sheet + nhớ lựa chọn), `usePreview` (debounce +
    generation guard), `useShortcuts` (phím tắt).
  - `api.ts` — kiểu `window.api`; `sanitize.ts` lọc HTML preview (chống XSS từ nội dung ô).
  - CSP (chỉ bản build, chèn trong `electron.vite.config.ts`): chỉ tài nguyên trong app,
    không inline script, không tải mạng.
- **Preload** (`src/preload/`): bridge tối thiểu qua contextBridge (`window.api`): dialog,
  store, listSheets, previewSheet, convert, cancelConvert, openPath, getVersion,
  getPathForFile.
- **Main** (`src/main/index.ts`): BrowserWindow, IPC handlers, ghi file output, store
  JSON, log lỗi, nhớ bounds cửa sổ. **Không nạp SheetJS.**
  - `converterWorker.ts` — client tới worker: request/response theo id, tự khởi động
    lại, `cancel()` = kill process (parse SheetJS đồng bộ, không ngắt giữa chừng được).
    Hai instance: preview/liệt kê sheet (cache 3 workbook) và convert (cache 1), để
    preview không chờ convert hàng loạt và Hủy không ảnh hưởng preview.
  - `output.ts` — escape Markdown inline, ghép file per-workbook, tên file an toàn.
  - `errors.ts` — map lỗi kỹ thuật sang tiếng Việt.
  - `guards.ts` — chỉ cho reload đúng trang (chặn mọi điều hướng khác), chỉ mở ngoài
    URL http/https/mailto, `openPath` chỉ nhận thư mục.
- **Worker** (`src/main/worker.ts` → `out/main/worker.js`, utilityProcess):
  - `workerHandler.ts` — xử lý listSheets / preview / convert (thuần, có test).
  - `workerProtocol.ts` — type request/response (main chỉ import type).
  - `workbookCache.ts` — LRU workbook đã parse, kiểm tra mtime + size mỗi lần lấy.
  - `converter.ts` — engine thuần (không phụ thuộc Electron): đọc cell qua SheetJS,
    nhận diện banner 基本設計 / meta / section / bảng, render Markdown.

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
  (`src/main/golden.test.ts`, file mẫu `test/fixtures`, output `test/golden`);
  đổi output có chủ ý thì `npm run test:update` và review diff `test/golden`.
- Đổi UI / IPC / main: chạy `npm run e2e` (build + điều khiển app Electron thật qua
  DevTools Protocol, `scripts/e2e.mjs`). Cần màn hình, không chạy trong CI.
- Xem BACKLOG.md (kế hoạch 200 vòng), PROGRESS.md (tiến độ), AUDIT.md (báo cáo audit).
