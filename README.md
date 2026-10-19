# ExcelToMarkdown

Ứng dụng desktop Windows convert file Excel sang Markdown, hiểu đúng bố cục tài liệu
thiết kế 基本設計 (Backlog) của Nhật: banner 基本設計, meta 機能ID/画面ID/テーブルID,
section, bảng No/№/項番, ô merge, ô nhiều dòng, công thức liên sheet.

Xây dựng bằng **Electron + TypeScript + React 18**.

## Tính năng

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
- Convert hàng loạt ra thư mục tùy chọn, thanh tiến độ từng file, báo cáo từng file,
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
index.ts # Electron main + IPC
converter.ts # engine xlsx -> markdown
preload/
index.ts # bridge an toàn cho renderer
types.ts # type dùng chung
renderer/
src/
App.tsx # UI chính
styles.css # theme + style app
utils.ts # copy, toast, uid...
components/
icons.tsx # SVG icons
```

## Phím tắt

| Phím | Tác dụng |
|---|---|
| `Ctrl+O` | Thêm file Excel |
| `Ctrl+Enter` | Convert sang Markdown |
| `Ctrl+=` / `Ctrl+-` / `Ctrl+0` | Phóng to / thu nhỏ / reset cỡ chữ preview |
| `↑` / `↓` | Chuyển sheet trước / sau |

## FAQ

**File Excel không phải tài liệu 基本設計 thì convert được không?**
Được. Engine có 2 lớp: lớp chung (bảng, quote, text) áp dụng cho mọi file;
lớp chuyên biệt (banner, meta tiếng Nhật) chỉ kích hoạt khi gặp đúng pattern.
Bảng từ 3 cột trở lên tự nhận diện; bảng 2 cột bật thêm trong Tùy chọn.

**Sheet ẩn trong Excel có bị convert không?**
Mặc định không tick (tránh convert thừa), bạn tick tay nếu cần.

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

## Phát triển

Từ Electron 42, `npm install` không tự tải binary Electron nữa; `npm run dev`
tự gọi `install-electron` (script `predev`) để tải ở lần chạy đầu.

```bash
npm install
npm run dev        # chạy dev
npm run typecheck  # kiểm tra TypeScript
npm run test       # chạy test (vitest)
npm run build      # build renderer + main
npm run dist       # đóng gói Windows (chạy trên Windows)
```

Engine convert nằm ở `src/main/converter.ts`, test ở `src/main/converter.test.ts`.
