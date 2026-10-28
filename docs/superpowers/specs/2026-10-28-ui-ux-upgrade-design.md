# Nâng cấp UI/UX: Đọc Markdown (sort, "Mới sửa", sao chép) và giao diện gọn hơn

## Vì sao

Khi mở thư mục có nhiều file Markdown, người dùng tìm file theo tên nhưng không biết file nào mới nhất, danh sách không sắp xếp được. Khung xem chưa có cách sao chép mã nguồn Markdown. Người dùng cũng thấy giao diện chung cần gọn và đẹp hơn, bố cục dễ dùng hơn.

## Mục tiêu

1. Trong chế độ Đọc Markdown, thấy ngay file sửa gần nhất của thư mục.
2. Sắp xếp được danh sách file theo Tên hoặc Ngày sửa.
3. Mỗi file hiện ngày sửa.
4. Dán mã Markdown từ clipboard vào chế độ Đọc Markdown để xem bản render mà không cần có file.
5. Giao diện cả ba chế độ (Excel → Markdown, Markdown → Excel, Đọc Markdown) gọn, đẹp, nhất quán hơn.

## Không làm

- Không lọc theo nội dung bên trong file (người dùng chỉ lọc theo tên).
- Không đổi logic chuyển đổi, đọc Excel, hay xuất file.
- Không làm lại bố cục tổng thể của ba chế độ; chỉ chỉnh cho gọn và đẹp.

## Điều không được xảy ra

- Quét thư mục chậm hơn rõ rệt hoặc treo app trên thư mục lớn (giới hạn hiện tại `MD_LIST_LIMIT` = 5000 file giữ nguyên).
- Mất các tính năng đang có: lọc theo tên, cây thư mục, thu gọn thư mục, file mở lẻ, quét lại, kéo thả.

## Đã quyết (theo người dùng)

- Bố cục danh sách file (phương án C trong mockup): cột trái có ô lọc theo tên ở trên cùng; mục "Mới sửa" cố định phía trên; bên dưới là mục "Tất cả" dạng cây thư mục.
- Sort nằm ở tiêu đề mục "Tất cả", gồm Tên và Ngày sửa.
- Mỗi file hiện ngày sửa dạng tương đối (ví dụ "2 giờ", "hôm qua").
- Nút "Copy" đã có sẵn ở khung xem (sao chép mã nguồn file đang mở) nên giữ nguyên. Điều người dùng thiếu là dán Markdown vào để xem (người dùng xác nhận bằng "ok"; ý này tôi suy ra, hỏi lại nếu sai).
- Làm gọn và đẹp cho cả ba chế độ để giao diện đồng nhất; sort, "Mới sửa" và nút sao chép chỉ thuộc chế độ Đọc Markdown.

## Tôi quyết (người dùng chưa duyệt từng điểm)

- "Mới sửa" hiện 6 file.
- Ô lọc áp dụng cho cả "Mới sửa" và "Tất cả". Khi đang lọc, danh sách phẳng hiện đường dẫn tương đối như hiện nay. Phím ↑/↓ đi theo thứ tự của cây và bỏ qua mục trùng trong "Mới sửa".
- Sort Ngày sửa: chỉ giảm dần. Trong cây, thư mục vẫn đứng trước file, thư mục xếp theo tên; file cùng ngày xếp theo tên tăng dần. Không nhớ lựa chọn sort sau khi đóng app.
- Ngày tương đối: "vừa xong", "N phút", "N giờ", "hôm qua", "N ngày", quá 30 ngày thì hiện ngày đầy đủ. File có ngày ở tương lai (lệch đồng hồ) hiện "vừa xong". Tooltip hiện ngày giờ đầy đủ.
- File mở lẻ (ngoài thư mục) không có ngày sửa và không vào "Mới sửa".
- Thư mục quá `MD_LIST_LIMIT` file: "Mới sửa" chỉ tính trong số file đã quét, dùng cảnh báo cắt bớt có sẵn.
- Ngày sửa lấy cùng lượt quét; chỉ cập nhật khi quét lại thư mục.
- Dán Markdown: nút "Dán Markdown" trong cột trái chế độ Đọc Markdown; đọc clipboard, hiện một mục "Dán từ clipboard" (không lưu ra đĩa, thay thế bản dán trước) và render bằng khung xem hiện có. Ảnh/link tương đối trong bản dán không phân giải được. Clipboard rỗng hoặc không đọc được thì báo toast lỗi.
- "Gọn và đẹp": giữ nguyên cấu trúc DOM và selector hiện có để 62 E2E test ít phải sửa; chỉ chỉnh CSS, khoảng cách, nhóm nút, và chỉ đổi component khi cần cho tính năng mới.

## Ràng buộc kỹ thuật

- Danh sách file hiện chỉ trả đường dẫn (`listMarkdownFiles` trong `src/main/mdFolder.ts`); cần thêm ngày sửa (mtime) cho từng file, lấy cùng lượt quét.
- Cây dựng ở `buildMdTree` (`src/shared/mdView.ts`); cần hỗ trợ sort theo ngày sửa.
- Cột trái là `src/renderer/src/components/MdTreeList.tsx`; kiểu dáng ở `src/renderer/src/styles.css`.
- Khung xem dùng chung `src/renderer/src/components/PreviewPane.tsx` (đã có nút Copy); App.tsx dùng nó cho cả ba chế độ.
- Codebase có 463 unit test và 62 E2E; thêm test cho logic mới (sắp xếp, chọn "Mới sửa", định dạng ngày tương đối).

## Để người làm quyết

- Cách đặt tên và tách file CSS/component.
- Cách chọn màu, khoảng cách, cỡ chữ cho phần "gọn và đẹp", miễn là nhất quán giữa ba chế độ và đọc rõ trên cả theme hiện có.
- Cách giữ lựa chọn sort giữa các lần mở app (có thể không cần).
