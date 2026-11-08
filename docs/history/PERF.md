# Performance baseline — ExcelToMarkdown

Đo ngày 2026-10-12, VM Linux, Node 24, convert toàn bộ 5 file thật của user
(XLSX.readFile + sheetToMarkdown mọi sheet, options mặc định).

| File | Size | Sheets | Thời gian |
|---|---|---|---|
| SPMT00151AC | 391 KB | 10 | 370 ms |
| SPMT01001AC | 490 KB | 10 | 300 ms |
| SPOR01101AC | 1012 KB | 17 | 857 ms |
| SPOR02001AC | 428 KB | 7 | 229 ms |
| SPVM00131 | 281 KB | 9 | 91 ms |
| **Tổng** | **2.6 MB** | **53** | **~1.8 s** |

Output: ~367k ký tự Markdown. Không cần tối ưu ở quy mô này.
Ngưỡng cần xem lại: file > 10 MB hoặc sheet > 50k dòng.

## listSheets (2026-10-12)

Đọc full workbook để đếm dòng mỗi sheet (có loading indicator ở UI):

| File | Sheets | Thời gian/lần |
|---|---|---|
| SPMT00151AC | 10 | 194 ms |
| SPMT01001AC | 10 | 198 ms |
| SPOR01101AC | 17 | 479 ms |
| SPOR02001AC | 7 | 149 ms |
| SPVM00131 | 9 | 104 ms |

Kết luận: dưới 0.5s/file lớn nhất, chấp nhận được, chưa cần tối ưu.

## `!ref` phình (2026-10-19, Windows, Node 24)

Excel ghi `!ref` (dimension) theo vùng có *định dạng*, không theo ô có giá trị: một ô
tô màu lạc ở CZ5000 làm `!ref` = A1:CZ5000. Engine cũ quét toàn bộ `!ref`.

| Trường hợp | Trước (1.3.x) | Sau (2.0.0) |
|---|---|---|
| 1 ô, `!ref` A1:AZ300000 (15.6M ô) | 11 842 ms, heap 402 MB | ~0 ms, heap 15 MB |

Sau khi sửa, thời gian tỉ lệ với số ô có nội dung, không với `!ref`.

## Worker + cache (2.1.0, 2026-10-19, Windows, Electron 44)

| Đo | Trước | Sau |
|---|---|---|
| Độ trễ IPC tới main khi đang convert 3 file × 60k dòng (E2E) | 1693 ms | ~5 ms |
| Bấm Hủy → convert dừng (E2E) | — (không hủy được) | ~110 ms |
| Preview đổi sheet, file 10 sheet × 5000 dòng (3.7 MB) | ~760 ms mỗi lần | 780 ms lần đầu, ~27 ms các lần sau |

Parse 1 file 60k dòng × 10 cột: ~1.5 s (SheetJS, đồng bộ, nay chạy trong utilityProcess).
