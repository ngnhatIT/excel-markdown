# Cấu hình dự án dùng chung (`x2m.json`)

Ngày: 2026-11-15 · Mục 11 trong danh sách mở rộng nghiệp vụ.

## Vì sao

Cả đội làm trên cùng một bộ tài liệu thiết kế (thường để trong Git). Hiện nay:

- Tùy chọn convert Excel → Markdown nằm trong `store.json` của từng máy. Hai người convert cùng file có thể
  ra `.md` khác nhau (front-matter, tách bảng, ô gộp dọc…), nên `git diff` có nhiều thay đổi không thật.
- Luật nhận diện viết cứng trong code: chữ mơ hồ (`AMBIGUOUS_RE`, `src/shared/specIndex.ts:23`), nhãn
  画面ID / 画面遷移 (`SCREEN_ID_LABELS`, `TRANSITION_LABELS`, `specIndex.ts:118-120`), động từ CRUD
  (`CRUD_VERBS`, `specIndex.ts:611`), cột khóa khi so sánh 新旧 (`ID_PRIORITY`, `src/shared/specDiff.ts:368`).
  Mẫu tài liệu của mỗi khách dùng từ khác (`画面コード`, `起票`, `項目コード`…), nên 影響調査, CRUD図,
  整合性チェック và so sánh bỏ sót.

Mục 5 (nhận diện loại tài liệu khác) sau này cũng cần chỗ khai báo theo dự án; file này là nền cho nó.

## Mục tiêu

1. Một file `x2m.json` đặt trong thư mục tài liệu, đưa vào Git, để cả đội convert ra cùng kết quả và dùng
   cùng luật nhận diện.
2. App, CLI và MCP đọc cùng một file, cùng một cách.
3. Luật trong file chỉ **cộng thêm** vào luật có sẵn.

## Không làm

- Không thay thế hay tắt luật có sẵn (không có `"replace": true`).
- Không cho viết regex trong file: mọi mục là chuỗi thường, so khớp nguyên văn. File đến từ thư mục người khác
  gửi; regex do người dùng viết có thể làm treo app (ReDoS).
- Không sửa `x2m.json` bằng giao diện trong app (người dùng sửa bằng editor; app chỉ đọc). Có nút mở file.
- Không đưa alias cột テーブル定義 / 項目定義 (`tableDef.ts`, `testDesign.ts`) vào đợt này: để mục 5.
- Không đồng bộ qua mạng.

## Điều phải tránh

- `x2m.json` hỏng hoặc sai kiểu làm app, CLI hoặc MCP lỗi hẳn. Sai thì bỏ qua phần sai, báo cảnh báo, chạy tiếp.
- Người dùng không biết kết quả đang chịu ảnh hưởng của file cấu hình.
- Đổi kết quả của người không có `x2m.json` (hành vi cũ phải giữ nguyên tuyệt đối).

## Các cách đã cân nhắc

- **A. File `x2m.json` trong thư mục tài liệu** — người dùng chọn. Nằm trong Git cùng tài liệu; app, CLI,
  MCP cùng đọc; không cần mạng.
- B. Xuất / nhập cài đặt trong app: cài đặt lệch dần giữa các máy, CLI và MCP không dùng được.
- C. Cấu hình trên server / ổ mạng: cần mạng, trái cam kết chạy offline.

## Định dạng file

```json
{
  "convert": {
    "includeSheetTitle": true,
    "skipDelSheets": true,
    "skipEmptySheets": true,
    "multiline": "br",
    "detectTwoColTables": false,
    "escapeMarkdown": true,
    "showFormulas": false,
    "frontMatter": true,
    "chunkRows": 50,
    "verticalMerge": "repeat",
    "alignTables": false
  },
  "rules": {
    "ambiguousWords": ["要調整", "別途"],
    "screenIdLabels": ["画面コード"],
    "transitionLabels": ["遷移先"],
    "crudVerbs": { "C": ["起票"], "R": [], "U": ["差戻し"], "D": ["破棄"] },
    "diffKeyColumns": ["項目コード"]
  }
}
```

- Mọi khóa đều tùy chọn. Khóa lạ: bỏ qua, có cảnh báo (bắt lỗi gõ sai tên).
- `convert`: đúng các khóa của `ConvertOptions` (`src/shared/types.ts`) **trừ `range`** (vùng ô là theo từng
  file, không theo dự án). Giá trị sai kiểu: bỏ khóa đó, cảnh báo.
- `rules.*`: mảng chuỗi, mỗi chuỗi 1–40 ký tự, tối đa 200 mục mỗi danh sách. So khớp sau `NFKC` + chữ thường,
  giống cách code hiện chuẩn hóa nhãn.
- File tối đa 256 KB; lớn hơn thì bỏ qua cả file, cảnh báo.
- UTF-8, cho phép BOM. JSON chuẩn (không comment).

## Tìm file

Một hàm thuần dùng chung: `findProjectConfig(startDir)` đi từ `startDir` lên thư mục cha, dừng ở:
- thư mục đầu tiên có `x2m.json` → dùng file đó;
- hoặc thư mục có `.git` (gốc repo) mà không có `x2m.json` → không có cấu hình;
- hoặc gốc ổ đĩa → không có cấu hình.

Đi lên giúp một repo có `x2m.json` ở gốc áp dụng cho mọi thư mục con (`docs/基本設計/`, `docs/out/`…).

| Nơi dùng | `startDir` |
|---|---|
| Đọc Markdown: bản đồ thiết kế, 影響調査, CRUD, 整合性チェック | thư mục đang mở |
| Excel → Markdown (app) | thư mục xuất |
| So sánh 新旧 | thư mục chứa file **mới** |
| CLI convert | thư mục của `-o` (không có `-o` thì thư mục hiện tại) |

**Không áp dụng `convert`** cho `textconv` và cho So sánh file Excel: cả hai dùng `workbookMarkdownForDiff`
(`src/main/adapters/outbound/workbookText.ts`), cố ý convert cố định (mọi sheet, `DEFAULT_OPTIONS`) để diff không
phụ thuộc máy hay cấu hình. Git còn chạy textconv từ gốc repo với file tạm, nên tìm theo thư mục không có nghĩa.
So sánh vẫn áp dụng `rules` (cột khóa).
| CLI / MCP `impact`, `lint`, `crud` | thư mục `root` |

## Áp dụng

**Luật (`rules`)**: `buildSpecIndex(docs, rules?)` và `diffSpecMarkdown(old, new, rules?)` nhận thêm tham số tùy
chọn. Không truyền thì giữ nguyên hành vi cũ. Mục trong `rules` được gộp với luật có sẵn:
- `ambiguousWords`: thêm vào phép kiểm chữ mơ hồ (so khớp chuỗi con, đã escape).
- `screenIdLabels`, `transitionLabels`: thêm vào hai `Set` nhãn.
- `crudVerbs`: thêm vào phép kiểm từng thao tác (chuỗi con).
- `diffKeyColumns`: xếp **trước** `ID_PRIORITY` có sẵn (cột khai báo được ưu tiên khi bảng có cả hai).

Viewer IPC (`mdv:specIndex`) dùng `rules` làm một phần khóa cache (đổi `x2m.json` thì tính lại chỉ mục).

**Tùy chọn convert (`convert`)**:
- App: khi thư mục xuất có cấu hình, các tùy chọn có trong file **bị khóa** theo file (control mờ, nhãn
  "Theo x2m.json của dự án" + nút mở file). Tùy chọn không có trong file vẫn chỉnh được như cũ. Đổi thư mục
  xuất thì tìm lại. Giá trị trong `store.json` của người dùng không bị ghi đè (bỏ cấu hình dự án là về như cũ).
- CLI: giá trị trong file làm mặc định; các cờ hiện có áp lên trên như cũ (cờ nào cũng đặt một giá trị cố
  định, nên chỉ cần đổi điểm xuất phát của `parseArgs` từ `DEFAULT_OPTIONS` sang `DEFAULT_OPTIONS + config`).
  Cờ mới `--no-config`: bỏ qua `x2m.json` (script cần kết quả không phụ thuộc file). Không thêm cờ đảo chiều.
- MCP `convert_excel`: như CLI.

**Thông báo**: chỗ nào đang áp dụng cấu hình dự án thì hiện đường dẫn file (thanh trạng thái của Đọc Markdown,
khung tùy chọn của Excel → Markdown, đầu kết quả So sánh). CLI in một dòng ra stderr. MCP (`convert_excel`,
`impact`, `lint`, `crud`) thêm dòng đường dẫn + cảnh báo vào chữ kết quả (client MCP không hiện stderr).
Cảnh báo (khóa lạ, sai kiểu, JSON hỏng) hiện kèm ở cùng chỗ.

## Quyết định của người làm (sau review)

- CRUD: động từ được kiểm trong `crudMatrix`, không lúc dựng chỉ mục → lưu `rules` trên `SpecIndex` để `crudMatrix` dùng.
- Excel → Markdown: tìm lại cấu hình ngay trước khi convert (thư mục xuất có thể được chọn lúc bấm Convert).
- So khớp: nhãn và cột khóa khớp nguyên văn sau chuẩn hóa; chữ mơ hồ và động từ CRUD khớp chuỗi con.
- `config:find` chỉ kiểm thư mục tuyệt đối đang tồn tại (thư mục xuất / thư mục file so sánh không nằm trong
  danh sách thư mục đã mở của viewer); nó chỉ đọc đúng file `x2m.json`, nên không mở rộng quyền đọc.

## Kiến trúc

- `src/shared/projectConfig.ts` (thuần): kiểu `ProjectConfig`, `parseProjectConfig(text) → { config, warnings }`.
  Test kỹ ở đây: JSON hỏng, sai kiểu, khóa lạ, quá dài, quá nhiều mục, BOM.
- `src/main/adapters/outbound/projectConfigFile.ts`: `findProjectConfig(startDir)` đọc file, gọi parse.
  Kết quả trả về renderer qua IPC mới `config:find(dir)` (kiểm `dir` là thư mục tuyệt đối như các IPC khác).
- Renderer không tự đọc file; nút "mở file" dùng `shell.openPath`, nhưng chỉ cho đúng đường dẫn `x2m.json` mà
  main vừa tìm ra (không mở được file bất kỳ).

## Kiểm thử

- Test thuần cho `parseProjectConfig` và cho từng luật cộng thêm (`buildSpecIndex`, `diffSpecMarkdown`, `crudOpsOf`).
- Test `findProjectConfig` với thư mục tạm: tìm ở thư mục cha, dừng ở `.git`, không có file.
- Test hồi quy: toàn bộ golden test hiện có chạy không cấu hình phải giữ nguyên kết quả.
- Test CLI: `x2m a.xlsx -o dir` với `dir/x2m.json` bật front-matter; cờ dòng lệnh ghi đè.

## Tài liệu

README: mục mới "Cấu hình dự án (x2m.json)", ví dụ đầy đủ, bảng "tìm ở đâu". CHANGELOG mục chưa phát hành.

## Để người làm tự quyết

- Tên hàm, cách hiện control bị khóa trong `OptionsPanel` (theo style hiện có).
- Chi tiết escape khi gộp chữ mơ hồ vào regex có sẵn (hoặc kiểm riêng bằng `includes`).
- Chữ i18n (vi / en / ja) cho nhãn và cảnh báo.
