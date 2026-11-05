# Kiến Trúc Dự Án ExcelToMarkdown (Hexagonal Architecture & Tailwind CSS v4)

Dự án đã được tái cấu trúc theo mô hình **Hexagonal Architecture (Ports and Adapters)** cho phần backend/main process, đồng thời nâng cấp toàn diện giao diện **UI/UX với Tailwind CSS v4** cho phần frontend/renderer.

---

## 1. Hexagonal Architecture (Main Process)

Kiến trúc phân tách rõ ràng trách nhiệm giữa nghiệp vụ cốt lõi (Domain), các cổng giao tiếp trừu tượng (Ports), các bộ điều hợp ngoại vi (Adapters), và điểm khởi chạy (Composition Root):

```mermaid
graph TD
  subgraph Inbound Adapters
    CLI["CLI Adapter (cliCore.ts)"]
    IPC["IPC Handlers (main/index.ts)"]
    WorkerH["Worker Handlers (workerHandler, mdHandler)"]
  end

  subgraph Application & Ports
    Protocols["Worker Protocols (workerProtocol.ts)"]
  end

  subgraph Pure Domain
    ExcelConv["Excel Converter & Escape"]
    Md2Xlsx["Markdown to Excel Parser & Layout"]
    RagEngine["RAG Chunker, Glossary & Retriever"]
    Guards["Domain Guards & Errors"]
  end

  subgraph Outbound Adapters
    XlsxRead["XLSX File Reader (xlsxFiles.ts)"]
    XlsxWrite["XLSX File Writer (xlsxWriter.ts)"]
    MdScan["Filesystem Scanner (mdFolder.ts)"]
    Gemini["Gemini Client & SafeStorage (geminiClient.ts)"]
    ConvWorker["Converter Worker Process (converterWorker.ts)"]
  end

  Inbound Adapters --> Pure Domain
  Inbound Adapters --> Application & Ports
  Pure Domain --> Application & Ports
  Outbound Adapters --> Pure Domain
  Inbound Adapters --> Outbound Adapters
```

### Chi tiết các tầng:

1. **Domain (`src/main/domain/`)**:
   - Chứa 100% logic nghiệp vụ thuần tuý, độc lập với môi trường chạy (không phụ thuộc vào Electron API hay I/O trực tiếp).
   - `excel/`: Xử lý cấu trúc sheet, nhận diện bảng Backlog/thiết kế Nhật-Việt, gom nhóm header, xử lý merge cell ngang/dọc, escape Markdown.
   - `md2xlsx/`: Parser cú pháp Markdown sang SheetModel, layout cột theo độ rộng ký tự CJK/Latin, glyph measurement table.
   - `rag/`: Phân đoạn tài liệu (chunker), từ điển thuật ngữ chuyên ngành Nhật-Việt (glossary), thuật toán BM25 và hybrid retriever.
   - `errors.ts`, `guards.ts`: Chuẩn hoá thông điệp lỗi thân thiện người dùng và các quy tắc kiểm tra đường dẫn an toàn.

2. **Ports (`src/main/application/ports/`)**:
   - `workerProtocol.ts`: Định nghĩa thông điệp và giao thức IPC giữa main process và `utilityProcess` xử lý chạy nền.

3. **Adapters (`src/main/adapters/`)**:
   - **Inbound Adapters**:
     - `cli/`: Adapter giao diện dòng lệnh không giao diện (`cliCore.ts`).
     - `worker/`: Bộ tiếp nhận tác vụ trong worker process (`workerHandler.ts`, `mdHandler.ts`, `workbookCache.ts`).
   - **Outbound Adapters**:
     - `xlsxFiles.ts`: Đọc và phân tích file Excel từ đĩa bằng SheetJS.
     - `xlsxWriter.ts`: Ghi file Excel atomic xuống đĩa an toàn bằng ExcelJS và JSZip (ghi `.partial` trước khi hoàn tất).
     - `gemini/`: Adapter gọi Google Gemini AI REST API kết hợp mã hoá mật khẩu qua Electron SafeStorage.
     - `mdFolder.ts`: Adapter tương tác với hệ thống tệp để quét thư mục Markdown.
     - `converterWorker.ts`: Adapter quản lý tiến trình con Electron `utilityProcess`.

4. **Composition Root (`src/main/index.ts`)**:
   - Khởi tạo cửa sổ BrowserWindow, đăng ký giao thức scheme hình ảnh an toàn (`x2m-img:`), cấu hình bảo mật CSP, và kết nối các adapter với IPC handlers.

---

## 2. Nâng cấp UI/UX với Tailwind CSS v4 (Renderer)

### Kiến trúc Styling hiện đại:
- **Tailwind CSS v4 & @tailwindcss/vite**: Không cần file cấu hình `tailwind.config.js` phức tạp, tối ưu hóa thời gian build và giảm kích thước CSS đóng gói xuống còn ~40KB.
- **Design Tokens (`src/renderer/src/index.css`)**: Sử dụng directive `@theme inline` ánh xạ trực tiếp tới các biến CSS theo theme:
  - Nền & Thẻ: `bg-canvas`, `bg-soft`, `bg-raised`, `bg-hover`.
  - Màu viền: `border-line`, `border-line-subtle`.
  - Màu chữ: `text-ink`, `text-dim`, `text-faint`.
  - Màu nhấn (Accent) & Phản hồi: `accent`, `accent-soft`, `success`, `warning`, `danger`.
- **Component Primitives (`src/renderer/src/ui.ts`)**:
  - Đóng gói các lớp kiểu dáng chuẩn: `btn`, `btnPrimary`, `btnGhost`, `btnSm`, `btnMini`, `iconBtn`, `input`, `card`, `paneTitle`.
  - Cung cấp tiện ích ghép lớp `cx(...)` linh hoạt.
- **Bảo toàn E2E Hooks**:
  - Toàn bộ selector và hook DOM phục vụ kiểm thử (`x2m-*`, `.btn`, `.active`, `.selected`, `.collapsed`...) được giữ nguyên vẹn trong JSX, đảm bảo toàn bộ bộ test E2E hoạt động ổn định.
- **Tách biệt Markdown Styles (`src/renderer/src/markdown.css`)**:
  - Dành riêng cho nội dung Markdown xem trước (`.md-body`) và định dạng in/PDF (`@media print`).
