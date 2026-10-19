# Changelog

> Quy tắc bump version (semver): `patch` (1.2.x) cho fix bug không đổi hành vi;
> `minor` (1.x.0) cho tính năng mới/tùy chọn mới; `major` (x.0.0) khi đổi format
> output mặc định hoặc breaking change IPC. Mỗi release cập nhật file này.

## 2.0.0 — 2026-10-19
Major vì **đổi format output mặc định** (escape) — xem quy tắc bump ở đầu file.
- Engine: escape ký tự Markdown/HTML trong ô (tùy chọn "Escape ký tự Markdown/HTML
  trong ô", mặc định bật). Nội dung ô hiển thị nguyên văn khi render: `<null>`,
  `<input>` không bị ẩn; `*必須*`, `__x__` không thành nghiêng/đậm; `&nbsp;` không
  thành entity; `1~10, 20~30` không gạch ngang; `[a](b)` không thành link; `# x`,
  `1. x`, `- x`, `---` đầu dòng không thành heading/list/đường kẻ. Chỉ escape chỗ bị
  hiểu nhầm (`snake_case`, `a < b`, `<画面名>`, `1~10` giữ nguyên). Tắt tùy chọn để
  có output như 1.x.
- Engine: giữ khoảng trắng toàn角 (U+3000) giữa chữ và ở đầu dòng 2+ trong ô nhiều
  dòng (trước đây gộp thành 1 dấu cách ASCII).
- Hiệu năng: quét theo vùng có nội dung thật thay vì `!ref` (Excel ghi `!ref` theo
  vùng có định dạng). Sheet `!ref` A1:AZ300000 với 1 ô: 11.8 s / 402 MB → ~0 ms.
  Danh sách sheet hiện số dòng thật. Merge vượt ngoài `!ref` không còn crash.
- Test: golden test với 3 file Excel mẫu (`test/fixtures`, gồm 2 file do Excel 16
  ghi: .xlsx và .xls); 71 test round-trip escape qua `marked`; tổng 173 test.
  `npm run test:update` cập nhật golden.

## 1.3.1 — 2026-10-19
- Fix: kéo-thả file vào app không hoạt động (Electron 32+ bỏ `File.path`);
  chuyển sang `webUtils.getPathForFile` qua preload.
- Bảo mật: nâng SheetJS 0.18.5 → 0.20.3 (cài từ cdn.sheetjs.com), vá
  GHSA-4r6h-8v6p-xvw6 (prototype pollution) và GHSA-5pgg-2g8v-p4x9 (ReDoS).
- Bảo mật: nâng Electron 34 (hết hỗ trợ) → 44.9.0; electron-builder 26.15.3.
- Bảo mật: cửa sổ app không còn bị điều hướng bởi link trong preview (link
  tương đối / `file://` / UNC bị chặn); chỉ link http/https/mailto mở trình
  duyệt ngoài. `shell:openPath` chỉ mở thư mục, từ chối mọi file.
- Dev: `npm run dev` tự tải binary Electron nếu thiếu (`predev`).
- Thay đổi hành vi: hộp thoại chọn file/thư mục mặc định mở thư mục Downloads
  (Electron 43+).
- Test: 91 test (thêm 7 test cho `guards.ts`).

## 1.3.0 — 2026-10-12
- Engine: bỏ dòng ma từ merge dọc trong header; hyperlink trong meta; ô đơn lẻ
  trùng meta label thành bullet.
- Bảo mật: sanitize HTML preview chống XSS; link mở trình duyệt ngoài.
- UX: progress bar từng file; second-instance nhận file; nhớ sheet đã chọn;
  giờ convert cuối; empty state lọc sheet; Escape đóng panel.
- A11y: contrast WCAG AA; aria-label/labels; role=status; focus-visible.
- Robust: lỗi tiếng Việt (ENOENT/EACCES/EISDIR); serialize store writes;
  guard IPC khi đóng window; bỏ file workbook rỗng.
- Test: 80 test (fuzz + regression file thật).

## 1.2.0 — 2026-10-12
- Tùy chọn nhận diện bảng 2 cột (mặc định tắt).
- Sheet ẩn trong Excel: hiện tag "ẩn", mặc định không tick.
- Hỗ trợ file .xls.
- Phím tắt Ctrl+O (thêm file), Ctrl+Enter (convert).
- 28 unit test cho converter; CI GitHub Actions.

## 1.1.0 — 2026-10-12
- Nhận diện tài liệu 基本設計: banner, meta 機能ID/画面ID/テーブルID, section 【...】/■....
- Bảng No/№/項番, ô merge dọc, công thức liên sheet, ô nhiều dòng.
- Preview rendered/source, copy Markdown, xuất per-sheet/per-workbook.

## 1.0.0 — 2026-10-12
- Bản đầu tiên: chọn file Excel, convert sang Markdown.
