# ExcelToMarkdown

Ứng dụng desktop Windows convert file Excel sang Markdown, hiểu đúng bố cục tài liệu
thiết kế 基本設計 (Backlog) của Nhật: banner 基本設計, meta 機能ID/画面ID/テーブルID,
section, bảng No/№/項番, ô merge, ô nhiều dòng, công thức liên sheet.

Từ bản 2.2.0 app đi được cả chiều ngược lại: **Markdown → Excel** (gộp các file `.md` thành
một file `.xlsx` để gửi khách), dùng công tắc chế độ ở thanh trên cùng.

Xây dựng bằng **Electron + TypeScript + React 18**.

## Tính năng

- **Hai chế độ** (công tắc ở Header, nhớ chế độ cuối): Excel → Markdown và Markdown → Excel
  (xem mục "Chế độ Markdown → Excel")
- Kéo thả hoặc chọn nhiều file `.xlsx` / `.xlsm` / `.xls` cùng lúc
- Phát hiện sheet ẩn trong Excel (gắn tag "ẩn", mặc định không tick)
- Nhớ sheet đã chọn theo từng file (mở lại file cũ tự khôi phục)
- Liệt kê sheet từng file, tick chọn sheet cần convert
- Xem trước song song: Markdown đã render và mã nguồn Markdown, copy nhanh
- Tùy chọn:
- Chế độ xuất: mỗi sheet 1 file `.md`, hoặc gộp cả workbook thành 1 file `.md`
- Bỏ qua sheet `DEL_`, bỏ qua sheet rỗng, thêm tiêu đề tên sheet
- Ô nhiều dòng: `<br>` hoặc gộp một dòng
- Tùy chọn nhận diện bảng 2 cột (mặc định tắt)
- Escape ký tự Markdown/HTML trong ô (mặc định bật): `<null>`, `*必須*`, `# x`...
  hiển thị nguyên văn khi render
- Convert hàng loạt ra thư mục tùy chọn, thanh tiến độ từng file, nút Hủy, báo cáo từng file,
  nút mở thư mục / copy đường dẫn
- Tìm kiếm/lọc sheet, phím tắt, zoom preview, nhớ vị trí cửa sổ
- Nhớ thư mục xuất và tùy chọn giữa các lần mở app
- Giao diện tiếng Việt, sáng/tối

## Cách convert hiểu file Excel

Engine nằm ở `src/main/converter.ts`:

1. **Banner 基本設計**: dòng đầu `基本設計` + tiêu đề tài liệu (画面項目定義書...)
thành quote; khối 版数/作成日/作成者 thành bảng nhỏ (kể cả version ghi inline
trên dòng meta).
2. **Meta** (`機能ID`, `機能名`, `画面ID`, `画面名`, `テーブルID`, `テーブル名`,
`更新種別`, `画面遷移`, `動作環境`): thành bullet `- **label**: value`; các dòng
nối tiếp (như 画面遷移 dòng 2) thành sub-bullet.
3. **Section** `【...】`, `■処理順序1`... thành `###`; ghi chú `※...` thành quote.
4. **Bảng**: nhận diện dòng tiêu đề (`No`, `№`, `項番` hoặc dòng nhiều ô + dòng sau
giống dữ liệu), bỏ cột trống toàn bảng cho gọn.
5. **Merge**: chỉ lan giá trị merge theo chiều dọc (merge ngang giữ tại ô gốc);
merge của dòng banner không lan xuống.
6. **Công thức**: dùng giá trị đã tính mà Excel lưu (kể cả tham chiếu liên sheet);
ô nhiều dòng thành `<br>`.

## Chế độ Markdown → Excel

Dùng khi muốn chỉnh Markdown (tay hoặc nhờ AI, dễ diff bằng git) rồi xuất lại Excel để gửi
khách. Tạo workbook **mới** theo bố cục chuẩn của app, không tái tạo bố cục Excel gốc.

Cách dùng:

1. Bật công tắc **Markdown → Excel** ở Header.
2. Kéo thả file `.md` vào cửa sổ, hoặc `Ctrl+O` / nút "Thêm file Markdown". Cột trái liệt kê
   file kèm số sheet sẽ tạo, dưới mỗi file là tên các sheet sẽ tạo: ↑/↓ đổi thứ tự (thứ tự
   sheet trong Excel = thứ tự danh sách), nút xóa bỏ file. Giữa là preview Markdown của file
   đang chọn. Preview và tên sheet được đọc lúc thêm file: sửa file `.md` sau đó thì bấm nút
   **Tải lại** (icon ⟳) của file đó để xem nội dung mới (app không tự theo dõi file; file
   Excel tạo ra luôn đọc nội dung mới nhất).
3. Ô "Tên file Excel" ở cột phải. Mặc định: phần tên chung trước `__` của các file; không có
   thì `# tiêu đề` của file đầu; không có thì tên file đầu.
4. Chọn thư mục xuất, bấm **Tạo file Excel** (`Ctrl+Enter`). **Mọi file trong danh sách gộp
   thành một file `.xlsx`.** Có nút Hủy khi đang chạy; file đích đã tồn tại thì hỏi
   `Ghi đè` / `Hủy`. App ghi file tạm `.partial` rồi đổi tên nên Hủy hoặc lỗi giữa chừng không
   để lại `.xlsx` dở; một file `.md` đọc lỗi thì không tạo file Excel.

Quy tắc chuyển (chi tiết: `docs/superpowers/specs/2026-10-19-md-to-excel-design.md`):

- **Tách sheet**: ranh giới file và dòng `---` ở ngoài cùng. Nếu block đầu của một phần là
  `##` thì đó là tên sheet; `##` về sau chỉ là dòng section. `# tiêu đề` đầu file chỉ dùng đặt
  tên file mặc định, không ghi vào sheet. Tên sheet được làm sạch: ký tự cấm `[]:*?/\` thành
  `_`, tối đa 31 ký tự, không trùng (thêm ` (2)`…), `History` (tên Excel dành riêng) thành
  `History_`.
- **Bố cục**: font 游ゴシック 10, ẩn gridline, in A4 ngang vừa 1 trang theo chiều rộng. Banner
  `> 基本設計：…`; bảng có header nền `#DDE5F0` + viền mảnh; `- **label**: value` thành ô
  label + ô value merge ngang; `###` thành dòng section; ghi chú và đoạn văn merge ngang, tự
  xuống dòng; heading và từng dòng code (MS Gothic) cũng merge ngang + tự xuống dòng nên dòng
  dài không bị cắt khi in. Chiều cao dòng được app tính (Excel không tự giãn ô merge; đo thực
  tế 16.5pt/dòng, heading 19.5pt/dòng, code 12pt/dòng; emoji và ký tự rộng tính theo bề rộng
  đo bằng Excel), đoạn / heading / dòng code quá cao tách thành nhiều hàng merge liền nhau.
- **Ô**: lấy chữ hiển thị (bỏ escape `\*`, `<br>` thành xuống dòng, bỏ `**`, `*`, `` ` ``);
  cả ô là đúng một link `http`/`https`/`mailto` thì thành hyperlink, còn lại chữ thuần.
- **Số**: `10`, `1.0` (giữ `0.0`), `1,234,567.89`, `12.50%` thành số đúng định dạng hiển thị;
  `0001`, số quá 11 chữ số, ngày, `#N/A`... giữ dạng text và không hiện tam giác xanh.

Giới hạn đã biết:

- Chỉ ghi chữ thuần (không giữ đậm/nghiêng giữa câu); không tái tạo 方眼紙, màu, merge gốc.
- Round-trip `md → xlsx → md` chỉ đảm bảo ổn định với Markdown do app tạo, và có ngoại lệ:
  label meta ngoài `META_LABELS` của engine Excel → Markdown (vd `**作成者**:`) và bảng 2 cột
  có thể ra khác sau một vòng; vì vậy không sửa engine Excel → Markdown để ổn định hơn (xem
  spec §11).
- Markdown viết tay dùng `---` làm đường kẻ trang trí sẽ bị tách sheet (xem trước tên sheet
  dưới từng file ở cột trái).
- Link nội bộ `#…` và scheme khác `http`/`https`/`mailto` ghi thành chữ thuần.
- Nội dung ô dài hơn 32 767 ký tự bị cắt (ký tự cuối là `…`).
- File `.md` phải lưu dạng UTF-8; file mã khác (vd Shift_JIS) bị từ chối, thông báo nêu tên file.

## Chạy dev

```bash
npm install
npm run dev
```

## Build

```bash
npm run typecheck # kiểm tra type
npm run build # build electron-vite
```

## Đóng gói.exe trên Windows

Chạy trên máy Windows (đã cài Node 20+):

```bash
npm install
npm run dist
```

File cài đặt nằm ở `release/`. Icon `resources/icon.ico` đã build sẵn multi-size
(16-256px) nên electron-builder không cần convert PNG sang ICO trên Windows.

## Cấu trúc

```
src/
  main/
    index.ts            # Electron main + IPC, ghi file .md (không nạp SheetJS, không nạp exceljs)
    converterWorker.ts  # client tới worker đọc Excel / ghi Excel, Hủy
    worker.ts           # utilityProcess: đọc Excel (workerHandler + workbookCache), Markdown -> Excel
    converter.ts        # engine xlsx -> markdown
    output.ts           # escape Markdown, tên file, ghép file
    guards.ts, errors.ts
    md2xlsx/            # engine Markdown -> Excel: parse, inline, cellValue, names, layout, write, mdHandler
  shared/
    workbookName.ts     # tên file Excel mặc định (dùng chung renderer + main)
  preload/
    index.ts            # bridge an toàn cho renderer (window.api)
  types.ts              # type dùng chung
  renderer/src/
    App.tsx             # state chính + ghép component
    components/         # Header (công tắc chế độ), FileList, PreviewPane, ResultsPanel, OptionsPanel,
                        # MdFileList, MdOptionsPanel, Footer...
    hooks/              # useFiles, useMdFiles, usePreview, useShortcuts
    api.ts, sanitize.ts, utils.ts, styles.css
test/fixtures, test/golden  # file Excel mẫu + output Excel -> Markdown đã duyệt
test/golden-md2xlsx         # output Markdown -> Excel (JSON đọc lại bằng SheetJS) đã duyệt
scripts/                    # sinh file mẫu, e2e.mjs, xlsx-snapshot.ps1 (chụp ảnh sheet bằng Excel thật)
```
Chi tiết: ARCHITECTURE.md.

## Phím tắt

| Phím | Tác dụng |
|---|---|
| `Ctrl+O` | Thêm file Excel (chế độ Markdown → Excel: thêm file `.md`) |
| `Ctrl+Enter` | Convert sang Markdown (chế độ Markdown → Excel: tạo file Excel) |
| `Ctrl+=` / `Ctrl+-` / `Ctrl+0` | Phóng to / thu nhỏ / reset cỡ chữ preview |
| `↑` / `↓` | Chuyển sheet trước / sau |

## FAQ

**File Excel không phải tài liệu 基本設計 thì convert được không?**
Được. Engine có 2 lớp: lớp chung (bảng, quote, text) áp dụng cho mọi file;
lớp chuyên biệt (banner, meta tiếng Nhật) chỉ kích hoạt khi gặp đúng pattern.
Bảng từ 3 cột trở lên tự nhận diện; bảng 2 cột bật thêm trong Tùy chọn.

**Sheet ẩn trong Excel có bị convert không?**
Mặc định không tick (tránh convert thừa), bạn tick tay nếu cần.

**Markdown → Excel: sao file Excel ra nhiều sheet hơn mong đợi?**
Mỗi dòng `---` ở ngoài cùng và mỗi file trong danh sách bắt đầu một sheet mới. Bỏ `---`
trang trí khỏi Markdown, hoặc xem tên sheet dưới từng file ở cột trái trước khi bấm Tạo file
Excel.

**Markdown → Excel: ô số có bị mất số 0 / đổi `1.0` thành `1` không?**
Không. `0001` giữ dạng text (không hiện tam giác xanh), `1.0` giữ định dạng `0.0`,
`12.50%` giữ `0.00%`.

**Sao file .md có dấu `\` trước `*`, `<`, `#`...?**
Đó là escape để Markdown hiển thị đúng nội dung ô (vd `<null>` không bị ẩn như thẻ HTML,
`*必須*` không thành chữ nghiêng). Nếu ô Excel cố ý chứa cú pháp Markdown, tắt
"Escape ký tự Markdown/HTML trong ô" trong Tùy chọn > Sheet.

**File có mật khẩu?**
App báo rõ "File có mật khẩu..." — hãy gỡ mật khẩu bằng Excel rồi thử lại.
Macro trong `.xlsm` được bỏ qua, chỉ lấy giá trị.

## Troubleshooting

| Hiện tượng | Cách xử lý |
|---|---|
| Windows cảnh báo khi chạy lần đầu | App chưa ký số: chọn "More info" → "Run anyway" |
| Preview hiện sheet cũ khi chuyển nhanh | Đã fix từ bản 1.2 (generation guard); nếu còn gặp, báo lại |
| 2 file khác thư mục cùng tên bị ghi đè | Tự đổi thành `tên (2).md` từ bản 1.2 |
| Lỗi khi convert | Xem `logs/error.log` trong thư mục userData của app |
| Bảng 2 cột không thành bảng | Bật "Nhận diện bảng 2 cột" trong Tùy chọn > Sheet |
| Tạo file Excel báo "Không ghi được file Excel" | File `.xlsx` cùng tên đang mở trong Excel: đóng file rồi thử lại |

## Phát triển

Từ Electron 42, `npm install` không tự tải binary Electron nữa; `npm run dev`
tự gọi `install-electron` (script `predev`) để tải ở lần chạy đầu.

```bash
npm install
npm run dev        # chạy dev
npm run typecheck  # kiểm tra TypeScript
npm run test       # chạy test (vitest), gồm golden test với file mẫu
npm run test:update  # cập nhật golden khi đổi engine có chủ ý (review diff test/golden)
npm run e2e        # build + chạy app Electron thật, kiểm 54 luồng UI (cần màn hình)
npm run build      # build renderer + main
npm run dist       # đóng gói Windows (chạy trên Windows)
```

Engine convert nằm ở `src/main/converter.ts`, test ở `src/main/converter.test.ts`.
File Excel mẫu (dữ liệu hư cấu) ở `test/fixtures`, output đã duyệt ở `test/golden`.
Sinh lại file mẫu: `node scripts/make-fixtures.mjs`, rồi (cần Excel)
`powershell -ExecutionPolicy Bypass -File scripts/make-excel-fixture.ps1`.

Engine Markdown → Excel nằm ở `src/main/md2xlsx/`; test golden + round-trip ở
`src/main/md2xlsx/golden.test.ts`, output đã duyệt ở `test/golden-md2xlsx`
(đổi bố cục có chủ ý: `npm run test:update` rồi review diff).

### Kiểm file Excel bằng Excel thật

Unit test không phát hiện được việc Excel đòi "sửa file" hay chữ bị che. Sau khi đổi
`src/main/md2xlsx/write.ts` hoặc `layout.ts`, tạo file Excel bằng app rồi chạy (cần Microsoft
Excel, Windows PowerShell 5.1):

```bash
powershell -ExecutionPolicy Bypass -File scripts/xlsx-snapshot.ps1 -In <đường dẫn tuyệt đối .xlsx> -OutDir <thư mục>
```

Script mở file chỉ đọc trong một tiến trình Excel riêng (không đụng cửa sổ Excel khác của
bạn), in `OK <số sheet>` và ghi `sheet1.png`, `sheet2.png`... vào `-OutDir` để xem bằng mắt
(banner, bảng, merge, chữ có bị che không). Nếu Excel phải sửa file, script in `REPAIRED`
(không mở được file thì in `FAILED`) và thoát mã 1.

Lưu ý: script dùng clipboard (CopyPicture/Paste) và hiện cửa sổ Excel trong lúc chạy, nên
đừng copy/paste ở chương trình khác cho tới khi script xong. Lưu `xlsx-snapshot.ps1` dạng
UTF-8 **có BOM** (PowerShell 5.1 đọc file không BOM theo ANSI và làm hỏng chữ Nhật).
