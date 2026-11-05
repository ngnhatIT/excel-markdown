# Thiết kế: Trợ lý AI (Gemini RAG) & Nâng cấp Chuẩn AI/RAG (Ưu tiên Chất lượng)

Ngày: 2026-11-05 · App: ExcelToMarkdown 2.2.0 (Electron 44, React 18, TypeScript)

## 1. Mục đích và lý do

Người dùng sử dụng **ExcelToMarkdown** để chuyển đổi các tài liệu thiết kế kỹ thuật (đặc biệt là tài liệu `基本設計` tiếng Nhật có cấu trúc phức tạp: banner, meta `機能ID`/`画面ID`/`テーブルID`, section `【...】`/`■...`, bảng nhiều tầng) sang Markdown vì Markdown sạch, giữ đúng cấu trúc bảng/mục và giúp AI đọc hiểu dễ hơn nhiều so với file Excel gốc.

Tuy nhiên hiện tại:
1. Chưa có công cụ hỏi đáp (RAG), tóm tắt hay dịch thuật bằng AI trực tiếp trên các tài liệu Markdown đã convert trong app.
2. Nút cấu hình nhanh **AI / RAG** ở chế độ `Excel → Markdown` (`src/renderer/src/components/OptionsPanel.tsx`) mới chỉ bật ghép YAML front-matter sơ sài (`source`, `sheet`) và chia bảng mỗi 50 dòng; thậm chí khung **Xem trước** còn chưa hiển thị YAML front-matter này.

Thiết kế này bổ sung **Trợ lý AI (Gemini RAG)** vào cột bên phải của chế độ **Đọc Markdown** (nơi quản lý cả thư mục hoặc danh sách file `.md` đã convert), cho phép hỏi đáp xuyên suốt nhiều file `.md` cùng lúc, trích dẫn nguồn bấm được để nhảy thẳng tới mục/bảng liên quan, hỗ trợ dịch/tóm tắt nhanh, với nguyên tắc **ưu tiên tuyệt đối chất lượng và độ đầy đủ của câu trả lời**, chỉ áp dụng các kỹ thuật tối ưu token **không làm mất thông tin (Lossless Token Optimization)**.

## 2. Mục tiêu

1. **Khung Trợ lý AI (RAG) ở chế độ Đọc Markdown (`mdview`):**
   - Đặt ở cột bên phải trong chế độ **Đọc Markdown** (`src/renderer/src/App.tsx`), dùng khung `SidePanel` đồng bộ 100% với cột Tùy chọn của chế độ `Excel → Markdown` (có thanh kéo giãn độ rộng 240px–520px và nút thu gọn thành dải hẹp, nhớ trạng thái).
   - Hỗ trợ 2 phạm vi ngữ cảnh (công tắc chuyển nhanh):
     - **Cả thư mục / Tất cả file đang mở:** Hỏi đáp xuyên suốt các file `.md` trong thư mục đang mở (`viewer.root`), các file mở lẻ (`viewer.loose`) và bản dán clipboard (`viewer.pasted`).
     - **Chỉ file đang xem:** Hỏi đáp, dịch thuật hoặc tóm tắt trên tài liệu đang mở ở khung giữa (`PreviewPane`).
   - Có các nút tác vụ nhanh (Quick Actions) cho tài liệu đang xem: **Tóm tắt nghiệp vụ**, **Dịch sang tiếng Việt**, **Kiểm tra logic / thiếu sót**.
2. **Trích dẫn nguồn bấm được (Clickable Citations):**
   - Mỗi câu trả lời của AI hiển thị danh sách các thẻ trích dẫn nguồn (`📍 TênFile.md › Mục/Bảng`) đã dùng để trả lời.
   - Bấm vào thẻ trích dẫn sẽ tự động mở đúng file `.md` đó ở khung giữa (`PreviewPane`) và cuộn tới đúng heading hoặc bảng tương ứng.
3. **Chiến lược Ngữ cảnh Ưu tiên Chất lượng (Quality-First Context + Lossless Compression):**
   - **Không cắt ngang bảng, không làm đứt mạch logic giữa các mục trong cùng một màn hình/sheet.**
   - **Chế độ "Chỉ file đang xem":** Luôn nạp **100% toàn văn file đang mở** (kể cả mọi bảng, ghi chú `※` và lịch sử `版数`) để AI không bao giờ đếm thiếu dòng hay sót điều kiện.
   - **Chế độ "Cả thư mục":**
     - Nếu tổng dung lượng các file `.md` đang mở (sau khi nén khoảng trắng lossless) `<= 32.000 tokens` (~100.000 ký tự, tương đương **15–20 sheet thiết kế đầy đủ**): **Nạp thẳng 100% toàn bộ các file** vào ngữ cảnh của Gemini để đạt độ chính xác tuyệt đối.
     - Nếu thư mục lớn (`> 32.000 tokens`, ví dụ 30–500 file): Sử dụng bộ tìm kiếm lai **BM25 + CJK 2-gram + Từ điển chuyên ngành Việt–Nhật** theo cơ chế **Parent-Document Retrieval** — ưu tiên nạp **nguyên vẹn cả file/sheet** của các tài liệu khớp nhất (và nguyên vẹn cả mục/bảng của các file liên quan tiếp theo) trong ngân sách rộng **32.000 tokens**, kèm theo **Bản đồ danh mục toàn bộ các file trong thư mục** để AI vẫn nắm được bức tranh tổng thể.
   - **Tối ưu Token Không mất dữ liệu (Lossless 100%):** Chỉ nén khoảng trắng căn cột (`| a     |` → `| a |`), gộp dòng trống thừa và không lặp lại khối `<context>` tài liệu cũ trong lịch sử chat; hiển thị số token thực tế (`usageMetadata`) dưới mỗi câu trả lời.
4. **Quản lý Gemini API Key & Bảo mật Electron:**
   - Người dùng nhập Gemini API Key và chọn model (`gemini-2.5-flash` mặc định hoặc `gemini-2.5-pro`) ngay trong khung Trợ lý AI.
   - Lưu API Key ở tiến trình `main` (mã hóa bằng `safeStorage` của Electron khi hệ điều hành hỗ trợ, fallback base64 trong `store.json`, không bao giờ ghi key ra log).
   - Mọi lệnh gọi HTTPS tới Gemini API thực hiện trong tiến trình `main` (`fetch` của Node) để giữ nguyên chính sách CSP chặn mạng tuyệt đối ở giao diện `renderer`.
5. **Nâng cấp Preset `AI / RAG` ở chế độ `Excel → Markdown`:**
   - Hiển thị khối YAML front-matter ngay trong khung **Xem trước** (`excel:preview`) khi bật tùy chọn `Front-matter YAML` để người dùng thấy đúng kết quả sẽ xuất.
   - Trích xuất tự động tiêu đề tài liệu (`title` từ banner `基本設計`) và danh sách định danh Meta (`機能ID`, `画面ID`, `テーブルID`, `バッチID`, `API ID`...) đưa vào YAML front-matter để tăng độ chính xác cho cả bộ RAG nội bộ lẫn pipeline RAG bên ngoài.

## 3. Ngoài phạm vi (Non-goals)

- Không nhúng cơ sở dữ liệu vector C++ native (như sqlite-vss, lancedb, chromadb) để tránh làm phình bộ cài `.exe` và tránh lỗi biên dịch native trên Windows.
- Không tự động sửa trực tiếp vào file `.md` trên ổ cứng của người dùng (mọi nội dung AI sinh ra chỉ hiển thị trong khung chat kèm nút **Copy Markdown**).
- Không bắt buộc phải có API Key mới dùng được chế độ **Đọc Markdown** (khi chưa nhập key, khung đọc tài liệu và thu gọn cột phải vẫn hoạt động bình thường).

## 4. Điều tuyệt đối tránh (Anti-goals)

- **Cắt cụt bảng hoặc cắt rời mục sự kiện/ghi chú làm AI trả lời thiếu dòng hoặc sai nghiệp vụ.**
- **Lộ hoặc ghi API Key vào `logs/error.log` hoặc lộ ra ngoài:** Mọi thông báo lỗi mạng/API phải lọc bỏ chuỗi API key và query param `?key=...` trước khi ghi log hay trả về UI.
- **Treo giao diện khi quét thư mục lớn:** Việc đọc và lập chỉ mục các file `.md` trong thư mục phải chạy bất đồng bộ ở `main`, có cache theo `mtime` (chỉ đọc và phân tích lại những file có `mtime` thay đổi).
- **Làm thay đổi byte-for-byte các golden test mặc định (`test/golden/*.md`):** Khi tùy chọn `frontMatter` ở trạng thái mặc định (`false`), đầu ra `Excel → Markdown` phải giữ nguyên tuyệt đối 100%.

## 5. Các phương án đã cân nhắc

1. **Phương án 1 (Đã chọn): Hybrid Parent-Document RAG (Toàn văn khi `<= 32k tokens` + BM25/CJK/Từ điển Việt–Nhật ưu tiên nguyên file/mục khi thư mục lớn)**
   - Giữ trọn vẹn cấu trúc từng sheet/file và bảng dữ liệu, kết hợp chấm điểm BM25 + 2-gram chữ Nhật + từ điển ánh xạ thuật ngữ chuyên ngành Việt ↔ Nhật có sẵn trong code.
   - *Ưu điểm:* Chất lượng câu trả lời cao nhất (không bị đứt mạch bảng/nghiệp vụ), 0 giây chờ khi mở thư mục, 0 tốn quota API ngầm, chỉ 1 request Gemini mỗi câu hỏi.
2. **Phương án 2: Cắt nhỏ cố định (Micro-chunking 25 dòng + trần 4k tokens)**
   - Cắt nhỏ mọi bảng và chặn trần token thấp.
   - *Nhược điểm:* Bị loại vì dễ làm AI đếm thiếu dòng trong bảng dài hoặc mất mối liên hệ giữa mục `【項目定義】` và `【イベント定義】` trong cùng một sheet.
3. **Phương án 3: Vector Embeddings qua Gemini Embedding API + Cache JSON**
   - Gọi API nhúng vector cho mọi đoạn khi mở thư mục.
   - *Nhược điểm:* Tốn thời gian chờ và tốn quota API mỗi khi mở thư mục mới; cần mạng ngay lúc lập chỉ mục.

## 6. Kiến trúc chi tiết

### 6.1. Phân tích cấu trúc tài liệu & Nén không mất dữ liệu (`src/main/rag/chunker.ts`)

Mỗi file `.md` được phân tích thành đối tượng `RagDocument` chứa toàn văn đã nén lossless và danh sách các mục `RagSection` (tương ứng với từng `## Sheet` / `### Section`):

```ts
export interface RagSection {
  id: string            // `${relPath}#${index}`
  filePath: string      // Đường dẫn tuyệt đối (hoặc '__paste__' cho clipboard)
  relPath: string       // Đường dẫn hiển thị ngắn gọn (vd `SC001__顧客一覧.md`)
  sheetName: string     // Tên sheet (`## ...`) hoặc tên file
  sectionTitle: string  // Tên mục (`### 【項目定義】`...) hoặc 'Tổng quan'
  metaHeader: string    // Ngữ cảnh đầu sheet (vd `[SC001__顧客一覧.md | 画面ID: SC001 | 画面名: 顧客一覧]`)
  content: string       // Toàn bộ nội dung mục này (giữ nguyên vẹn bảng và ghi chú ※)
  tokensEst: number     // Ước lượng số token (~ charCount / 3)
}

export interface RagDocument {
  filePath: string
  relPath: string
  mtime: number
  metaHeader: string
  outline: string[]     // Danh sách các heading `##` / `###` trong file
  fullContent: string   // Toàn văn file sau khi nén khoảng trắng lossless
  tokensEst: number
  sections: RagSection[]
}
```

**Nén không mất dữ liệu (Lossless Prompt Compression):**
- Thu gọn khoảng trắng đệm căn cột trong bảng Markdown (`| No    | 項目名      |` → `| No | 項目名 |`, `|-------|-------------|` → `|---|---|`).
- Gộp các dòng trống liên tiếp thành 1 dòng trống.
- **Giữ nguyên 100% mọi dòng dữ liệu, mọi bảng (kể cả bảng `版数`), mọi ghi chú `※` và công thức.**

### 6.2. Chiến lược chọn ngữ cảnh Ưu tiên Chất lượng (`src/main/rag/retriever.ts`)

1. **Khi chọn phạm vi "Chỉ file đang xem":**
   - Luôn gửi trọn vẹn `fullContent` của file đang xem (nếu file cực lớn `> 60.000 tokens` mới lọc theo `RagSection` ưu tiên các mục khớp câu hỏi + toàn bộ `outline`).
2. **Khi chọn phạm vi "Cả thư mục / Tất cả file đang mở":**
   - **Nhánh Toàn văn (Small/Medium Folder `<= 32.000 tokens`):** Nếu tổng `tokensEst` của tất cả các `RagDocument` đang mở `<= 32.000 tokens`, gửi **toàn văn tất cả các file** để Gemini đối chiếu chéo chính xác 100%.
   - **Nhánh Parent-Document RAG (Large Folder `> 32.000 tokens`):**
     - Luôn đính kèm **Sơ đồ tổng quan thư mục (Directory Catalog)** ở đầu ngữ cảnh (liệt kê mọi file kèm `metaHeader` và các mục `outline` của từng file) để AI nắm toàn cảnh dự án.
     - Chấm điểm từng file và từng mục bằng **BM25 + CJK 2-gram + Từ điển chuyên ngành Việt–Nhật (`glossary.ts`)** + thưởng điểm khớp chính xác mã định danh (`SC001`, `CUSTOMER_CD`...).
     - **Ưu tiên nạp nguyên file (Parent-Document):** Các file có điểm khớp cao nhất được nạp **nguyên vẹn toàn bộ file (`fullContent`)** vào ngữ cảnh trước để không bị đứt mạch giữa các mục trong cùng một màn hình; phần ngân sách còn lại (cho tới `MAX_CONTEXT_TOKENS = 32.000`) nạp tiếp các `RagSection` trọn vẹn (bao gồm nguyên bảng) từ các file liên quan khác.

### 6.3. Lịch sử hội thoại & Kết nối Gemini API (`src/main/rag/geminiClient.ts`)

1. **Lịch sử hội thoại sạch:**
   - Gửi tối đa **6 lượt hỏi – đáp gần nhất** (`12 messages`).
   - Chỉ gửi nội dung câu hỏi và câu trả lời của các lượt trước (không lặp lại khối `<context>` cũ vì lượt hiện tại đã nạp bộ `<context>` đầy đủ mới nhất).
2. **Định dạng trả lời & Trích dẫn nguồn:**
   - Yêu cầu Gemini trả lời chi tiết, chính xác bằng tiếng Việt (giữ nguyên mã kỹ thuật/tên trường tiếng Nhật trong ngoặc hoặc inline code), và gắn thẻ nguồn ở dạng `[[relPath | sectionTitle]]` (hoặc hệ thống đối chiếu với các `RagDocument`/`RagSection` đã nạp) để trích xuất danh sách `citations` bấm được.
3. **Thống kê Token minh bạch:**
   - Đọc `usageMetadata` (`promptTokenCount`, `candidatesTokenCount`, `totalTokenCount`) từ phản hồi của Gemini API để hiển thị dưới câu trả lời.

### 6.4. Giao diện & Luồng tương tác (`src/renderer/src/components/AiChatPanel.tsx`)

1. **Vị trí:** Trong `src/renderer/src/App.tsx`, khi `appMode === 'mdview'`, render thêm thanh kéo `x2m-resizer` và `<AiChatPanel>` ở cột bên phải (dùng khung `SidePanel`, kéo giãn độ rộng và thu gọn đồng bộ với cột Tùy chọn).
2. **Thành phần trong `AiChatPanel`:**
   - **Thanh tiêu đề:** Tên `Trợ lý AI (RAG)`, nút `🔑 API Key` (nhập API key + chọn model `gemini-2.5-flash` / `gemini-2.5-pro`), nút `Xóa chat` và nút thu gọn cột `›`.
   - **Thanh chọn phạm vi (Scope):** `Cả thư mục (N file)` | `Chỉ file đang xem`.
   - **Thanh tác vụ nhanh (Quick Actions):** `📋 Tóm tắt nghiệp vụ`, `🌐 Dịch sang tiếng Việt`, `🔍 Kiểm tra thiếu sót`.
   - **Danh sách tin nhắn:**
     - Hiển thị câu trả lời Markdown đã render qua `marked` + `sanitizeHtml`.
     - Các chip trích dẫn `📍 TênFile.md › 【Mục】`: bấm vào sẽ mở đúng file đó ở `PreviewPane` và cuộn mượt tới đúng heading/bảng đó.
     - Dòng thông tin phụ: chế độ ngữ cảnh đã dùng (ví dụ `Đọc toàn văn 12 file` hoặc `Tra cứu 5 file liên quan`) + số token (`⚡ N tokens`) + nút `Copy`.
   - **Ô nhập câu hỏi:** Textarea hỗ trợ `Enter` để gửi (`Shift+Enter` xuống dòng), nút `Gửi` / `Dừng` (hủy request qua `AbortController`).

### 6.5. Nâng cấp Preset `AI / RAG` ở chế độ `Excel → Markdown`

1. **Làm giàu YAML Front-matter (`src/main/output.ts` & `src/main/converter.ts`):**
   - Thêm hàm `extractSheetFrontMatterMeta(ws)` lấy tiêu đề tài liệu từ banner `基本設計` và các cặp định danh chính trong `META_LABELS` (`機能ID`, `機能名`, `画面ID`, `画面名`, `テーブルID`, `テーブル名`, `バッチID`, `API ID`).
   - Khi `options.frontMatter === true`, khối YAML đầu file sẽ có thêm trường `title` và `meta` (nếu sheet có các thông tin này; nếu là bảng thường không có `基本設計`/meta thì giữ nguyên `source` và `sheet` như cũ để các unit test hiện tại vẫn tương thích).
2. **Hiển thị Front-matter trong Xem trước (`src/main/workerHandler.ts`):**
   - Khi xử lý request `preview` với `req.options.frontMatter === true`, gắn luôn khối `frontMatter(...)` vào đầu chuỗi Markdown trả về cho `PreviewPane`.

## 7. Quyết định để người triển khai (Builder) chủ động

- Hệ số `k1` (mặc định `1.5`) và `b` (mặc định `0.75`) của BM25 trong `retriever.ts`.
- Giới hạn cache `RagDocument` theo `mtime` trong tiến trình `main`.
- Chi tiết CSS của `AiChatPanel` trong `src/renderer/src/styles.css` theo 2 theme sáng/tối sẵn có.
