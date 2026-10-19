# Changelog

> Quy tắc bump version (semver): `patch` (1.2.x) cho fix bug không đổi hành vi;
> `minor` (1.x.0) cho tính năng mới/tùy chọn mới; `major` (x.0.0) khi đổi format
> output mặc định hoặc breaking change IPC. Mỗi release cập nhật file này.

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
