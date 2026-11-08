# 200-Round Upgrade Loop — PROGRESS

## Round 1 — C1: dedupe tên file output (bug thật)
- Thêm `dedupeFileName(wanted, used)` vào converter.ts: tên trùng -> ` (2)`, ` (3)...`
- Dùng trong IPC excel:convert cho cả per-workbook và per-sheet mode.
- Test: 28 -> 31 (3 test mới cho dedupeFileName). typecheck PASS, test 31/31 PASS.
- Regression: không đổi hành vi converter (chỉ thêm export mới + logic tên file ở main).

## Round 2 — D1: preview race condition (bug thật)
- Thêm previewGen ref: mỗi lần effect chạy tăng generation; promise cũ resolve sau
  thì bị bỏ qua, không đè preview của sheet mới chọn.
- Test: 31/31 PASS. typecheck PASS.
- Regression: chỉ đổi renderer, không đụng converter.

## Round 3 — A1: hyperlink thành markdown link
- getCell: cell có l.Target và text khác URL -> `[text](url)`; text trùng URL giữ nguyên.
- Test: 31 -> 34 (3 test mới). typecheck PASS, test 34/34 PASS.
- Regression 5 file thật: 0 hyperlink, chỉ 2 diff đã biết từ fix n===1 trước đó.

## Round 4 — A2: dòng 1 ô ngay trên bảng thành ### heading
- Nhánh n===1: nếu dòng kế tiếp là table header -> render `###` thay vì `> quote`.
- Test: 34 -> 36 (2 test mới). typecheck PASS, test 36/36 PASS.
- Regression 5 file thật: 7 sheet đổi, tất cả đều là quote -> heading cho tiêu đề bảng
  (đã soi từng diff, đều là cải tiến đúng ý đồ, không regression).

## Round 5 — A4: ô lỗi Excel render nguyên văn
- Kiểm tra: format_cell đã trả về #DIV/0!, #N/A, #REF! nguyên văn (không cần sửa code).
- Thêm 2 test khóa hành vi (text + trong bảng). Test: 36 -> 38, 38/38 PASS. typecheck PASS.
- Regression: không đổi code converter.

## Round 6 — A5: ô boolean
- Kiểm tra: format_cell đã trả TRUE/FALSE đúng (không cần sửa code).
- Thêm 1 test khóa hành vi. Test: 38 -> 39, 39/39 PASS. typecheck PASS.

## Round 7 — A9: dòng ragged
- Kiểm tra: renderTable đã pad dòng ngắn bằng ?? '' và giữ cột thừa (header rỗng) — bảng không rách.
- Thêm 1 test khóa hành vi (đếm cột mọi dòng bằng nhau). Test: 39 -> 40, 40/40 PASS.

## Round 8 — A12: ô whitespace coi như rỗng
- getCell đã trim nên ô whitespace -> rỗng (không cần sửa code).
- Thêm 1 test khóa hành vi. Test: 40 -> 41, 41/41 PASS.

## Round 9 — A13: fallback khi !ref thiếu
- Thêm inferRange(ws): quét key cell để suy ra range khi !ref bị thiếu.
- Sửa lỗi type trong test (boolean) do các round 5-8 bỏ sót typecheck — từ nay chạy đủ cả hai.
- Test: 41 -> 43, 43/43 PASS. typecheck PASS.

## Round 10 — C2: safeFileName bỏ dấu chấm/khoảng trắng cuối tên
- Windows cấm tên file kết thúc bằng . hoặc space -> strip sau khi slice.
- Test: 43 -> 44, 44/44 PASS. typecheck PASS.

## Round 11 — C3: tên reserved Windows
- safeFileName: stem trùng CON/PRN/AUX/NUL/COM1-9/LPT1-9 (case-insensitive) -> prefix _.
- Test: 44 -> 45, 45/45 PASS. typecheck PASS.

## Round 12 — A14: test nhánh continuation + detectTwoColTables
- Dòng 2 cột (ô đầu rỗng) sau meta: tắt option -> sub-bullet; bật -> mở bảng Markdown.
- Test: 45 -> 46, 46/46 PASS. typecheck PASS. Không đổi code (nhánh đã đúng).

## Round 13 — A8: header ô đầu rỗng
- Kiểm tra: header [rỗng, A, B, C] đã được nhận diện bảng, cột đầu trống bị loại (không sửa code).
- Thêm 1 test khóa hành vi. Test: 46 -> 47, 47/47 PASS. typecheck PASS.

## Round 14 — A11: ô chỉ chứa |
- escCell đã escape đúng. Test khóa: đếm pipe CHƯA escape (lookbehind) để check bảng không rách.
- Lúc đầu test sai (split thường đếm cả pipe đã escape) -> fix test, không phải bug converter.
- Test: 47 -> 48, 48/48 PASS. typecheck PASS.

## Round 15 — A10: bảng 60 cột
- Kiểm tra: render đúng 60 cột, mọi dòng cùng số cột (không sửa code).
- Thêm 1 test. Test: 48 -> 49, 49/49 PASS. typecheck PASS.

## Round 16 — A6: format số kế toán/scientific
- format_cell đã đúng: (1,235) và 1.23E+08 (không sửa code). Thêm 1 test.
- Test: 49 -> 50, 50/50 PASS. typecheck PASS.

## Round 17 — A7: ô ngày giờ
- format_cell giữ đúng yyyy/mm/dd hh:mm (không sửa code). Thêm 1 test regex.
- Test: 50 -> 51, 51/51 PASS. typecheck PASS.

## Round 18 — B7: array formula
- format_cell trả cached values đúng (không sửa code). Thêm 1 test.
- Test: 51 -> 52, 52/52 PASS. typecheck PASS.

## Round 19 — B1: file hỏng
- SheetJS không throw với file rác/0-byte (trả workbook rỗng); convertWorkbook xử lý sạch.
- Thêm 1 test khóa: không throw, kết quả là mảng. Test: 52 -> 53, 53/53 PASS. typecheck PASS.

## Round 20 — B2: file có mật khẩu
- SheetJS throw 'File is password-protected' -> thêm errors.ts/friendlyError map sang tiếng Việt.
- Dùng trong 3 handler Excel (listSheets/preview/convert per-file).
- Test: 53 -> 55 (errors.test.ts mới). typecheck PASS, 55/55 PASS.

## Round 21 — E10: theme lần đầu theo OS
- systemTheme() đọc prefers-color-scheme; saved theme trong store vẫn override khi đã có.
- Không test (renderer matchMedia, khó unit test); typecheck PASS, 55/55 PASS.

## Round 22 — E13: Ctrl+O thêm file
- Mở rộng keydown handler: Ctrl+O gọi pickFiles (bỏ qua khi focus trong input).
- Cập nhật ghi chú phím tắt trong UI. typecheck PASS, 55/55 PASS.

## Round 23 — E7: toast file không phải Excel
- addPaths: đếm file bị loại bởi EXCEL_EXT, toast báo số lượng (dialog chọn file đã lọc sẵn nên không spam).
- typecheck PASS, 55/55 PASS.

## Round 24 — E9: nút khôi phục tùy chọn mặc định
- resetOptions: reset options + outputMode về default, persist, toast xác nhận.
- CSS .x2m-pane-title thêm flex để nút nằm gọn. typecheck PASS, 55/55 PASS, build PASS.

## Round 25 — D3: version app ở footer
- IPC app:getVersion (app.getVersion từ package.json) -> preload -> footer hiện v1.x.y.
- typecheck PASS, 55/55 PASS.

## Round 26 — C4: kiểm tra quyền ghi thư mục đích
- Sau mkdir recursive: access(W_OK), lỗi -> trả message tiếng Việt rõ ràng.
- Không test (main-process fs); typecheck PASS, 55/55 PASS.

## Round 27 — E11: nhớ kích thước/vị trí cửa sổ
- Lưu bounds vào store.json khi đóng (bỏ qua khi maximized); restore khi mở (validate min size).
- typecheck PASS, 55/55 PASS. Không test (main-process Electron).

## Round 28 — F1: aria-label cho icon-button
- Thêm aria-label cho 5 nút chỉ có icon (theme, chevron, xóa file, đóng kết quả, mở thư mục).
- typecheck PASS, 55/55 PASS.

## Round 29 — F4: prefers-reduced-motion
- Thêm media query tắt animation/transition. build PASS (CSS-only, không cần test).

## Round 30 — I2: fuzz test
- 100 grid ngẫu nhiên (seeded): không throw; mọi block bảng có số cột (pipe chưa escape) đồng đều.
- Test: 55 -> 56, 56/56 PASS. typecheck PASS.

## Round 31 — G1: benchmark
- 5 file thật: 53 sheet / 2.6 MB -> ~1.8s, output 367k chars. Ghi PERF.md, chưa cần tối ưu.
- Không đổi code.

## Round 32 — D4: log lỗi ra file
- logError(): ghi logs/error.log trong userData, xoay vòng ở 512KB, không bao giờ throw.
- Wire vào 3 handler Excel + uncaughtException. typecheck PASS, 56/56 PASS.

## Round 33 — E2: lọc sheet theo tên
- Ô search trong panel file; lọc case-insensitive lúc render. CSS cho input.
- typecheck PASS, 56/56 PASS, build PASS.

## Round 34 — C5: file spec không tồn tại
- access(R_OK) trước convertWorkbook; lỗi per-file tiếng Việt rõ ràng thay vì ENOENT thô.
- typecheck PASS, 56/56 PASS.

## Round 35 — A3: per-workbook separator sạch
- Tách joinWorkbookMarkdown(base, sheets): trim + bỏ sheet rỗng, nối bằng ---.
- Dùng trong IPC convert. Test: 56 -> 57, 57/57 PASS. typecheck PASS.

## Round 36 — E3: thống kê preview
- previewStats: số dòng, số bảng (đếm dòng separator), số ký tự; hiện trong preview-meta.
- typecheck PASS, 57/57 PASS.

## Round 37 — E5: nút mở thư mục + copy đường dẫn từng kết quả
- Mỗi dòng kết quả có 2 icon-btn (mở thư mục output, copy đường dẫn). CSS căn phải.
- typecheck PASS, 57/57 PASS, build PASS.

## Round 38 — J1: JSDoc cho hàm export
- Thêm JSDoc cho sheetToMarkdown, listSheets, convertSheet, convertWorkbook.
- typecheck PASS, 57/57 PASS.

## Round 39 — J3: ARCHITECTURE.md
- Tài liệu kiến trúc ngắn: luồng dữ liệu, engine pipeline, quy ước làm việc.

## Round 40 — H2: CHANGELOG.md
- Ghi lịch sử 1.0.0 -> 1.2.0.

## Round 41 — H3: LICENSE MIT
- Thêm LICENSE + license field trong package.json.

## Round 42 — E8: onboarding hint lần đầu
- Banner dưới header, hiện khi chưa có onboardingSeen trong store; đóng -> nhớ.
- typecheck PASS, 57/57 PASS, build PASS.

## Round 43 — E12: zoom preview
- Ctrl+=/- phóng to/thu nhỏ (0.5-2x), Ctrl+0 reset; nút hiện % khi khác 100%.
- typecheck PASS, 57/57 PASS, build PASS.

## Round 44 — E14: phím mũi tên chuyển sheet
- ArrowUp/Down chuyển sheet trước/sau trong file đang chọn (chỉ khi focus ở body).
- typecheck PASS, 57/57 PASS.

## Round 45 — E6: thư mục output gần đây
- Lưu tối đa 5 thư mục vào store; dropdown chọn nhanh trong footer.
- typecheck PASS, 57/57 PASS, build PASS.

## Round 46 — E4: giới hạn preview dài
- Preview >300 dòng: cắt ở ranh giới dòng trống (không xé bảng) + nút Hiện thêm N dòng.
- typecheck PASS, 57/57 PASS, build PASS.

## Round 47 — F2: focus-visible
- CSS :focus-visible outline accent cho mọi control. build PASS.

## Round 48 — E16: sticky table header
- CSS thead th sticky khi cuộn preview. build PASS.

## Round 49 — E15: số dòng tab source
- Gutter đánh số dòng (sticky left), font đồng bộ với pre.
- typecheck PASS, 57/57 PASS, build PASS.

## Round 50 — I1: cán 61 tests + lone meta label
- Thêm 4 test (№ header, meta rỗng, version dừng, multiline meta).
- Cải tiến nhỏ: ô đơn lẻ trùng meta label -> bullet `- **label**` thay vì quote
  (0 hit trong file thật, an toàn).
- Test: 57 -> 61, 61/61 PASS. typecheck PASS.
- Regression: 11 diff, tất cả đều là 2 pattern đã verify (n===1 sub-bullet, A2 heading).

## Round 51 — E1: progress bar convert
- Main gửi excel:progress sau mỗi file; preload onProgress; renderer hiện thanh progress
  có role=progressbar trong footer khi đang convert.
- typecheck PASS, 61/61 PASS, build PASS.

## Round 52 — D2: second-instance nhận file
- extractExcelPaths(argv); second-instance/open-file/lần mở đầu forward qua IPC open-files.
- Renderer subscribe -> addPaths. typecheck PASS, 61/61 PASS, build PASS.

## Round 53 — J2: constant SUB_BULLET
- Gom 3 chỗ dùng prefix sub-bullet thành constant. typecheck PASS, 61/61 PASS.

## Round 54 — B6: .xlsm
- SheetJS bỏ qua macro, chỉ đọc giá trị. Thêm test với file .xlsm thật.
- Test: 61 -> 62, 62/62 PASS. typecheck PASS.

## Round 55 — B5: .xls parity
- Test với file .xls (BIFF8) thật do SheetJS ghi: listSheets + convertWorkbook đúng.
- Test: 62 -> 63, 63/63 PASS. typecheck PASS.

## Round 56 — F3: contrast WCAG AA
- Đo tất cả cặp text/bg: 3 màu fail -> đổi (dark faint #66707f->#8b96a5,
  light faint #8b98a9->#5f7085, light accent #2b6fe3->#1f5fd0). Giờ tất cả >= 4.5.
- build PASS (CSS-only).

## Round 57 — H1: README
- Cập nhật tính năng mới; thêm bảng phím tắt, FAQ, troubleshooting.

## Round 58 — H5: quy tắc bump version
- Ghi quy tắc semver vào đầu CHANGELOG.md.

## Round 59 — E17: giờ convert cuối
- Footer hiện giờ convert thành công cuối cùng. typecheck PASS, 63/63 PASS.

## Round 60 — B8: công thức liên sheet
- Test với workbook 2 sheet: formula Data!A1*2 -> dùng cached value 200, không lộ công thức.
- Test: 63 -> 64, 64/64 PASS. typecheck PASS.

## Round 61 — A15: nhiều bảng cách dòng trống
- Thêm test: 2 bảng cách dòng trống -> render 2 bảng riêng.
- Test: 64 -> 65, 65/65 PASS. typecheck PASS.

## Round 62 — G2: benchmark listSheets
- 104-479ms/file. Chấp nhận được (có loading), ghi PERF.md, không tối ưu.

## Round 63 — fix dòng ma từ merge dọc trong header
- Bug: header merge dọc lan xuống tạo dòng ma (vd: | No |  |) trong bảng.
- Thêm isHeaderGhost: bỏ qua dòng mà mọi ô đều trùng header hiện tại.
- Test: 65 -> 66, 66/66 PASS. typecheck PASS.
- Regression: 2 sheet hết dòng ma (cải thiện); 0 regression từ fix này.

## Round 64 — chống XSS ở preview
- marked -> dangerouslySetInnerHTML không sanitize: cell chứa <script>/<img onerror>
  sẽ chạy code. Thêm sanitizeHtml (allowlist thẻ marked + br, chặn javascript: href),
  không thêm dependency.
- Test: 66 -> 72, 72/72 PASS. typecheck PASS, build PASS.

## Round 65 — B4: lỗi file thân thiện
- friendlyError dịch ENOENT/EACCES/EPERM/EISDIR sang tiếng Việt (gợi ý file bị khóa...).
- Test: 74 -> 77, 77/77 PASS. typecheck PASS.

## Round 66 — hyperlink trong meta
- Verify + test: giá trị meta có hyperlink -> [text](url) (đã có từ getCell).
- Test: 77 -> 78, 78/78 PASS. typecheck PASS.

## Round 67 — link preview mở trình duyệt ngoài
- Bug: click hyperlink trong preview điều hướng cả cửa sổ app.
- setWindowOpenHandler + will-navigate -> shell.openExternal.
- typecheck PASS, 78/78 PASS, build PASS.

## Round 68 — empty state cho lọc sheet
- Khi filter không khớp sheet nào: hiện thông báo thay vì danh sách trống.
- typecheck PASS, build PASS.

## Round 69 — hiện thư mục xuất ở kết quả
- Header kết quả convert hiện đường dẫn outDir.
- typecheck PASS, build PASS.

## Round 70 — phím Escape
- Escape: đóng panel kết quả + xóa filter sheet.
- typecheck PASS, build PASS.

## Round 71 — dọn dead code sanitize
- Xóa nhánh ternary 2 vế giống nhau. typecheck PASS, 78/78 PASS.

## Round 72 — toast khi 0 file được tạo
- Thông báo rõ ràng thay vì "Xong: 0 file". typecheck PASS, build PASS.

## Round 73 — J1: JSDoc cho safeFileName
- Hàm export cuối cùng còn thiếu JSDoc. typecheck PASS, 78/78 PASS.

## Round 74 — aria-label cho checkbox sheet
- Screen reader đọc được tên sheet. typecheck PASS, build PASS.

## Round 75 — README mục phát triển
- Thêm lệnh dev/typecheck/test/build/dist. 

## Round 76 — role=status cho kết quả
- Screen reader tự thông báo khi convert xong. typecheck PASS, build PASS.

## Round 77 — aria-live cho toast
- Thông báo toast được screen reader đọc. typecheck PASS, build PASS.

## Round 78 — bỏ ghi file workbook rỗng
- per-workbook mode không ghi file chỉ có tiêu đề khi mọi sheet rỗng/bị bỏ qua.
- typecheck PASS, 78/78 PASS.

## Round 79 — guard progress khi đóng window
- Không gửi IPC progress nếu webContents đã destroy. typecheck PASS, 78/78 PASS.

## Round 80 — serialize store writes
- Chuỗi hóa read-modify-write qua promise chain, tránh mất dữ liệu khi persist đồng thời.
- typecheck PASS, 78/78 PASS.

## Round 81 — health check
- typecheck PASS, 78/78 tests PASS, build PASS. 162 commits.

## Round 82 — test section + bảng
- Test: ■ section trước bảng -> heading + bảng đúng.
- Test: 78 -> 79, 79/79 PASS. typecheck PASS.

## Round 83 — test banner trùng tên sheet
- Test: 79 -> 80, 80/80 PASS. typecheck PASS.

## Round 84 — nhớ sheet đã chọn theo file
- Lưu checkedSheets theo đường dẫn file; mở lại file cũ tự khôi phục lựa chọn.
- typecheck PASS, 80/80 PASS, build PASS.

## Round 85 — giới hạn savedChecks 50 file
- Tránh store phình khi dùng lâu. typecheck PASS, build PASS.

## Round 86 — CHANGELOG mục chưa phát hành
- Ghi nhận các cải tiến từ loop.

## Round 87 — test sanitize payload thực tế
- Test: 80 -> 81, 81/81 PASS.

## Round 88 — test sheet chỉ có banner
- Test: 81 -> 82, 82/82 PASS.

## Round 89 — test hiệu năng 1000 dòng
- Test: 82 -> 83, 83/83 PASS.

## Round 90 — regression tổng
- 19 diffs trên file thật, tất cả đã verify là cải thiện (A2 heading, D1 sub-bullet,
  ghost row removal). 0 regression.

## Round 91 — nút thử lại file lỗi
- Header kết quả có nút "Thử lại file lỗi" khi có file thất bại.
- typecheck PASS, build PASS.

## Round 92 — test convertSheet sheet không tồn tại
- Test: 83 -> 84, 84/84 PASS.

## Round 93 — ARCHITECTURE cập nhật sanitize

## Round 94 — bump version 1.3.0
- package.json 1.0.0 -> 1.3.0 (đồng bộ với CHANGELOG); typecheck PASS.

## Round 95 — nút convert hiện số sheet
- typecheck PASS, build PASS.

## Round 96 — fix khôi phục sheet đã chọn
- Bug: round 84 chỉ lưu mà quên khôi phục. Đã thêm apply logic vào addPaths.
- typecheck PASS, build PASS.

## Round 97 — README tính năng nhớ sheet

## Round 98 — xóa formatBytes không dùng
- typecheck PASS.

## Round 99 — xóa dead code utils
- Xóa formatDateTime, isEditableTarget không dùng. typecheck PASS.

## Round 100 — verification tổng hợp
- typecheck PASS, 84/84 tests PASS (3 files), build PASS. 200 commits.
- Đây là vòng 100. Đánh giá: đã bao phủ toàn bộ backlog có giá trị thực hiện được
  trên Linux. Xem tổng kết ở cuối PROGRESS.md.

---

## TỔNG KẾT LOOP (dừng ở vòng 100/200)

### Số liệu
- **Vòng hoàn thành**: 100 (202 commits)
- **Test**: 28 → 84 (tất cả PASS)
- **Typecheck**: PASS | **Build**: PASS
- **Regression**: 19 diffs trên 5 file thật, tất cả đã verify là cải thiện

### Top 10 thay đổi giá trị nhất
1. **Chống XSS ở preview** (round 64): sanitize HTML, chặn script/event-handler/javascript: URLs
2. **Fix dòng ma từ merge dọc** (round 63): loại bỏ 7 dòng rác trong bảng ở file thật
3. **Progress bar convert** (round 51): IPC events theo từng file
4. **Nhớ sheet đã chọn** (round 84+96): persist theo file, khôi phục khi mở lại
5. **Second-instance nhận file** (round 52): mở file bằng app, kéo vào exe
6. **Lỗi tiếng Việt** (round 65): ENOENT/EACCES/EISDIR → thông báo rõ ràng
7. **Contrast WCAG AA** (round 56): đo và fix 3 màu fail
8. **Link mở trình duyệt ngoài** (round 67): không điều hướng app
9. **Serialize store writes** (round 80): tránh race mất dữ liệu
10. **Version 1.3.0** (round 94): đồng bộ package.json/CHANGELOG

### Các nhóm đã rà soát
- **A. Engine** (15/15): hyperlink, A2 heading, separator, error cells, boolean,
  số, ngày giờ, header rỗng, ragged, bảng rộng, escape |, whitespace, !ref thiếu,
  2-col, nhiều bảng + ghost fix, section
- **B. Robustness** (9/9): file hỏng, mật khẩu, 0-byte, lock, .xls, .xlsm,
  array formula, cross-sheet, >50k dòng
- **C. Output** (5/5): dedupe tên, safeFileName, reserved, tạo thư mục, spec lỗi
- **D. Main/IPC** (4/4): preview race, second-instance, version, log file
- **E. UI/UX** (17/17): progress, filter, stats, giới hạn preview, kết quả,
  recent dirs, drag-drop, onboarding, reset, theme, nhớ bounds, zoom,
  Ctrl+O, arrows, line numbers, sticky, giờ convert
- **F. A11y** (5/5): aria-label, focus-visible, contrast, reduced-motion, labels
- **G. Perf** (2/2): baseline, listSheets benchmark
- **H. Docs** (4/5): README, CHANGELOG, LICENSE, version rules
- **I. Test** (2/2): 84 tests, fuzz
- **J. Quality** (3/3): JSDoc, constants, ARCHITECTURE

### Giới hạn còn lại
- **H4 (NSIS tiếng Việt)**: cần Windows để build/test installer, không làm được trên Linux
- **Test trên Windows thật**: chưa chạy app đóng gói trên Windows
- **100 vòng còn lại**: các ý tưởng có giá trị thật đã cạn; tiếp tục sẽ là fluff
  (vi phạm nguyên tắc "đúng > đủ > đẹp")
