# 200-Round Professional Upgrade Loop — ExcelToMarkdown

## 0. QUY TẮC SỐNG CÒN (đọc trước mọi vòng)

**Tool `muse.write` / `muse.edit` BỊ HỎNG:** chúng lặng lẽ strip toàn bộ indentation
và làm rơi ký tự CJK (đã từng xóa `【項目定義】`, regex `/^【[^】]+】$/`).
=> **CẤM dùng muse.write/muse.edit cho mọi file source.** Mọi ghi/sửa file PHẢI qua
`muse.exec` + `python3` (stdin hoặc heredoc, byte-exact).
Sau mỗi lần ghi, VERIFY: `grep -c '^ ' <file>` (phải > 0 với file code),
`grep` các chuỗi CJK/regex quan trọng còn nguyên.

## 1. Protocol mỗi vòng

1. Đọc `PROGRESS.md` (vòng cuối đã làm) để resume.
2. Chọn **01** cải tiến duy nhất: ưu tiên giá trị thật cho user
   (đúng > đủ > đẹp). Không fluff, không churn mỹ phẩm vô nghĩa.
3. Implement nhỏ nhất giải quyết trọn vấn đề (laziness ladder).
4. Chạy `npm run typecheck` và `npm run test` — PHẢI pass mới được commit.
   Regression: với option mặc định, output trên 5 file thật
   (`~/workspace/user/files/*.xlsx`, CHỈ ĐỌC, không sửa) không được đổi
   ngoài ý đồ của vòng đó.
5. `git add -A && git commit -m "round N: <mô tả ngắn>"`.
6. Ghi `PROGRESS.md`: số vòng, thay đổi, kết quả verify.
7. Dừng khi đủ 200 vòng, hoặc khi đã cạn ý tưởng có giá trị thật
   (phải liệt kê các nhóm đã rà soát để chứng minh).

## 2. Backlog seed (tự tìm thêm bằng audit, đây chỉ là điểm khởi đầu)

### A. Engine converter — đúng đắn
- A1 Hyperlink (cell.l) -> `[text](url)` markdown link + test.
- A2 Dòng tiêu đề merge ngang phía trên bảng -> `###` heading thay vì quote + test.
- A3 Per-workbook mode: separator `---` giữa các sheet khi tắt includeSheetTitle.
- A4 Ô lỗi Excel (#DIV/0!, #N/A, #REF!) render nguyên văn + test.
- A5 Ô boolean -> TRUE/FALSE + test.
- A6 Số format kế toán (âm trong ngoặc), scientific notation + test.
- A7 Ô ngày có giờ (date+time format) + test.
- A8 Bảng header ô đầu rỗng + test.
- A9 Dòng ragged (số cột lệch header) -> pad cho đủ, không rách bảng + test.
- A10 Bảng rất rộng (50+ cột) vẫn hợp lệ + test.
- A11 Ô chỉ chứa `|` -> escape đúng + test.
- A12 Whitespace-only cells coi như rỗng + test.
- A13 Sheet có `!ref` thiếu nhưng cell tồn tại -> quét cell thay vì trả rỗng.
- A14 detectTwoColTables: test nhánh continuation (looksHeader2).
- A15 Nhiều bảng cách nhau bởi dòng trống -> flush đúng + test (đã có, mở rộng).

### B. Engine — vững chắc
- B1 File xlsx hỏng/cắt cụt -> lỗi sạch, không crash + test file rác.
- B2 File có mật khẩu -> thông báo rõ "file có mật khẩu".
- B3 File 0-byte / không phải Excel -> lỗi sạch.
- B4 File đang bị Excel khóa (lock) -> lỗi sạch.
- B5 .xls (BIFF8) parity: convert thử file .xls thật + test.
- B6 .xlsm có macro -> bỏ macro, convert giá trị + test.
- B7 Array formula -> cached values + test.
- B8 Shared formula liên sheet (đã có) + test mở rộng.
- B9 Sheet >50k dòng: đo, quyết định (cảnh báo/cap) + ghi PERF.md baseline.

### C. Output file
- C1 Trùng tên output: 2 file khác thư mục cùng basename ở per-workbook mode
  cùng ghi `report.md` -> dedupe bằng suffix ` (2)`. BUG THẬT, ưu tiên cao.
- C2 `safeFileName`: tên sheet kết thúc bằng dấu chấm/khoảng trắng (Windows cấm) -> trim.
- C3 Tên reserved Windows (CON, PRN, NUL...) -> prefix `_`.
- C4 Kiểm tra thư mục đích ghi được trước khi convert; tự tạo nếu chưa có.
- C5 Đường dẫn spec không tồn tại -> lỗi per-file rõ ràng.

### D. Main process / IPC
- D1 Preview race: chuyển sheet nhanh tay có thể hiện preview cũ (thiếu generation
  guard ở setTimeout+promise) -> thêm request id. BUG THẬT, ưu tiên cao.
- D2 Second-instance: nhận file từ CLI args / open-file -> thêm vào danh sách.
- D3 Hiện version app (từ package.json qua IPC) ở footer.
- D4 Log lỗi ra file trong userData (giới hạn size) để debug.

### E. UI/UX
- E1 Progress bar convert theo từng file (IPC progress events).
- E2 Ô tìm kiếm/lọc sheet khi nhiều sheet.
- E3 Preview: thống kê (số dòng, số bảng, số ký tự).
- E4 Preview bảng dài: giới hạn dòng + nút "hiện thêm".
- E5 Kết quả: nút "mở thư mục" từng file + nút copy đường dẫn.
- E6 Thư mục output gần đây (dropdown).
- E7 Kéo-thả file không phải Excel -> toast báo số file bị loại.
- E8 Onboarding hint lần đầu chạy (dismiss được, nhớ trạng thái).
- E9 Nút "khôi phục mặc định" cho tùy chọn.
- E10 Lần đầu chạy: theo theme OS thay vì cứng dark.
- E11 Nhớ kích thước/vị trí cửa sổ.
- E12 Zoom preview (Ctrl+=/-/0).
- E13 Ctrl+O thêm file.
- E14 Điều hướng sheet bằng phím mũi tên.
- E15 Source tab: số dòng (CSS counter).
- E16 Bảng dài: sticky header khi cuộn.
- E17 Status bar: số file, version engine, giờ convert cuối.

### F. Accessibility
- F1 aria-label cho mọi icon-button (hiện chỉ có title).
- F2 Kiểu focus-visible rõ ràng.
- F3 Contrast cả 2 theme đạt WCAG AA (đo + fix).
- F4 prefers-reduced-motion: tắt transition.
- F5 Label đầy đủ cho checkbox/radio với screen reader.

### G. Performance
- G1 Benchmark 5 file thật, ghi baseline PERF.md.
- G2 Đo listSheets với file lớn; tối ưu nếu chậm.

### H. Đóng gói & docs
- H1 README: screenshot, tính năng, FAQ, troubleshooting.
- H2 CHANGELOG.md.
- H3 LICENSE (MIT).
- H4 NSIS installer dùng tiếng Việt (MUI).
- H5 Quy tắc bump version.

### I. Test
- I1 Nâng lên 60+ tests.
- I2 Fuzz: grid ngẫu nhiên -> không crash, markdown hợp lệ (bảng không rách).

### J. Code quality
- J1 JSDoc cho mọi hàm export.
- J2 Không còn magic string rải rác -> constants.
- J3 ARCHITECTURE.md ngắn gọn.

## 3. Cấm
- Không sửa/xóa `~/workspace/user/files/*` (file thật của user, chỉ đọc).
- Không đụng MEMORY.md, không upload/publish gì, không liên hệ user.
- Không thêm dependency nặng nếu chưa chứng minh cần thiết.
- Không commit khi typecheck/test đỏ.
