# Thiết kế: Trợ lý AI (Gemini RAG) & Nâng cấp Chuẩn AI/RAG

Ngày: 2026-11-05 · App: ExcelToMarkdown 2.2.0 (Electron 44, React 18, TypeScript)

## 1. Mục đích và lý do

Người dùng sử dụng **ExcelToMarkdown** để chuyển đổi các tài liệu thiết kế kỹ thuật (đặc biệt là tài liệu `基本設計` tiếng Nhật có cấu trúc phức tạp: banner, meta `機能ID`/`画面ID`/`テーブルID`, section `【...】`/`■...`, bảng nhiều tầng) sang Markdown vì Markdown sạch, giữ đúng cấu trúc bảng/mục và giúp AI đọc hiểu dễ hơn nhiều so với file Excel gốc.

Tuy nhiên hiện tại:
1. Chưa có công cụ hỏi đáp (RAG), tóm tắt hay dịch thuật bằng AI trực tiếp trên các tài liệu Markdown đã convert trong app.
2. Nút cấu hình nhanh **AI / RAG** ở chế độ `Excel → Markdown` (`src/renderer/src/components/OptionsPanel.tsx`) mới chỉ bật ghép YAML front-matter sơ sài (`source`, `sheet`) và chia bảng mỗi 50 dòng; thậm chí khung **Xem trước** còn chưa hiển thị YAML front-matter này.

Thiết kế này bổ sung **Trợ lý AI (Gemini RAG)** vào cột bên phải của chế độ **Đọc Markdown** (nơi quản lý cả thư mục hoặc danh sách file `.md` đã convert), cho phép hỏi đáp xuyên suốt nhiều file `.md` cùng lúc, trích dẫn nguồn bấm được để nhảy thẳng tới mục/bảng liên quan, hỗ trợ dịch/tóm tắt nhanh, đồng thời **tối ưu hóa triệt để lượng token tiêu thụ** khi gọi Gemini API.

## 2. Mục tiêu

1. **Khung Trợ lý AI (RAG) ở chế độ Đọc Markdown (`mdview`):**
   - Đặt ở cột bên phải trong chế độ **Đọc Markdown** (`src/renderer/src/App.tsx`), dùng khung `SidePanel` đồng bộ 100% với cột Tùy chọn của chế độ `Excel → Markdown` (có thanh kéo giãn độ rộng 240px–520px và nút thu gọn thành dải hẹp, nhớ trạng thái).
   - Hỗ trợ 2 phạm vi ngữ cảnh (công tắc chuyển nhanh):
     - **Cả thư mục / Tất cả file đang mở:** Tìm kiếm RAG trên toàn bộ các file `.md` trong thư mục đang mở (`viewer.root`) cộng với các file mở lẻ (`viewer.loose`) và bản dán clipboard (`viewer.pasted`).
     - **Chỉ file đang xem:** Chỉ hỏi đáp, dịch thuật hoặc tóm tắt trên tài liệu đang mở ở khung giữa (`PreviewPane`).
   - Có các nút tác vụ nhanh (Quick Actions) cho tài liệu đang xem: **Tóm tắt nghiệp vụ**, **Dịch sang tiếng Việt**, **Kiểm tra logic / thiếu sót**.
2. **Trích dẫn nguồn bấm được (Clickable Citations):**
   - Mỗi câu trả lời của AI hiển thị danh sách các thẻ trích dẫn nguồn (`📍 TênFile.md › Mục/Bảng`) đã dùng để trả lời.
   - Bấm vào thẻ trích dẫn sẽ tự động mở đúng file `.md` đó ở khung giữa (`PreviewPane`) và cuộn tới đúng heading hoặc bảng tương ứng.
3. **Tối ưu hóa Token đa tầng (Zero-Waste Token Pipeline):**
   - Mỗi câu hỏi của người dùng chỉ tốn **đúng 1 lần gọi Gemini API** (không gọi API phụ để tạo embedding hay dịch câu hỏi).
   - Nén dữ liệu Markdown trước khi gửi, lọc bỏ phần lịch sử sửa đổi (`版数`) khi không hỏi tới, chia nhỏ bảng dài kèm header, giới hạn ngân sách token mỗi lượt và hiển thị số token thực tế (`usageMetadata`) dưới mỗi câu trả lời.
4. **Quản lý Gemini API Key & Bảo mật Electron:**
   - Người dùng nhập Gemini API Key và chọn model (`gemini-2.5-flash` mặc định vì nhanh/rẻ, hoặc `gemini-2.5-pro`) ngay trong khung Trợ lý AI.
   - Lưu API Key ở tiến trình `main` (mã hóa bằng `safeStorage` của Electron khi hệ điều hành hỗ trợ, fallback base64 trong `store.json`, không bao giờ ghi key ra log).
   - Mọi lệnh gọi HTTPS tới Gemini API thực hiện trong tiến trình `main` (`node:https` / `fetch` của Node) để giữ nguyên chính sách CSP chặn mạng tuyệt đối ở giao diện `renderer`.
5. **Nâng cấp Preset `AI / RAG` ở chế độ `Excel → Markdown`:**
   - Hiển thị khối YAML front-matter ngay trong khung **Xem trước** (`excel:preview`) khi bật tùy chọn `Front-matter YAML` để người dùng thấy đúng kết quả sẽ xuất.
   - Trích xuất tự động tiêu đề tài liệu (`title` từ banner `基本設計`) và danh sách định danh Meta (`機能ID`, `画面ID`, `テーブルID`, `バッチID`, `API ID`...) đưa vào YAML front-matter để tăng độ chính xác cho cả bộ RAG nội bộ lẫn pipeline RAG bên ngoài.

## 3. Ngoài phạm vi (Non-goals)

- Không nhúng cơ sở dữ liệu vector C++ native (như sqlite-vss, lancedb, chromadb) để tránh làm phình bộ cài `.exe` và tránh lỗi biên dịch native trên Windows.
- Không tự động sửa trực tiếp vào file `.md` trên ổ cứng của người dùng (mọi nội dung AI sinh ra chỉ hiển thị trong khung chat kèm nút **Copy Markdown**).
- Không bắt buộc phải có API Key mới dùng được chế độ **Đọc Markdown** (khi chưa nhập key, khung đọc tài liệu và thu gọn cột phải vẫn hoạt động bình thường).

## 4. Điều tuyệt đối tránh (Anti-goals)

- **Lộ hoặc ghi API Key vào `logs/error.log` hoặc lộ ra ngoài:** Mọi thông báo lỗi mạng/API phải lọc bỏ chuỗi API key và query param `?key=...` trước khi ghi log hay trả về UI.
- **Đốt token vô ích:** Gửi nguyên văn hàng chục file `.md` hoặc gửi các bảng hàng trăm dòng kèm khoảng trắng đệm (`alignTables`) và lịch sử chat cũ chứa đầy tài liệu lặp lại.
- **Treo giao diện khi quét thư mục lớn:** Việc đọc và lập chỉ mục các file `.md` trong thư mục phải chạy bất đồng bộ ở `main`, có cache theo `mtime` (chỉ đọc và tách đoạn lại những file có `mtime` thay đổi), giới hạn tối đa số file quét để không chặn luồng UI.
- **Làm thay đổi byte-for-byte các golden test mặc định (`test/golden/*.md`):** Khi tùy chọn `frontMatter` ở trạng thái mặc định (`false`), đầu ra `Excel → Markdown` phải giữ nguyên tuyệt đối 100%.

## 5. Các phương án đã cân nhắc

1. **Phương án 1 (Đã chọn): Local Structural Chunking + Tìm kiếm lai BM25/CJK + Từ điển thuật ngữ Việt–Nhật nội bộ**
   - Tách đoạn theo cấu trúc Markdown (`##`, `###`, bảng), chấm điểm BM25 kết hợp n-gram cho chữ Nhật/CJK và từ điển ánh xạ thuật ngữ chuyên ngành Việt ↔ Nhật có sẵn trong code.
   - *Ưu điểm:* 0 giây chờ khi mở thư mục, 0 tốn quota API ngầm, chỉ 1 request Gemini mỗi câu hỏi, bắt chính xác tuyệt đối các mã `SC001`, `CUSTOMER_CD`, `項目定義`.
2. **Phương án 2: Vector Embeddings qua Gemini Embedding API + Cache JSON**
   - Gọi API nhúng vector cho mọi đoạn khi mở thư mục.
   - *Nhược điểm:* Tốn thời gian chờ và tốn quota API mỗi khi mở thư mục mới; cần mạng ngay lúc lập chỉ mục.
3. **Phương án 3: Thuần Long-Context (Gửi toàn bộ file vào Prompt)**
   - Gửi nguyên văn các file sang Gemini.
   - *Nhược điểm:* Chi phí token cao gấp nhiều lần, chậm và không mở rộng được cho thư mục nhiều file.

## 6. Kiến trúc chi tiết & Chiến lược Tối ưu Token

### 6.1. Bộ chia đoạn theo cấu trúc Markdown (`src/main/rag/chunker.ts`)

Mỗi file `.md` khi đưa vào bộ lập chỉ mục sẽ được phân tích thành các `RagChunk`:

```ts
export interface RagChunk {
  id: string            // `${relPath}#${index}`
  filePath: string      // Đường dẫn tuyệt đối (hoặc '__paste__' cho clipboard)
  relPath: string       // Đường dẫn hiển thị ngắn gọn (vd `SC001__顧客一覧.md`)
  sheetName: string     // Tên sheet (`## ...`) hoặc tên file nếu không có `##`
  sectionTitle: string  // Tên mục (`### 【項目定義】`...) hoặc 'Tổng quan'
  metaHeader: string    // Chuỗi ngữ cảnh gọn (vd `[SC001__顧客一覧.md | 画面ID: SC001 | 画面名: 顧客一覧]`)
  content: string       // Nội dung Markdown ĐÃ NÉN TOKEN của đoạn này
  tokensEst: number     // Ước lượng số token (~ charCount / 3 với văn bản trộn Nhật-Việt)
  isVersionTable: boolean // Đánh dấu đoạn chỉ chứa bảng lịch sử sửa đổi (版数/作成日/作成者)
}
```

**Quy tắc tách & nén tiết kiệm token:**
1. **Trích xuất `metaHeader` 1 dòng:** Gom YAML front-matter (nếu có), dòng banner `> 基本設計：...` và các dòng bullet meta đầu sheet (`- **機能ID**: ...`, `- **画面ID**: ...`, `- **テーブルID**: ...`) thành 1 dòng tiêu đề ngữ cảnh ngắn gọn `metaHeader`. Dòng này được đính kèm vào đầu mọi chunk thuộc sheet đó khi gửi cho Gemini để AI luôn biết bảng/đoạn đó thuộc màn hình hay bảng DB nào mà chỉ tốn ~20–30 token.
2. **Tách theo Heading & Bảng:**
   - Mỗi khối bắt đầu bởi `## ` (sheet mới) hoặc `### ` (section mới như `### 【項目定義】`) tạo thành một đoạn riêng.
   - Nếu trong một mục có bảng Markdown dài hơn **25 dòng dữ liệu** (`RAG_TABLE_SLICE = 25`), bảng được chia thành các đoạn con 25 dòng, mỗi đoạn con **luôn giữ lại 2 dòng đầu của bảng** (`| Header |` và `|---|`) để AI không bị mất tên cột.
3. **Nén Markdown trong `content` (Prompt Compression):**
   - Thu gọn các bảng đã căn cột (`| No    | 項目名      |` → `| No | 項目名 |`, `|-------|-------------|` → `|---|---|`).
   - Bỏ các ký tự escape thuần hiển thị (`\*` → `*`, `\_` → `_`, `\<` → `<`, `\[` → `[`, `\]` → `]`).
   - Gộp nhiều dòng trống liên tiếp thành 1 dòng trống.
4. **Nhận diện bảng Lịch sử phiên bản (`isVersionTable`):**
   - Đoạn chỉ chứa bảng có cột `版数` / `作成日` / `作成者` / `改定履歴` được gắn cờ `isVersionTable = true`. Mặc định loại khỏi ngữ cảnh gửi AI (tiết kiệm ~150–300 token/sheet), chỉ đưa vào khi câu hỏi có từ khóa hỏi về phiên bản/ngày tạo/người tạo.

### 6.2. Tìm kiếm lai BM25 + CJK N-gram + Từ điển Việt–Nhật (`src/main/rag/retriever.ts`)

Để người dùng gõ câu hỏi bằng **tiếng Việt** nhưng tìm trúng nội dung tài liệu **tiếng Nhật (`基本設計`)** mà **không tốn thêm lượt gọi API phụ**:

1. **Bộ tách từ đa ngữ (Tokenizer):**
   - Tách từ tiếng Việt / tiếng Anh theo ranh giới từ (chữ thường, giữ nguyên mã định danh như `sc001`, `customer_cd`, `fn-01`).
   - Với chuỗi ký tự CJK (Kanji, Hiragana, Katakana): tách thành **unigram + bigram (2-gram)** liên tiếp (ví dụ `顧客一覧画面` → `顧客`, `客一`, `一覧`, `覧画`, `画面` cùng các ký tự đơn), giúp tìm kiếm tiếng Nhật chính xác mà không cần thư viện từ điển MeCab/Kuromoji nặng hàng chục MB.
2. **Từ điển mở rộng truy vấn Việt ↔ Nhật cục bộ (`src/main/rag/glossary.ts`):**
   - Khi người dùng đặt câu hỏi có từ khóa nghiệp vụ tiếng Việt/Anh, bộ truy vấn tự động cộng thêm các token tiếng Nhật tương đương vào tập từ khóa tìm kiếm (với trọng số `0.7`):
     - `màn hình / screen / ui` → `画面`, `表示`, `項目`
     - `bảng / table / db / cơ sở dữ liệu` → `テーブル`, `マスタ`, `カラム`, `項目定義`
     - `bắt buộc / required` → `必須`
     - `kiểm tra / validate / điều kiện / check` → `入力チェック`, `チェック`, `条件`, `桁数`, `型`
     - `lỗi / thông báo / error / message` → `エラー`, `メッセージ`, `異常`
     - `nút / sự kiện / action / button` → `イベント`, `ボタン`, `処理`, `押下`
     - `chuyển màn hình / điều hướng / transition` → `画面遷移`, `遷移`
     - `api / tích hợp / interface / liên kết` → `API`, `IF`, `連携`, `エンドポイント`, `リクエスト`, `レスポンス`
     - `khách hàng / customer` → `顧客`, `取引先`
     - `người dùng / tài khoản / user / quyền` → `ユーザ`, `アカウント`, `権限`, `ログイン`
3. **Chấm điểm & Chọn ngân sách Context (Token Budget):**
   - Điểm mỗi chunk = `BM25(content) + 2.0 * BM25(metaHeader + sectionTitle) + 3.0 * ExactIdMatch` (khớp chính xác mã ID/tên cột như `SC001`, `TBL_...`).
   - Chọn các đoạn có điểm cao nhất cho tới khi đạt ngưỡng **`MAX_CONTEXT_TOKENS = 4000`** (tương đương ~12.000 ký tự đã nén, tối đa **8 chunks**).
   - **Trường hợp câu hỏi tổng quát trên cả thư mục** (ví dụ *"Thư mục này gồm những màn hình và chức năng nào?"*, điểm khớp chi tiết thấp): Tự động chuyển sang gửi **Bản tóm tắt cấu trúc thư mục (Index Summary)** gồm danh sách tất cả các file kèm `metaHeader` và danh sách `### Section` của từng file (chỉ tốn ~30–50 token/file, tức 20 file chỉ mất ~800 token!).
   - **Khi chọn phạm vi "Chỉ file đang xem":**
     - Nếu tổng dung lượng file sau nén `<= 4000 tokens`: gửi toàn bộ nội dung đã nén của file đó (bỏ bảng `版数` nếu không hỏi tới).
     - Nếu file rất lớn (`> 4000 tokens`): gửi `metaHeader` + danh sách mục lục của file + các chunks có điểm khớp cao nhất trong file đó cho tới ngưỡng `4000 tokens`.

### 6.3. Lịch sử hội thoại & Kết nối Gemini API (`src/main/rag/geminiClient.ts`)

1. **Giới hạn lịch sử hội thoại (Sliding Window):**
   - Chỉ gửi tối đa **4 lượt hỏi – đáp gần nhất** (`8 messages`).
   - Các lượt cũ chỉ gửi câu hỏi của user và câu trả lời của AI (tuyệt đối **không** lặp lại khối `<context>` tài liệu đã đính kèm ở các lượt trước).
2. **System Prompt gọn & Chuẩn định dạng trích dẫn:**
   - Yêu cầu Gemini trả lời bằng ngôn ngữ của người hỏi (mặc định tiếng Việt), giữ nguyên các mã kỹ thuật/tên cột/tên mục tiếng Nhật trong ngoặc hoặc inline code để dễ đối chiếu.
   - Khi lấy thông tin từ đoạn nào, AI gắn trích dẫn hoặc hệ thống tự đối chiếu từ các chunks đã gửi để trả về danh sách `citations: { relPath, filePath, sheetName, sectionTitle }[]` hiển thị thành các chip bấm được dưới câu trả lời.
3. **Thống kê Token minh bạch:**
   - Đọc trường `usageMetadata` (`promptTokenCount`, `candidatesTokenCount`, `totalTokenCount`) từ JSON phản hồi của Gemini `generateContent` API và trả về UI để hiển thị dưới câu trả lời (ví dụ: `⚡ 1.240 tokens (in: 980 · out: 260)`).

### 6.4. Giao diện & Luồng tương tác (`src/renderer/src/components/AiChatPanel.tsx`)

1. **Vị trí:** Trong `src/renderer/src/App.tsx`, khi `appMode === 'mdview'`, render thêm thanh kéo `x2m-resizer` và `<AiChatPanel>` ở cột bên phải (dùng chung state `sideCollapsed` và `rightWidth` hoặc state thu gọn riêng cho cột phải).
2. **Thành phần trong `AiChatPanel`:**
   - **Thanh tiêu đề:** Tên `Trợ lý AI (RAG)`, nút `🔑 API Key` (mở hộp nhập API key + chọn model `gemini-2.5-flash` / `gemini-2.5-pro`), nút `Xóa chat` và nút thu gọn cột `›`.
   - **Thanh chọn phạm vi (Scope):**
     - `Cả thư mục (N file)` (tự động cập nhật số file từ thư mục + file mở lẻ).
     - `Chỉ file đang xem` (disabled nếu chưa chọn file nào).
   - **Thanh tác vụ nhanh (Quick Actions):** 3 nút bấm 1 chạm áp dụng cho file đang xem (hoặc toàn thư mục):
     - `📋 Tóm tắt nghiệp vụ`
     - `🌐 Dịch sang tiếng Việt`
     - `🔍 Kiểm tra thiếu sót`
   - **Danh sách tin nhắn:**
     - Tin nhắn của người dùng và câu trả lời của AI (render Markdown qua `marked` + `sanitizeHtml` sẵn có của app).
     - Dưới mỗi câu trả lời AI:
       - Các chip trích dẫn `📍 TênFile.md › 【Mục】`: bấm vào sẽ gọi `viewer.select(filePath)` (hoặc `viewer.openFiles([filePath])`) và truyền `scrollToHeading` sang `PreviewPane` để cuộn mượt tới đúng heading/bảng đó.
       - Dòng thông tin phụ: số token đã dùng (`⚡ N tokens`) + nút `Copy` câu trả lời.
   - **Ô nhập câu hỏi:** Textarea tự giãn nhẹ (1–4 dòng), `Enter` để gửi (`Shift+Enter` xuống dòng), nút `Gửi` (hoặc nút `Dừng` khi đang chờ phản hồi, hỗ trợ `AbortController` hủy request ngay lập tức).

### 6.5. Nâng cấp Preset `AI / RAG` ở chế độ `Excel → Markdown`

1. **Làm giàu YAML Front-matter (`src/main/output.ts` & `src/main/converter.ts`):**
   - Thêm hàm trích xuất nhanh thông tin đầu sheet `extractSheetFrontMatterMeta(ws)`: lấy tiêu đề tài liệu từ dòng banner `基本設計` (nếu có) và tối đa các cặp định danh chính trong `META_LABELS` (`機能ID`, `機能名`, `画面ID`, `画面名`, `テーブルID`, `テーブル名`, `バッチID`, `API ID`).
   - Khi `options.frontMatter === true`, khối YAML đầu file sẽ có thêm trường `title` và `meta` (nếu sheet có các thông tin này; nếu là bảng thường không có `基本設計`/meta thì giữ nguyên `source` và `sheet` như cũ để các unit test hiện tại vẫn tương thích).
2. **Hiển thị Front-matter trong Xem trước (`src/main/workerHandler.ts`):**
   - Khi xử lý request `preview` với `req.options.frontMatter === true`, gắn luôn khối `frontMatter(...)` vào đầu chuỗi Markdown trả về cho `PreviewPane` để khi người dùng bấm preset **AI / RAG** sẽ nhìn thấy ngay thay đổi ở cả tab *Xem trước* và *Mã Markdown*.

## 7. Quyết định để người triển khai (Builder) chủ động

- Chi tiết hệ số `k1` (mặc định `1.5`) và `b` (mặc định `0.75`) của công thức BM25 trong `retriever.ts`.
- Giới hạn bộ nhớ cache chỉ mục RAG trong tiến trình `main` (ví dụ giữ tối đa `2.000 chunks` hoặc `500 file .md` mới nhất trong thư mục để đảm bảo RAM nhẹ dưới 30MB).
- Cách trình bày CSS chi tiết của bóng chat, chip trích dẫn và hộp nhập API Key trong `src/renderer/src/styles.css` sao cho khớp hoàn toàn với bảng màu sáng/tối (`data-theme="dark" | "light"`) và đạt chuẩn tương phản WCAG AA sẵn có.
