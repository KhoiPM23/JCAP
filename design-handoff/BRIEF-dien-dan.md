# Brief thiết kế: Diễn đàn cộng đồng (JCAP)

Tài liệu này mô tả chức năng **Diễn đàn** của JCAP để thiết kế lại giao diện. Mọi trường dữ liệu và thao tác dưới đây là những gì hệ thống đang có (API `/api/community`). Chức năng chưa có API được gom ở mục 8 và phải ghi rõ là **đề xuất**.

## 1. Bối cảnh

- **Sản phẩm:** JCAP, nền tảng luyện nói tiếng Nhật cho người Việt (JLPT N5–N3). Hai cách luyện chính là Hội thoại AI và Shadowing.
- **Người dùng:** học viên đã đăng nhập. Admin dùng chung màn này, có thêm quyền ghim bài.
- **Việc chính của trang:** đọc và lọc các bài thảo luận, đăng câu hỏi hoặc chia sẻ, bình luận và trả lời nhau.
- **Đường dẫn:** `/community` (mục "Diễn đàn" trên thanh bên trái, icon `groups`). `/forum` dẫn về cùng trang. Admin vào qua `/admin/community`.
- **Khác với Góp ý:** báo lỗi kỹ thuật hoặc thanh toán đi qua trang Góp ý (`/feedback`). Diễn đàn có một lối dẫn sang đó ("Hỗ trợ kỹ thuật"), chỉ hiện với học viên.

## 2. Ràng buộc thiết kế (bắt buộc)

- **Design system:** theo `design-handoff/` (`HANDOFF.md`, `tokens/tokens.css`, `design-system/`).
  - Màu, font, bo góc, đổ bóng chỉ lấy từ token, không thêm mã màu mới.
  - Màn hiện tại dùng màu cứng và emoji làm icon. Khi thiết kế lại phải bỏ cả hai.
- **Theme:** đây là trang học viên, `data-theme="hoc-tap"`, nền `--paper-100`. Có chế độ tối `hoc-tap-dem`; thiết kế phải đọc rõ ở cả hai chế độ.
- **Component có sẵn:** `Button`, `IconButton`, `Badge`, `JlptBadge`, `Tabs`, `SegmentedControl`, `TextField`, `Switch`, `EmptyState`, `JpText` (chữ Nhật có furigana).
- **Font và icon:**
  - Font: Be Vietnam Pro cho chữ Việt, Noto Sans JP cho chữ Nhật, Noto Serif JP cho chữ Hán trang trí.
  - Icon: Material Symbols Rounded.
- **Bố cục:** trang nằm bên phải thanh bên trái (rộng 240px, thu gọn 72px). Cột nội dung hiện rộng tối đa khoảng 896px.
- **Chữ trên giao diện:**
  - Tiếng Việt, câu ngắn, không IN HOA nhãn.
  - Thuật ngữ: Diễn đàn, bài thảo luận, bình luận, kênh.
- **Bàn giao:** bản máy tính (1440px) và điện thoại (390px).

## 3. Dữ liệu

### 3.1 Bài thảo luận

| Trường | Ghi chú |
|---|---|
| Kênh (`channel`) | Một trong 5 kênh ở mục 3.3 |
| Tiêu đề | Bắt buộc, tối đa 290 ký tự |
| Nội dung | Bắt buộc, văn bản thường, giữ xuống dòng. Có thể chứa tiếng Nhật |
| Tác giả | Tên, ảnh đại diện (có thể không có), cấp JLPT của học viên (N5…N1) hoặc nhãn Admin |
| Ẩn danh (`isAnonymous`) | Tên hiện là "Thành viên ẩn danh #1234", không có ảnh đại diện. Admin không đăng ẩn danh được |
| Bài của tôi (`isOwnPost`) | Đúng cả khi bài đăng ẩn danh |
| Ngày đăng, ngày sửa | Hiện dạng tương đối ("5 phút trước") |
| Ghim (`isPinned`) | Bài ghim luôn đứng đầu danh sách |
| Đã giải đáp (`isSolved`) | Chỉ có ý nghĩa ở kênh Hỏi đáp |
| Lượt thích (`upvotes`, `upvotedByMe`) | Bấm để thích hoặc bỏ thích. Người đăng tự động thích bài của mình |
| Đính kèm | Ảnh (hiện xem trước, bấm để phóng to) hoặc tệp (tên, dung lượng, tải về) |
| Bình luận | Danh sách ở mục 3.2 |

### 3.2 Bình luận

| Trường | Ghi chú |
|---|---|
| Nội dung | Bắt buộc |
| Tác giả, ẩn danh | Giống bài thảo luận |
| Trả lời (`parentCommentId`) | Trả lời một bình luận gốc, chỉ một cấp: trả lời nằm thụt vào dưới bình luận gốc, có dòng "Đang trả lời @tên" khi đang viết |
| Ngày đăng | Hiện dạng tương đối |
| Đính kèm | Giống bài thảo luận |

### 3.3 Kênh

| Mã | Tên | Mô tả ngắn |
|---|---|---|
| `QA_JAPANESE` | Hỏi đáp Tiếng Nhật | Giải đáp từ vựng, ngữ pháp, kính ngữ trong bài học |
| `SPEAKING_TIPS` | Kinh nghiệm Luyện nói | Mẹo phản xạ với AI và luyện phát âm Shadowing |
| `STUDY_BUDDY` | Tìm bạn cùng học | Lập nhóm luyện giao tiếp, giữ chuỗi ngày học |
| `RESOURCES` | Tài liệu & JLPT | Chia sẻ ghi chú, PDF, bảng tóm tắt ôn thi |
| `LOUNGE` | Góc Trò chuyện | Văn hoá Nhật Bản và động lực học tập |

Mỗi kênh cần một màu nhận diện (lấy từ token) và một icon Material Symbols. Hiện đang dùng emoji, phải thay.

## 4. Màn danh sách bài (`/community`)

### 4.1 Đầu trang
- Tiêu đề "Diễn đàn" và một dòng mô tả: hỏi đáp ngữ pháp, chia sẻ mẹo luyện nói, kết nối bạn học.
- Nút chính "Đăng bài thảo luận".
- Nút phụ "Hỗ trợ kỹ thuật", chỉ hiện với học viên, dẫn sang `/feedback`.

### 4.2 Ô đăng nhanh
- Một dòng gồm ảnh đại diện của mình và câu gợi ý "Đặt câu hỏi tiếng Nhật, chia sẻ mẹo Shadowing hoặc đính kèm tài liệu…".
- Bấm vào thì mở khung soạn bài (mục 6).

### 4.3 Lọc, tìm, sắp xếp
- **Kênh:** "Tất cả (số bài)" và 5 kênh.
- **Tìm kiếm:** theo tiêu đề, nội dung hoặc tên tác giả. Lọc ngay khi gõ, tìm ở phía trình duyệt.
- **Sắp xếp:**
  - **Nổi bật:** điểm = lượt thích × 2 + số bình luận × 3.
  - **Mới nhất:** theo ngày đăng.
  - Cả hai cách, bài ghim luôn đứng đầu.

### 4.4 Thẻ bài trong danh sách
- **Đầu thẻ:** ảnh đại diện (hoặc biểu tượng ẩn danh), tên, nhãn cấp JLPT hoặc Admin, thời gian, nhãn kênh.
- **Nhãn trạng thái:** "Đã ghim", "Đã giải đáp" (kênh Hỏi đáp).
- **Thân thẻ:** tiêu đề và đoạn đầu nội dung (rút gọn vài dòng). Nếu bài có ảnh thì có ảnh xem trước.
- **Hàng thao tác:**
  - Thích, kèm số lượt thích và trạng thái đã thích.
  - Số bình luận.
  - "Đánh dấu đã giải đáp": chỉ ở kênh Hỏi đáp, chỉ tác giả hoặc admin.
  - Ghim / Bỏ ghim: chỉ admin.
  - Xoá bài: tác giả hoặc admin. Server cho cả hai, màn hiện tại chỉ hiện với admin. Phải có hộp xác nhận.
- **Mở bài:** bấm thẻ thì bài mở rộng ngay tại chỗ, hiện đủ nội dung, đính kèm và bình luận. Có thể đề xuất trang riêng cho một bài (mục 8).

### 4.5 Bài đang mở rộng
- Nội dung đầy đủ, giữ xuống dòng.
- **Đính kèm:** ảnh dạng lưới xem trước, bấm vào thì phóng to (lightbox, đóng bằng Esc). Tệp là một dòng gồm icon theo loại, tên, dung lượng và nút tải.
- **Bình luận:**
  - Bình luận gốc theo thời gian, trả lời nằm thụt dưới bình luận gốc.
  - Mỗi bình luận có tác giả, nhãn cấp, thời gian, nội dung, đính kèm và nút "Trả lời".
- **Ô viết bình luận** ở cuối bài:
  - Ô nhập nhiều dòng, nút đính kèm, công tắc "Bình luận ẩn danh", nút Gửi.
  - Khi đang trả lời ai đó thì có dòng "Đang trả lời @tên" và nút bỏ.
- Chưa có bình luận: hiện câu mời "Hãy là người đầu tiên chia sẻ ý kiến".

## 5. Cập nhật dữ liệu
- Danh sách tự làm mới mỗi 8 giây và khi quay lại tab, nên bài và bình luận của người khác tự xuất hiện. Thiết kế nên có cách báo nhẹ khi có bài mới, nhưng không làm nhảy vị trí đang đọc.
- Không có phân trang: tải toàn bộ bài một lần.

## 6. Khung soạn bài (hộp thoại; điện thoại thì phủ toàn màn)
- **Chọn kênh:** 5 kênh, có mô tả ngắn để người học chọn đúng.
- **Tiêu đề:** bắt buộc, tối đa 290 ký tự, nên có bộ đếm ký tự.
- **Nội dung:** bắt buộc, nhiều dòng.
- **Đính kèm:**
  - Ảnh, PDF, TXT, DOC, DOCX; mỗi tệp tối đa 5MB, chọn nhiều tệp một lúc được.
  - Có trạng thái đang tải lên, danh sách tệp đã chọn (ảnh có hình thu nhỏ), nút bỏ từng tệp.
  - Tệp quá 5MB thì báo lỗi ngay tại tệp đó. Màn hiện tại dùng hộp alert của trình duyệt, phải thay.
- **Công tắc "Đăng ẩn danh":** ghi rõ người khác sẽ thấy "Thành viên ẩn danh #…", không thấy tên và ảnh. Admin không có công tắc này.
- **Nút:** Huỷ và "Đăng bài". Nút Đăng bài khoá khi thiếu tiêu đề hoặc nội dung, hoặc khi còn tệp đang tải lên.
- **Sau khi đăng:** bài mới hiện đầu danh sách và có thông báo "Đã đăng bài thảo luận".

## 7. Trạng thái cần vẽ
- Đang tải danh sách lần đầu.
- Không kết nối được máy chủ: hiện thông báo kèm "Thử lại". Màn hiện tại lặng lẽ dùng dữ liệu mẫu lưu trong trình duyệt, cách này sẽ bỏ.
- Rỗng ở một kênh: "Chưa có bài thảo luận nào ở mục này", kèm nút đăng bài.
- Tìm không ra: gợi ý đổi từ khoá hoặc bỏ lọc kênh.
- Đang gửi bài hoặc bình luận; gửi lỗi (giữ nguyên nội dung đã gõ).
- Đang tải tệp lên.
- Hộp xác nhận xoá bài.

## 8. Chưa có trong hệ thống (chỉ vẽ nếu ghi rõ "đề xuất")
- **Thích bình luận:** dữ liệu có trường lượt thích cho bình luận nhưng chưa có API.
- **Chọn câu trả lời hay nhất:** có trường `isAcceptedAnswer` nhưng chưa có API. Hiện chỉ đánh dấu được cả bài là "Đã giải đáp".
- **Lượt xem:** server chỉ đếm khi mở một bài bằng API chi tiết, mà màn hiện tại không gọi, nên số này chưa đúng. Đừng hiện lượt xem nếu chưa sửa.
- **Trang riêng cho một bài** (`/community/:id`, chia sẻ được link): API chi tiết đã có, giao diện chưa có.
- **Sửa bài, sửa hoặc xoá bình luận, báo cáo bài vi phạm:** chưa có API.
- **Phân trang hoặc tải thêm khi cuộn:** chưa có.

## 9. Không làm
- Không thêm số liệu không có thật: thành viên đang online, bảng xếp hạng người đóng góp, số lượt xem.
- Không dùng emoji làm icon, không dùng màu ngoài token.
- Không cho admin đăng ẩn danh.

## 10. Cần bàn giao
- **1440px:** danh sách (có bài ghim, bài đã giải đáp, bài ẩn danh, bài có ảnh và tệp), một bài đang mở rộng có bình luận và trả lời, khung soạn bài.
- **390px:** danh sách, bài đang mở, khung soạn bài toàn màn.
- **Trạng thái:** các trạng thái ở mục 7.
- **Chế độ:** sáng và tối.
- **Màn của admin:** có thêm Ghim và Xoá.
- **Ghi chú component:** ghi rõ component dùng ở từng phần để dựng lại trong `jcap-web/src/components/jcap/`.
