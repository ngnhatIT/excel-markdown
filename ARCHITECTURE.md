# Kiến trúc ExcelToMarkdown

Electron + TypeScript + React (electron-vite). UI tiếng Việt, 2 theme.

## Luồng dữ liệu

```
Renderer (React) --IPC--> Main (Node) --> file .md
     ^                         |
     +---- preview/stats -------+
```

- **Renderer** (`src/renderer/`): chọn file, tick sheet, xem preview (rendered/source),
  chỉnh options, bấm convert. Không đụng filesystem trực tiếp.
  `sanitize.ts` lọc HTML preview (chống XSS từ nội dung cell).
- **Preload** (`src/preload/`): bridge tối thiểu qua contextBridge
  (`window.api`): dialog, store, listSheets, previewSheet, convert, openPath, getVersion.
- **Main** (`src/main/`):
  - `converter.ts` — engine thuần (không phụ thuộc Electron): đọc cell qua SheetJS,
    nhận diện banner 基本設計 / meta / section / bảng, render Markdown.
    Test được trực tiếp bằng vitest.
  - `index.ts` — BrowserWindow, IPC handlers, ghi file output, store JSON,
    log lỗi, nhớ bounds cửa sổ.
  - `errors.ts` — map lỗi kỹ thuật sang tiếng Việt.
  - `guards.ts` — kiểm tra an toàn: chỉ cho reload đúng trang (chặn mọi điều hướng
    khác), chỉ mở ngoài URL http/https/mailto, `openPath` chỉ nhận thư mục.

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
   còn lại → quote/text.
3. Ô: hyperlink → `[text](url)`, nhiều dòng → `<br>`, `|` → `\|`,
   công thức → giá trị cache, lỗi → nguyên văn; text đứng đầu dòng (đoạn văn, quote,
   sub-bullet) escape thêm cú pháp block (`# `, `> `, `- `, `1. `, `---`).
   Khoảng trắng ASCII gộp, toàn角 (U+3000) giữ.

## Quy ước

- Mỗi thay đổi: typecheck + test xanh mới commit. Regression: golden test
  (`src/main/golden.test.ts`, file mẫu `test/fixtures`, output `test/golden`);
  đổi output có chủ ý thì `npm run test:update` và review diff `test/golden`.
- Xem BACKLOG.md (kế hoạch 200 vòng), PROGRESS.md (tiến độ), AUDIT.md (báo cáo audit).
