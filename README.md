# ExcelToMarkdown

Ứng dụng desktop chuyển tài liệu thiết kế Excel sang Markdown và ngược lại, đọc tài liệu Markdown
và hỏi đáp trên tài liệu bằng AI. App hiểu đúng bố cục tài liệu 基本設計 của Nhật (banner,
画面ID / 機能ID, bảng 項番, ô merge, ghi chú ※, ảnh và shape trong sheet), nhưng file Excel thường
cũng convert được.

**Bạn muốn làm gì?**

| Việc cần làm | Dùng |
|---|---|
| Đưa tài liệu Excel vào Git, wiki, hoặc cho AI đọc | [Excel → Markdown](#1-excel--markdown) |
| Sửa Markdown xong xuất lại Excel để gửi khách | [Markdown → Excel](#2-markdown--excel) |
| Đọc cả thư mục tài liệu `.md` như một trang web | [Đọc Markdown](#3-đọc-markdown) |
| Hỏi "màn hình nào dùng cột X?", tóm tắt, sinh test case | [Trợ lý AI](#4-trợ-lý-ai-trên-tài-liệu) |
| Cho Claude Code / Codex làm việc trên tài liệu, không cần API key | [MCP](#5-dùng-với-claude-code--codex--claude-desktop-mcp) |

Ba chế độ đầu đổi bằng công tắc ở thanh trên cùng; app nhớ chế độ dùng lần cuối.

---

## Cài đặt

- **Windows**: chạy file cài đặt `ExcelToMarkdown Setup x.y.z.exe` (lấy từ thư mục `release/` sau khi
  đóng gói, xem [Đóng gói](#đóng-gói-exe-trên-windows)). Lần đầu Windows có thể cảnh báo vì app
  chưa ký số: chọn **More info → Run anyway**.
- **Chạy từ mã nguồn** (Windows / macOS / Linux, cần Node 20+):

```bash
npm install
npm run dev
```

---

## 1. Excel → Markdown

1. Kéo thả file `.xlsx` / `.xlsm` / `.xls` vào cửa sổ (hoặc `Ctrl+O`). Chọn nhiều file cùng lúc được.
2. Tick các sheet cần convert. Sheet ẩn trong Excel có nhãn "ẩn" và mặc định không tick. App nhớ
   lựa chọn sheet của từng file.
3. Xem trước ở giữa: bản đã render, mã Markdown, hoặc cả hai song song.
4. Chọn thư mục xuất ở thanh dưới, bấm **Convert** (`Ctrl+Enter`). Có thanh tiến độ, nút Hủy, báo
   kết quả từng file, nút mở thư mục kết quả.

### Cấu hình nhanh (Preset)

Ba nút ở đầu cột Tùy chọn bên phải. Mỗi nút bật/tắt sẵn một nhóm tùy chọn, tùy **ai sẽ đọc** file `.md`:

| Preset | Khi nào dùng | Thay đổi |
|---|---|---|
| **Chuẩn tài liệu** | Người đọc tài liệu thiết kế (mặc định) | Giữ đúng cấu trúc 基本設計, không thêm gì |
| **Bảng dữ liệu** | Sheet chủ yếu là bảng số liệu | Ô gộp dọc để trống như Excel, căn thẳng cột trong mã nguồn, nhận diện bảng 2 cột |
| **AI / RAG** | File sẽ đưa cho AI: trợ lý trong app, NotebookLM, Claude Projects, ChatGPT, Dify, RAG nội bộ... | Lặp giá trị ô gộp xuống mọi dòng (mỗi dòng tự đủ nghĩa), thêm YAML front-matter (file nguồn, sheet, 画面ID...) để lọc và trích dẫn, tách bảng dài mỗi 50 dòng có lặp header (công cụ RAG cắt nhỏ vẫn giữ tên cột) |

### Các tùy chọn khác

| Nhóm | Tùy chọn |
|---|---|
| Chế độ xuất file | Mỗi sheet một file `TênFile__TênSheet.md`, hoặc gộp cả workbook thành `TênFile.md` |
| Bố cục Bảng & Sheet | Bỏ qua sheet `DEL_`, bỏ qua sheet rỗng, thêm tiêu đề tên sheet, nhận diện bảng 2 cột, căn thẳng cột, escape ký tự Markdown/HTML trong ô (mặc định bật: `<null>`, `*必須*` hiện nguyên văn) |
| Ô gộp dọc | Lặp giá trị / Để trống / Ký hiệu `↑` |
| Ô nhiều dòng | Xuống dòng bằng `<br>` hoặc gộp một dòng |
| Nâng cao | Hiện công thức (`` `=SUM(..)` `` cạnh giá trị), front-matter YAML, chỉ convert vùng ô (vd `A1:F40`), tách bảng mỗi N dòng |

Nút **Mặc định** ở đầu cột đưa mọi tùy chọn về ban đầu. Cột Tùy chọn thu gọn được (nút `›`).

### App hiểu file Excel thế nào

- **Banner 基本設計**: dòng `基本設計` + tên tài liệu thành quote; khối 版数 / 作成日 / 作成者 thành bảng nhỏ.
- **Meta** (`機能ID`, `画面ID`, `テーブルID`, `画面遷移`...): thành `- **label**: value`, dòng nối tiếp thành bullet con.
- **Section** `【...】`, `■処理順序1` thành heading `###`; ghi chú `※...` thành quote.
- **Bảng**: nhận diện dòng tiêu đề (`No`, `№`, `項番`...), header 2 tầng, bỏ cột trống toàn bảng.
- **Ô merge**: merge dọc xử lý theo tùy chọn "Ô gộp dọc"; merge ngang giữ ở ô gốc.
- **Công thức**: lấy giá trị Excel đã tính (kể cả tham chiếu liên sheet).
- **Lớp vẽ** (chỉ `.xlsx`): ảnh ghi ra thư mục `<tên>_images/` và chèn đúng chỗ; chữ trong shape / text
  box thành `- 〔図形 B10〕...`; mũi tên nối hai shape thành `- 〔矢印〕A → B`; comment ô thành
  `- 〔コメント B56〕...`; biểu đồ thành `**〔グラフ B3:H18〕縦棒グラフ「tiêu đề」**` + bảng số liệu
  (danh mục × series, lấy giá trị Excel đã lưu trong file). Chưa đọc SmartArt / biểu đồ kiểu mới (waterfall, treemap...).

File không phải 基本設計 vẫn convert bình thường: lớp chung (bảng, đoạn văn) luôn chạy, lớp riêng
(banner, meta tiếng Nhật) chỉ bật khi gặp đúng mẫu.

### Convert bằng dòng lệnh

Cùng engine với app, tiện cho script hoặc CI (cần `npm run build` trước):

```bash
node out/main/cli.js a.xlsx b.xlsx -o out --front-matter --chunk 50
```

Cờ: `--per-workbook`, `--range A1:F40`, `--formulas`, `--front-matter`, `--chunk N`, `--keep-del`,
`--keep-empty`, `--no-escape`, `--no-title`.

---

## 2. Markdown → Excel

Dùng khi muốn sửa Markdown (bằng tay hoặc nhờ AI, dễ diff bằng Git) rồi xuất lại Excel. App tạo
workbook **mới** theo bố cục chuẩn của app, không dựng lại bố cục Excel gốc.

1. Bật công tắc **Markdown → Excel**.
2. Kéo thả file `.md` (hoặc `Ctrl+O`). Dưới mỗi file là tên các sheet sẽ tạo. ↑ / ↓ đổi thứ tự
   (thứ tự danh sách = thứ tự sheet). Sửa file `.md` sau khi thêm thì bấm **Tải lại** (⟳) để xem nội dung mới.
3. Đặt tên file Excel ở cột phải (mặc định lấy phần tên chung trước `__` của các file).
4. Chọn thư mục xuất, bấm **Tạo file Excel** (`Ctrl+Enter`). **Mọi file trong danh sách gộp thành
   một file `.xlsx`.** File đích đã có thì app hỏi Ghi đè / Hủy; Hủy hoặc lỗi giữa chừng không để lại file dở.

**Quy tắc chuyển**

- **Tách sheet**: mỗi file và mỗi dòng `---` ở ngoài cùng bắt đầu một sheet mới. `##` đầu phần là
  tên sheet. Tên sheet tự làm sạch (bỏ ký tự cấm, tối đa 31 ký tự, không trùng).
- **Bố cục**: font 游ゴシック 10, ẩn gridline, in A4 ngang vừa chiều rộng; bảng có header nền xanh
  nhạt + viền mảnh; `- **label**: value` thành ô label + ô value; chiều cao dòng tự tính để chữ
  không bị che khi in.
- **Ô**: lấy chữ hiển thị (bỏ `\*`, `**`, `` ` ``; `<br>` thành xuống dòng). Ô chỉ chứa một link
  `http`/`https`/`mailto` thành hyperlink.
- **Số**: `10`, `1.0`, `1,234,567.89`, `12.50%` thành số đúng định dạng; `0001`, số quá 11 chữ số,
  ngày, `#N/A` giữ dạng text.

**Giới hạn**

- Chỉ ghi chữ thuần: không giữ đậm / nghiêng giữa câu, màu, 方眼紙, merge gốc.
- Round-trip `md → xlsx → md` chỉ ổn định với Markdown do app tạo.
- `---` dùng làm đường kẻ trang trí cũng bị tách sheet: xem tên sheet dưới từng file trước khi tạo.
- Ô dài quá 32 767 ký tự bị cắt. File `.md` phải là UTF-8 (Shift_JIS bị từ chối, có báo tên file).

Chi tiết: `docs/superpowers/specs/2026-10-19-md-to-excel-design.md`.

---

## 3. Đọc Markdown

Xem file `.md` như trang web (heading, bảng, code, ảnh, link, sơ đồ Mermaid), chỉ đọc, không sửa file.

- **Mở thư mục** (nút ở thanh trên / `Ctrl+O` / kéo thả thư mục): cột trái là cây mọi file
  `.md` trong thư mục và thư mục con (bỏ `node_modules`, thư mục ẩn; tối đa 5 000 file), có ô
  lọc, mục **Mới sửa**, sắp xếp theo Tên / Ngày sửa, ↑ / ↓ để chuyển file.
- **Mở file lẻ** hoặc **Dán Markdown** từ clipboard để xem nhanh.
- Mỗi lần chọn file đều đọc lại từ đĩa. File > 20 MB không mở.
- Ảnh đường dẫn tương đối hiện được; ảnh từ mạng không tải. Link tới `.md` khác mở ngay trong app,
  link web mở trình duyệt.
- **Xuất HTML** ra một trang đứng riêng (mục lục, tìm mục, lọc bảng, sáng/tối, in) để gửi người
  không cài app; **In / PDF** in phần nội dung.

---

## 4. Trợ lý AI trên tài liệu

Ở chế độ Đọc Markdown, cột phải là trợ lý hỏi đáp. App tìm đoạn tài liệu liên quan rồi gửi kèm câu
hỏi cho AI (cách làm này gọi là **RAG**), nên AI trả lời dựa trên tài liệu thật của bạn, bằng tiếng
Việt, kèm trích dẫn `file › mục` bấm được để mở đúng chỗ.

### Thiết lập lần đầu

1. Bấm nút **🔑** ở đầu cột trợ lý.
2. Chọn nhà cung cấp và dán API key:

| Nhà cung cấp | Lấy key ở | Dạng key | Model mặc định |
|---|---|---|---|
| Gemini | aistudio.google.com | `AIza...` | `gemini-2.5-flash` |
| Claude | console.anthropic.com | `sk-ant-...` | `claude-opus-5-5` |
| OpenAI / Codex | platform.openai.com | `sk-...` | `gpt-5` |

3. Bấm **Lưu**. Danh sách model mà key dùng được sẽ tự tải về (nút ↻ để tải lại).

Mỗi nhà cung cấp lưu một key riêng, đổi qua lại không mất key. Key được mã hóa bằng kho bảo mật của
hệ điều hành và chỉ gửi thẳng tới API của nhà cung cấp đó.

> **API key khác gói đăng ký.** Gói ChatGPT Plus/Pro hay Claude Pro/Max **không** đi kèm API key;
> API tính tiền riêng theo token. Muốn dùng gói đăng ký sẵn có, xem [MCP](#5-dùng-với-claude-code--codex--claude-desktop-mcp).

### Đặt câu hỏi

- **Phạm vi**: *Cả thư mục* (tìm trên mọi file đang mở) hoặc *Chỉ file đang xem* (gửi nguyên văn file đó).
- **Hỏi tiếng Việt vẫn tìm ra tài liệu tiếng Nhật**: app có từ điển Việt ↔ Nhật cho thuật ngữ
  nghiệp vụ (vd "khách hàng" ↔ 顧客, "bắt buộc" ↔ 必須, "kiểm tra" ↔ 入力チェック).
- **Nút tác vụ nhanh**: Tóm tắt nghiệp vụ, Dịch sang tiếng Việt, Kiểm tra thiếu sót, Sinh test
  case (file đang xem), Đối chiếu chéo tên bảng / cột / mã màn hình giữa các file (cả thư mục).
- Câu trả lời **hiện dần** trong lúc AI đang viết; bấm **Dừng** để huỷ.
- AI nhớ 6 lượt hỏi đáp gần nhất. **Xóa chat** để bắt đầu lại.

### Ngữ cảnh tối đa và chi phí

Ô **Ngữ cảnh** trong hộp 🔑 chọn lượng tài liệu tối đa gửi kèm mỗi câu hỏi:

| Mức | Ý nghĩa |
|---|---|
| 32k token (mặc định) | Tiết kiệm. Thư mục nhỏ gửi nguyên văn; lớn hơn thì chỉ gửi các file khớp nhất |
| 120k token | Cân bằng, ít bị sót hơn với thư mục vừa |
| 250k token | Đầy đủ nhất, tốn nhất (vẫn dưới giới hạn đầu vào của các model lớn) |

Hỏi tiếp trên cùng tài liệu thì nhà cung cấp đọc lại phần tài liệu từ **cache** với giá rẻ hơn
nhiều. Cuối mỗi câu trả lời có dòng `⚡ … tokens · cache …` để bạn theo dõi.

---

## 5. Dùng với Claude Code / Codex / Claude Desktop (MCP)

**MCP** là chuẩn để các trợ lý AI gọi công cụ bên ngoài. App có sẵn một MCP server, nên Claude
Code, Codex CLI, Claude Desktop hay Cursor dùng được converter và bộ tìm kiếm Việt ↔ Nhật của app,
chạy bằng **gói đăng ký của bạn, không cần API key**. Agent còn tự tìm, đọc và đối chiếu nhiều
file, nên làm được nhiều việc hơn khung chat trong app.

### Đăng ký (một lần)

Build trước để có file `out/main/mcp.js`:

```bash
npm install
npm run build
```

Claude Code:

```bash
claude mcp add excel-markdown -- node /đường/dẫn/excel-markdown/out/main/mcp.js
```

Codex CLI:

```bash
codex mcp add excel-markdown -- node /đường/dẫn/excel-markdown/out/main/mcp.js
```

Claude Desktop / Cursor: thêm vào file cấu hình MCP:

```json
{
  "mcpServers": {
    "excel-markdown": { "command": "node", "args": ["/đường/dẫn/excel-markdown/out/main/mcp.js"] }
  }
}
```

Máy chỉ cài bản `.exe` (không có Node): dùng chính app thay Node:

```json
{
  "mcpServers": {
    "excel-markdown": {
      "command": "C:\\...\\ExcelToMarkdown.exe",
      "args": ["C:\\...\\resources\\app.asar\\out\\main\\mcp.js"],
      "env": { "ELECTRON_RUN_AS_NODE": "1" }
    }
  }
}
```

### Công cụ agent dùng được

| Tool | Làm gì |
|---|---|
| `convert_excel` | Convert file Excel sang Markdown (tùy chọn front-matter, gộp workbook, tách bảng, vùng ô) |
| `list_docs` | Liệt kê file `.md` trong một thư mục |
| `search_docs` | Tìm các file / mục liên quan nhất tới câu hỏi, có tiêu đề để trích dẫn |
| `read_doc` | Đọc nguyên văn một file `.md` |

### Ví dụ câu hỏi

- "Convert các file Excel trong `~/specs` sang Markdown có front-matter, ghi vào `~/specs-md`"
- "Trong `~/specs-md`, màn hình nào dùng cột `CUSTOMER_CD`? Liệt kê kèm nguồn"
- "Đối chiếu độ dài cột giữa định nghĩa màn hình và định nghĩa bảng DB, báo chỗ lệch"

Lưu ý: MCP chạy bản build trong `out/`, sửa code xong phải `npm run build` lại. Đường dẫn truyền
cho tool phải là đường dẫn tuyệt đối (agent thường tự lo).

---

## Phím tắt

| Phím | Tác dụng |
|---|---|
| `Ctrl+O` | Thêm file Excel (Markdown → Excel: thêm file `.md`; Đọc Markdown: mở thư mục) |
| `Ctrl+Enter` | Convert (Markdown → Excel: tạo file Excel) |
| `Ctrl+=` / `Ctrl+-` / `Ctrl+0` | Phóng to / thu nhỏ / đặt lại cỡ chữ xem trước |
| `↑` / `↓` | Sheet trước / sau (Đọc Markdown: file trước / sau) |

---

## Câu hỏi thường gặp

**Sheet ẩn trong Excel có bị convert không?**
Mặc định không tick để tránh convert thừa; tick tay nếu cần.

**Sao file `.md` có dấu `\` trước `*`, `<`, `#`...?**
Đó là escape để Markdown hiển thị đúng nội dung ô (`<null>` không bị ẩn như thẻ HTML, `*必須*`
không thành chữ nghiêng). Nếu ô Excel cố ý chứa cú pháp Markdown, tắt "Escape ký tự Markdown/HTML
trong ô" ở nhóm Bố cục Bảng & Sheet.

**File có mật khẩu?**
App báo "File có mật khẩu..."; gỡ mật khẩu bằng Excel rồi thử lại. Macro trong `.xlsm` được bỏ
qua, chỉ lấy giá trị.

**Markdown → Excel ra nhiều sheet hơn mong đợi?**
Mỗi file và mỗi dòng `---` ở ngoài cùng bắt đầu một sheet mới. Bỏ `---` trang trí, hoặc xem tên
sheet dưới từng file trước khi tạo.

**Markdown → Excel có làm mất số 0 đầu hay đổi `1.0` thành `1` không?**
Không. `0001` giữ dạng text, `1.0` giữ định dạng `0.0`, `12.50%` giữ `0.00%`.

**Dữ liệu tài liệu có bị gửi đi đâu không?**
Convert và đọc Markdown chạy hoàn toàn trên máy. Chỉ khi bạn hỏi trợ lý AI, phần tài liệu liên quan
mới được gửi tới nhà cung cấp bạn đã chọn (OpenAI được yêu cầu không lưu hội thoại). Kiểm tra chính
sách của công ty trước khi gửi tài liệu mật cho AI.

**Nên chọn nhà cung cấp AI nào?**
Gemini Flash rẻ và nhanh cho hỏi đáp thường ngày. Claude và các model lớn của OpenAI cho kết quả
kỹ hơn với tài liệu dài hoặc việc phân tích (đối chiếu chéo, sinh test case), giá cao hơn.

---

## Xử lý sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| Windows cảnh báo khi chạy lần đầu | App chưa ký số: chọn **More info → Run anyway** |
| Lỗi khi convert | Xem `logs/error.log` trong thư mục dữ liệu của app (userData) |
| Bảng 2 cột không thành bảng | Bật "Nhận diện bảng 2 cột" ở nhóm Bố cục Bảng & Sheet |
| Tạo file Excel báo "Không ghi được file Excel" | File `.xlsx` cùng tên đang mở trong Excel: đóng rồi thử lại |
| AI báo key không hợp lệ (401 / 403) | Kiểm tra key đúng nhà cung cấp đang chọn, còn hạn, tài khoản API đã nạp tiền |
| AI báo vượt giới hạn (429) | Chờ ít giây rồi hỏi lại, hoặc kiểm tra hạn mức tài khoản API |
| AI báo model không tồn tại | Bấm ↻ trong hộp 🔑 để tải lại danh sách model rồi chọn lại |
| AI trả lời thiếu thông tin | Tăng mức **Ngữ cảnh**, hoặc chuyển sang *Chỉ file đang xem* |

---

## Dành cho lập trình viên

Xây dựng bằng **Electron + TypeScript + React 18**, build bằng electron-vite. Chi tiết kiến trúc:
[docs/architecture.md](docs/architecture.md). Lịch sử thay đổi: [CHANGELOG.md](CHANGELOG.md).

```bash
npm install
npm run dev          # chạy dev (lần đầu tự tải binary Electron qua script predev)
npm run typecheck    # kiểm tra TypeScript
npm run test         # vitest, gồm golden test với file mẫu
npm run test:update  # cập nhật golden khi đổi engine có chủ ý (nhớ review diff)
npm run e2e          # build + chạy app Electron thật, kiểm các luồng UI chính (cần màn hình)
npm run build        # build vào out/ (gồm cả cli.js và mcp.js)
npm run dist         # đóng gói Windows (chạy trên Windows)
```

### Cấu trúc

```
src/
  shared/                    # dùng chung main + renderer: types.ts, tên workbook, cây file, trang HTML xuất
  preload/index.ts           # bridge an toàn cho renderer (window.api)
  main/
    index.ts, window.ts      # vòng đời app, cửa sổ
    cli.ts, mcp.ts, worker.ts  # điểm vào: CLI, MCP server, utilityProcess đọc/ghi Excel
    domain/                  # logic thuần: excel/, md2xlsx/, rag/, guards.ts, errors.ts
    application/ports/       # giao thức main <-> worker
    adapters/
      inbound/ipc/           # IPC theo tính năng: system, convert, viewer, ai
      inbound/cli, mcp, worker
      outbound/              # store, llm/ (Gemini, Claude, OpenAI), worker client, đọc/ghi file
  renderer/src/
    App.tsx                  # layout + chuyển chế độ
    features/                # excel2md/, md2excel/, viewer/, ai/
    components/, hooks/, lib/
test/fixtures, test/golden   # file Excel mẫu (dữ liệu hư cấu) + output đã duyệt
test/golden-md2xlsx          # output Markdown -> Excel đã duyệt
scripts/                     # sinh file mẫu, e2e.mjs, xlsx-snapshot.ps1
docs/                        # architecture.md, specs/plans, history/
```

Chi tiết từng tầng và quy tắc phụ thuộc: [docs/architecture.md](docs/architecture.md).

Sinh lại file mẫu: `node scripts/make-fixtures.mjs`, rồi (cần Excel)
`powershell -ExecutionPolicy Bypass -File scripts/make-excel-fixture.ps1`.

### Đóng gói .exe trên Windows

Chạy trên máy Windows đã cài Node 20+:

```bash
npm install
npm run dist
```

File cài đặt nằm ở `release/`. Icon `resources/icon.ico` đã build sẵn nhiều cỡ (16-256 px).

### Kiểm file Excel bằng Excel thật

Unit test không phát hiện được việc Excel đòi "sửa file" hay chữ bị che. Sau khi đổi
`src/main/domain/md2xlsx/write.ts` hoặc `layout.ts`, tạo file Excel bằng app rồi chạy (cần Microsoft
Excel, Windows PowerShell 5.1):

```bash
powershell -ExecutionPolicy Bypass -File scripts/xlsx-snapshot.ps1 -In <đường dẫn tuyệt đối .xlsx> -OutDir <thư mục>
```

Script mở file chỉ đọc trong một tiến trình Excel riêng, in `OK <số sheet>` và ghi `sheet1.png`,
`sheet2.png`... vào `-OutDir`. Nếu Excel phải sửa file, script in `REPAIRED` (không mở được thì
`FAILED`) và thoát mã 1. Script dùng clipboard nên đừng copy/paste ở chương trình khác trong lúc
chạy. Lưu `xlsx-snapshot.ps1` dạng UTF-8 **có BOM** (PowerShell 5.1 đọc file không BOM theo ANSI
và làm hỏng chữ Nhật).
