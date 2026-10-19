# Changelog

> Quy tắc bump version (semver): `patch` (1.2.x) cho fix bug không đổi hành vi;
> `minor` (1.x.0) cho tính năng mới/tùy chọn mới; `major` (x.0.0) khi đổi format
> output mặc định hoặc breaking change IPC. Mỗi release cập nhật file này.

## 2.2.0 — 2026-10-19
Minor: tính năng mới; **output Excel → Markdown không đổi** (`test/golden/*.md` giữ nguyên byte).
- Tính năng: chế độ **Markdown → Excel** (công tắc ở Header, nhớ chế độ cuối). Chọn file `.md`
  bằng kéo-thả / `Ctrl+O`, ↑/↓ đổi thứ tự, xem trước Markdown + danh sách sheet, ô "Tên file
  Excel" (mặc định theo tên chung trước `__`), `Ctrl+Enter` tạo file. **Mọi file trong danh sách
  gộp thành một `.xlsx`**; có nút Hủy; file đích đã có thì hỏi `Ghi đè` / `Hủy`; ghi file tạm
  `.partial` rồi đổi tên nên Hủy/lỗi không để lại `.xlsx` dở; một file `.md` lỗi thì không tạo
  file. File `.md` không phải UTF-8 (vd Shift_JIS) bị từ chối với thông báo nêu tên file, thay
  vì ghi chữ lỗi mã vào Excel.
- Bố cục Excel: font 游ゴシック 10, ẩn gridline, A4 ngang vừa 1 trang rộng; banner 基本設計,
  bảng 版数, meta merge ngang, bảng có header nền + viền, section, ghi chú, đoạn văn. Chữ trong
  ô là chữ hiển thị (bỏ escape, `<br>` thành xuống dòng); số giữ đúng hiển thị (`0001` text,
  `1.0` → `0.0`, `12.50%` → `0.00%`) và không có tam giác xanh (`ignoredErrors`).
- Markdown viết tay: list đánh số luôn giữ số `N. ` (kể cả `1. **初期表示**: …`, không thành
  ô meta); list con đánh số trong value meta và trong ghi chú `>` cũng giữ số. `<br>` trong khối
  HTML (vd `<br>` rồi xuống dòng `次の段落`) thành xuống dòng, không còn lọt chữ `<br>` vào ô.
- Dependency: **exceljs 4.4.0 chỉ dùng để GHI** file do app tạo (không bao giờ đọc file ngoài),
  thêm `jszip`; `npm audit` báo 2 moderate (`uuid`), chấp nhận vì chỉ ghi. Main process không
  nạp exceljs: worker nạp bằng `import()` động khi có yêu cầu `mdToXlsx`.
- Chiều cao dòng: Excel không tự giãn ô merge nên app tự tính, theo **16.5pt mỗi dòng** (đo bằng
  Excel thật với 游ゴシック 10). Đoạn văn/ghi chú dài hoặc nhiều dòng trải ngang cả bề rộng
  bảng; đoạn cao hơn 409.5pt (giới hạn một hàng Excel) được **tách thành nhiều hàng merge liền
  nhau**. Số dòng ước lượng theo bề rộng glyph đo bằng Excel thật (chữ hoa, số, định danh
  `TBL_CUSTOMER`… rộng hơn chữ thường) và mô phỏng xuống dòng theo khoảng trắng như Excel, nên
  câu SQL/định danh dài không còn bị che dòng cuối (kiểm bằng AutoFit của Excel thật).
- Kiểm tra: `scripts/xlsx-snapshot.ps1` mở file bằng Excel thật (COM), báo `REPAIRED` nếu Excel
  đòi sửa file và chụp PNG từng sheet; test golden + round-trip cho chiều mới; E2E mở rộng
  (54 kiểm tra), 404 unit test.
- Giới hạn round-trip đã biết (spec §11): `md → xlsx → md` chỉ ổn định với Markdown do app tạo;
  label meta ngoài `META_LABELS` của engine Excel → Markdown (vd `**作成者**:`) và bảng 2 cột có
  thể ra khác sau một vòng. Chỉ ghi chữ thuần (không giữ đậm/nghiêng giữa câu); link nội bộ `#…`
  và scheme khác http/https/mailto thành chữ thuần; `---` trang trí trong Markdown viết tay tách
  thêm sheet.

## 2.1.0 — 2026-10-19
- Hiệu năng: đọc Excel trong tiến trình riêng (Electron utilityProcess). Cửa sổ không
  còn treo khi convert file lớn (E2E 3 file 60k dòng: IPC chậm nhất 1693 ms → ~5 ms);
  file quá lớn có làm worker crash cũng không sập app.
- Tính năng: nút **Hủy** khi đang convert (dừng sau ~0.1 s; file đã ghi giữ nguyên,
  file chưa xong báo "Đã hủy").
- Hiệu năng: cache workbook đã parse (theo đường dẫn + mtime/size). Đổi sheet khi xem
  trước file 10 sheet × 5000 dòng: ~760 ms → ~27 ms.
- Bảo mật: Content-Security-Policy cho giao diện (không inline script, không tải mạng).
- Code: tách `App.tsx` (1190 dòng) thành components + hooks; main process không nạp
  SheetJS.
- Test: E2E `npm run e2e` (37 kiểm tra trên app Electron thật); 186 unit test.

## 2.0.0 — 2026-10-19
Major vì **đổi format output mặc định** (escape) — xem quy tắc bump ở đầu file.
- Engine: escape ký tự Markdown/HTML trong ô (tùy chọn "Escape ký tự Markdown/HTML
  trong ô", mặc định bật). Nội dung ô hiển thị nguyên văn khi render: `<null>`,
  `<input>` không bị ẩn; `*必須*`, `__x__` không thành nghiêng/đậm; `&nbsp;` không
  thành entity; `1~10, 20~30` không gạch ngang; `[a](b)` không thành link; `# x`,
  `1. x`, `- x`, `---` đầu dòng không thành heading/list/đường kẻ. Chỉ escape chỗ bị
  hiểu nhầm (`snake_case`, `a < b`, `<画面名>`, `1~10` giữ nguyên). Tắt tùy chọn để
  có output như 1.x.
- Engine: luôn có dòng trống trước bảng/heading/quote/đoạn văn đi sau sub-bullet meta.
  Trước đây bảng nằm ngay dưới dòng nối tiếp meta (Excel không có dòng trống) bị
  render lồng trong list item, đoạn văn bị nối vào bullet.
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
