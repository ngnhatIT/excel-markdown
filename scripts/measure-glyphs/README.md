# Đo bề rộng glyph bằng Excel thật → `src/main/md2xlsx/glyphTable.ts`

`glyphTable.ts` liệt kê các ký tự BMP ngoài ASCII mà Excel hiển thị **rộng hơn 1em** (emoji, ⟶, ⸻, U+FDFD, chữ
Ấn/Đông Nam Á…). `layout.ts` dùng bảng này để ước lượng số dòng của ô merge (chiều cao hàng không được thiếu).
File được sinh từ số đo, **không sửa tay**; các script ở đây sinh lại nó.

Cần: Windows, Microsoft Excel 16 (COM), PowerShell 5.1, Node. Mỗi script tạo **tiến trình Excel riêng**
(`New-Object -ComObject Excel.Application`, ẩn) và luôn `Quit` + giải phóng COM ở `finally`: không đụng cửa sổ /
workbook Excel người dùng đang mở. File `.ps1` lưu dạng UTF-8 **có BOM** (PowerShell 5.1 đọc file không BOM theo ANSI).

## Các bước

| Bước | Script | Việc | Thời gian (máy dev) |
|---|---|---|---|
| 1 | `scan.ps1` | Quét U+00A0–U+FFFF: mỗi ký tự một hàng, lặp đủ số lần để chữ rộng đúng 1em vừa khít một dòng của cột 150 (1055px), AutoFit cả khối; hàng cao hơn một dòng → ký tự rộng hơn 1em. | ~40 s / kiểu chữ |
| 2 | `precise.ps1` | Với hợp các ký tự bị đánh dấu ở cả bốn kiểu (~1470): tìm nhị phân số ký tự tối đa `n` trên một dòng → bề rộng < (vùng chữ + 1) / n. | ~45 s / kiểu chữ |
| 3 | `gen-table.cjs` | Đọc `data/precise-*.txt`, đổi về 1em = 13px, lấy max của bốn kiểu, làm tròn lên, gộp ký tự liền nhau → ghi `glyphTable.ts`. | < 1 s |

`run.ps1` chạy bước 1 + 2 cho bốn kiểu chữ app dùng (游ゴシック 10 thường / đậm, 游ゴシック 12 đậm cho heading,
MS Gothic 10 cho code) và ghi `data/precise-<kiểu>.txt` — tổng ~6–10 phút (lần chạy kiểm tra: 627 s, cho ra
`data/` giống hệt bản đã commit). Kết quả quét thô của bước 1 để ở thư mục
tạm (`-WorkDir`, mặc định `%TEMP%\measure-glyphs`), không commit. `data/precise-*.txt` là đầu vào của bước 3 nên
được commit.

## Sinh lại

```powershell
# đo lại (ghi đè data\precise-*.txt; thêm -DataDir <thư mục> để ghi chỗ khác mà so sánh trước)
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\measure-glyphs\run.ps1
# sinh glyphTable.ts từ data\
node scripts\measure-glyphs\gen-table.cjs
# chỉ kiểm glyphTable.ts có khớp data\ không
node scripts\measure-glyphs\gen-table.cjs --check
```

Sau khi sinh lại: `npm test` (test `parseWideGlyphs` kiểm số khoảng / số ký tự — cập nhật nếu bảng đổi) và chạy lại
so sánh AutoFit bằng Excel thật (xem `src/main/md2xlsx/write.test.ts`, suite "chiều cao hàng merge không thấp hơn
AutoFit").

## Giới hạn đã biết

- Chỉ đo BMP. Ký tự ngoài BMP tính 20px (đã kiểm U+1F000–U+1FFFF: không chữ nào quá ~20px); U+10000–U+10FFF (chữ
  cổ) làm Excel treo khi quét nên chưa đo.
- Số đo là của máy đo (Excel 16, font 游ゴシック / MS Gothic / Segoe UI Emoji, 96 DPI); font khác phiên bản có thể
  lệch ít, bù bằng hệ số 6.5 px/đơn vị của `layout.ts` (~3.5%).
