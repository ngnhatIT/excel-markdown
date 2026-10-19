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
