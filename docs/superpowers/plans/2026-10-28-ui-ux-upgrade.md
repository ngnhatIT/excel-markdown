# UI/UX Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chế độ Đọc Markdown có mục "Mới sửa", sort Tên/Ngày sửa, ngày sửa trên từng file, dán Markdown từ clipboard để xem; giao diện ba chế độ gọn và đẹp hơn.

**Architecture:** Lượt quét thư mục (`listMarkdownFiles`) trả thêm mtime từng file. Logic sắp xếp, chọn "Mới sửa", định dạng ngày là hàm thuần trong `src/shared/mdView.ts` (test bằng vitest). Hook `useMdViewer` giữ trạng thái sort và bản dán; `MdTreeList` chỉ hiển thị. Phần "gọn và đẹp" chỉ đổi CSS.

**Tech Stack:** Electron, React, TypeScript, vitest (`npm test`), E2E `npm run e2e` (`scripts/e2e.mjs`).

**Spec:** `docs/superpowers/specs/2026-10-28-ui-ux-upgrade-design.md`

## Global Constraints

- `MD_LIST_LIMIT` = 5000 giữ nguyên; quét không được chậm rõ rệt.
- Giữ nguyên: lọc theo tên, cây thư mục, thu gọn thư mục, file mở lẻ, quét lại, kéo thả, phím ↑/↓.
- "Mới sửa" hiện 6 file. File không có mtime (mở lẻ, hoặc stat lỗi) không có ngày và không vào "Mới sửa".
- Sort chỉ có Tên (mặc định, như hiện nay) và Ngày sửa (giảm dần); ngày bằng nhau xếp theo tên tăng dần; thư mục luôn đứng trước file và xếp theo tên. Không lưu lựa chọn sort.
- Ngày tương đối: "vừa xong" (dưới 1 phút hoặc ở tương lai), "N phút", "N giờ", "hôm qua", "N ngày" (tối đa 30 ngày), quá đó hiện ngày đầy đủ `dd/MM/yyyy`. Tooltip: ngày giờ đầy đủ.
- Bản dán: mục "Dán từ clipboard", không ghi đĩa, thay bản dán trước, không lưu vào `persist('viewerFile', ...)`.
- Giữ nguyên cấu trúc DOM và tên class/selector hiện có (62 E2E); chỉ thêm class mới.
- Comment và text giao diện bằng tiếng Việt như code xung quanh.

## Review Focus

- Mtime trùng nhau hoặc thiếu: thứ tự ổn định theo tên, file thiếu mtime không vào "Mới sửa".
- Ô lọc không khớp file nào trong "Mới sửa": ẩn mục đó, không hiện tiêu đề rỗng.
- Clipboard rỗng hoặc từ chối quyền: toast lỗi, không đổi tài liệu đang xem.
- Dán, rồi chọn file, rồi dán lại: không để lại đường dẫn giả trong `viewerFile` đã lưu; link/ảnh tương đối trong bản dán không làm app điều hướng.
- Đóng thư mục: "Mới sửa" biến mất; thu gọn thư mục không làm mất file khỏi "Mới sửa".
- Tên file có dấu tiếng Việt và số (`file2.md` trước `file10.md`) vẫn sort đúng.

---

### Task 1: Quét thư mục trả mtime

**Files:**
- Modify: `src/main/mdFolder.ts`, `src/main/index.ts` (handler `mdv:list`, ~dòng 482), `src/types.ts` (`MdFolderListing`)
- Test: `src/main/mdFolder.test.ts`

**Interfaces:**
- Produces: `listMarkdownFiles(root, limit?) -> Promise<{ files: string[]; mtimes: Record<string, number>; truncated: boolean }>`; `MdFolderListing.mtimes: Record<string, number>` (khóa là đường dẫn tương đối trong `files`, giá trị là `mtimeMs`; file stat lỗi thì không có khóa).

- [ ] **Step 1: Write the failing test** trong `mdFolder.test.ts`: `it('trả mtimeMs của từng file')` — tạo cây bằng `makeTree()`, `utimesSync` đặt `docs/a.md` về `new Date(2020,0,1)`, kiểm tra `res.mtimes['docs/a.md']` bằng `new Date(2020,0,1).getTime()` và `Object.keys(res.mtimes).sort()` bằng `res.files.sort()`.
- [ ] **Step 2: Run** `npx vitest run src/main/mdFolder.test.ts` — Expected: FAIL (`mtimes` undefined).
- [ ] **Step 3: Implement** trong `listMarkdownFiles`: sau khi gom file của một thư mục, `stat` song song bằng `Promise.all`; lỗi từng file thì bỏ qua khóa đó. Thêm `mtimes` vào kết quả (cả nhánh `truncated`), vào `MdFolderListing` (có comment tiếng Việt), và vào `listing` ở `mdv:list`.
- [ ] **Step 4: Run** `npm test` — Expected: PASS toàn bộ (kể cả test cũ của `listMarkdownFiles`).
- [ ] **Step 5: Commit** `feat(mdv): quét thư mục trả mtime từng file`

### Task 2: Hàm thuần: sort cây, "Mới sửa", ngày tương đối

**Files:**
- Modify: `src/shared/mdView.ts`
- Test: `src/shared/mdView.test.ts`

**Interfaces:**
- Produces:
  - `export type MdSort = 'name' | 'date'`
  - `buildMdTree(relPaths: string[], sort?: MdSort, mtimes?: Record<string, number>): MdTreeNode[]` (mặc định `'name'`, hành vi cũ không đổi)
  - `recentMdFiles(relPaths: string[], mtimes: Record<string, number>, n = 6): string[]` (giảm dần theo mtime, trùng thì theo tên tăng dần, bỏ file không có mtime)
  - `formatRelativeTime(mtimeMs: number, nowMs: number): string` (theo Global Constraints)

- [ ] **Step 1: Write failing tests** trong `mdView.test.ts`: (a) `buildMdTree(['b.md','a.md','d/x.md'], 'date', {'a.md':1,'b.md':2,'d/x.md':3})` ra thư mục `d` trước rồi `b.md`, `a.md`; (b) mtime bằng nhau xếp theo tên; (c) `recentMdFiles` lấy đúng n, bỏ file thiếu mtime; (d) `formatRelativeTime` các mốc: 30 giây trước → `'vừa xong'`, tương lai → `'vừa xong'`, 5 phút → `'5 phút'`, 3 giờ → `'3 giờ'`, hôm qua → `'hôm qua'`, 4 ngày → `'4 ngày'`, 40 ngày → chuỗi `dd/MM/yyyy`.
- [ ] **Step 2: Run** `npx vitest run src/shared/mdView.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** ba hàm trong `mdView.ts`; "hôm qua" tính theo ngày lịch (so `toDateString` với hôm nay trừ 1 ngày), "N ngày" khi từ 2 đến 30 ngày trôi qua.
- [ ] **Step 4: Run** `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(mdv): hàm thuần sort cây, mục Mới sửa, ngày tương đối`

### Task 3: Hook `useMdViewer`: mtime, sort, dán Markdown

**Files:**
- Modify: `src/renderer/src/hooks/useMdViewer.ts`
- Test: `src/renderer/src/hooks/` không có test hook sẵn; kiểm bằng `npm run typecheck` và E2E ở Task 6.

**Interfaces:**
- Consumes: Task 1 (`res.mtimes`), Task 2 (`buildMdTree`, `recentMdFiles`, `MdSort`).
- Produces (thêm vào giá trị trả về): `mtimes: Record<string, number>`, `sort: MdSort`, `setSort(s: MdSort): void`, `recent: string[]` (đường dẫn tương đối, đã áp ô lọc), `pasteText(text: string): void`, `export const PASTE_PATH = 'clipboard:paste'`.

- [ ] **Step 1: Implement** `mtimes`/`sort` state; `openFolder` lưu `res.mtimes`; `closeFolder` xóa chúng; `tree = buildMdTree(relFiles, sort, mtimes)`; `recent = recentMdFiles(...)` rồi lọc theo `filter` giống `visible`. `visible` (↑/↓) giữ nguyên thứ tự cây.
- [ ] **Step 2: Implement `pasteText`**: `setDoc({ path: PASTE_PATH, loading: false, error: '', markdown: text })`, tăng `readSeq` để hủy đọc file đang dở, KHÔNG gọi `persist`.
- [ ] **Step 3: Verify** `npm run typecheck` — Expected: không lỗi kiểu; `npm test` PASS.
- [ ] **Step 4: Commit** `feat(mdv): hook giữ mtime, sort và bản dán`

### Task 4: `MdTreeList` + wiring `App.tsx`

**Files:**
- Modify: `src/renderer/src/components/MdTreeList.tsx`, `src/renderer/src/App.tsx` (khối `isView`, ~dòng 663-700; handler chọn file của viewer ~dòng 538-583), `src/renderer/src/styles.css` (class mới, thêm cạnh khối `.x2m-tree*` ~dòng 1099)

**Interfaces:**
- Consumes: Task 3 (`recent`, `mtimes`, `sort`, `setSort`, `pasteText`, `PASTE_PATH`).
- Produces: props mới của `MdTreeList`: `recent: string[]`, `mtimes: Record<string, number>`, `sort: MdSort`, `onSortChange: (s: MdSort) => void`, `onPaste: () => void`.

- [ ] **Step 1: Implement UI** trong `MdTreeList`: ô lọc giữ vị trí; dưới đó, nếu `recent.length > 0` thì mục "Mới sửa" (tiêu đề `.x2m-tree-group`) liệt kê `recent` bằng `fileRow` kèm ngày bên phải; mục "Tất cả" có tiêu đề kèm hai nút sort Tên/Ngày sửa (`aria-pressed`); cây như cũ. Mỗi `fileRow` hiện `formatRelativeTime(mtimes[rel], Date.now())` (class `.x2m-tree-date dim`, `title` = ngày giờ đầy đủ) khi có mtime. Nút "Dán Markdown" trong `.x2m-tree-actions` gọi `onPaste`. Khi đang lọc, chỉ danh sách phẳng như cũ cộng "Mới sửa" đã lọc.
- [ ] **Step 2: Implement `App.tsx`**: truyền props mới; `onPaste` = `navigator.clipboard.readText()`, rỗng hoặc lỗi → `toast('Clipboard trống hoặc không đọc được', 'err')`, ngược lại `viewer.pasteText(text)`. `viewerTitle` hiện "Dán từ clipboard" khi `doc.path === PASTE_PATH`; `resolveViewerImage` và `viewerLinkClick` trả "không xử lý" (không phân giải, không điều hướng) khi path là `PASTE_PATH`; `selectedPath` của cây không khớp hàng nào khi đang xem bản dán.
- [ ] **Step 3: Verify** `npm run typecheck`, `npm test` — Expected: PASS.
- [ ] **Step 4: Commit** `feat(mdv): mục Mới sửa, sort, ngày sửa, dán Markdown`

### Task 5: Làm gọn và đẹp cả ba chế độ

**Files:**
- Modify: `src/renderer/src/styles.css` (chỉ CSS; component chỉ đổi khi bắt buộc)

- [ ] **Step 1: Chụp trước**: chạy app (`npm run dev`), chụp màn hình ba chế độ ở cỡ cửa sổ mặc định, giữ làm mốc so sánh.
- [ ] **Step 2: Chỉnh CSS** cho nhất quán giữa ba chế độ: khoảng cách và cỡ chữ cột trái/header/thanh nút, nhóm các nút nhỏ (`x2m-move-btn`, `icon-btn`) cho đều, hover/selected rõ hơn, mục `.x2m-tree-group` và `.x2m-tree-date` của Task 4 đồng bộ kiểu. Giữ biến màu hiện có (`var(--accent)`, `var(--bg-hover)`...), đọc rõ ở mọi theme hiện có.
- [ ] **Step 3: Verify** chụp lại ba chế độ, so với mốc, không có chữ bị cắt hoặc chồng; `npm test` PASS.
- [ ] **Step 4: Commit** `style: gọn và đồng nhất giao diện ba chế độ`

### Task 6: E2E và hoàn tất

**Files:**
- Modify: `scripts/e2e.mjs` (cuối khối "Đọc Markdown", ~dòng 395-425), tài liệu mô tả E2E nếu có (số test)

- [ ] **Step 1: Thêm check** theo kiểu `check(...)`/`waitFor` sẵn có, sau khi thả thư mục fixture: (a) có tiêu đề "Mới sửa" và ít nhất một hàng có `.x2m-tree-date`; (b) bấm nút sort "Ngày sửa" → `aria-pressed="true"` và thứ tự file trong "Tất cả" đổi đúng theo mtime fixture; (c) ô lọc một chuỗi không khớp → mục "Mới sửa" ẩn; (d) giả lập `navigator.clipboard.readText = async () => '# Dán\n'` rồi bấm "Dán Markdown" → `.md-body h1` là "Dán" và không có hàng cây nào `selected`; (e) clipboard rỗng → toast lỗi, tài liệu cũ giữ nguyên.
- [ ] **Step 2: Run** `npm test` và `npm run e2e` — Expected: toàn bộ PASS (463+ unit, 62+ E2E).
- [ ] **Step 3: Commit** `test(e2e): Mới sửa, sort ngày, dán Markdown`
