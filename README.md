# ExcelToMarkdown

Ứng dụng desktop chuyển tài liệu thiết kế Excel sang Markdown và ngược lại, đọc tài liệu Markdown
và hỏi đáp trên tài liệu bằng AI. App hiểu đúng bố cục tài liệu 基本設計 của Nhật (banner,
画面ID / 機能ID, bảng 項番, ô merge, ghi chú ※, ảnh và shape trong sheet), nhưng file Excel thường
cũng convert được.

> Hướng dẫn đầy đủ từng bước: [docs/USER_MANUAL.md](docs/USER_MANUAL.md).

**Bạn muốn làm gì?**

| Việc cần làm | Dùng |
|---|---|
| Đưa tài liệu Excel vào Git, wiki, hoặc cho AI đọc | [Excel → Markdown](#1-excel--markdown) |
| Đọc cả thư mục tài liệu `.md` như một trang web | [Đọc Markdown](#2-đọc-markdown) |
| Hỏi "màn hình nào dùng cột X?", tóm tắt, sinh test case | [Trợ lý AI](#3-trợ-lý-ai-trên-tài-liệu) |
| Xem bản thiết kế mới đổi gì so với bản cũ (新旧比較), xuất báo cáo thay đổi | [So sánh](#4-so-sánh-bản-cũ--bản-mới-新旧比較) |
| Sửa bảng / cột / màn hình thì ảnh hưởng tới đâu? Sơ đồ 画面遷移, ER cả thư mục | [Bản đồ thiết kế](#2-đọc-markdown) |

Ba chế độ (Excel → Markdown, Đọc Markdown, So sánh) đổi ở thanh dọc bên trái (nút sáng / tối
ở đáy thanh); app nhớ chế độ dùng lần cuối. Giao diện có **tiếng Việt / English / 日本語** (nút VI · EN · 日本語 ở
thanh trên; lần đầu theo ngôn ngữ hệ điều hành).

**Dịch** (dùng nhà cung cấp AI đã cấu hình ở mục [Trợ lý AI](#3-trợ-lý-ai-trên-tài-liệu); chỉ gửi khi bạn bấm; giữ
nguyên mã, ID, tên bảng / cột; theo đúng thuật ngữ trong `用語集.md` nếu có):

- **Đoạn bôi đen**: bôi đen chữ trong khung xem (mọi chế độ) → nút **訳 Dịch** cạnh vùng chọn (hoặc `Ctrl+Shift+T`)
  → popup ghi rõ chiều dịch (vd Tiếng Nhật → Tiếng Việt), đổi đích Việt / Anh / Nhật, và các thuật ngữ 用語集 đã áp dụng.
- **Cả một mục hoặc một bảng**: nút **訳** trên chip của mục / bảng ở thanh mục lục → hộp hai cột Bản gốc | Bản dịch,
  bảng giữ nguyên cấu trúc Markdown; **Copy Markdown** hoặc **Lưu .md**. Tối đa 12 000 ký tự mỗi lần.
- **Lịch sử**: tab **Dịch** ở cột phải của chế độ Đọc Markdown liệt kê các bản dịch trong phiên (mở lại bản dịch mục
  không tốn token). Chỉ giữ trong bộ nhớ, đóng app là mất.

---

## Cài đặt

- **Windows**: tải `ExcelToMarkdown-Setup-x.y.z.exe` ở trang
  [Releases](https://github.com/ngnhatIT/excel-markdown/releases) (kèm `SHA256SUMS.txt` để đối chiếu:
  `certutil -hashfile ExcelToMarkdown-Setup-x.y.z.exe SHA256`) rồi chạy. Trình cài đặt hiện tiếng Việt /
  English / 日本語 theo ngôn ngữ Windows, mặc định cài cho riêng tài khoản vào
  `%LOCALAPPDATA%\Programs\ExcelToMarkdown` (không cần quyền admin, đổi được thư mục). Lần đầu Windows có
  thể cảnh báo vì app chưa ký số: chọn **More info → Run anyway**.
  - Cài xong, chuột phải file `.xlsx` / `.xlsm` / `.xls` / `.md` → **Open with → ExcelToMarkdown**. App
    **không** giành quyền mở mặc định: nhấp đúp file Excel vẫn mở Excel như cũ.
  - App không tự kiểm tra hay tải bản mới (không gọi mạng ngầm): xem bản mới ở trang Releases.
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

Hai nút ở đầu cột Tùy chọn bên phải, chọn theo **ai sẽ đọc** file `.md`; dòng mô tả ngay dưới nút cho biết preset đang
chọn làm gì:

| Preset | Khi nào dùng | Thay đổi |
|---|---|---|
| **Cho người đọc** | Đọc, review, Git, wiki (mặc định) | Giữ đúng cấu trúc 基本設計, không thêm gì |
| **Cho AI / RAG** | File sẽ đưa cho AI: trợ lý trong app, NotebookLM, Claude Projects, ChatGPT, Dify, RAG nội bộ... | Lặp giá trị ô gộp xuống mọi dòng (mỗi dòng tự đủ nghĩa), thêm YAML front-matter (file nguồn, sheet, 画面ID...) để lọc và trích dẫn, tách bảng dài mỗi 50 dòng có lặp header (công cụ RAG cắt nhỏ vẫn giữ tên cột), dựng khối 2 cột thành bảng |

Cần ô gộp dọc để trống hay căn thẳng cột trong mã nguồn (cho sheet thuần bảng số liệu) thì chỉnh riêng ở các tùy chọn bên
dưới.

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
  `- 〔コメント B56〕...`; danh sách thả xuống (入力規則) thành `- 〔入力規則 C2:C50〕入力 / 選択`; chữ gạch
  ngang (見え消し) thành `~~…~~`; link sang sheet khác thành link tới mục / file `.md` của sheet đó; biểu đồ thành `**〔グラフ B3:H18〕縦棒グラフ「tiêu đề」**` + bảng số liệu
  (danh mục × series, lấy giá trị Excel đã lưu trong file). Chưa đọc SmartArt / biểu đồ kiểu mới (waterfall, treemap...).

File không phải 基本設計 vẫn convert bình thường: lớp chung (bảng, đoạn văn) luôn chạy, lớp riêng
(banner, meta tiếng Nhật) chỉ bật khi gặp đúng mẫu.


---

## 2. Đọc Markdown

Xem file `.md` như trang web (heading, bảng, code, ảnh, link, sơ đồ Mermaid), chỉ đọc, không sửa file.

- **Mở thư mục** (nút ở thanh trên / `Ctrl+O` / kéo thả thư mục): cột trái là cây mọi file
  `.md` trong thư mục và thư mục con (kể cả thư mục bắt đầu bằng dấu chấm như `.review`; bỏ `node_modules`, `.git`, `.vscode`…; tối đa 5 000 file), có ô
  lọc, mục **Mới sửa**, sắp xếp theo Tên / Ngày sửa, ↑ / ↓ để chuyển file.
- **Tìm trong nội dung**: bấm nút **Nội dung** cạnh ô lọc rồi gõ từ khóa (nhiều từ cách nhau bằng
  khoảng trắng = dòng phải chứa đủ các từ, không phân biệt hoa thường). Kết quả theo file và dòng;
  bấm một dòng để mở file, cuộn tới chỗ khớp và tô sáng từ khóa.
  Không phân biệt hiragana / katakana (`てーぶる` tìm ra `テーブル`).
- **`Ctrl+K`**: nhảy nhanh tới file hoặc heading (gõ vài chữ, khớp cả chữ toàn角).
- **Lùi / Tiến** (nút ← → trên thanh xem, `Alt+←` / `Alt+→`, nút chuột lùi/tiến); link `#mục` và
  `file.md#mục` cuộn đúng tới mục.
- File đang xem bị sửa bên ngoài (convert lại, sửa bằng editor) thì quay lại cửa sổ app là tự tải lại,
  giữ vị trí cuộn.
- **Bản đồ thiết kế + 影響調査** (nút bản đồ ở đầu cây file): toàn thư mục, chạy cục bộ, không AI. Tab **Hướng dẫn**
  cho biết thư mục đã có / còn thiếu gì (画面ID, 画面遷移, テーブル定義 có 物理名 + 型, tham chiếu bảng / cột,
  用語集), file nào không nhận ra gì, kèm tài liệu mẫu để copy / lưu.
  - **画面遷移図**: sơ đồ chuyển màn hình tự dựng từ meta `画面ID` / `画面遷移` và mũi tên `〔矢印〕`; bấm một màn
    hình để mở đúng chỗ định nghĩa. Ô rẽ nhánh (`権限あり？`) vẽ hình thoi; màn hình chưa định nghĩa viền đứt.
  - **ER**: sơ đồ quan hệ của mọi テーブル定義 trong thư mục.
  - **影響調査**: gõ bảng, `TBL.COL` hoặc 画面ID → các tài liệu / màn hình tham chiếu tới nó (và màn hình liên quan qua
    遷移), bấm để mở và tô sáng. **Copy Markdown / Copy TSV / Lưu .md** để làm 影響調査書.
  - **整合性チェック**: 画面ID / bảng trùng, 遷移 tới màn hình chưa định nghĩa, `TBL.COL` không có cột; cảnh báo cách
    viết mơ hồ (など / 適宜 / 原則 / TBD / 要確認 / 未定…), cột cùng tên nhưng khác kiểu / độ dài giữa các bảng, và hạng
    mục nhập trong 【項目定義】 có 桁数 lớn hơn cột chữ cùng 論理名 trong テーブル定義. Copy / lưu danh sách như 影響調査.
  - **CRUD図**: ma trận 画面 × テーブル, C / R / U / D suy từ động từ (登録 / 表示 / 更新 / 削除…, cả tiếng Việt / Anh).
    Dòng không nói thao tác (ô 項目定義 `入力`…) thì suy từ tên màn hình, ghi **chữ thường** (`顧客検索画面` → `r`,
    `顧客登録画面` → `c`); `?` = không xác định được (không đoán bừa). Bấm ô để xem bằng chứng file:dòng; copy TSV / Markdown.
  - **質問票**: mọi chỗ chưa rõ (遷移 treo, chữ mơ hồ, 桁数 màn hình > DB, ô CRUD `?`, màn hình không có 項目定義…) thành câu
    hỏi gửi khách theo văn phong 質問票, kèm màn hình và `file:dòng`; tiếng Nhật / Việt / Anh; Copy TSV dán vào mẫu của dự án.
  - **Hoàn thiện (完成度)**: % hoàn thiện cả thư mục và từng màn hình / bảng (có 項目定義, 遷移, CRUD rõ, không còn chữ mơ hồ /
    vấn đề 整合性; bảng có PK, đủ 型, có màn hình dùng), yếu nhất trước; copy TSV / Markdown để báo cáo tiến độ.
  - **用語集**: đặt `用語集.md` (bảng `| 日本語 | Tiếng Việt | English | 備考 |`) ở gốc thư mục — Dịch nhanh và Trợ lý AI
    dùng đúng thuật ngữ dự án; nút **Copy gợi ý 用語集** tạo sẵn bảng từ tên bảng / cột / màn hình để bạn chỉnh.
- **テスト観点表** (nút **観点表** khi tài liệu có bảng 【項目定義】 trong mục có 画面ID): sinh khung テスト仕様書 tại chỗ,
  không AI: 必須, biên 桁数 (n / n+1 ký tự), 形式 (数値 / 日付 / 半角英数), 初期値, lựa chọn, nút và 画面遷移, kèm
  参照元 file:dòng. Copy TSV dán Excel, hoặc Lưu `.md`. Nội dung
  tiếng Nhật / Việt / Anh.
- **Định nghĩa bảng → DDL / ER / JSON**: bảng có cột `物理名` + `型` (テーブル定義書) có thêm nút **DDL** trên thanh
  mục lục: chọn Generic / PostgreSQL / MySQL / Oracle / SQL Server, copy `CREATE TABLE` (kèm PK, NOT NULL, DEFAULT,
  comment theo tên logic), JSON hoặc sơ đồ ER Mermaid. Nút **ER** trên thanh xem vẽ sơ đồ quan hệ của cả file
  (khóa ngoại suy ra từ tên cột).
- **Mock màn hình** (nút **Mock** trên thanh xem khi tài liệu có 【項目定義】; nút **Mock** ở Bản đồ thiết kế cho cả thư mục): mỗi
  画面ID thành một form bấm được: ô nhập theo 型 / 桁数 / 必須 / 初期値, danh sách thả xuống từ 〔入力規則〕, nút và link
  画面遷移 sang màn hình khác. **Lưu HTML** ra một file đứng riêng (không JavaScript, mở bằng trình duyệt) để demo với khách.
  Tài liệu tiếng Việt dùng nhãn `Mã màn hình` / `Tên màn hình` / `Chuyển màn hình` và bảng `Hạng mục | Loại | Kiểu | Độ dài |
  Bắt buộc | Ghi chú` (lựa chọn ghi ở Ghi chú: `A / B / C`); chữ trên mock theo ngôn ngữ tài liệu.
- **Mở file lẻ** hoặc **Dán Markdown** từ clipboard để xem nhanh.
- Mỗi lần chọn file đều đọc lại từ đĩa. File > 20 MB không mở.
- Ảnh đường dẫn tương đối hiện được; ảnh từ mạng không tải. Link tới `.md` khác mở ngay trong app,
  link web mở trình duyệt.
- **Xuất HTML** ra một trang đứng riêng (mục lục, tìm mục, lọc bảng, sáng/tối, in) để gửi người
  không cài app; **In / PDF** in phần nội dung.

---

## 3. Trợ lý AI trên tài liệu

Ở chế độ Đọc Markdown, cột phải là trợ lý hỏi đáp. App tìm đoạn tài liệu liên quan rồi gửi kèm câu
hỏi cho AI (cách làm này gọi là **RAG**), nên AI trả lời dựa trên tài liệu thật của bạn, bằng tiếng
Việt, kèm trích dẫn `file › mục` bấm được để mở đúng chỗ.

### Thiết lập lần đầu

1. Bấm nút **🔑** ở đầu cột trợ lý.
2. Chọn nhà cung cấp và dán API key:

| Nhà cung cấp | Lấy key ở | Dạng key | Model mặc định |
|---|---|---|---|
| Gemini | aistudio.google.com | `AIza...` / `AQ....` | `gemini-flash-latest` (luôn trỏ tới bản flash mới nhất) |
| Claude | console.anthropic.com | `sk-ant-...` | `claude-opus-5-5` |
| OpenAI / Codex | platform.openai.com | `sk-...` | `gpt-5` |

3. Bấm **Lưu**. Danh sách model mà key dùng được sẽ tự tải về (nút ↻ để tải lại).

Mỗi nhà cung cấp lưu một key riêng, đổi qua lại không mất key. Key được mã hóa bằng kho bảo mật của
hệ điều hành và chỉ gửi thẳng tới API của nhà cung cấp đó.

> **API key khác gói đăng ký.** Gói ChatGPT Plus/Pro hay Claude Pro/Max **không** đi kèm API key;
> API tính tiền riêng theo token.

### Đặt câu hỏi

- **Phạm vi**: *Cả thư mục* (tìm trên mọi file đang mở) hoặc *Chỉ file đang xem* (gửi nguyên văn file đó).
- **Hỏi tiếng Việt vẫn tìm ra tài liệu tiếng Nhật**: app có từ điển Việt ↔ Nhật cho thuật ngữ
  nghiệp vụ (vd "khách hàng" ↔ 顧客, "bắt buộc" ↔ 必須, "kiểm tra" ↔ 入力チェック).
- **Nút tác vụ nhanh**: Tóm tắt nghiệp vụ, Kiểm tra thiếu sót, Sinh test
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

## 4. So sánh bản cũ / bản mới (新旧比較)

Dùng khi bổ sung / sửa thiết kế và muốn biết chính xác đã đổi gì.

1. Bật chế độ **So sánh**.
2. Chọn **bản cũ (旧)** và **bản mới (新)**: kéo thả 2 file (file đầu là bản cũ), hoặc nút **Chọn file…**
   ở từng ô. File Excel (`.xlsx` / `.xlsm` / `.xls`) hoặc Markdown; có thể so Excel với Markdown.
3. Bảng hai cột hiện từng thay đổi: dòng thêm (xanh), xóa (đỏ), sửa (tô đúng chữ đã đổi; chữ Nhật so
   theo từng ký tự). **Chỉ thay đổi** ẩn phần giống nhau (bấm dòng `⋯` để hiện). `F7` / `Shift+F7` hoặc
   ↑ ↓ nhảy giữa các thay đổi; cột trái liệt kê các mục 【…】 / sheet có thay đổi.
4. **Xuất báo cáo** (`.md`) hoặc **Copy báo cáo**: bảng `場所 | 項目 | 旧 | 新` để dán vào review / 改訂履歴.
5. **改訂履歴**: tự sinh mỗi mục thay đổi một dòng (vd 「行追加 1件（C09）、行変更 1件（C02: 項目名）」); điền 版数 /
   改訂者, chọn ngôn ngữ, **Copy cho Excel (TSV)** rồi dán vào ô 版数 đầu tiên của bảng 改訂履歴.

**ALTER TABLE**: khi hai bản có テーブル定義 (bảng có cột 物理名 + 型), nút **ALTER TABLE** ở thanh so sánh sinh câu lệnh đưa
CSDL từ bản cũ sang bản mới (Generic / PostgreSQL / MySQL / Oracle / SQL Server): bảng mới → `CREATE TABLE`, thêm / bỏ cột,
đổi kiểu / 桁数, NULL ↔ NOT NULL, 既定値. Khớp theo 物理名; chỗ cần người quyết (xóa dữ liệu, có thể là đổi tên cột, đổi khóa
chính) ghi `-- 要確認` thay vì đoán.

So theo cấu trúc: sheet → mục → dòng bảng khớp theo cột khóa (`ID`, `項目ID`, `物理名`, `項目名`…), nên
chèn một dòng giữa bảng (kể cả khi cột No đánh số lại) chỉ báo đúng một dòng thêm. Mọi thứ chạy trên máy,
không gửi file đi đâu. Nút ⇄ đổi chỗ cũ / mới, ⟳ đọc lại hai file sau khi sửa.

---

## Cấu hình dự án (x2m.json)

Đặt file `x2m.json` trong thư mục tài liệu (thường ở gốc repo, đưa vào Git cùng tài liệu) để cả đội convert ra cùng
kết quả và dùng chung luật nhận diện của dự án. Không có file thì app chạy như cũ.

```json
{
  "convert": { "frontMatter": true, "chunkRows": 50, "verticalMerge": "repeat" },
  "rules": {
    "ambiguousWords": ["要調整", "別途"],
    "screenIdLabels": ["画面コード"],
    "transitionLabels": ["遷移先"],
    "crudVerbs": { "C": ["起票"], "U": ["差戻し"], "D": ["破棄"] },
    "diffKeyColumns": ["項目コード"],
    "itemColumns": { "item": ["部品名称"], "length": ["入力桁"] }
  }
}
```

- **`convert`**: tùy chọn Excel → Markdown, đúng tên như trong app (`includeSheetTitle`, `skipDelSheets`,
  `skipEmptySheets`, `multiline`, `detectTwoColTables`, `escapeMarkdown`, `showFormulas`, `frontMatter`, `chunkRows`,
  `verticalMerge`, `alignTables`). Không có `range` (vùng ô là theo từng file). Trong app, tùy chọn có trong file bị
  khóa ở cột phải.
- **`rules`**: **cộng thêm** vào luật có sẵn, không thay thế. Mỗi mục là chuỗi thường (không phải regex), tối đa 40 ký
  tự, 200 mục mỗi danh sách; không phân biệt hoa thường / toàn角. Nhãn và cột khóa khớp nguyên văn; chữ mơ hồ và động
  từ CRUD khớp một phần dòng.
- File sai (JSON hỏng, khóa gõ sai, giá trị sai kiểu) không làm app lỗi: phần sai bị bỏ, kèm cảnh báo.

**App tìm file ở đâu**: đi từ thư mục dưới đây lên các thư mục cha, dừng ở thư mục đầu tiên có `x2m.json`, hoặc ở gốc repo
(thư mục có `.git`).

| Chức năng | Bắt đầu tìm từ |
|---|---|
| Excel → Markdown (app) | thư mục xuất |
| Đọc Markdown: Bản đồ thiết kế, 影響調査, CRUD図, 整合性チェック, Mock, テスト観点表 | thư mục đang mở |
| So sánh 新旧 | thư mục chứa file **mới** (chỉ dùng `diffKeyColumns`) |

So sánh file Excel không dùng `convert`: chỗ này luôn convert cố định để diff
không phụ thuộc máy hay cấu hình.

---

## Phím tắt

| Phím | Tác dụng |
|---|---|
| `Ctrl+O` | Thêm file Excel (Đọc Markdown: mở thư mục) |
| `Ctrl+Enter` | Convert |
| `Ctrl+=` / `Ctrl+-` / `Ctrl+0` | Phóng to / thu nhỏ / đặt lại cỡ chữ xem trước |
| `↑` / `↓` | Sheet trước / sau (Đọc Markdown: file trước / sau) |
| `Ctrl+K` | Đọc Markdown: nhảy nhanh tới file / heading |
| `Alt+←` / `Alt+→` | Đọc Markdown: lùi / tiến |
| `F7` / `Shift+F7` | So sánh: thay đổi sau / trước |
| `Ctrl+Shift+T` | Dịch đoạn đang bôi đen |
| `Esc` | Đóng popup / bảng lệnh, xóa ô lọc |

---

## Menu Trợ giúp

- **Giới thiệu**: phiên bản app, Electron, Chrome, Node.
- **Kiểm tra cập nhật…**: hỏi trang GitHub Releases của dự án **chỉ khi bạn bấm** (app không tự gọi mạng); có bản
  mới thì mở trang tải về.
- **Mở thư mục log** / **Copy thông tin chẩn đoán** (phiên bản, hệ điều hành, 50 dòng log cuối, API Key đã được che)
  để gửi kèm khi báo lỗi.
- **Đặt lại cài đặt…**: xóa mọi cài đặt (thư mục, tùy chọn, ngôn ngữ, theme…) nhưng giữ API Key.

Lỗi giao diện bất ngờ không còn làm cửa sổ trắng trơn: app hiện thông báo và nút **Tải lại**, lỗi được ghi vào log.

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
npm run build        # build vào out/
npm run dist         # build + đóng gói installer Windows vào release/
```

### Cấu trúc

```
src/
  shared/                    # dùng chung main + renderer: types.ts, tên workbook, cây file, trang HTML xuất
  preload/index.ts           # bridge an toàn cho renderer (window.api)
  main/
    index.ts, window.ts      # vòng đời app, cửa sổ
    worker.ts                # utilityProcess đọc/ghi Excel
    domain/                  # logic thuần: excel/, md2xlsx/, rag/, guards.ts, errors.ts
    application/ports/       # giao thức main <-> worker
    adapters/
      inbound/ipc/           # IPC theo tính năng: system, convert, viewer, ai
      inbound/worker
      outbound/              # store, llm/ (Gemini, Claude, OpenAI), worker client, đọc/ghi file
  renderer/src/
    App.tsx                  # layout + chuyển chế độ
    features/                # excel2md/, viewer/, compare/, ai/
    components/, hooks/, lib/
test/fixtures, test/golden   # file Excel mẫu (dữ liệu hư cấu) + output đã duyệt
scripts/                     # sinh file mẫu, e2e.mjs
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

`npm run dist` build rồi đóng gói; file cài đặt là `release/ExcelToMarkdown-Setup-x.y.z.exe`. Cấu hình ở
`package.json > build`; các file đi kèm nằm trong `resources/`:

- `icon.ico`: icon nhiều cỡ (16-256 px).
- `installer.nsh`: thêm app vào **Open with** cho `.xlsx/.xlsm/.xls/.md/.markdown` (chỉ `OpenWithProgids`,
  không đổi app mặc định; gỡ app thì xóa sạch). Cố ý không dùng `build.fileAssociations`: electron-builder
  ghi ProgID của app làm mặc định cho đuôi file, tức giành quyền mở của Excel.

Kiểm nhanh bản đóng gói không cần installer: `npx electron-builder --dir --win --x64` rồi
`npx asar list release/win-unpacked/resources/app.asar` (phải có `out/main/index.js`, `worker.js`).

**Phát hành**: tăng `version` trong `package.json`, đổi tiêu đề mục "Chưa phát hành" của `CHANGELOG.md` thành
`## x.y.z — YYYY-MM-DD`, commit, rồi `git tag vx.y.z && git push origin vx.y.z`. Workflow
`.github/workflows/release.yml` chạy typecheck / test / build trên Windows, dựng installer, tạo GitHub Release
kèm `SHA256SUMS.txt` và lấy ghi chú từ mục tương ứng trong CHANGELOG. Tag phải khớp `version`, nếu không
workflow dừng. Ký số (Azure Trusted Signing) đã có chỗ để sẵn (comment) trong workflow.

