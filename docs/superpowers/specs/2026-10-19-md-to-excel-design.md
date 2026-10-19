# Thiết kế: chiều Markdown → Excel (giai đoạn 4)

Ngày: 2026-10-19 · App: ExcelToMarkdown 2.1.0 (Electron 44, React 18, TypeScript)

## 1. Mục đích và lý do

Nhóm làm tài liệu 基本設計 dạng Excel. Quy trình mong muốn: convert Excel → Markdown bằng
app này, chỉnh nội dung trên Markdown (tay hoặc nhờ AI, dễ diff/quản lý bằng git), rồi
**convert Markdown → Excel để gửi khách hàng** — khách làm việc bằng Excel.

File Excel là sản phẩm giao khách nên phải trông chuyên nghiệp: không còn dấu vết cú pháp
Markdown, bảng không vỡ, số hiển thị đúng như trong Markdown.

Người dùng đã quyết định:

- **Tạo workbook mới** với bố cục chuẩn của app. **Không** cố tái tạo bố cục Excel gốc
  (方眼紙, merge ngang, màu, vị trí ô) — thông tin đó đã mất khi Excel → Markdown.
- **Người dùng tự chỉ định** các file `.md` gộp chung; **tất cả file trong danh sách gộp
  thành 1 file `.xlsx`** (không tự nhóm theo tên).
- Thư viện ghi Excel: **exceljs** (cần style: đậm, viền, nền, wrap text). Đọc Excel vẫn
  dùng SheetJS như hiện tại.
- Bố cục sheet: **như bản thử đã duyệt** (mục 5; ảnh/bản thử nằm ở `spike/`, không commit).

## 2. Mục tiêu

1. Chế độ mới **Markdown → Excel** trong cùng app.
2. Chọn file `.md` bằng kéo-thả hoặc hộp thoại; danh sách có nút ↑/↓ đổi thứ tự (thứ tự
   sheet trong file Excel = thứ tự danh sách) và nút xóa.
3. Toàn bộ file trong danh sách → **một** file `.xlsx` trong thư mục xuất.
4. Markdown do app xuất ra (cả hai chế độ "mỗi sheet 1 file" và "gộp cả workbook") được
   chuyển đúng cấu trúc: banner 基本設計, bảng 版数, meta, section, bảng, ghi chú, đoạn văn.
5. Nội dung ô hiển thị **đúng chữ** người đọc Markdown thấy khi render (xem mục 6).
6. Chạy trong worker (utilityProcess) như chiều Excel → Markdown; có nút Hủy; main không
   nạp exceljs.

## 3. Ngoài phạm vi (non-goals)

- Tái tạo bố cục / style của file Excel gốc; chế độ "template" lấy style từ file mẫu.
- Ghi `.xls` hay định dạng khác ngoài `.xlsx`.
- Giữ định dạng chữ trong ô (đậm/nghiêng giữa câu): bản này ghi **chữ thuần** (bỏ ký hiệu,
  giữ chữ). Rich text để sau.
- Sửa Markdown trong app.
- Hiển thị preview dạng lưới Excel trong app.

## 4. Điều tuyệt đối tránh (anti-goals)

Khách mở file và thấy bất kỳ điều sau thì coi như thất bại, dù code "chạy":

- Còn cú pháp Markdown: `\*`, `\<`, `<br>`, `**`, `|`, `[x](y)`, `&nbsp;` bị hiểu sai.
- Bảng lệch cột / mất dòng / mất ô.
- Số sai: `1.0` thành `1`, `0001` mất số 0, `12.50%` thành `0.125` hiển thị khác.
- Tam giác xanh "Number stored as text" khắp file.
- Lỗi font / chữ Nhật vỡ; tên sheet bị Excel báo lỗi khi mở ("We found a problem...").
- App treo khi Markdown lớn.

## 5. Bố cục sheet (đã duyệt qua bản thử)

Toàn sheet: font **游ゴシック 10**, ẩn gridline, căn trên (`vertical: top`), in **A4 ngang,
vừa 1 trang theo chiều rộng** (`fitToWidth: 1, fitToHeight: 0`).

Từ trên xuống, theo thứ tự block trong Markdown, mỗi block cách nhau 1 dòng trống:

| Block Markdown | Trong Excel |
|---|---|
| `> 基本設計：<tiêu đề>` | A: `基本設計` (đậm, 10pt, xám); B: tiêu đề (đậm, 16pt); dòng cao 24pt |
| Bảng (gồm bảng 版数 và bảng có header No/№/項番) | Header: đậm, nền `#DDE5F0`, viền mảnh `#808080`; ô: viền, `wrapText`; bắt đầu cột A |
| `- **label**: value` (meta) + sub-bullet `  - …` | A: label (đậm, nền `#F2F2F2`, viền); B…cột cuối: value **merge ngang** tới bề rộng bảng lớn nhất của sheet (tối thiểu 4 cột), viền, căn trái (cả khi value là số); sub-bullet thành dòng mới trong cùng ô value; chiều cao dòng = 16.5pt × số dòng (đo bằng Excel: 游ゴシック 10 tự giãn 16.5pt/dòng; Excel không tự giãn ô merge) |
| `### …` (section `【…】`, `■…`, tiêu đề bảng) | A: đậm 12pt, màu `#1F3864`, gạch dưới (viền dưới); **merge ngang** A…cột cuối (gạch dưới trải cả vùng merge), `wrapText`, chiều cao do app tính (19.5pt/dòng) — heading dài xuống dòng thay vì tràn ra ngoài vùng in |
| Code block | Mỗi dòng code một hàng (không gộp), font MS Gothic 10; **merge ngang** A…cột cuối, `wrapText`, chiều cao do app tính (12pt/dòng + 1.5, tối thiểu 15pt) |
| `> …` (ghi chú `※…`, dòng 1 ô) | Như đoạn văn, chữ màu `#595959` |
| Đoạn văn | **Merge ngang** từ A tới cột cuối (cùng bề rộng như ô meta), `wrapText`, không viền; giữ xuống dòng (`<br>`) và thụt lề toàn角; chiều cao dòng do app tính (mục dưới) |

Đoạn văn / ghi chú dài hoặc nhiều dòng (người dùng chọn sau bản thử): trải ngang + tự
xuống dòng để in A4 không bị cắt và không mất xuống dòng. Excel không tự giãn chiều cao ô
merge, nên app tính: số dòng hiển thị = Σ theo từng dòng thật số dòng khi **mô phỏng cách
Excel tự xuống dòng**, chiều cao = 16.5pt × số dòng (đo bằng Excel: 游ゴシック 10 tự giãn
16.5pt/dòng). Mô phỏng (đo bằng AutoFit của Excel 16 thật, sửa sau review cuối):

- Độ rộng chữ theo bề rộng glyph 游ゴシック 10 trong Excel, tính bằng đơn vị độ rộng cột:
  chữ toàn角 (CJK, kana, ký hiệu) = 2; chữ Latin theo bảng đo được (vd `0` ≈ 1.08, `A` ≈ 1.23,
  `W` ≈ 1.85, `i` ≈ 0.46); ký tự ngoài ASCII khác tính như toàn角, trừ emoji
  (`\p{Emoji_Presentation}`: ✅ ❌ ⭐ ⌛…, Excel hiển thị ~18–19px so với 13px của toàn角) và
  ký tự ngoài BMP tính 20px, ký tự BMP đo được rộng hơn 1em (⟶ ⸻ U+FDFD, chữ Ấn/Đông Nam Á…:
  quét toàn bộ U+00A0–U+FFFF bằng Excel thật) theo bảng đo (`glyphTable.ts`). Hệ số chọn hơi
  lớn hơn Excel (≈ 3.5%) để ước lượng nghiêng về dư.
- Heading (游ゴシック 12 đậm) và code (MS Gothic 10) có bảng bề rộng glyph đo riêng: heading
  rộng hơn cỡ 10 (vd `i` 5px, `W` 15px, toàn角 16px); MS Gothic đơn cách (mọi chữ ASCII 7px,
  toàn角 14px — bảng 游ゴシック tính `i`/`l` quá hẹp, sẽ thiếu dòng). Chiều cao: heading
  19.5pt/dòng; code 12pt/dòng + 1.5 (Excel AutoFit: 12n khi tự xuống dòng, 12n + 1.5 khi có
  xuống dòng thật), không thấp hơn 15pt (hàng mặc định).
- Excel chỉ xuống dòng sau khoảng trắng ASCII và sau dấu `-` (U+002D) (khoảng trắng cuối dòng
  được treo); một từ không vừa phần còn lại của dòng thì sang dòng mới, từ dài hơn một dòng thì
  cắt theo ký tự. Chữ Nhật không có khoảng trắng cũng là một từ. Dấu `-` (đo bằng Excel thật,
  sửa sau review): xuống dòng được ngay sau **mọi** dấu `-`, bất kể hai bên là chữ, chữ số
  (`2026-10-19`, UUID), chữ toàn角, dấu câu, khoảng trắng (` -x`), dấu `-` khác (`--`) hay đầu ô;
  không xuống dòng trước dấu `-`; một dấu `-` ngay sau phần đã vừa dòng được treo ở cuối dòng
  (chỉ một dấu; phần trước nó đã tràn thì không treo). Các ký tự khác — `/ ? , . ) ! % ; | _`,
  ngoặc, `‐ – — ‑` (U+2010–U+2014), NBSP, khoảng trắng toàn角, `、。・`, giữa hai chữ toàn角 —
  **không** là chỗ xuống dòng. Bỏ quy tắc này làm hàng thấp hơn AutoFit (vd dòng code
  `curl -X POST https://…/search-by-name-…` ở vùng 4 cột: app 97.5 vs Excel 108).
- Vùng rộng = tổng độ rộng các cột merge; cột giữ mặc định (không có dữ liệu, hoặc tính ra
  đúng 9 — exceljs coi 9 là mặc định và không ghi `<col>`) tính 8.43.
- Hàng meta mà value > 1 dòng: chiều cao lấy thêm max với số dòng của ô nhãn ở cột A (hàng
  đã có chiều cao cố định thì Excel không tự giãn cho ô nhãn nữa); nhãn in đậm nên dùng bảng
  bề rộng glyph đậm (đo cùng cách, rộng hơn tới 1px mỗi chữ).

Ước lượng được phép dư (thừa khoảng trắng chấp nhận được), **không được thiếu** (chữ bị che
là lỗi). Một hàng Excel cao tối đa 409.5pt (24 dòng), nên đoạn văn / ghi chú cao hơn thì được
tách thành các hàng merge liền nhau (không có hàng trống giữa các mảnh, mỗi hàng ≤ 409.5pt):
xếp nguyên từng dòng thật theo thứ tự, dòng thật tự nó vượt một hàng thì cắt tại chỗ xuống
dòng của mô phỏng (mỗi mảnh ≤ 24 dòng hiển thị; không cắt giữa cặp surrogate). Heading
(≤ 21 dòng mỗi hàng; chỉ hàng cuối có gạch dưới) và một dòng code (≤ 34 dòng mỗi hàng) quá cao
cũng tách như vậy.

Độ rộng cột: theo nội dung ô bảng (ký tự CJK tính 2), tối thiểu 6, tối đa 60, cộng 2.

## 6. Nội dung ô: quy tắc chuyển

Parse bằng `marked.lexer` (đã có trong dependency); lấy **chữ hiển thị** từ token inline:

- escape `\x` → `x` (gỡ mọi escape mà Excel → Markdown đã thêm); `<br>` → xuống dòng trong ô;
  `\|` → `|`; khoảng trắng toàn角 giữ nguyên.
- `**x**`, `*x*`, `~~x~~`, `` `x` `` → `x` (bỏ ký hiệu, giữ chữ).
- HTML khác (vd `<null>` khi Markdown viết tay không escape) → giữ nguyên chữ.
- Link: **cả ô là đúng một link** → ô hyperlink (chữ + URL, màu xanh gạch chân). Link nằm
  giữa câu, hoặc URL trần được GFM tự nhận → chỉ giữ chữ, không gắn hyperlink. Chỉ scheme
  `http`/`https`/`mailto` (và link nội bộ, xem dưới) được gắn hyperlink; scheme khác
  (`file:`, `javascript:`…) → chữ thuần (giống `guards.ts`).
- Link nội bộ sang sheet (`#'Sheet'!A1`): bản thử cho thấy exceljs ghi sai mã hóa → builder
  kiểm tra cách ghi đúng của exceljs; nếu không làm được sạch thì **ghi chữ thuần** (quyết
  định của tôi).

**Số** (quyết định của tôi, để không có tam giác xanh mà hiển thị y như Markdown):

| Chữ trong Markdown | Ghi vào Excel |
|---|---|
| `10`, `-3` (nguyên, không có số 0 đứng đầu, ≤ 11 chữ số — General hiện số dài hơn dạng `1.23E+11`) | số, format General |
| `1.0`, `1.10`, `0.5` | số, format `0.0` / `0.00`… (số chữ số thập phân giữ nguyên) |
| `1,234,567.89` | số, format `#,##0.00` (số thập phân theo chữ) |
| `12.50%`, `50%` | số /100, format `0.00%` / `0%` |
| `0001`, số nguyên > 11 chữ số, `03-xxxx`, ngày `2026/10/01`, `#N/A`, `TRUE`, mọi thứ khác | text, giữ nguyên |

Ô text trông như số (`0001`, mã 12 chữ số) vẫn bị Excel gắn tam giác xanh; exceljs không
hỗ trợ `ignoredErrors` nên sau khi ghi, chèn
`<ignoredErrors><ignoredError sqref="A1:XFD1048576" numberStoredAsText="1"/></ignoredErrors>`
vào XML từng sheet — quyết định của tôi.

## 7. Nhiều file → một workbook

- Ranh giới sheet (quyết định của tôi, áp dụng cho mọi Markdown):
  - Ranh giới file, và dòng `---` (thematic break) ở cấp ngoài cùng. **Chỉ hai thứ này**
    tách sheet; `##` thêm vào giữa (vd AI thêm `## 変更履歴`) **không** tạo sheet mới.
  - Trong mỗi phần: nếu block đầu tiên là `##` thì đó là **tên sheet** (không ghi thành
    dòng); mọi heading khác (kể cả `##` sau đó) là dòng section.
  - Phần không có `##` đầu: tên sheet lấy phần sau `__` trong tên file, không có `__` thì
    lấy tên file (thêm ` (2)`… nếu một file sinh nhiều sheet không tên).
  - `# tiêu đề` ở đầu file là tên workbook: chỉ dùng cho tên file mặc định, **không ghi**
    vào sheet (để banner 基本設計 luôn ở dòng 1).
  - Phần rỗng (vd `---` ở cuối file) bị bỏ qua.
  - Hệ quả chấp nhận: Markdown viết tay dùng `---` làm đường kẻ trang trí sẽ bị tách sheet;
    người dùng thấy trước danh sách sheet trong preview (mục 9).
- Ví dụ: `# kihon` / `## 画面A` / … / `---` / `## 画面B` / … → 2 sheet `画面A`, `画面B`.
  `# 画面設計` / `## 概要` / … / `## 項目` / … (không `---`) → 1 sheet tên `概要`, `項目` là
  dòng section.
- Tên sheet hợp lệ cho Excel: bỏ ký tự `[]:*?/\`, cắt 31 ký tự, không rỗng, không trùng
  (thêm ` (2)`), tránh tên `History` (Excel dành riêng).
- Thứ tự sheet = thứ tự file trong danh sách, trong file theo thứ tự xuất hiện.
- Tên file `.xlsx` mặc định (quyết định của tôi): phần tên chung trước `__` của các file;
  không có thì `# tiêu đề` của file đầu; không có thì tên file đầu. Người dùng sửa được
  trong ô "Tên file Excel" trước khi xuất.
- File đích đã tồn tại → hỏi xác nhận ghi đè (hộp thoại của main) — quyết định của tôi.
- Một file `.md` lỗi (không đọc được, hoặc không phải UTF-8 — giải mã ra U+FFFD, vd file
  Shift_JIS: báo `File không phải UTF-8: <tên file>. Hãy lưu lại file dạng UTF-8 rồi thử lại.`
  cả khi xem trước lẫn khi tạo file) → **không tạo** file Excel, báo rõ file nào lỗi (file
  Excel là một sản phẩm giao khách, thiếu sheet còn tệ hơn không có) — quyết định của tôi.
- Ghi ra file tạm rồi đổi tên: Hủy hoặc lỗi giữa chừng không để lại `.xlsx` dở — quyết
  định của tôi.

## 8. Markdown không do app tạo

Hỗ trợ ở mức "hợp lý" (quyết định của tôi): heading mọi cấp → dòng section (cấp 1–2 như
`###`); bảng GFM → bảng; list thường (không có `**label**:`) → mỗi item một dòng ở cột A:
list không đánh số → tiền tố `・`, list đánh số → số hiển thị `N. ` (theo số bắt đầu của
list, vd `3.` `4.`); item của list **không đánh số** dạng `**label**:` hoặc `**label**：`
(dấu `：` toàn角) → meta; list đánh số **không bao giờ** thành meta: mỗi item giữ `N. ` +
chữ (vd `1. **初期表示**: 画面を表示する` → `1. 初期表示: 画面を表示する`, ký hiệu `**` bỏ như
chữ inline khác); list con nằm trong value meta hoặc trong ghi chú `>`: list đánh số giữ
tiền tố `N. ` (`- **処理**:` + `1. 検索` / `2. 表示` → value `1. 検索⏎2. 表示`), bullet không
số chỉ giữ chữ (sửa sau review cuối, Ruling 18); trong khối HTML, `<br>` / `<br/>` /
`<br />` (mọi kiểu hoa/thường) → xuống dòng (`<br>⏎次の段落` → `次の段落`, bỏ dòng trống ở
đầu/cuối); khối không còn chữ (`<br>` đứng riêng một dòng, `<br>⏎<br>`, đoạn chỉ có `<br><br>`)
và comment HTML `<!-- … -->` → bỏ, HTML khác → chữ nguyên văn;
code block → từng dòng ở cột A, font monospace; ảnh → chữ alt; còn lại → chữ
thuần. Không được crash với bất kỳ Markdown nào.

## 9. Giao diện (quyết định của tôi)

- Header có công tắc chế độ: **Excel → Markdown | Markdown → Excel**. Nhớ chế độ cuối.
- Chế độ Markdown → Excel:
  - Cột trái: danh sách file `.md` (tên file, số sheet sẽ tạo; tên các sheet sẽ tạo liệt kê
    ngay dưới từng file — Ruling 3), ↑/↓, xóa; kéo-thả `.md`. Mỗi file có nút **Tải lại**
    (icon): preview và tên sheet được đọc lúc thêm file, người dùng sửa file `.md` thì bấm để
    đọc lại (đang đọc / lỗi hiện như khi thêm file, không đổi file đang chọn); không theo dõi
    file tự động. File Excel tạo ra luôn đọc nội dung mới nhất của file.
  - Giữa: preview Markdown đã render của file đang chọn (dùng lại PreviewPane).
  - Phải: ô "Tên file Excel" (mặc định theo mục 7).
  - Dưới: thư mục xuất (dùng chung), nút **Tạo file Excel** (Ctrl+Enter), Hủy khi đang chạy.
  - Ctrl+O mở hộp thoại chọn `.md`. Kéo-thả file Excel khi đang ở chế độ này → gợi ý chuyển
    chế độ (toast), không tự chuyển.
- Kết quả: toast + panel kết quả (đường dẫn file, số sheet), nút mở thư mục.

## 10. Ràng buộc

- exceljs 4.4.0 (MIT): bản ổn định cuối 10/2023, kéo theo 193 package, `npm audit` báo 2
  moderate (`uuid`). Chấp nhận vì **chỉ dùng để ghi** file do app tạo; **không bao giờ
  dùng exceljs để đọc file** từ bên ngoài.
- Chạy trong utilityProcess (worker convert hiện có hoặc worker riêng — builder chọn); main
  không nạp exceljs/marked-parse nặng. Renderer không đọc file system: đọc nội dung `.md` để
  preview phải qua IPC, và IPC chỉ đọc file đuôi `.md` (giữ nguyên tinh thần `guards.ts`).
- Giữ các bảo vệ hiện có: CSP, chặn điều hướng, `openPath` chỉ thư mục.
- Windows 10/11 x64; tên file/sheet tiếng Nhật.
- Version 2.2.0 (tính năng mới, không đổi output Excel → Markdown).

## 11. Kiểm chứng (bắt buộc)

- Unit test: parse Markdown → mô hình sheet/block; quy tắc ô (mục 6) gồm mọi case escape
  của `escape.test.ts` theo chiều ngược; quy tắc số; tên sheet.
- Golden: 3 file `test/golden/*.md` hiện có → `.xlsx` → đọc lại bằng SheetJS → so giá trị ô,
  merge, hyperlink, number format với golden mới (dạng JSON để diff được).
- **Round-trip** (quyết định của tôi về phạm vi): chỉ với Markdown **do app tạo** (3 golden
  hiện có + fixture mới cùng dạng): `md₁ → xlsx → md₂ (engine Excel → Markdown của app) →
  xlsx → md₃`, yêu cầu `md₂ === md₃` (ổn định sau một vòng) và mọi chữ trong ô của `md₁` có
  trong `md₂`. Markdown bất kỳ (fuzz + vài mẫu viết tay): chỉ yêu cầu không crash và mọi chữ
  được giữ. **Không** sửa engine Excel → Markdown để round-trip ổn định hơn (output chiều
  đó phải giữ nguyên); các trường hợp không ổn định đã biết (label meta ngoài `META_LABELS`
  như `**作成者**:`, bảng 2 cột) ghi vào tài liệu như giới hạn.
- Mở thật bằng Excel (COM) không báo lỗi sửa file; chụp ảnh sheet để review như bản thử.
- E2E (`npm run e2e`): chuyển chế độ, kéo-thả 2 file `.md`, đổi thứ tự, tạo file, kiểm
  số sheet + thứ tự + nội dung đọc lại.

## 12. Quyết định của Claude (người dùng chưa xác nhận từng mục)

Font 游ゴシック 10; quy tắc số (mục 6, gồm giới hạn 11 chữ số); `ignoredErrors`; link chỉ
http/https/mailto; link nội bộ lỗi thì ghi chữ thuần; quy tắc tách sheet (mục 7); `#` đầu
file không ghi vào sheet; tên file mặc định; hỏi trước khi ghi đè; một file lỗi thì không
tạo Excel; ghi file tạm rồi đổi tên; hỗ trợ Markdown viết tay (mục 8); giao diện (mục 9);
phạm vi round-trip (mục 11); version 2.2.0.

## 13. Để builder tự quyết

Cấu trúc module (vd `src/main/md2xlsx/`), tên IPC, mô hình dữ liệu trung gian, cách chia
component UI, cách đo độ rộng cột chi tiết, cách lấy ảnh kiểm tra.
