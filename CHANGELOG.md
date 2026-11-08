# Changelog

> Quy tắc bump version (semver): `patch` (1.2.x) cho fix bug không đổi hành vi;
> `minor` (1.x.0) cho tính năng mới/tùy chọn mới; `major` (x.0.0) khi đổi format
> output mặc định hoặc breaking change IPC. Mỗi release cập nhật file này.

## Chưa phát hành
Minor: tính năng mới. Output Excel → Markdown chỉ đổi ở sheet có ảnh / shape / biểu đồ / comment / 入力規則 /
chữ gạch ngang, và link sang sheet khác (trước là link chết `#'Sheet'!A1`, nay trỏ đúng mục / file).
- Tính năng: chế độ **So sánh 新旧** hai bản thiết kế (Excel hoặc Markdown): so theo sheet → mục → dòng bảng
  khớp theo cột khóa, tô chữ đổi trong ô, chỉ hiện thay đổi, F7 / Shift+F7, xuất / copy báo cáo
  `場所 | 項目 | 旧 | 新`. Lõi `src/shared/specDiff.ts`, IPC `compare:read` (worker riêng, giới hạn 120 giây).
- Tính năng: **giao diện tiếng Việt / English / 日本語** (VI · EN · 日本語 ở thanh trên, lần đầu theo hệ điều hành).
- Tính năng: **Dịch nhanh đoạn bôi đen** (popup, Ctrl+Shift+T) qua nhà cung cấp AI đã cấu hình; IPC `ai:translate`.
- Tính năng: Đọc Markdown có **Ctrl+K** (nhảy tới file / heading), **Lùi / Tiến** (Alt+← / →), link `#mục` /
  `file.md#mục` cuộn đúng mục, tự tải lại file vừa bị sửa khi quay lại cửa sổ, tìm không phân biệt
  hiragana / katakana; khung AI có **Xuất .md** cuộc trò chuyện (IPC `export:md`).
- Tính năng: Excel → Markdown đọc **入力規則** (danh sách thả xuống), chữ **gạch ngang** (見え消し → `~~…~~`),
  **link sang sheet khác**.
- Tính năng: CLI `textconv` (git diff file Excel dạng Markdown), `md2xlsx`, đầu vào là thư mục, `--no-clobber`,
  `--help`, `--version`. MCP thêm `build_excel`, `list_sheets`, `preview_sheet`, `outline`, `read_doc` chia trang,
  `convert_excel` nhận `dir` và cần `overwrite: true` để ghi đè.
- Tính năng: Markdown → Excel giữ đậm / nghiêng / gạch / code trong ô bảng (rich text), căn lề cột, link trong đoạn,
  link sang sheet khác, 入力規則 thành danh sách thả xuống, コメント thành note của ô, nhúng ảnh PNG/JPEG cạnh file .md.
  Sửa: trích dẫn / list lồng rất sâu làm tràn stack, đoạn văn rất dài chạy chậm theo hàm bậc hai, khối code 100 000 dòng
  bị treo, bảng > 16 384 cột, số > 15 chữ số sai chữ số; file chỉ có heading không còn bị bỏ, file rỗng báo lỗi rõ.
- Tính năng: So sánh tự tạo dòng **改訂履歴** (版数 / 改訂日 / 改訂者 / 改訂箇所 / 改訂内容) từ các thay đổi, copy
  Markdown hoặc TSV dán Excel.
- Giao diện: font Be Vietnam Pro đóng gói (offline), font Nhật cho giao diện 日本語, màu nhấn dịu hơn, tiêu đề khung
  không viết hoa, popup / toast / bảng lệnh gần đặc dễ đọc, front-matter YAML hiện thành khối code.
- Sửa: file text đổi đuôi `.xlsx` không còn được nhận như Excel; lỗi thư viện (zip/CFB) thành thông báo tiếng Việt
  ở app, CLI và MCP; copy TSV bảng dài đủ dòng; nút Lùi / Tiến không còn bị đẩy ra ngoài ở cửa sổ hẹp; link hỏng
  không tạo "file ma"; In / PDF không in banner; Hủy ở hộp thoại ghi đè không hiện như lỗi; khung AI hết tràn
  ngang; lưu khi chưa có key thì nhắc dán key.
- Tính năng: Excel → Markdown đọc **biểu đồ** (.xlsx): cột/thanh/đường/tròn/vùng/phân tán/radar..., cả biểu đồ
  kết hợp, thành `**〔グラフ B3:H18〕縦棒グラフ・折れ線グラフ「tiêu đề」**` + bảng số liệu (giá trị cache trong file,
  tối đa 1 000 danh mục). AI/RAG/MCP đọc được số liệu biểu đồ.
- Tính năng: chế độ Đọc Markdown **tìm trong nội dung** mọi file của thư mục (nút Tên / Nội dung ở
  ô lọc); bấm kết quả thì mở file, cuộn tới chỗ khớp và tô sáng từ khóa. IPC mới `mdv:search`.
- Bảo mật: `uuid` của exceljs nâng lên 11.1.1 (`overrides`), `npm audit --omit=dev` sạch.
- Bảo mật: file .xlsx độc đặt tên ảnh chứa `\` không còn ghi được file ra ngoài thư mục xuất (Windows);
  MCP `convert_excel` chỉ nhận file Excel (trước đọc được file text bất kỳ); XML lớp vẽ có vạn thẻ
  không đóng không còn làm treo worker (quét tuyến tính + preview giới hạn 120 giây).
- Sửa: `store.json` không còn bị ghi đè trắng (mất cài đặt và API Key) khi lỗi đọc tạm thời (EBUSY/EPERM).
- Sửa: AI "chỉ file đang xem" với file lớn ít mục bị cắt vừa mức ngữ cảnh thay vì gửi vài trăm nghìn token.
- Sửa: tick sheet không còn tải lại preview; preview không kẹt "Đang convert..."; Enter chốt chữ IME
  không gửi câu hỏi AI; rời chế độ Đọc Markdown thì dừng câu trả lời đang stream; bấm trích dẫn AI
  không còn khóa tab Mã Markdown; mở thư mục nhanh liên tiếp không bị kết quả cũ ghi đè; mục lục
  HTML xuất không escape hai lần (`A &amp;amp; B`); focus bàn phím hiện rõ trong cây file.
- MCP: `protocolVersion` lạ trả bản mới nhất hỗ trợ, batch trả `-32600`, tool lạ trả `-32602`.
- Dependency: electron 44.10.2, vitest 5.1, tailwind 4.3.5 (bản vá).
- Bảo mật: renderer không còn đọc/ghi được API Key Claude / OpenAI qua `store:get` / `store:set`
  (trước chỉ chặn khóa của Gemini).
- Sửa: cửa sổ không còn mở ra ngoài màn hình khi màn hình phụ lần trước đã rút (bỏ vị trí đã lưu).
- Sửa: thanh tiến độ Excel → Markdown chạy tới cuối cả khi có file bị hủy / không đọc được;
  bấm Dừng trong chat AI không còn ghi vào `error.log`.
- Nội bộ: tách `src/main/index.ts` (847 dòng) thành `window.ts` + IPC theo tính năng
  (`adapters/inbound/ipc/`); renderer gom theo tính năng (`features/`), tách hook convert khỏi `App.tsx`;
  client Gemini về `llm/` cùng kiểu trả về với Claude/OpenAI; app và CLI dùng chung một hàm ghi `.md`;
  xóa 22 icon và 3 class không dùng; `types.ts` vào `src/shared/`; tài liệu kiến trúc gộp về
  `docs/architecture.md`, nhật ký quá trình vào `docs/history/`. CI chạy thêm Windows.
- Tính năng: **Trợ lý AI nhiều nhà cung cấp**: Gemini, Claude (SDK `@anthropic-ai/sdk`, mặc định
  `claude-opus-5-5`, bật `fallbacks: "default"` cho model hỗ trợ) và OpenAI / Codex (Responses API,
  `store: false`). Key riêng từng bên (key Gemini cũ giữ nguyên), danh sách model lấy từ API.
- Tính năng: câu trả lời AI **stream** (hiện dần, kênh IPC `ai:delta`); khối tài liệu chuyển lên
  system/instructions để nhà cung cấp cache được khi hỏi tiếp, hiện số token đọc từ cache.
- Tính năng: chọn **ngữ cảnh tối đa** 32k / 120k / 250k token (mặc định 32k như cũ); ước lượng token đếm chữ Nhật ~1 token/ký tự.
- Tính năng: nút nhanh **Sinh test case** và **Đối chiếu chéo** (cả thư mục).
- Tính năng: **MCP server** `out/main/mcp.js` (stdio) cho Claude Code / Codex / Claude Desktop:
  `convert_excel`, `list_docs`, `search_docs`, `read_doc`.
- Sửa: meta trong front-matter (`meta: {"画面ID": ...}`) bị bộ RAG bỏ qua, nay vào tiêu đề từng mục.
- Tính năng: Excel → Markdown đọc **lớp vẽ** của sheet .xlsx (`domain/excel/drawings.ts`): ảnh ghi ra
  `<tên>_images/` và chèn `![tên (A7:H24)](...)` đúng chỗ trong sheet; chữ trong shape/text box/callout
  thành `- 〔図形 B10〕...`; mũi tên nối hai shape thành `- 〔矢印〕A → B（nhãn）`; comment ô thành
  `- 〔コメント B56: ô〕...`. Preview nhúng ảnh dạng data:. Chưa đọc biểu đồ/SmartArt và lớp vẽ của .xls.
- Tính năng: nhóm **Nâng cao** ở cột Tùy chọn (mặc định tắt, output cũ không đổi): vùng ô
  (`A1:F40`), hiện công thức (`` `=SUM(..)` `` cạnh giá trị), front-matter YAML (file nguồn, sheet),
  tách bảng mỗi N dòng (lặp header, cho RAG/LLM).
- Tính năng: nút **Xuất HTML**: trang đứng riêng, mặc định full width (nút Rộng/Đọc, ẩn mục lục, cỡ chữ A−/A+, nhớ lựa chọn; (hero + chip, mục lục scrollspy + tìm mục, callout `> [!NOTE]`, copy code, lọc/sắp xếp bảng, đổi sáng/tối, thanh tiến độ, in), một script inline cố định, CSP chặn mạng, `src/shared/guideHtml.ts`.
- Tính năng: nút **In / PDF** ở khung xem trước (`window.print`, CSS `@media print` chỉ in nội dung).
- Tính năng: **CLI headless** `node out/main/cli.js a.xlsx -o out [--per-workbook --range A1:F40
  --formulas --front-matter --chunk N]`, cùng engine với app (`src/main/cliCore.ts`).
- Tính năng: chế độ **Đọc Markdown** (nút thứ ba ở Header). Mở thư mục (dialog / `Ctrl+O` /
  kéo thả) -> cây file `.md` (đệ quy, bỏ `node_modules` + thư mục ẩn, tối đa 5 000 file), lọc,
  thu gọn thư mục, ↑/↓; mở file lẻ; xem HTML hoặc mã Markdown. Ảnh tương đối qua scheme
  `x2m-img:` (main chỉ phục vụ file ảnh nằm trong thư mục đã mở; CSP `img-src` thêm `x2m-img:`);
  link `.md` tương đối mở trong app. Nhớ thư mục + file đang xem.
- Tính năng: cột **Tùy chọn** thu gọn được thành dải hẹp, nhớ trạng thái (`sideCollapsed`).
- IPC mới: `dialog:openMarkdownFolder`, `mdv:list` (chỉ thư mục tồn tại), `mdv:read` (chỉ `.md`/`.markdown`).

## 2.2.0 — 2026-10-19
Minor: tính năng mới; **output Excel → Markdown không đổi** (`test/golden/*.md` giữ nguyên byte).
- Tính năng: chế độ **Markdown → Excel** (công tắc ở Header, nhớ chế độ cuối). Chọn file `.md`
  bằng kéo-thả / `Ctrl+O`, ↑/↓ đổi thứ tự, xem trước Markdown + danh sách sheet, nút **Tải lại**
  từng file (đọc lại preview + tên sheet sau khi sửa file `.md`; không theo dõi file tự động), ô
  "Tên file Excel" (mặc định theo tên chung trước `__`), `Ctrl+Enter` tạo file. **Mọi file trong danh sách
  gộp thành một `.xlsx`**; có nút Hủy; file đích đã có thì hỏi `Ghi đè` / `Hủy`; ghi file tạm
  `.partial` rồi đổi tên nên Hủy/lỗi không để lại `.xlsx` dở; một file `.md` lỗi thì không tạo
  file. File `.md` không phải UTF-8 (vd Shift_JIS) bị từ chối với thông báo nêu tên file, thay
  vì ghi chữ lỗi mã vào Excel.
- Bố cục Excel: font 游ゴシック 10, ẩn gridline, A4 ngang vừa 1 trang rộng; banner 基本設計,
  bảng 版数, meta merge ngang, bảng có header nền + viền, section, ghi chú, đoạn văn. Chữ trong
  ô là chữ hiển thị (bỏ escape, `<br>` thành xuống dòng); số giữ đúng hiển thị (`0001` text,
  `1.0` → `0.0`, `12.50%` → `0.00%`) và không có tam giác xanh (`ignoredErrors`).
- Markdown viết tay: list đánh số luôn giữ số `N. ` (kể cả `1. **初期表示**: …`, không thành
  ô meta); list con đánh số trong value meta và trong ghi chú `>` cũng giữ số. `<br>` trong khối
  HTML (vd `<br>` rồi xuống dòng `次の段落`) thành xuống dòng, không còn lọt chữ `<br>` vào ô.
- Dependency: **exceljs 4.4.0 chỉ dùng để GHI** file do app tạo (không bao giờ đọc file ngoài),
  thêm `jszip`; `npm audit` báo 2 moderate (`uuid`), chấp nhận vì chỉ ghi. Main process không
  nạp exceljs: worker nạp bằng `import()` động khi có yêu cầu `mdToXlsx`.
- Chiều cao dòng: Excel không tự giãn ô merge nên app tự tính, theo **16.5pt mỗi dòng** (đo bằng
  Excel thật với 游ゴシック 10). Đoạn văn/ghi chú dài hoặc nhiều dòng trải ngang cả bề rộng
  bảng; đoạn cao hơn 409.5pt (giới hạn một hàng Excel) được **tách thành nhiều hàng merge liền
  nhau**. Số dòng ước lượng theo bề rộng glyph đo bằng Excel thật (chữ hoa, số, định danh
  `TBL_CUSTOMER`… rộng hơn chữ thường) và mô phỏng xuống dòng theo khoảng trắng như Excel, nên
  câu SQL/định danh dài không còn bị che dòng cuối (kiểm bằng AutoFit của Excel thật). Emoji
  (✅ ❌ ⭐ ⌛…, Excel hiển thị ~18–19px) tính 20px, ký tự khác rộng hơn 1em (⟶ ⸻ U+FDFD, chữ
  Ấn/Đông Nam Á…) theo bảng đo bằng Excel thật, nên hàng có emoji không còn bị che chữ.
- Heading và dòng code dài: merge từ cột A tới cột cuối như đoạn văn, tự xuống dòng, chiều cao
  do app tính (heading 游ゴシック 12 đậm 19.5pt/dòng; code MS Gothic đơn cách max(15, 12 × dòng + 1.5)pt) nên
  không tràn ra ngoài vùng in và bị cắt khi in; mỗi dòng code vẫn một hàng, dòng quá cao tách
  thành nhiều hàng. Xuống dòng mô phỏng đúng Excel: sau khoảng trắng **và sau dấu `-`** (một dấu `-`
  cuối dòng được treo) — chuỗi `a-b-c…`, UUID, URL, ngày `2026-10-19` không còn bị che dòng cuối.
- Kiểm tra: `scripts/xlsx-snapshot.ps1` mở file bằng Excel thật (COM), báo `REPAIRED` nếu Excel
  đòi sửa file và chụp PNG từng sheet; test golden + round-trip cho chiều mới; E2E mở rộng
  (62 kiểm tra), 463 unit test; `scripts/measure-glyphs` đo lại bảng bề rộng glyph bằng Excel thật
  và sinh `glyphTable.ts`.
- Giới hạn round-trip đã biết (spec §11): `md → xlsx → md` chỉ ổn định với Markdown do app tạo;
  label meta ngoài `META_LABELS` của engine Excel → Markdown (vd `**作成者**:`) và bảng 2 cột có
  thể ra khác sau một vòng. Chỉ ghi chữ thuần (không giữ đậm/nghiêng giữa câu); link nội bộ `#…`
  và scheme khác http/https/mailto thành chữ thuần; `---` trang trí trong Markdown viết tay tách
  thêm sheet.

## 2.1.0 — 2026-10-19
- Hiệu năng: đọc Excel trong tiến trình riêng (Electron utilityProcess). Cửa sổ không
  còn treo khi convert file lớn (E2E 3 file 60k dòng: IPC chậm nhất 1693 ms → ~5 ms);
  file quá lớn có làm worker crash cũng không sập app.
- Tính năng: nút **Hủy** khi đang convert (dừng sau ~0.1 s; file đã ghi giữ nguyên,
  file chưa xong báo "Đã hủy").
- Hiệu năng: cache workbook đã parse (theo đường dẫn + mtime/size). Đổi sheet khi xem
  trước file 10 sheet × 5000 dòng: ~760 ms → ~27 ms.
- Bảo mật: Content-Security-Policy cho giao diện (không inline script, không tải mạng).
- Code: tách `App.tsx` (1190 dòng) thành components + hooks; main process không nạp
  SheetJS.
- Test: E2E `npm run e2e` (37 kiểm tra trên app Electron thật); 186 unit test.

## 2.0.0 — 2026-10-19
Major vì **đổi format output mặc định** (escape) — xem quy tắc bump ở đầu file.
- Engine: escape ký tự Markdown/HTML trong ô (tùy chọn "Escape ký tự Markdown/HTML
  trong ô", mặc định bật). Nội dung ô hiển thị nguyên văn khi render: `<null>`,
  `<input>` không bị ẩn; `*必須*`, `__x__` không thành nghiêng/đậm; `&nbsp;` không
  thành entity; `1~10, 20~30` không gạch ngang; `[a](b)` không thành link; `# x`,
  `1. x`, `- x`, `---` đầu dòng không thành heading/list/đường kẻ. Chỉ escape chỗ bị
  hiểu nhầm (`snake_case`, `a < b`, `<画面名>`, `1~10` giữ nguyên). Tắt tùy chọn để
  có output như 1.x.
- Engine: luôn có dòng trống trước bảng/heading/quote/đoạn văn đi sau sub-bullet meta.
  Trước đây bảng nằm ngay dưới dòng nối tiếp meta (Excel không có dòng trống) bị
  render lồng trong list item, đoạn văn bị nối vào bullet.
- Engine: giữ khoảng trắng toàn角 (U+3000) giữa chữ và ở đầu dòng 2+ trong ô nhiều
  dòng (trước đây gộp thành 1 dấu cách ASCII).
- Hiệu năng: quét theo vùng có nội dung thật thay vì `!ref` (Excel ghi `!ref` theo
  vùng có định dạng). Sheet `!ref` A1:AZ300000 với 1 ô: 11.8 s / 402 MB → ~0 ms.
  Danh sách sheet hiện số dòng thật. Merge vượt ngoài `!ref` không còn crash.
- Test: golden test với 3 file Excel mẫu (`test/fixtures`, gồm 2 file do Excel 16
  ghi: .xlsx và .xls); 71 test round-trip escape qua `marked`; tổng 173 test.
  `npm run test:update` cập nhật golden.

## 1.3.1 — 2026-10-19
- Fix: kéo-thả file vào app không hoạt động (Electron 32+ bỏ `File.path`);
  chuyển sang `webUtils.getPathForFile` qua preload.
- Bảo mật: nâng SheetJS 0.18.5 → 0.20.3 (cài từ cdn.sheetjs.com), vá
  GHSA-4r6h-8v6p-xvw6 (prototype pollution) và GHSA-5pgg-2g8v-p4x9 (ReDoS).
- Bảo mật: nâng Electron 34 (hết hỗ trợ) → 44.9.0; electron-builder 26.15.3.
- Bảo mật: cửa sổ app không còn bị điều hướng bởi link trong preview (link
  tương đối / `file://` / UNC bị chặn); chỉ link http/https/mailto mở trình
  duyệt ngoài. `shell:openPath` chỉ mở thư mục, từ chối mọi file.
- Dev: `npm run dev` tự tải binary Electron nếu thiếu (`predev`).
- Thay đổi hành vi: hộp thoại chọn file/thư mục mặc định mở thư mục Downloads
  (Electron 43+).
- Test: 91 test (thêm 7 test cho `guards.ts`).

## 1.3.0 — 2026-10-12
- Engine: bỏ dòng ma từ merge dọc trong header; hyperlink trong meta; ô đơn lẻ
  trùng meta label thành bullet.
- Bảo mật: sanitize HTML preview chống XSS; link mở trình duyệt ngoài.
- UX: progress bar từng file; second-instance nhận file; nhớ sheet đã chọn;
  giờ convert cuối; empty state lọc sheet; Escape đóng panel.
- A11y: contrast WCAG AA; aria-label/labels; role=status; focus-visible.
- Robust: lỗi tiếng Việt (ENOENT/EACCES/EISDIR); serialize store writes;
  guard IPC khi đóng window; bỏ file workbook rỗng.
- Test: 80 test (fuzz + regression file thật).

## 1.2.0 — 2026-10-12
- Tùy chọn nhận diện bảng 2 cột (mặc định tắt).
- Sheet ẩn trong Excel: hiện tag "ẩn", mặc định không tick.
- Hỗ trợ file .xls.
- Phím tắt Ctrl+O (thêm file), Ctrl+Enter (convert).
- 28 unit test cho converter; CI GitHub Actions.

## 1.1.0 — 2026-10-12
- Nhận diện tài liệu 基本設計: banner, meta 機能ID/画面ID/テーブルID, section 【...】/■....
- Bảng No/№/項番, ô merge dọc, công thức liên sheet, ô nhiều dòng.
- Preview rendered/source, copy Markdown, xuất per-sheet/per-workbook.

## 1.0.0 — 2026-10-12
- Bản đầu tiên: chọn file Excel, convert sang Markdown.
