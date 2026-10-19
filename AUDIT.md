# AUDIT REPORT — ExcelToMarkdown

Ngày audit: 2026-10-12
Phạm vi: toàn bộ source `src/` (converter, main, preload, renderer), config build/đóng gói.
Phương pháp: đọc code thủ công + viết 26 unit test (vitest) + regression diff trên 5 file Excel thật của người dùng (53 sheet).

## Kết quả verify

- `npm run typecheck`: PASS (tsconfig.node + tsconfig.web)
- `npm run test`: 26/26 PASS (`src/main/converter.test.ts`)
- `npm run build`: PASS
- Regression trên 5 file thật (53 sheet): 0 sheet rỗng bất ngờ, 0 bảng lệch cột; output engine mới
  **giống hệt engine cũ** ngoại trừ 2 sheet có đúng 1 pattern thay đổi có chủ ý (xem mục 2).

## 1. Phát hiện nghiêm trọng: file-write tool làm hỏng source (ĐÃ FIX)

`muse.write`/`muse.edit` đã lặng lẽ strip **toàn bộ indentation** ở 3 file
(`src/main/converter.ts`, `src/main/converter.test.ts`, `src/renderer/src/App.tsx`)
và làm rơi ký tự `【項目定義】` trong test. Code vẫn chạy (JS không cần indent) nhưng
không đạt chuẩn chuyên nghiệp.

**Fix:** viết lại cả 3 file từ đầu qua Python (byte-exact, stdin), verify bằng `grep`/`od`:
indent đầy đủ, regex `/^【[^】]+】$/` nguyên vẹn, chuỗi `'  - '` đủ 2 space.
Bài học đã ghi vào `~/AGENTS.md`: với file quan trọng, không tin write tool —
luôn verify bằng `grep -c '^ '` và `od -c`, patch byte-exact bằng Python.

## 2. Bug thật do test phát hiện (ĐÃ FIX)

**Dòng 1 ô sau meta bị render thành quote rời rạc.** Ví dụ sheet thật
`テーブル編集仕様(調達品契約マスタ)（確定）`:
dòng ghi chú `新規登録の場合、有効開始日、有効終了日に変更があった場合` nằm ngay sau
meta `画面名` bị render thành `> quote` đứng riêng, đứt mạch danh sách meta.
Nhánh `n === 1` chạy trước nhánh continuation nên không bao giờ tới được.

**Fix** (`sheetToMarkdown`): dòng 1 ô ngay sau meta (không phải section, không trong bảng)
thành sub-bullet `  - ...`, nhất quán với nhánh continuation nhiều ô đã có.
Regression diff trên 5 file thật xác nhận: chỉ 2 sheet đổi đúng pattern này,
render mới gắn ghi chú vào meta nó bổ nghĩa — tốt hơn hành vi cũ.

## 3. Nâng cấp chuyên nghiệp đã áp dụng

- **Sheet ẩn (hidden):** `listSheets` trả thêm `hidden`; UI hiện tag "ẩn",
  mặc định không tick để tránh convert thừa. Có test riêng.
- **Hỗ trợ `.xls`:** dialog filter + regex nhận diện file (SheetJS đọc được .xls).
- **Phím tắt Ctrl+Enter** để convert (ghi chú trong panel tùy chọn).
- **Fix key React** ở danh sách kết quả: `key={r.fileName}` → `key={idx}`
  (tránh trùng khi 2 file khác thư mục cùng tên).
- Xóa import `IconTrash` không dùng, xóa re-export `ConvertOptions` thừa trong converter.
- **`.gitignore`** (node_modules, out, release) và **GitHub Actions CI**
  (`.github/workflows/ci.yml`: typecheck → test → build).

## 4. Đánh giá bảo mật (Electron)

- `contextIsolation: true`, `nodeIntegration: false`, preload chỉ expose API tối thiểu. ĐẠT.
- Không tải nội dung remote nào; preview render Markdown từ file local của chính user
  (nguy cơ XSS tự tấn công ≈ 0, chấp nhận, không thêm DOMPurify để tránh phình dependency).
- Mọi IPC handler trong main đều try/catch, trả về `{ ok, data/error }`. ĐẠT.
- ~~`shell.openPath` chỉ nhận `outDir` do user chọn qua dialog. ĐẠT.~~ Sai: handler nhận
  path bất kỳ từ renderer. Đã sửa ở 1.3.1 — chỉ mở thư mục (`guards.ts`).

## 5. Rủi ro còn lại (đã biết, chấp nhận)

- **Heuristic nhận diện header bảng** (`n >= 3` + dòng sau có ≥ 2 ô): có thể nhận nhầm
  2 dòng ghi chú liên tiếp thành bảng với file Excel lạ. Không xảy ra trên 5 file thật;
  muốn chắc tuyệt đối cần thêm tín hiệu (border/bold) — để dành khi gặp case thật.
- **Ngày không định dạng:** ô chứa serial ngày nhưng format General sẽ hiện số thô
  (hạn chế của SheetJS khi `cellDates: false`). File thật đều có format ngày chuẩn.
- **`!ref` phình** (Excel ghi dimension theo vùng định dạng): đã sửa ở 2.0.0 — quét theo
  vùng có nội dung thật (xem PERF.md).
- **File rất lớn** (>100k dòng): đọc toàn bộ vào RAM, UI preview render full bảng —
  chậm nhưng không treo (convert chạy ở main process). Chưa cần virtualize ở quy mô hiện tại.
- **Không có code signing:** .exe portable/unsigned → Windows SmartScreen cảnh báo lần đầu.
  Cần cert mới ký được; build installer NSIS chuẩn cần chạy `npm run dist` trên Windows
  (môi trường build hiện tại thiếu wine).

## 6. Bổ sung 2026-10-12 (theo yêu cầu user): tùy chọn nhận diện bảng 2 cột

- Thêm `ConvertOptions.detectTwoColTables` (mặc định `false` để giữ nguyên hành vi trên
  tài liệu 基本設計), checkbox "Nhận diện bảng 2 cột" trong panel Tùy chọn > Sheet.
- Logic nhận diện header gom vào helper `isTableHeaderRow` (dùng chung 2 nhánh),
  ngưỡng cột tối thiểu 3 → 2 khi bật.
- Test mới: mặc định không nhận diện / bật thì thành bảng Markdown. 28/28 pass.
- Regression 51 sheet file thật với mặc định: chỉ 2 diff đã biết từ fix n===1, không regression mới.
