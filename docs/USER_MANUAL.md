# ExcelToMarkdown — Hướng dẫn sử dụng

| | |
|---|---|
| **Sản phẩm** | ExcelToMarkdown (desktop app, CLI `x2m`, MCP server `x2m-mcp`) |
| **Phiên bản tài liệu** | 2.3.0 + các tính năng ở mục "Chưa phát hành" của CHANGELOG |
| **Nền tảng** | Windows 10/11 x64 (bản cài đặt); Windows / macOS / Linux khi chạy từ mã nguồn |
| **Đối tượng** | BrSE, Comtor, Dev, Tester, PM làm việc với tài liệu thiết kế Excel (基本設計 / 詳細設計) |
| **Ngôn ngữ giao diện** | Tiếng Việt · English · 日本語 |

---

## Mục lục

1. [Giới thiệu](#1-giới-thiệu)
2. [Cài đặt và khởi động](#2-cài-đặt-và-khởi-động)
3. [Làm quen giao diện](#3-làm-quen-giao-diện)
4. [Bắt đầu nhanh trong 5 phút](#4-bắt-đầu-nhanh-trong-5-phút)
5. [Chế độ Excel → Markdown](#5-chế-độ-excel--markdown)
6. [Chế độ Markdown → Excel](#6-chế-độ-markdown--excel)
7. [Chế độ Đọc Markdown](#7-chế-độ-đọc-markdown)
8. [Bản đồ thiết kế và phân tích tài liệu](#8-bản-đồ-thiết-kế-và-phân-tích-tài-liệu)
9. [Chế độ So sánh 新旧](#9-chế-độ-so-sánh-新旧)
10. [Trợ lý AI và Dịch nhanh](#10-trợ-lý-ai-và-dịch-nhanh)
11. [Dùng với Claude Code / Codex / Claude Desktop (MCP)](#11-dùng-với-claude-code--codex--claude-desktop-mcp)
12. [Dòng lệnh `x2m`](#12-dòng-lệnh-x2m)
13. [Cấu hình dự án `x2m.json`](#13-cấu-hình-dự-án-x2mjson)
14. [Quy trình làm việc mẫu](#14-quy-trình-làm-việc-mẫu)
15. [Phím tắt](#15-phím-tắt)
16. [Bảo mật và quyền riêng tư](#16-bảo-mật-và-quyền-riêng-tư)
17. [Xử lý sự cố](#17-xử-lý-sự-cố)
18. [Câu hỏi thường gặp](#18-câu-hỏi-thường-gặp)
19. [Giới hạn đã biết](#19-giới-hạn-đã-biết)
20. [Phụ lục: Thuật ngữ](#20-phụ-lục-thuật-ngữ)

**Quy ước trong tài liệu**

| Ký hiệu | Ý nghĩa |
|---|---|
| **Chữ đậm** | Tên nút, menu, ô trên giao diện |
| `Ctrl+O` | Phím tắt (macOS: thay `Ctrl` bằng `Cmd` khi chạy từ mã nguồn) |
| `code` | Tên file, lệnh, giá trị gõ vào |
| > **Lưu ý** | Thông tin quan trọng, dễ gây nhầm lẫn |
| > **Mẹo** | Cách làm nhanh hơn, không bắt buộc |

---

## 1. Giới thiệu

### 1.1. ExcelToMarkdown là gì?

ExcelToMarkdown chuyển tài liệu thiết kế Excel sang Markdown (và ngược lại), rồi giúp bạn **đọc, tra cứu, so sánh
và phân tích** bộ tài liệu đó. App hiểu đúng bố cục tài liệu 基本設計 kiểu Nhật (banner, 画面ID / 機能ID, bảng 項番,
ô merge, ghi chú ※, ảnh và shape trong sheet). File Excel thông thường vẫn convert được.

### 1.2. Bạn muốn làm gì?

| Mục tiêu | Chức năng | Xem mục |
|---|---|---|
| Đưa tài liệu Excel vào Git, wiki, hoặc cho AI đọc | Excel → Markdown | [5](#5-chế-độ-excel--markdown) |
| Sửa Markdown rồi xuất lại file Excel | Markdown → Excel | [6](#6-chế-độ-markdown--excel) |
| Đọc cả thư mục `.md` như một trang web, tìm nội dung | Đọc Markdown | [7](#7-chế-độ-đọc-markdown) |
| Sửa bảng / cột / màn hình thì ảnh hưởng đến đâu? | 影響調査 | [8.3](#83-影響調査-điều-tra-ảnh-hưởng) |
| Vẽ 画面遷移図, ER, ma trận CRUD cho cả thư mục | Bản đồ thiết kế | [8](#8-bản-đồ-thiết-kế-và-phân-tích-tài-liệu) |
| Phát hiện ID trùng, 遷移 tới màn hình không tồn tại, chữ mơ hồ | 整合性チェック | [8.4](#84-整合性チェック-kiểm-tra-nhất-quán) |
| Sinh khung テスト仕様書, DDL `CREATE TABLE` | 観点表, DDL | [8.7](#87-テスト観点表), [8.8](#88-ddl--json--er-từ-テーブル定義書) |
| Biết bản thiết kế mới đổi gì so với bản cũ, điền 改訂履歴 | So sánh 新旧 | [9](#9-chế-độ-so-sánh-新旧) |
| Hỏi đáp, tóm tắt, sinh test case bằng AI | Trợ lý AI | [10](#10-trợ-lý-ai-và-dịch-nhanh) |
| Cho Claude Code / Codex làm việc trên tài liệu, không cần API key | MCP | [11](#11-dùng-với-claude-code--codex--claude-desktop-mcp) |
| Xem thay đổi file Excel ngay trong `git diff` | textconv | [12.4](#124-xem-thay-đổi-file-excel-trong-git-diff) |
| Cả đội convert ra cùng một kết quả | `x2m.json` | [13](#13-cấu-hình-dự-án-x2mjson) |

### 1.3. Nguyên tắc hoạt động

- **Chạy trên máy**: convert, đọc, so sánh, bản đồ thiết kế đều chạy cục bộ, không gửi file đi đâu.
- **AI chỉ khi bạn yêu cầu**: chỉ khi bạn hỏi trợ lý AI hoặc bấm Dịch, phần nội dung cần thiết mới được gửi tới nhà
  cung cấp AI bạn đã chọn.
- **Không gọi mạng ngầm**: app không tự kiểm tra hay tải bản cập nhật.
- **Không đụng file gốc**: app chỉ đọc file Excel / Markdown nguồn; kết quả ghi ra thư mục bạn chọn.

---

## 2. Cài đặt và khởi động

### 2.1. Yêu cầu hệ thống

| Thành phần | Yêu cầu |
|---|---|
| Hệ điều hành | Windows 10/11 64-bit (bản cài đặt) |
| Quyền | Không cần quyền admin (cài cho riêng tài khoản) |
| Chạy từ mã nguồn | Node.js 20 trở lên, Windows / macOS / Linux |
| Trợ lý AI (tùy chọn) | Kết nối Internet + API key của Gemini, Claude hoặc OpenAI |

### 2.2. Cài đặt trên Windows

1. Tải `ExcelToMarkdown-Setup-x.y.z.exe` ở trang
   [Releases](https://github.com/ngnhatIT/excel-markdown/releases).
2. (Khuyến nghị) Đối chiếu mã băm với file `SHA256SUMS.txt` đi kèm:

   ```bat
   certutil -hashfile ExcelToMarkdown-Setup-x.y.z.exe SHA256
   ```

3. Chạy file cài đặt. Trình cài đặt hiện theo ngôn ngữ Windows (Việt / Anh / Nhật). Thư mục mặc định:
   `%LOCALAPPDATA%\Programs\ExcelToMarkdown` (đổi được).
4. Lần đầu chạy, Windows SmartScreen có thể cảnh báo vì app chưa ký số: chọn **More info → Run anyway**.

Sau khi cài:

- Chuột phải file `.xlsx` / `.xlsm` / `.xls` / `.md` → **Open with → ExcelToMarkdown**. App **không** giành quyền mở
  mặc định: nhấp đúp file Excel vẫn mở bằng Excel.
- Lệnh `x2m` (CLI) và `x2m-mcp` (MCP server) nằm trong `resources\bin` của thư mục cài, chạy bằng chính app, không
  cần cài Node. Xem [mục 12](#12-dòng-lệnh-x2m) và [mục 11](#11-dùng-với-claude-code--codex--claude-desktop-mcp).

### 2.3. Chạy từ mã nguồn

```bash
npm install
npm run dev
```

Muốn dùng CLI / MCP từ mã nguồn, build trước bằng `npm run build` (tạo `out/main/cli.js`, `out/main/mcp.js`).

### 2.4. Cập nhật và gỡ cài đặt

- **Cập nhật**: menu **Trợ giúp → Kiểm tra cập nhật…** (chỉ gọi mạng khi bạn bấm). Có bản mới thì tải installer mới
  và cài đè; cài đặt và API key được giữ.
- **Gỡ cài đặt**: Windows Settings → Apps → ExcelToMarkdown → Uninstall. Mục "Open with" được xóa sạch.

---

## 3. Làm quen giao diện

```
┌──────┬──────────────────────────────────────────────────────────────────────┐
│ Logo │ Tên chế độ đang dùng                    VI EN 日本語  [Nút chính]      │
│      ├──────────────┬───────────────────────────────────┬───────────────────┤
│ Excel│ Cột trái     │ Khung giữa (nền lưới 方眼紙)       │ Cột phải          │
│ → MD │ danh sách    │ tài liệu hiện như một tờ giấy      │ Tùy chọn, hoặc    │
│ MD → │ file, sheet, │ xem trước / mã Markdown / so sánh  │ tab Trợ lý AI |   │
│ Excel│ cây thư mục  │                                    │ Dịch (thu gọn ›)  │
│ Đọc  ├──────────────┴───────────────────────────────────┴───────────────────┤
│ So   │ Thanh dưới: thư mục xuất · nút Convert / Tạo file Excel · tiến độ     │
│ sánh │                                                                       │
│ ☀/☾  │                                                                       │
└──────┴──────────────────────────────────────────────────────────────────────┘
```

| Vùng | Chức năng |
|---|---|
| **Thanh chế độ (trái)** | Đổi giữa 4 chế độ (app nhớ chế độ dùng lần cuối); nút sáng / tối ở đáy |
| **Thanh trên** | Tên chế độ đang dùng, đổi ngôn ngữ giao diện, nút chính (Thêm file / Mở thư mục) |
| **Cột trái** | File đã thêm, danh sách sheet, cây thư mục `.md`, danh sách mục có thay đổi |
| **Khung giữa** | Xem trước bản render / mã Markdown / song song; nội dung tài liệu; bảng so sánh |
| **Cột phải** | Tùy chọn convert (Excel → MD), tên file Excel (MD → Excel), tab Trợ lý AI / Dịch (Đọc Markdown). Cửa sổ hẹp hơn 1200px thì tự thu thành dải hẹp, bấm dải để mở |
| **Thanh dưới** | Chọn thư mục xuất, nút chạy, thanh tiến độ, nút Hủy, nút mở thư mục kết quả |

**Menu Trợ giúp**

| Mục | Tác dụng |
|---|---|
| **Giới thiệu** | Phiên bản app, Electron, Chrome, Node |
| **Kiểm tra cập nhật…** | Hỏi trang Releases, chỉ khi bạn bấm |
| **Mở thư mục log** | Mở thư mục chứa `error.log` |
| **Copy thông tin chẩn đoán** | Phiên bản, hệ điều hành, 50 dòng log cuối (API key đã che) để gửi khi báo lỗi |
| **Đặt lại cài đặt…** | Xóa mọi cài đặt (thư mục, tùy chọn, ngôn ngữ, theme…), **giữ API key** |

---

## 4. Bắt đầu nhanh trong 5 phút

**Mục tiêu**: convert một file thiết kế Excel sang Markdown, rồi đọc và tra cứu nó.

1. Mở app, chọn chế độ **Excel → Markdown** ở thanh trên.
2. Kéo thả file `.xlsx` vào cửa sổ (hoặc `Ctrl+O`).
3. Ở cột trái, tick các sheet cần convert (sheet ẩn mặc định không tick).
4. Ở cột phải, chọn preset **Cho người đọc** (mặc định).
5. Ở thanh dưới, chọn **thư mục xuất**, bấm **Convert** (`Ctrl+Enter`).
6. Khi xong, bấm nút mở thư mục kết quả để xem các file `.md`.
7. Chuyển sang chế độ **Đọc Markdown** → **Mở thư mục** → chọn thư mục xuất ở bước 5.
8. Gõ vào ô lọc để tìm file, bấm **Nội dung** để tìm trong nội dung, hoặc `Ctrl+K` để nhảy tới heading.
9. Bấm nút **bản đồ** ở đầu cây file để xem 画面遷移図, ER, CRUD và chạy 影響調査.

> **Mẹo**: nếu file `.md` sẽ đưa cho AI (NotebookLM, Claude Projects, RAG nội bộ…), chọn preset **AI / RAG** ở bước 4.

---

## 5. Chế độ Excel → Markdown

### 5.1. Các bước

1. **Thêm file**: kéo thả `.xlsx` / `.xlsm` / `.xls` vào cửa sổ, hoặc `Ctrl+O`. Thêm nhiều file cùng lúc được.
2. **Chọn sheet**: tick sheet cần convert. Sheet ẩn có nhãn "ẩn" và mặc định không tick. App nhớ lựa chọn sheet của
   từng file. Dùng `↑` / `↓` để chuyển sheet đang xem.
3. **Xem trước**: khung giữa hiện bản đã render, mã Markdown, hoặc cả hai song song. `Ctrl+=` / `Ctrl+-` / `Ctrl+0` đổi
   cỡ chữ.
4. **Chọn tùy chọn** ở cột phải (xem 5.2, 5.3).
5. **Chọn thư mục xuất** ở thanh dưới, bấm **Convert** (`Ctrl+Enter`). Thanh tiến độ hiện từng file; bấm **Hủy** để
   dừng. Cuối cùng app báo kết quả từng file và có nút mở thư mục kết quả.

### 5.2. Preset (cấu hình nhanh)

Hai nút ở đầu cột Tùy chọn, chọn theo **ai sẽ đọc** file `.md`. Dòng ngay dưới nút mô tả preset đang chọn (hoặc báo
"Tùy chỉnh" khi bạn đã chỉnh tùy chọn khác cả hai).

| Preset | Dùng khi | Thay đổi so với mặc định |
|---|---|---|
| **Cho người đọc** | Đọc, review, Git, wiki (mặc định) | Giữ đúng cấu trúc 基本設計 |
| **Cho AI / RAG** | File đưa cho AI / hệ thống RAG | Thêm YAML front-matter, tách bảng dài mỗi 50 dòng có lặp header, dựng khối 2 cột thành bảng; ô gộp lặp giá trị |

**Preset Cho AI / RAG để làm gì?** Công cụ AI đọc tài liệu (NotebookLM, Claude Projects, ChatGPT, Dify, RAG nội bộ)
thường cắt file thành nhiều đoạn nhỏ rồi chỉ đưa vài đoạn liên quan cho AI. Preset này giúp từng đoạn vẫn tự đủ nghĩa:

- **Khối YAML đầu file** (file nguồn, sheet, 画面ID, 画面名…): đoạn nào cũng biết mình thuộc màn hình / tài liệu nào,
  công cụ lọc được theo 画面ID và AI trích dẫn đúng nguồn.
- **Tách bảng dài mỗi 50 dòng, lặp lại header**: đoạn bị cắt giữa bảng vẫn có tên cột, AI không đọc nhầm cột.
- **Ô gộp lặp giá trị xuống mọi dòng**: mỗi dòng bảng tự đủ thông tin, không phụ thuộc dòng phía trên.
- **Khối 2 cột thành bảng**: cặp nhãn – giá trị không bị tách rời.

Không đưa file cho AI thì dùng **Cho người đọc**: file gọn hơn, không có khối YAML. Cần ô gộp dọc để trống hoặc căn thẳng
cột trong mã nguồn thì chỉnh riêng ở mục 5.3.

Nút **Mặc định** đưa mọi tùy chọn về ban đầu.

### 5.3. Bảng tùy chọn đầy đủ

| Nhóm | Tùy chọn | Ý nghĩa |
|---|---|---|
| Chế độ xuất | Mỗi sheet một file | Tạo `TênFile__TênSheet.md` cho từng sheet |
| | Gộp workbook | Tạo một `TênFile.md` cho cả workbook |
| Bố cục Bảng & Sheet | Bỏ qua sheet `DEL_` | Không convert sheet có tên bắt đầu bằng `DEL_` |
| | Bỏ qua sheet rỗng | Không tạo file cho sheet không có nội dung |
| | Thêm tiêu đề tên sheet | Chèn heading tên sheet đầu nội dung |
| | Nhận diện bảng 2 cột | Biến khối 2 cột (nhãn – giá trị) thành bảng |
| | Căn thẳng cột | Căn cột bảng trong mã Markdown cho dễ đọc |
| | Escape ký tự Markdown/HTML (mặc định bật) | `<null>`, `*必須*` hiện nguyên văn |
| Ô gộp dọc | Lặp giá trị / Để trống / `↑` | Cách ghi ô bị merge theo chiều dọc |
| Ô nhiều dòng | `<br>` / gộp một dòng | Cách ghi ô có xuống dòng |
| Nâng cao | Hiện công thức | Ghi `` `=SUM(..)` `` cạnh giá trị |
| | Front-matter YAML | Thêm file nguồn, sheet, 画面ID… ở đầu file |
| | Chỉ convert vùng ô | Ví dụ `A1:F40` |
| | Tách bảng mỗi N dòng | Lặp header sau mỗi N dòng |

> **Lưu ý**: nếu thư mục xuất (hoặc thư mục cha) có `x2m.json` với mục `convert`, các tùy chọn tương ứng bị **khóa**
> ở cột phải để cả đội ra cùng kết quả. Xem [mục 13](#13-cấu-hình-dự-án-x2mjson).

### 5.4. App hiểu file Excel thế nào

| Trong Excel | Trong Markdown |
|---|---|
| Dòng `基本設計` + tên tài liệu | Quote; khối 版数 / 作成日 / 作成者 thành bảng nhỏ |
| Meta `機能ID`, `画面ID`, `テーブルID`, `画面遷移`… | `- **label**: value`; dòng nối tiếp thành bullet con |
| Section `【...】`, `■処理順序1` | Heading `###` |
| Ghi chú `※...` | Quote |
| Bảng có header `No`, `№`, `項番`… | Bảng Markdown; hỗ trợ header 2 tầng, bỏ cột trống |
| Ô merge dọc / ngang | Theo tùy chọn "Ô gộp dọc"; merge ngang giữ ở ô gốc |
| Công thức | Giá trị Excel đã tính (kể cả tham chiếu liên sheet) |
| Ảnh (chỉ `.xlsx`) | Ghi ra thư mục `<tên>_images/`, chèn đúng vị trí |
| Shape / text box | `- 〔図形 B10〕...` |
| Mũi tên nối hai shape | `- 〔矢印〕A → B` |
| Comment ô | `- 〔コメント B56〕...` |
| Danh sách thả xuống (入力規則) | `- 〔入力規則 C2:C50〕入力 / 選択` |
| Chữ gạch ngang (見え消し) | `~~…~~` |
| Link sang sheet khác | Link tới mục / file `.md` của sheet đó |
| Biểu đồ | `**〔グラフ B3:H18〕縦棒グラフ「tiêu đề」**` + bảng số liệu |

File không phải 基本設計 vẫn convert bình thường: lớp chung (bảng, đoạn văn) luôn chạy; lớp riêng (banner, meta tiếng
Nhật) chỉ bật khi gặp đúng mẫu.

---

## 6. Chế độ Markdown → Excel

Dùng khi muốn sửa nội dung bằng Markdown (bằng tay hoặc nhờ AI, dễ diff bằng Git) rồi xuất ra Excel.

> **Lưu ý**: app tạo workbook **mới** theo bố cục chuẩn của app, **không** dựng lại bố cục Excel gốc (màu, 方眼紙,
> merge gốc).

### 6.1. Các bước

1. Bật chế độ **Markdown → Excel**.
2. Kéo thả các file `.md` (hoặc `Ctrl+O`). Dưới mỗi file là tên các sheet sẽ được tạo.
3. Dùng ↑ / ↓ để đổi thứ tự (thứ tự danh sách = thứ tự sheet). Sửa file `.md` bên ngoài thì bấm **Tải lại** (⟳).
4. Đặt **tên file Excel** ở cột phải (mặc định là phần tên chung trước `__` của các file).
5. Chọn thư mục xuất, bấm **Tạo file Excel** (`Ctrl+Enter`).

**Mọi file trong danh sách được gộp thành một file `.xlsx`.** Nếu file đích đã tồn tại, app hỏi **Ghi đè / Hủy**. Hủy
hoặc lỗi giữa chừng không để lại file dở.

### 6.2. Quy tắc chuyển

| Markdown | Excel |
|---|---|
| Mỗi file, mỗi dòng `---` ở ngoài cùng | Bắt đầu một sheet mới |
| `##` đầu phần | Tên sheet (tự làm sạch ký tự cấm, ≤ 31 ký tự, không trùng) |
| Bảng | Header nền xanh nhạt, viền mảnh; căn lề theo `:---:` / `---:` |
| `- **label**: value` | Ô label + ô value |
| `**đậm**`, `*nghiêng*`, `~~gạch~~`, `` `code` `` trong ô | Rich text (`**10**` vẫn là số 10) |
| `<br>` trong ô | Xuống dòng trong ô |
| Ô / đoạn có một link `http` / `https` / `mailto` | Hyperlink |
| Link `#mục` / `file.md` trong cùng lần tạo | Link nội bộ tới sheet đó |
| `- 〔入力規則 C2:C50〕A / B` | Danh sách thả xuống trên đúng cột (khi chỉ một cột khớp) |
| `- 〔コメント B5: ô〕…` | Ghi chú (note) của đúng ô (khi chỉ một ô khớp) |
| Ảnh PNG / JPEG ≤ 10 MB trong thư mục của file `.md` | Nhúng vào sheet |

**Số**: `10`, `1.0`, `1,234,567.89`, `12.50%` thành số đúng định dạng. `0001`, số dài hơn 11 chữ số, ngày, `#N/A` giữ
dạng text.

**Trình bày**: font 游ゴシック 10, ẩn gridline, in A4 ngang vừa chiều rộng, chiều cao dòng tự tính để chữ không bị che
khi in.

### 6.3. Lưu ý

- `---` dùng làm đường kẻ trang trí cũng bị tách sheet: xem tên sheet dưới từng file trước khi tạo.
- Đoạn văn, heading, ghi chú ghi chữ thuần (không giữ đậm giữa câu).
- Round-trip `md → xlsx → md` chỉ ổn định với Markdown do chính app tạo.
- File `.md` phải là UTF-8 (Shift_JIS bị từ chối, có báo tên file). File rỗng bị từ chối.
- Ô dài hơn 32 767 ký tự bị cắt (giới hạn của Excel).

---

## 7. Chế độ Đọc Markdown

Xem file `.md` như trang web: heading, bảng, code, ảnh, link, sơ đồ Mermaid. Chỉ đọc, không sửa file.

### 7.1. Mở tài liệu

| Cách | Thao tác |
|---|---|
| Mở thư mục | Nút **Mở thư mục** ở thanh trên, `Ctrl+O`, hoặc kéo thả thư mục vào cửa sổ |
| Mở file lẻ | Nút mở file, hoặc chuột phải file `.md` → Open with → ExcelToMarkdown |
| Dán Markdown | Dán nội dung từ clipboard để xem nhanh |

Khi mở thư mục, cột trái hiện cây mọi file `.md` / `.markdown` trong thư mục và thư mục con:

- **Có quét** thư mục bắt đầu bằng dấu chấm do người dùng tạo, ví dụ `.review`, `.docs`, `.spec`.
- **Bỏ qua** thư mục thư viện và công cụ: `node_modules`, `bower_components`, `.git`, `.svn`, `.hg`, `.vscode`, `.idea`,
  `.vs`, `.venv`, `.tox`, `.cache`, `.next`, `.nuxt`, `.yarn`, `.pnpm-store`, `.npm`, `.gradle`, `.terraform`, thùng
  rác hệ thống.
- Tối đa 5 000 file; quá giới hạn thì app báo danh sách bị cắt. File lớn hơn 20 MB không mở.

### 7.2. Tìm kiếm và điều hướng

| Chức năng | Cách dùng |
|---|---|
| Lọc theo tên file | Gõ vào ô lọc đầu cây file |
| Mới sửa / Sắp xếp | Mục **Mới sửa**; sắp xếp theo Tên hoặc Ngày sửa |
| Tìm trong nội dung | Bấm **Nội dung** cạnh ô lọc rồi gõ từ khóa. Nhiều từ cách nhau bằng khoảng trắng = dòng phải chứa đủ các từ. Không phân biệt hoa thường, không phân biệt hiragana / katakana (`てーぶる` tìm ra `テーブル`). Bấm một kết quả để mở file, cuộn tới dòng và tô sáng |
| Nhảy nhanh | `Ctrl+K`, gõ vài chữ để tới file hoặc heading |
| Chuyển file | `↑` / `↓` |
| Lùi / Tiến | Nút ← →, `Alt+←` / `Alt+→`, hoặc nút lùi/tiến của chuột |
| Link | `#mục` và `file.md#mục` cuộn đúng tới mục; link web mở trình duyệt |

File đang xem bị sửa bên ngoài (convert lại, sửa bằng editor) thì khi quay lại cửa sổ app sẽ tự tải lại và giữ vị trí cuộn.

### 7.3. Xuất và in

Các thao tác dưới đây nằm trong menu **Xuất ▾** trên thanh xem (cùng **Copy** Markdown của file đang xem).

- **Xuất HTML**: một trang HTML đứng riêng (mục lục, tìm mục, lọc bảng, sáng / tối, in) để gửi người không cài app.
- **In / PDF**: in phần nội dung tài liệu.

> **Lưu ý**: ảnh đường dẫn tương đối hiện được; ảnh từ Internet không tải (vì lý do bảo mật).

---

## 8. Bản đồ thiết kế và phân tích tài liệu

Mở bằng nút **bản đồ** ở đầu cây file trong chế độ Đọc Markdown. Phân tích **toàn bộ thư mục đang mở**, chạy cục bộ,
**không dùng AI**.

### 8.0. Tài liệu cần viết thế nào để bản đồ hiện ra

Bản đồ chỉ hiện được những gì nó tìm thấy trong các file `.md`. Tab **Hướng dẫn** (tab cuối của bản đồ) cho
biết thư mục đang mở đã có / còn thiếu từng thứ dưới đây, file nào không nhận ra gì, và có **tài liệu mẫu** để copy
hoặc lưu vào thư mục rồi bấm Quét lại. Thư mục chưa có gì thì màn trống có nút dẫn thẳng tới tab này.

| Bản đồ cần | Viết thế nào | Dùng cho |
|---|---|---|
| **Màn hình** | Mỗi màn hình là một phần bắt đầu bằng `##` (hoặc ngăn bằng `---`) có dòng `- **画面ID**: SCR010`; thêm `- **画面名**: 顧客検索画面` để sơ đồ hiện tên | 画面遷移図, hàng CRUD, 影響調査 theo màn hình, 観点表 |
| **Chuyển màn hình** | `- **画面遷移**: メニュー → 顧客検索 → 顧客詳細` (→, ->, ⇒; ↔ hai chiều), hoặc dòng `〔矢印〕A → B（thao tác）` sinh ra từ mũi tên shape trong Excel | 画面遷移図, màn hình liên quan, cảnh báo 遷移 treo |
| **Định nghĩa bảng** | Bảng Markdown có cột `物理名` và `型` (thêm `論理名`, `桁数`, `PK`, `NOT NULL`); tên bảng lấy từ `- **テーブルID**: …` hoặc heading ngay trên | ER, DDL, cột CRUD, 影響調査 theo bảng / cột, so 桁数 |
| **Màn hình nhắc tới bảng / cột** | Trong phần của màn hình: tên bảng, `TBL.COL`, hoặc `論理名` đứng nguyên một ô của bảng 項目定義; động từ cùng dòng (登録 / 表示 / 更新 / 削除) cho C / R / U / D | CRUD図, 影響調査 |
| **用語集** (không bắt buộc) | `用語集.md` ở gốc thư mục, bảng `| 日本語 | Tiếng Việt | English | 備考 |` | Dịch và Trợ lý AI dùng đúng thuật ngữ |

Tài liệu Excel không phải viết tay: convert bằng chế độ Excel → Markdown, các ô 画面ID / 画面遷移 / テーブルID, bảng
物理名 + 型 và mũi tên shape được chuyển đúng các dạng trên.

### 8.1. 画面遷移図

Sơ đồ chuyển màn hình tự dựng từ meta `画面ID` / `画面遷移` và các mũi tên `〔矢印〕`.

- Bấm một màn hình để mở đúng chỗ định nghĩa nó.
- Ô rẽ nhánh (ví dụ `権限あり？`) vẽ hình thoi.
- Màn hình được nhắc tới nhưng chưa định nghĩa có viền đứt.

### 8.2. ER

Sơ đồ quan hệ của mọi テーブル定義 trong thư mục. Khóa ngoại được suy ra từ tên cột.

### 8.3. 影響調査 (điều tra ảnh hưởng)

Gõ một trong các dạng:

| Truy vấn | Ví dụ | Kết quả |
|---|---|---|
| Tên bảng | `M_CUSTOMER` | Tài liệu / màn hình tham chiếu tới bảng |
| Bảng.Cột | `M_CUSTOMER.CUSTOMER_CD` | Nơi dùng cột đó |
| 画面ID | `SCR001` | Tài liệu tham chiếu + màn hình liên quan qua 遷移 |

Bấm kết quả để mở file và tô sáng chỗ tham chiếu.

**Xuất báo cáo 影響調査書**: cạnh dòng tóm tắt có ba nút:

| Nút | Kết quả |
|---|---|
| **Copy Markdown** | Báo cáo gồm tiêu đề, danh sách màn hình bị ảnh hưởng / liên quan, bảng `File | Dòng | Lý do | Nội dung` |
| **Copy TSV** | Bảng chi tiết để dán thẳng vào Excel |
| **Lưu .md** | Lưu báo cáo thành file (mở bằng chế độ Markdown → Excel nếu cần `.xlsx`) |

### 8.4. 整合性チェック (kiểm tra nhất quán)

| Loại | Phát hiện |
|---|---|
| Lỗi | 画面ID / bảng bị định nghĩa trùng; `TBL.COL` không có cột đó |
| Cảnh báo | 遷移 tới màn hình chưa định nghĩa; cách viết mơ hồ: など / 適宜 / 原則 / TBD / 要確認 / 未定…; cột cùng tên nhưng khác kiểu / độ dài giữa các bảng; hạng mục nhập trên màn hình dài hơn cột DB |

**Hạng mục màn hình dài hơn cột DB**: với mỗi hạng mục nhập trong bảng 【項目定義】 (bỏ qua hạng mục 表示 / 出力 / ボタン),
app tìm cột có cùng 論理名 trong テーブル定義. Nếu 桁数 trên màn hình **lớn hơn** độ dài của cột kiểu chữ (CHAR, VARCHAR,
NVARCHAR2, 文字列…) thì cảnh báo, ví dụ `A001 顧客名 桁数 50 > TBL_X.CUST_NAME VARCHAR(40)`: người dùng nhập đủ 50 ký tự
thì lưu sẽ lỗi hoặc bị cắt. Màn hình ngắn hơn DB là bình thường nên không báo. Tên logic có ở nhiều bảng thì chỉ báo khi
dài hơn mọi cột đó. Cột số / ngày không so.

**Xuất danh sách**: **Copy Markdown**, **Copy TSV**, **Lưu .md** ở đầu danh sách (bảng `Mức | Nội dung | File | Dòng`),
tiện làm 質問票 hoặc checklist review.

> **Mẹo**: thêm từ mơ hồ riêng của dự án vào `rules.ambiguousWords` trong `x2m.json`.

### 8.5. CRUD図

Ma trận 画面 × テーブル. Thao tác của mỗi dòng nhắc tới bảng được xác định theo thứ tự:

1. Động từ trên chính dòng đó (登録 / 表示 / 更新 / 削除…, cả tiếng Việt / Anh) → **chữ hoa** `C R U D`.
2. Không có thì động từ trong heading của mục (vd 【削除処理】) → **chữ hoa**.
3. Không có nữa thì suy từ **tên màn hình** → **chữ thường** `c r u d`. Ví dụ bảng 【項目定義】 của `顧客検索画面` chỉ ghi
   `入力` → `r`; của `顧客登録画面` → `c`; `顧客登録・更新画面` → `cu`.
4. Vẫn không xác định được → `?` (app không đoán bừa).

Một ô gộp mọi dòng: chữ hoa (có bằng chứng) thắng chữ thường. Ví dụ `cR` = R có bằng chứng, C chỉ là suy luận.

- Chữ thường nên được xác nhận lại với người viết thiết kế trước khi dùng làm căn cứ.
- Bấm một ô để xem bằng chứng `file:dòng`.
- **Copy TSV** (dán Excel) hoặc **Copy Markdown**.

### 8.5b. 質問票 (câu hỏi gửi khách)

Tab **質問票** của Bản đồ thiết kế biến mọi chỗ thiết kế chưa rõ mà app phát hiện thành câu hỏi lịch sự, theo văn phong
質問票, mỗi câu kèm màn hình và vị trí `file:dòng` (bấm để mở đúng chỗ).

| Nguồn | Câu hỏi |
|---|---|
| 遷移 tới màn hình chưa định nghĩa | Xin mã màn hình và tài liệu của màn hình đích |
| Chữ mơ hồ (など / TBD / 要確認 / 原則…) | Trích nguyên câu, hỏi điều kiện / giá trị / phạm vi cụ thể |
| 桁数 màn hình > cột DB | Theo độ dài màn hình hay DB |
| Cột cùng tên khác kiểu / 桁数 | Có phải cùng hạng mục, kiểu / độ dài đúng |
| Ô CRUD `?` | Màn hình thực hiện thao tác nào với bảng |
| Màn hình không có 項目定義 | Xin danh sách hạng mục |
| 画面ID / bảng trùng, `TBL.COL` không có cột | Xếp loại **記載不備** (lỗi tài liệu, thường tự sửa) |

- Chọn ngôn ngữ câu hỏi **日本語 / VI / EN** (mặc định theo ngôn ngữ tài liệu).
- **Chỉ câu hỏi đặc tả** bỏ các dòng 記載不備 trước khi gửi.
- **Copy TSV** rồi dán vào mẫu 質問票 của dự án: cột 回答 / 回答者 / 回答日 để trống cho khách.
- Dòng lệnh: `x2m qa <thư mục> [--lang ja|vi|en] [--spec-only] [--format tsv|md] [-o qa.tsv]` (file TSV có BOM, mở bằng Excel
  không lỗi font).

### 8.5c. Hoàn thiện (完成度)

Tab **Hoàn thiện** trả lời câu "thiết kế xong bao nhiêu, màn hình nào còn thiếu gì" mà không phải mở từng file.

- Con số **% hoàn thiện** của cả thư mục, cùng số màn hình / bảng đạt đủ mọi tiêu chí.
- Bảng màn hình (yếu nhất ở đầu): có 項目定義 · có 遷移 · có dùng bảng · CRUD đã rõ · không còn chữ mơ hồ · không còn vấn đề
  整合性. `✓` đạt, `✗` chưa đạt (kèm số chỗ), `–` không áp dụng (vd màn hình không dùng bảng thì không xét CRUD).
- Bảng định nghĩa: có khóa chính · mọi cột có 型 · có màn hình dùng.
- Bấm tên màn hình / bảng để mở đúng chỗ; **Copy TSV / Markdown / Lưu .md** để báo cáo tiến độ.

Điểm chỉ dựa trên những gì app đọc được, không đánh giá chất lượng nghiệp vụ: 100% nghĩa là "không còn chỗ thiếu mà app phát
hiện được", không phải "thiết kế đúng".

### 8.6. 用語集 (thuật ngữ dự án)

Đặt file `用語集.md` ở gốc thư mục, có bảng:

```markdown
| 日本語 | Tiếng Việt | English | 備考 |
|---|---|---|---|
| 顧客 | Khách hàng | Customer | |
```

Dịch nhanh và Trợ lý AI sẽ dùng đúng thuật ngữ này. Nút **Copy gợi ý 用語集** tạo sẵn bảng từ tên bảng / cột / màn
hình trong thư mục để bạn chỉnh.

### 8.7. テスト観点表

Nút **観点表** xuất hiện khi tài liệu có bảng 【項目定義】 trong mục có 画面ID. App sinh khung テスト仕様書 tại chỗ,
không dùng AI:

- 必須, biên 桁数 (n / n+1 ký tự), 形式 (数値 / 日付 / 半角英数), 初期値, lựa chọn, nút, 画面遷移.
- Mỗi dòng có 参照元 `file:dòng`.
- Nội dung bằng tiếng Nhật / Việt / Anh.
- **Copy TSV** để dán Excel, hoặc **Lưu `.md`** rồi dùng chế độ Markdown → Excel để ra `.xlsx`.

> **Lưu ý**: đây là **khung** quan điểm kiểm thử. Người kiểm thử vẫn cần bổ sung case nghiệp vụ.

### 8.7b. Mock màn hình (画面モック)

Biến tài liệu thiết kế thành các màn hình bấm được để demo với khách, không cần viết code, không dùng AI.

- **Một tài liệu**: nút **Mock** trên thanh xem (hiện khi tài liệu có bảng 【項目定義】 trong phần có 画面ID).
- **Cả thư mục**: nút **Mock** ở thanh trên của Bản đồ thiết kế; link 画面遷移 giữa các file bấm được.

Mỗi 画面ID thành một form:

| Trong 【項目定義】 | Trên mock |
|---|---|
| 区分 入力, 型 文字列 / 数値 / 日付 / 日時 | Ô nhập đúng loại; độ dài ô theo 桁数, `maxlength` = 桁数 |
| 桁数 ≥ 200 hoặc 型 テキストエリア | Ô nhiều dòng |
| 区分 / 型 プルダウン, 選択, ラジオ, チェックボックス | Danh sách thả xuống / nút chọn; lựa chọn lấy từ dòng 〔入力規則〕 của màn hình |
| 区分 表示 / 出力 | Ô chỉ đọc, hiện 初期値 |
| 区分 ボタン | Nút; nút có nhãn trùng thao tác 画面遷移 thì bấm được sang màn hình đó |
| 必須 (cột 必須, hoặc chữ 必須 ở 備考) | Nhãn đỏ 必須 |
| 画面遷移 / 〔矢印〕 | Hàng nút 遷移 cuối màn hình; màn hình chưa định nghĩa thì mờ |

**Tài liệu viết bằng tiếng Việt** cũng mock được: dùng nhãn `Mã màn hình` / `Tên màn hình` / `Chuyển màn hình` (hoặc `Screen
ID` / `Screen name` / `Screen transition`) và bảng hạng mục có cột tiếng Việt. Chữ trên mock (Bắt buộc, Chuyển tới…) theo
ngôn ngữ của tài liệu.

```markdown
## Thanh toán

- **Mã màn hình**: CHECKOUT
- **Tên màn hình**: Thanh toán
- **Chuyển màn hình**: Thanh toán → Đặt hàng thành công（Đặt hàng ngay）

| Hạng mục | Loại | Kiểu | Độ dài | Bắt buộc | Ghi chú |
|---|---|---|---|---|---|
| Họ và tên | Nhập | Chuỗi | 50 | ○ | |
| Tỉnh/TP | Chọn | Danh sách | | ○ | Hà Nội / TP.HCM / Đà Nẵng |
| Phương thức thanh toán | Nút chọn | | | ○ | COD / VietQR / MoMo |
| Đặt hàng ngay | Nút | | | | |
```

| Từ khóa (cột Loại / Kiểu) | Thành |
|---|---|
| Chọn, Danh sách, Thả xuống | Danh sách thả xuống |
| Nút chọn, Radio | Nhóm nút chọn |
| Hộp kiểm, Ô đánh dấu | Ô đánh dấu |
| Nhiều dòng, Văn bản dài | Ô nhiều dòng |
| Ngày / Ngày giờ, Thời gian | Ô chọn ngày / ngày giờ |
| Số, Số nguyên, Số tiền | Ô số |
| Hiển thị | Ô chỉ đọc |
| Nút | Nút bấm |
| Tên hạng mục có "điện thoại", "mật khẩu", "email" | Ô điện thoại / mật khẩu / email |

Lựa chọn của danh sách / nút chọn viết thẳng ở cột **Ghi chú**, ngăn bằng ` / `.

**Lưu HTML** tạo một file HTML đứng riêng (không JavaScript, không tải gì từ mạng): mở bằng trình duyệt bất kỳ, danh sách màn
hình bên trái. Mock chỉ là giao diện: không kiểm tra nhập, không xử lý. Dòng lệnh: `x2m mock <thư mục|file.md|file.xlsx> -o
mock.html [--title …]`.

### 8.8. DDL / JSON / ER từ テーブル定義書

Bảng có cột `物理名` + `型` có thêm nút **DDL** trên thanh mục lục:

1. Chọn dialect: Generic / PostgreSQL / MySQL / Oracle / SQL Server.
2. Copy `CREATE TABLE` (kèm PK, NOT NULL, DEFAULT, comment theo tên logic), hoặc JSON, hoặc ER Mermaid.

Nút **ER** trên thanh xem vẽ sơ đồ quan hệ của riêng file đang xem.

---

## 9. Chế độ So sánh 新旧

Dùng khi khách gửi bản thiết kế mới và bạn cần biết chính xác đã đổi gì.

### 9.1. Các bước

1. Bật chế độ **So sánh**.
2. Chọn **bản cũ (旧)** và **bản mới (新)**: kéo thả 2 file (file thả trước là bản cũ), hoặc nút **Chọn file…** ở từng
   ô. Chấp nhận `.xlsx` / `.xlsm` / `.xls` / `.md`; so Excel với Markdown cũng được.
3. Đọc kết quả ở bảng hai cột:

   | Màu | Ý nghĩa |
   |---|---|
   | Xanh | Dòng thêm |
   | Đỏ | Dòng xóa |
   | Tô chữ | Dòng sửa, tô đúng phần chữ đổi (chữ Nhật so theo từng ký tự) |

4. Điều hướng: `F7` / `Shift+F7` hoặc ↑ ↓ để nhảy giữa các thay đổi; cột trái liệt kê các mục 【…】 / sheet có thay
   đổi. **Chỉ thay đổi** ẩn phần giống nhau (bấm dòng `⋯` để hiện lại).
5. Nút **⇄** đổi chỗ cũ / mới, **⟳** đọc lại hai file sau khi sửa.

### 9.2. Xuất báo cáo và 改訂履歴

- **Xuất báo cáo** (`.md`) hoặc **Copy báo cáo**: bảng `場所 | 項目 | 旧 | 新` để dán vào review.
- **改訂履歴**: app tự sinh mỗi mục thay đổi một dòng, ví dụ 「行追加 1件（C09）、行変更 1件（C02: 項目名）」. Điền 版数 /
  改訂者, chọn ngôn ngữ, bấm **Copy cho Excel (TSV)** rồi dán vào ô 版数 đầu tiên của bảng 改訂履歴 trong Excel.

### 9.3. ALTER TABLE từ hai bản thiết kế

Khi bản cũ và bản mới có テーブル定義 (bảng có cột 物理名 + 型), thanh so sánh có nút **ALTER TABLE**. Hộp thoại sinh câu
lệnh đưa CSDL từ bản cũ sang bản mới; chọn hệ CSDL (Generic / PostgreSQL / MySQL / Oracle / SQL Server), bấm **Copy SQL**.

| Thay đổi trong thiết kế | Câu lệnh sinh ra |
|---|---|
| Bảng chỉ có ở bản mới | `CREATE TABLE` đầy đủ |
| Bảng chỉ có ở bản cũ | `DROP TABLE` kèm `-- 要確認` (mất dữ liệu) |
| Thêm cột | `ADD COLUMN` (Oracle `ADD (...)`); NOT NULL không có 既定値 thì nhắc dữ liệu cũ |
| Bỏ cột | `DROP COLUMN` kèm `-- 要確認` |
| Đổi kiểu / 桁数, NULL ↔ NOT NULL, 既定値 | PostgreSQL `ALTER COLUMN … TYPE / SET NOT NULL / SET DEFAULT`, MySQL `MODIFY COLUMN` (đủ định nghĩa), Oracle `MODIFY (...)`, SQL Server `ALTER COLUMN` |
| Cột mới cùng 論理名 với cột bị bỏ | `-- 要確認`: có thể là đổi tên, nên dùng `RENAME COLUMN` |
| Đổi khóa chính, 既定値 trên SQL Server | Chỉ ghi `-- 要確認` (cần tên constraint, không đoán) |

Bảng và cột khớp theo **物理名** (không phân biệt hoa thường). Luôn đọc các dòng `-- 要確認` trước khi chạy trên CSDL thật.
Dòng lệnh: `x2m migrate <bản cũ> <bản mới> [--dialect postgres] [-o alter.sql]`.

### 9.4. Cách app so sánh

So theo cấu trúc: sheet → mục → dòng bảng. Dòng bảng được khớp theo **cột khóa** (`ID`, `項目ID`, `物理名`, `項目名`…),
nên chèn một dòng giữa bảng (kể cả khi cột No bị đánh số lại) chỉ báo đúng **một dòng thêm**. Thêm cột khóa riêng của
dự án bằng `rules.diffKeyColumns` trong `x2m.json`.

---

## 10. Trợ lý AI và Dịch nhanh

### 10.1. Thiết lập lần đầu

1. Ở chế độ Đọc Markdown, bấm nút **🔑** ở đầu cột trợ lý.
2. Chọn nhà cung cấp, dán API key:

   | Nhà cung cấp | Lấy key ở | Dạng key | Model mặc định |
   |---|---|---|---|
   | Gemini | aistudio.google.com | `AIza...` / `AQ....` | `gemini-flash-latest` |
   | Claude | console.anthropic.com | `sk-ant-...` | `claude-opus-5-5` |
   | OpenAI / Codex | platform.openai.com | `sk-...` | `gpt-5` |

3. Bấm **Lưu**. Danh sách model dùng được với key tự tải về (nút ↻ để tải lại).

Mỗi nhà cung cấp lưu một key riêng; đổi qua lại không mất key. Key được mã hóa bằng kho bảo mật của hệ điều hành.

> **Lưu ý**: API key **khác** gói đăng ký. ChatGPT Plus/Pro hay Claude Pro/Max **không** kèm API key; API tính tiền
> riêng theo token. Muốn dùng gói đăng ký sẵn có, xem [mục 11 (MCP)](#11-dùng-với-claude-code--codex--claude-desktop-mcp).

### 10.2. Đặt câu hỏi

| Thiết lập | Ý nghĩa |
|---|---|
| Phạm vi **Cả thư mục** | Tìm đoạn liên quan trên mọi file đang mở rồi gửi kèm câu hỏi (RAG) |
| Phạm vi **Chỉ file đang xem** | Gửi nguyên văn file đang xem |

- Hỏi tiếng Việt vẫn tìm ra tài liệu tiếng Nhật nhờ từ điển thuật ngữ Việt ↔ Nhật và 用語集 dự án.
- **Nút tác vụ nhanh**: Tóm tắt nghiệp vụ, Kiểm tra thiếu sót, Sinh test case (file đang xem),
  Đối chiếu chéo tên bảng / cột / mã màn hình (cả thư mục).
- Câu trả lời hiện dần; bấm **Dừng** để hủy. Trích dẫn `file › mục` bấm được để mở đúng chỗ.
- AI nhớ 6 lượt hỏi đáp gần nhất; **Xóa chat** để bắt đầu lại; **Xuất .md** để lưu cuộc trò chuyện.

**Ví dụ câu hỏi tốt**

- "Màn hình nào cập nhật bảng `T_ORDER`? Liệt kê kèm nguồn."
- "Liệt kê các mục 必須 của màn hình SCR010 và điều kiện kiểm tra."
- "So sánh độ dài cột `CUSTOMER_CD` giữa định nghĩa màn hình và định nghĩa bảng."

### 10.3. Ngữ cảnh và chi phí

Ô **Ngữ cảnh** trong hộp 🔑:

| Mức | Khi nào chọn |
|---|---|
| 32k token (mặc định) | Tiết kiệm; thư mục nhỏ gửi nguyên văn, lớn thì chỉ gửi file khớp nhất |
| 120k token | Cân bằng, ít sót hơn với thư mục vừa |
| 250k token | Đầy đủ nhất, tốn nhất |

Hỏi tiếp trên cùng tài liệu thì nhà cung cấp đọc lại từ **cache** với giá rẻ hơn. Cuối mỗi câu trả lời có dòng
`⚡ … tokens · cache …` để theo dõi.

### 10.4. Dịch

Dùng nhà cung cấp AI đã cấu hình ở 10.1; chỉ gửi khi bạn bấm. Mã, ID, tên bảng / cột được giữ nguyên. Nếu thư mục có
`用語集.md` (mục 8.6), bản dịch theo đúng thuật ngữ trong đó và hiện các thuật ngữ đã áp dụng.

**Dịch đoạn bôi đen**

1. Bôi đen chữ trong khung xem (mọi chế độ).
2. Bấm nút **訳 Dịch** cạnh vùng chọn, hoặc `Ctrl+Shift+T`.
3. Popup ghi chiều dịch (vd *Tiếng Nhật → Tiếng Việt*). Ngôn ngữ đích mặc định là ngôn ngữ giao diện; nếu đoạn chọn đã
   là ngôn ngữ đó thì app dịch sang cặp Nhật ↔ Việt. Đổi đích bằng nút **VI / EN / 日本語**.
4. **Copy bản dịch**, hoặc `Esc` để đóng.

**Dịch cả một mục hoặc một bảng**

1. Trên thanh mục lục phía trên tài liệu, bấm nút **訳** ở chip của mục (heading) hoặc bảng cần dịch.
2. Hộp thoại hiện hai cột **Bản gốc** | **Bản dịch**; bảng trong mục được dịch mà vẫn giữ cấu trúc Markdown.
3. **Copy Markdown** để dán vào tài liệu / chat, hoặc **Lưu .md** (mở bằng chế độ Markdown → Excel nếu cần `.xlsx`).

Mỗi lần dịch tối đa 12 000 ký tự; mục dài hơn thì dịch từng mục con hoặc dùng Trợ lý AI.

**Lịch sử dịch**: ở chế độ Đọc Markdown, tab **Dịch** ở cột phải liệt kê các bản dịch trong phiên (mới nhất trước),
có Copy và **Mở bản dịch** (với bản dịch mục / bảng: mở lại hộp hai cột, không gọi AI lần nữa). Lịch sử chỉ nằm trong
bộ nhớ, đóng app là mất.

---

## 11. Dùng với Claude Code / Codex / Claude Desktop (MCP)

**MCP** là chuẩn để trợ lý AI gọi công cụ bên ngoài. App có sẵn một MCP server, nên Claude Code, Codex CLI, Claude
Desktop, Cursor dùng được converter và bộ tìm kiếm của app, chạy bằng **gói đăng ký của bạn, không cần API key**.

### 11.1. Đăng ký (một lần)

**Máy đã cài app** (Command Prompt; PowerShell thay `%LOCALAPPDATA%` bằng `$env:LOCALAPPDATA`):

```bat
claude mcp add excel-markdown -- cmd /c "%LOCALAPPDATA%\Programs\ExcelToMarkdown\resources\bin\x2m-mcp.cmd"
codex mcp add excel-markdown -- cmd /c "%LOCALAPPDATA%\Programs\ExcelToMarkdown\resources\bin\x2m-mcp.cmd"
```

**Claude Desktop / Cursor** (thay `<tên>` bằng tên tài khoản Windows):

```json
{
  "mcpServers": {
    "excel-markdown": {
      "command": "cmd",
      "args": ["/c", "C:\\Users\\<tên>\\AppData\\Local\\Programs\\ExcelToMarkdown\\resources\\bin\\x2m-mcp.cmd"]
    }
  }
}
```

**Từ mã nguồn**: `npm install && npm run build`, rồi:

```bash
claude mcp add excel-markdown -- node /đường/dẫn/excel-markdown/out/main/mcp.js
```

### 11.2. Danh sách công cụ

| Tool | Chức năng |
|---|---|
| `convert_excel` | Convert Excel → Markdown (`files` và/hoặc `dir`; front-matter, gộp workbook, tách bảng, vùng ô) |
| `list_docs` | Liệt kê file `.md` trong thư mục |
| `search_docs` | Tìm file / mục liên quan nhất tới câu hỏi, có tiêu đề để trích dẫn |
| `read_doc` | Đọc file `.md` theo trang (`offset` / `limit`, mặc định 2 000 dòng) |
| `outline` | Danh sách heading kèm số dòng |
| `list_sheets` | Danh sách sheet của file Excel (số dòng, sheet ẩn) |
| `preview_sheet` | Markdown của một sheet, không ghi file |
| `impact` | 影響調査 + 整合性チェック cho cả thư mục |
| `crud` | Ma trận CRUD kèm bằng chứng `file:dòng` |
| `table_ddl` | DDL / JSON / ER Mermaid từ テーブル定義書 |
| `build_excel` | Gộp `.md` thành một `.xlsx` |

> **Lưu ý**: `convert_excel` và `build_excel` từ chối ghi đè file đã có, trừ khi truyền `overwrite: true`. Đường dẫn
> truyền cho tool phải là tuyệt đối.

### 11.3. Ví dụ yêu cầu cho agent

- "Convert các file Excel trong `D:\specs` sang Markdown có front-matter, ghi vào `D:\specs-md`."
- "Trong `D:\specs-md`, màn hình nào dùng cột `CUSTOMER_CD`? Liệt kê kèm nguồn."
- "Chạy 整合性チェック cho `D:\specs-md` và đề xuất câu hỏi gửi khách cho từng lỗi."

---

## 12. Dòng lệnh `x2m`

### 12.1. Thiết lập

Máy đã cài app: thêm `resources\bin` vào PATH (PowerShell, chạy một lần, mở terminal mới):

```powershell
[Environment]::SetEnvironmentVariable('Path', [Environment]::GetEnvironmentVariable('Path','User') + ";$env:LOCALAPPDATA\Programs\ExcelToMarkdown\resources\bin", 'User')
```

Từ mã nguồn: `npm run build`, rồi thay `x2m` bằng `node out/main/cli.js` trong mọi lệnh dưới đây.

### 12.2. Tham chiếu lệnh

| Lệnh | Chức năng |
|---|---|
| `x2m <file|thư mục>... -o <out>` | Excel → Markdown |
| `x2m md2xlsx <file.md|thư mục> -o <Book.xlsx> [--overwrite]` | Markdown → Excel |
| `x2m impact <thư mục> <truy vấn>` | 影響調査 |
| `x2m lint <thư mục>` | 整合性チェック; có lỗi → mã thoát 1 (dùng trong CI) |
| `x2m crud <thư mục> [--format md|tsv]` | Ma trận CRUD |
| `x2m ddl <file.md|thư mục|file.xlsx> [--dialect postgres] [--format sql|json|mermaid] [-o schema.sql]` | DDL |
| `x2m textconv <file.xlsx>` | In Markdown ra stdout (dùng cho git diff) |
| `x2m --help`, `x2m --version` | Trợ giúp, phiên bản |

**Cờ cho Excel → Markdown**

| Cờ | Ý nghĩa |
|---|---|
| `--per-workbook` | Gộp mỗi workbook thành một file |
| `--range A1:F40` | Chỉ convert vùng ô |
| `--formulas` | Hiện công thức |
| `--front-matter` | Thêm YAML front-matter |
| `--chunk N` | Tách bảng mỗi N dòng |
| `--keep-del` / `--keep-empty` | Giữ sheet `DEL_` / sheet rỗng |
| `--no-escape` / `--no-title` | Tắt escape / tắt tiêu đề sheet |
| `--no-clobber` | Bỏ qua workbook đã có file `.md` đầu ra |
| `--no-config` | Bỏ qua `x2m.json` |

Đầu vào là thư mục thì convert mọi file Excel bên trong (đệ quy, bỏ file khóa `~$*`, giữ cấu trúc thư mục con).

### 12.3. Ví dụ

```bash
x2m specs/ -o specs-md --front-matter --chunk 50
x2m lint specs-md
x2m impact specs-md M_CUSTOMER.CUSTOMER_CD
x2m ddl specs-md --dialect postgres -o schema.sql
```

### 12.4. Xem thay đổi file Excel trong `git diff`

```bash
git config diff.x2m.textconv "x2m.cmd textconv"
git config diff.x2m.cachetextconv true
echo '*.xlsx diff=x2m' >> .gitattributes
```

Sau đó `git diff`, `git log -p`, SourceTree… hiện thay đổi theo từng sheet dạng Markdown; ảnh hiện kèm mã sha1 nên đổi
ảnh cũng thấy.

---

## 13. Cấu hình dự án `x2m.json`

Đặt `x2m.json` trong thư mục tài liệu (thường ở gốc repo, commit cùng tài liệu) để cả đội convert ra cùng kết quả và
dùng chung luật nhận diện. Không có file thì app chạy như mặc định.

```json
{
  "convert": { "frontMatter": true, "chunkRows": 50, "verticalMerge": "repeat" },
  "rules": {
    "ambiguousWords": ["要調整", "別途"],
    "screenIdLabels": ["画面コード"],
    "transitionLabels": ["遷移先"],
    "crudVerbs": { "C": ["起票"], "U": ["差戻し"], "D": ["破棄"] },
    "diffKeyColumns": ["項目コード"]
  }
}
```

| Khóa | Ý nghĩa |
|---|---|
| `convert` | Tùy chọn Excel → Markdown: `includeSheetTitle`, `skipDelSheets`, `skipEmptySheets`, `multiline`, `detectTwoColTables`, `escapeMarkdown`, `showFormulas`, `frontMatter`, `chunkRows`, `verticalMerge`, `alignTables`. Trong app bị khóa ở cột phải; CLI / MCP dùng làm mặc định, cờ dòng lệnh áp lên trên |
| `rules.ambiguousWords` | Thêm chữ mơ hồ cho 整合性チェック |
| `rules.screenIdLabels` | Thêm nhãn được hiểu là 画面ID |
| `rules.transitionLabels` | Thêm nhãn được hiểu là 画面遷移 |
| `rules.crudVerbs` | Thêm động từ cho C / R / U / D |
| `rules.diffKeyColumns` | Thêm cột khóa khi So sánh 新旧 |

- `rules` **cộng thêm** vào luật có sẵn, không thay thế. Mỗi mục là chuỗi thường (không phải regex), ≤ 40 ký tự,
  ≤ 200 mục mỗi danh sách; không phân biệt hoa thường / toàn角.
- File sai (JSON hỏng, khóa gõ sai, sai kiểu) không làm app lỗi: phần sai bị bỏ qua, kèm cảnh báo.

**App tìm `x2m.json` ở đâu**: đi từ thư mục dưới đây lên các thư mục cha, dừng ở thư mục đầu tiên có `x2m.json` hoặc
ở gốc repo (thư mục có `.git`).

| Chức năng | Bắt đầu tìm từ |
|---|---|
| Excel → Markdown (app) | Thư mục xuất |
| Đọc Markdown, Bản đồ thiết kế, 影響調査, CRUD, 整合性 | Thư mục đang mở |
| So sánh 新旧 | Thư mục chứa file **mới** (chỉ dùng `diffKeyColumns`) |
| CLI / MCP convert | Thư mục `-o` / `out_dir` |
| CLI / MCP `impact`, `lint`, `crud` | Thư mục tài liệu truyền vào |

`textconv` và So sánh file Excel không dùng `convert`, để kết quả diff không phụ thuộc máy hay cấu hình.

---

## 14. Quy trình làm việc mẫu

### 14.1. Đưa bộ tài liệu thiết kế vào Git

1. Tạo repo, đặt `x2m.json` ở gốc với `convert` mong muốn.
2. `x2m specs/ -o docs/ --front-matter` (hoặc dùng app, thư mục xuất là `docs/`).
3. Cấu hình textconv (mục 12.4) để diff được cả file Excel gốc.
4. Thêm `x2m lint docs/` vào CI để chặn lỗi nhất quán.

### 14.2. Nhận bản thiết kế mới từ khách

1. Chế độ **So sánh**: bản cũ = file trước, bản mới = file khách gửi.
2. Bật **Chỉ thay đổi**, duyệt bằng `F7`.
3. **Xuất báo cáo** để review nội bộ; **Copy cho Excel (TSV)** để điền 改訂履歴.
4. Convert bản mới, mở **Bản đồ thiết kế** → **影響調査** cho từng bảng / màn hình bị đổi.

### 14.3. Chuẩn bị Q&A (質問票) cho khách

1. Mở thư mục tài liệu ở chế độ Đọc Markdown → **Bản đồ thiết kế** → **整合性チェック**.
2. Mỗi lỗi / cảnh báo (遷移 tới màn hình chưa định nghĩa, TBD, 要確認…) là một câu hỏi tiềm năng.
3. Dùng Trợ lý AI hoặc MCP: "Từ các cảnh báo này, soạn câu hỏi bằng tiếng Nhật gửi khách."

### 14.4. Chuẩn bị kiểm thử

1. Mở tài liệu màn hình có 【項目定義】 → **観点表** → Lưu `.md`.
2. Bổ sung case nghiệp vụ, rồi chế độ **Markdown → Excel** để ra テスト仕様書 `.xlsx`.
3. Dùng **CRUD図** để kiểm tra bảng nào cần chuẩn bị dữ liệu test.

### 14.5. Thư mục review riêng (`.review`)

Có thể để ghi chú review, Q&A, biên bản trong thư mục chấm như `.review/` cạnh tài liệu. Chế độ Đọc Markdown, tìm
kiếm, Trợ lý AI và Bản đồ thiết kế đều đọc các file này cùng tài liệu chính.

---

## 15. Phím tắt

| Phím | Tác dụng |
|---|---|
| `Ctrl+O` | Thêm file Excel (MD → Excel: thêm `.md`; Đọc Markdown: mở thư mục) |
| `Ctrl+Enter` | Convert / Tạo file Excel |
| `Ctrl+=` / `Ctrl+-` / `Ctrl+0` | Phóng to / thu nhỏ / đặt lại cỡ chữ xem trước |
| `↑` / `↓` | Sheet trước / sau (Đọc Markdown: file trước / sau) |
| `Ctrl+K` | Nhảy nhanh tới file / heading |
| `Alt+←` / `Alt+→` | Lùi / tiến |
| `F7` / `Shift+F7` | So sánh: thay đổi sau / trước |
| `Ctrl+Shift+T` | Dịch đoạn đang bôi đen |
| `Esc` | Đóng popup / bảng lệnh, xóa ô lọc |

---

## 16. Bảo mật và quyền riêng tư

| Hoạt động | Dữ liệu rời khỏi máy? |
|---|---|
| Excel ↔ Markdown, Đọc Markdown, So sánh, Bản đồ thiết kế, CLI | **Không** |
| MCP | Do agent bạn dùng (Claude Code, Codex…) quyết định, theo chính sách của agent đó |
| Trợ lý AI | Đoạn tài liệu liên quan + câu hỏi, gửi tới nhà cung cấp đã chọn |
| Dịch nhanh | Chỉ đoạn đã bôi đen |
| Kiểm tra cập nhật | Chỉ khi bạn bấm, gọi trang GitHub Releases |

- API key được mã hóa bằng kho bảo mật của hệ điều hành và chỉ gửi tới API của chính nhà cung cấp đó.
- Ảnh từ Internet trong Markdown không được tải; nội dung hiển thị được lọc HTML nguy hiểm.
- File Excel được đọc trong một tiến trình tách riêng khỏi giao diện.

> **Lưu ý**: kiểm tra chính sách bảo mật của công ty và hợp đồng với khách trước khi gửi tài liệu mật cho AI.

---

## 17. Xử lý sự cố

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Windows cảnh báo khi chạy lần đầu | App chưa ký số | **More info → Run anyway** |
| Báo "File có mật khẩu" | File Excel được bảo vệ | Gỡ mật khẩu bằng Excel rồi thử lại |
| Lỗi khi convert | File hỏng, định dạng lạ | **Trợ giúp → Mở thư mục log**, xem `error.log` |
| Bảng 2 cột không thành bảng | Tùy chọn đang tắt | Bật "Nhận diện bảng 2 cột" |
| Ngày hiện thành số (ví dụ `45123`) | Ô ngày có format General trong Excel | Đặt format ngày cho ô trong Excel rồi convert lại |
| "Không ghi được file Excel" | File `.xlsx` cùng tên đang mở trong Excel | Đóng file trong Excel rồi thử lại |
| Markdown → Excel ra nhiều sheet hơn mong đợi | Có dòng `---` trang trí | Bỏ `---` hoặc xem tên sheet dưới từng file |
| File `.md` bị từ chối | Không phải UTF-8 hoặc rỗng | Lưu lại dạng UTF-8 |
| Không thấy file trong thư mục `.git`, `.vscode`… | Cố ý bỏ qua thư mục công cụ | Chuyển tài liệu sang thư mục khác (ví dụ `.review`, `docs`) |
| Cây file báo bị cắt | Quá 5 000 file | Mở thư mục con nhỏ hơn |
| AI báo 401 / 403 | Key sai, hết hạn, chưa nạp tiền | Kiểm tra key đúng nhà cung cấp đang chọn |
| AI báo 429 | Vượt giới hạn tần suất | Chờ vài giây, hoặc kiểm tra hạn mức |
| AI báo model không tồn tại | Model bị đổi tên / ngừng | Bấm ↻ trong hộp 🔑, chọn lại model |
| AI trả lời thiếu | Ngữ cảnh không đủ | Tăng mức **Ngữ cảnh**, hoặc chọn *Chỉ file đang xem* |
| Tùy chọn convert bị khóa | Có `x2m.json` với mục `convert` | Sửa `x2m.json`, hoặc chọn thư mục xuất khác |
| Giao diện báo lỗi và có nút **Tải lại** | Lỗi hiển thị bất ngờ | Bấm **Tải lại**; gửi **Copy thông tin chẩn đoán** khi báo lỗi |

**Khi báo lỗi**, gửi kèm: thông tin từ **Trợ giúp → Copy thông tin chẩn đoán**, các bước tái hiện, và (nếu được) file
mẫu đã xóa dữ liệu nhạy cảm.

---

## 18. Câu hỏi thường gặp

**Sheet ẩn có bị convert không?**
Mặc định không tick. Tick tay nếu cần.

**Sao file `.md` có dấu `\` trước `*`, `<`, `#`?**
Đó là escape để nội dung ô hiện đúng nguyên văn (`<null>` không bị ẩn như thẻ HTML, `*必須*` không thành chữ nghiêng).
Nếu ô Excel cố ý chứa cú pháp Markdown, tắt "Escape ký tự Markdown/HTML trong ô".

**Macro trong `.xlsm` thì sao?**
Bị bỏ qua, chỉ lấy giá trị.

**Markdown → Excel có làm mất số 0 đầu hay đổi `1.0` thành `1`?**
Không. `0001` giữ dạng text, `1.0` giữ định dạng `0.0`, `12.50%` giữ `0.00%`.

**Có đọc được thư mục bắt đầu bằng dấu chấm như `.review` không?**
Có. Chỉ các thư mục công cụ (`.git`, `.svn`, `.vscode`, `.idea`, `.venv`, `.cache`…) và `node_modules` bị bỏ qua.

**Trợ lý AI trong app hay MCP?**
Đã có gói Claude / ChatGPT và dùng Claude Code / Codex: chọn **MCP** (không tốn API, agent tự tìm và đọc nhiều file).
Muốn hỏi nhanh ngay trong app: dùng **Trợ lý AI** với API key.

**Nên chọn nhà cung cấp AI nào?**
Gemini Flash rẻ, nhanh cho hỏi đáp thường ngày. Claude và các model lớn của OpenAI kỹ hơn với tài liệu dài hoặc phân
tích (đối chiếu chéo, sinh test case), giá cao hơn.

**Có chạy trên macOS không?**
Bản cài đặt hiện chỉ cho Windows. Trên macOS / Linux, chạy từ mã nguồn (mục 2.3).

---

## 19. Giới hạn đã biết

| Lĩnh vực | Giới hạn |
|---|---|
| Excel → Markdown | Chưa đọc SmartArt và biểu đồ kiểu mới (waterfall, treemap…). Ảnh, shape, biểu đồ chỉ đọc từ `.xlsx`. Nhận diện header bảng dựa trên mẫu, có thể nhầm với file Excel bố cục lạ |
| Markdown → Excel | Không dựng lại bố cục gốc (màu, 方眼紙, merge). Round-trip chỉ ổn định với Markdown do app tạo |
| Đọc Markdown | Tối đa 5 000 file mỗi thư mục, file ≤ 20 MB. Không tải ảnh từ Internet |
| Bản đồ thiết kế | Khóa ngoại suy từ tên cột; CRUD suy từ động từ / tên màn hình nên có ô chữ thường (suy luận) hoặc `?`; so 桁数 màn hình ↔ DB chỉ khớp theo 論理名 và chỉ với cột kiểu chữ |
| Trợ lý AI | Tìm đoạn liên quan theo từ khóa và từ điển thuật ngữ; nhớ 6 lượt gần nhất |
| Nền tảng | Bản cài đặt chỉ Windows x64, chưa ký số |

---

## 20. Phụ lục: Thuật ngữ

| Thuật ngữ | Giải thích |
|---|---|
| **基本設計** | Thiết kế cơ bản (basic design) |
| **画面ID / 機能ID / テーブルID** | Mã màn hình / chức năng / bảng |
| **画面遷移 / 画面遷移図** | Chuyển màn hình / sơ đồ chuyển màn hình |
| **項目定義** | Định nghĩa các mục (field) trên màn hình |
| **テーブル定義書** | Tài liệu định nghĩa bảng CSDL |
| **物理名 / 論理名 / 型 / 桁数** | Tên vật lý / tên logic / kiểu dữ liệu / độ dài |
| **必須** | Bắt buộc nhập |
| **入力規則** | Data validation (danh sách thả xuống) trong Excel |
| **見え消し** | Chữ gạch ngang để thể hiện nội dung đã xóa |
| **新旧比較** | So sánh bản cũ và bản mới |
| **改訂履歴 / 版数 / 改訂者** | Lịch sử sửa đổi / số phiên bản / người sửa |
| **影響調査** | Điều tra phạm vi ảnh hưởng |
| **整合性チェック** | Kiểm tra tính nhất quán |
| **CRUD** | Create / Read / Update / Delete |
| **テスト観点表 / テスト仕様書** | Bảng quan điểm kiểm thử / đặc tả kiểm thử |
| **用語集** | Bảng thuật ngữ |
| **Markdown** | Định dạng văn bản thuần có cú pháp đơn giản cho heading, bảng, danh sách |
| **Front-matter** | Khối YAML ở đầu file `.md` chứa thông tin mô tả (metadata) |
| **RAG** | Kỹ thuật tìm đoạn tài liệu liên quan rồi gửi kèm câu hỏi cho AI |
| **MCP** | Model Context Protocol, chuẩn để trợ lý AI gọi công cụ bên ngoài |
| **textconv** | Cơ chế Git chuyển file nhị phân sang văn bản để hiển thị diff |
| **DDL** | Lệnh định nghĩa CSDL (`CREATE TABLE`…) |
