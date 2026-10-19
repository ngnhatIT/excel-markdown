# Kiến trúc ExcelToMarkdown

Electron + TypeScript + React (electron-vite). UI tiếng Việt, 2 theme.

## Luồng dữ liệu

```
Renderer (React) --IPC--> Main (Node) --message--> Worker (utilityProcess, SheetJS / exceljs)
     ^                      |   ^                        |
     |                      |   +---- Markdown ----------+   Excel -> Markdown
     +-- preview/kết quả ---+--> ghi file .md
     |                      |   +---- .xlsx (đã ghi) ----+   Markdown -> Excel
     |                      +--> hỏi ghi đè (dialog)
```

Hai chiều dùng chung một khung (renderer → IPC → main → utilityProcess):
Excel → Markdown (SheetJS đọc) và Markdown → Excel (marked parse + exceljs ghi, từ 2.2.0).

- **Renderer** (`src/renderer/`): chọn file, tick sheet, xem preview (rendered/source),
  chỉnh options, bấm convert / Hủy. Không đụng filesystem trực tiếp.
  - `App.tsx` — state chính + ghép component; giữ chế độ hiện tại (`AppMode`:
    `excel2md` | `md2excel`, lưu vào store) và nhánh tạo file Excel.
  - `components/` — Header (có **công tắc chế độ** Excel → Markdown | Markdown → Excel),
    FileList, PreviewPane, ResultsPanel, OptionsPanel, Footer, Toasts, icons;
    chế độ Markdown → Excel thêm `MdFileList` (danh sách file `.md`: số sheet, Tải lại, ↑/↓, xóa)
    và `MdOptionsPanel` (ô "Tên file Excel").
  - `hooks/` — `useFiles` (file + sheet + nhớ lựa chọn), `useMdFiles` (danh sách file `.md`:
    thêm/xóa/đổi thứ tự, đọc nhanh từng file qua `md:inspect`; `reload(id)` đọc lại một file khi
    người dùng bấm Tải lại — không theo dõi file tự động), `usePreview` (debounce +
    generation guard), `useShortcuts` (phím tắt).
  - `api.ts` — kiểu `window.api`; `sanitize.ts` lọc HTML preview (chống XSS từ nội dung ô).
  - CSP (chỉ bản build, chèn trong `electron.vite.config.ts`): chỉ tài nguyên trong app,
    không inline script, không tải mạng.
- **Shared** (`src/shared/`): code thuần dùng chung renderer và main (không import module
  riêng của Node). `workbookName.ts` — tên workbook mặc định khi Markdown → Excel (phần
  trước `__` chung của các file, không có thì `# tiêu đề` file đầu, không có thì tên file đầu).
- **Preload** (`src/preload/`): bridge tối thiểu qua contextBridge (`window.api`): dialog,
  store, listSheets, previewSheet, convert, cancelConvert, openPath, getVersion,
  getPathForFile; Markdown → Excel: openMarkdownFiles, inspectMarkdown, convertMarkdown
  (Hủy dùng lại cancelConvert).
- **Main** (`src/main/index.ts`): BrowserWindow, IPC handlers, ghi file output, store
  JSON, log lỗi, nhớ bounds cửa sổ. **Không nạp SheetJS, không nạp exceljs.**
  - IPC Markdown → Excel: `dialog:openMarkdownFiles` (hộp thoại chọn `.md`/`.markdown`),
    `md:inspect` (đọc nhanh một file `.md`: tiêu đề, tên sheet sẽ tạo, nội dung preview; chạy
    ở worker preview, IPC chỉ nhận đường dẫn tuyệt đối đuôi `.md`/`.markdown`), `md:convert` (gộp danh sách file thành một
    `.xlsx` trong thư mục xuất; chạy ở worker convert).
    `md:convert` kiểm file/đường dẫn, dùng chung cờ `convertRunning` với Excel → Markdown
    (mỗi lúc chỉ một lần convert), **hỏi ghi đè** bằng hộp thoại `Ghi đè` / `Hủy` khi file
    đích đã có (`Hủy` → kết quả `declined`, không đụng file cũ, không lỗi), rồi gọi worker.
    Hủy giữa chừng kill worker và dọn `<file>.xlsx.partial`.
  - `converterWorker.ts` — client tới worker: request/response theo id, tự khởi động
    lại, `cancel()` = kill process (parse SheetJS đồng bộ, không ngắt giữa chừng được).
    Hai instance: preview/liệt kê sheet (cache 3 workbook) và convert (cache 1), để
    preview không chờ convert hàng loạt và Hủy không ảnh hưởng preview.
  - `output.ts` — escape Markdown inline, ghép file per-workbook, tên file an toàn.
  - `errors.ts` — map lỗi kỹ thuật sang tiếng Việt.
  - `guards.ts` — chỉ cho reload đúng trang (chặn mọi điều hướng khác), chỉ mở ngoài
    URL http/https/mailto, `openPath` chỉ nhận thư mục.
- **Worker** (`src/main/worker.ts` → `out/main/worker.js`, utilityProcess):
  - `workerHandler.ts` — xử lý listSheets / preview / convert (thuần, có test).
  - `workerProtocol.ts` — type request/response (main chỉ import type). Yêu cầu Markdown →
    Excel: `mdInspect` (path → `MdInspectResult`: title, tên sheet, markdown) và `mdToXlsx`
    (files + outPath → outPath + tên sheet). Cũng chứa `PARTIAL_SUFFIX` (hậu tố file tạm
    `.partial`) để main dọn file tạm khi Hủy mà không kéo exceljs vào main.
  - `md2xlsx/mdHandler.ts` — `worker.ts` chuyển `mdInspect`/`mdToXlsx` sang `handleMdRequest`
    (không bao giờ ném: lỗi thành phản hồi `ok: false` với thông báo tiếng Việt). **exceljs
    chỉ được nạp bằng `import('./write')` động khi có `mdToXlsx`**; preview và mọi yêu cầu
    Excel → Markdown không trả giá nạp exceljs.
  - `workbookCache.ts` — LRU workbook đã parse, kiểm tra mtime + size mỗi lần lấy.
  - `converter.ts` — engine thuần (không phụ thuộc Electron): đọc cell qua SheetJS,
    nhận diện banner 基本設計 / meta / section / bảng, render Markdown.

## Engine converter (tóm tắt)

1. `sheetToGrid`: đọc cell trong `effectiveRange` (góc trên-trái theo `!ref`, góc
   dưới-phải cắt về ô có nội dung cuối — `!ref` của Excel có thể phình theo vùng định
   dạng) thành string[][], escape Markdown/HTML inline từng ô (`escapeMarkdownInline`),
   lan merge **dọc** (trừ dòng banner).
2. `sheetToMarkdown`: duyệt từng dòng —
   banner 基本設計 → quote + bảng version;
   dòng meta (機能ID/画面ID/...) → bullet, dòng nối tiếp → sub-bullet;
   `【...】`/`■...` → `###`; dòng 1 ô trên bảng → `###`;
   bảng (No/№/項番 hoặc heuristic) → bảng Markdown, bỏ cột trống;
   còn lại → quote/text. Block mới sau sub-bullet luôn cách 1 dòng trống.
3. Ô: hyperlink → `[text](url)`, nhiều dòng → `<br>`, `|` → `\|`,
   công thức → giá trị cache, lỗi → nguyên văn; text đứng đầu dòng (đoạn văn, quote,
   sub-bullet) escape thêm cú pháp block (`# `, `> `, `- `, `1. `, `---`).
   Khoảng trắng ASCII gộp, toàn角 (U+3000) giữ.

## Engine Markdown → Excel (`src/main/md2xlsx/`, tóm tắt)

Thuần Node (test được không cần Electron); `write.ts` là module duy nhất nạp exceljs.
Thiết kế và quyết định: `docs/superpowers/specs/2026-10-19-md-to-excel-design.md`.

| Module | Việc |
|---|---|
| `model.ts` | Mô hình trung gian: `SheetModel` { tên, `Block[]` } với block banner / table / meta / heading / note / paragraph / code; `XCell` (chữ + link tuỳ chọn). |
| `inline.ts` | Token inline của `marked` → chữ hiển thị của ô (chiều ngược của `escapeMarkdownInline`); cả ô là một link http/https/mailto thì giữ link. |
| `cellValue.ts` | Quy tắc giá trị ô: `10` số, `1.0`/`1.10` số + format `0.0`/`0.00`, `1,234` → `#,##0`, `1,234.50` → `#,##0.00` (số chữ số thập phân theo chữ), `12.50%` → số/100 + `0.00%`; `0001`, số > 11 chữ số, ngày, `#N/A`... giữ text. |
| `parse.ts` | `parseMarkdownFile(md, fileName)` → `{ title, sheets }`: tách sheet (ranh giới file và `---` ngoài cùng, `##` đầu phần là tên sheet), nhận banner 基本設計, bảng, meta `**label**:`/`**label**：` (chỉ trong list không đánh số; list đánh số luôn giữ `N. `), section, ghi chú, đoạn văn, list, code; `<br>` trong khối HTML thành xuống dòng. Không crash với Markdown bất kỳ. |
| `names.ts` | `assignSheetNames`: tên sheet hợp lệ (ký tự cấm `[]:*?/\` và `'` ở đầu/cuối thành `_`; ký tự điều khiển cấm của XML bị bỏ; ≤ 31 ký tự; không trùng → ` (2)`; `History` → `History_`). |
| `layout.ts` | Độ rộng hiển thị cho độ rộng cột (CJK = 2); ước lượng số dòng của ô merge theo kiểu chữ (`body` 游ゴシック 10, `bold` nhãn meta, `heading` 游ゴシック 12 đậm, `code` MS Gothic 10 đơn cách — bề rộng glyph đo bằng Excel thật; mô phỏng Excel xuống dòng sau khoảng trắng và sau dấu `-` (một dấu `-` cuối dòng được treo)); `splitByLines` tách đoạn quá cao thành nhiều hàng. |
| `glyphTable.ts` | Dữ liệu đo (sinh tự động, không sửa tay): ký tự BMP ngoài ASCII mà Excel hiển thị rộng hơn 1em (⟶ ⸻ U+FDFD, chữ Ấn/Đông Nam Á…); `layout.ts` cộng thêm emoji `\p{Emoji_Presentation}` (✅ ❌ ⭐ ⌛…) tính 20px. |
| `write.ts` | `buildWorkbook(sheets)` ghi bố cục (font 游ゴシック 10, màu, viền, merge, wrap, A4 ngang vừa 1 trang rộng; chiều cao dòng = **16.5pt × số dòng**, đo bằng Excel thật; heading và từng dòng code cũng merge A..cột cuối + tự xuống dòng (heading 19.5pt/dòng, code MS Gothic 12pt/dòng + 1.5, tối thiểu 15) để không bị cắt khi in; hàng ≤ 409.5pt nên đoạn / heading / dòng code dài tách thành nhiều hàng merge liền nhau). `saveWorkbook` chèn `ignoredErrors` (không tam giác xanh) vào XML từng sheet bằng JSZip, ghi `.partial` rồi đổi tên. |
| `mdHandler.ts` | `handleMdRequest`: `mdInspect` / `mdToXlsx`. Một file lỗi (không đọc được, hoặc không phải UTF-8) → dừng, chưa ghi gì. |

Luồng `mdToXlsx`: đọc + parse từng file theo thứ tự danh sách → `assignSheetNames` trên toàn bộ
sheet (trùng tên giữa các file cũng thành `Tên (2)`) → `buildWorkbook` → `saveWorkbook`.

Ràng buộc: exceljs 4.4.0 **chỉ để ghi** file do app tạo, không bao giờ đọc file ngoài (test
chỉ đọc lại buffer do chính code tạo, bằng SheetJS). `out/main/index.js` không được chứa
`require("exceljs")`. Output Excel → Markdown (`test/golden/*.md`, `*.sheets.json`) không đổi.

Kiểm bằng Excel thật: `scripts/xlsx-snapshot.ps1` (xem README) mở file bằng COM, báo
`REPAIRED` nếu Excel đòi sửa file, và chụp ảnh từng sheet để review bố cục.

## Quy ước

- Mỗi thay đổi: typecheck + test xanh mới commit. Regression: golden test
  (`src/main/golden.test.ts`, file mẫu `test/fixtures`, output `test/golden`);
  đổi output có chủ ý thì `npm run test:update` và review diff `test/golden`.
  Chiều Markdown → Excel: `src/main/md2xlsx/golden.test.ts` (golden JSON `test/golden-md2xlsx`
  + round-trip với Markdown do app tạo); **không** sửa `test/golden` để chiều này ổn định hơn.
- Đổi UI / IPC / main: chạy `npm run e2e` (build + điều khiển app Electron thật qua
  DevTools Protocol, `scripts/e2e.mjs`). Cần màn hình, không chạy trong CI.
- Xem BACKLOG.md (kế hoạch 200 vòng), PROGRESS.md (tiến độ), AUDIT.md (báo cáo audit).
