# Brief thiết kế: Trung tâm Hỗ trợ & Góp ý (JCAP)

Tài liệu này mô tả chức năng **Hỗ trợ & Góp ý** của JCAP để thiết kế lại giao diện. Mọi trường dữ liệu và thao tác dưới đây là những gì hệ thống đang có (API `/api/feedback` và `/api/admin/feedback`). Chức năng chưa có API được gom ở mục 10 và phải ghi rõ là **đề xuất**.

## 1. Bối cảnh

- **Sản phẩm:** JCAP, nền tảng luyện nói tiếng Nhật cho người Việt (JLPT N5–N3). Luyện bằng Hội thoại AI (tốn Credit) và Shadowing.
- **Người dùng chính:** học viên gặp sự cố (trừ Credit sai, lỗi micro, lỗi chấm điểm, lỗi nội dung bài) hoặc muốn góp ý.
- **Người dùng phụ:** admin tiếp nhận, trả lời và đóng phiếu.
- **Việc chính của trang:**
  1. Gửi một phiếu sự cố và theo dõi xem admin đã xử lý đến đâu.
  2. Trao đổi qua lại với admin trong phiếu đó.
  3. Gửi góp ý một chiều, không chờ trả lời.
- **Điểm đặc biệt: ẩn danh.** Admin không thấy tên, email hay tài khoản của người gửi, chỉ thấy mã `#ANON-1234` của phiếu. Giao diện phải cho học viên biết và tin điều này.
- **Đường dẫn:** `/feedback` (học viên), `/admin/feedback` (admin).
- **Lối vào:** mục "Hỗ trợ & Góp ý" trong menu tài khoản ở thanh bên; liên kết "Hỗ trợ kỹ thuật" ở trang Diễn đàn.
- **Khác với Diễn đàn:** hỏi bài và trao đổi giữa học viên thuộc Diễn đàn (`/community`). Trang này có một lối dẫn sang đó ("Hỏi bài tại Diễn đàn").

## 2. Ràng buộc thiết kế (bắt buộc)

- **Design system:** theo `design-handoff/` (`HANDOFF.md`, `tokens/tokens.css`, `design-system/`).
  - Màu, font, bo góc, đổ bóng chỉ lấy từ token. Không thêm mã màu mới.
  - Màn hiện tại dùng màu cứng và emoji làm icon. Thiết kế lại phải bỏ cả hai.
- **Theme học viên:** đồng bộ với Diễn đàn (mục 9h của `HANDOFF.md`): `data-theme="kham-pha"`, tối `hoc-tap-dem` với điểm nhấn màu cát.
- **Theme admin:** `quan-tri`.
- **Component có sẵn:** `Button`, `IconButton`, `Badge`, `Tabs`, `SegmentedControl`, `TextField`, `Select`, `EmptyState`, `Modal`, `Alert`, `Toast`, khung chờ (`jc-skel`).
- **Font và icon:** Be Vietnam Pro (chữ Việt), Noto Sans JP (chữ Nhật), Noto Serif JP (chữ Hán trang trí). Icon: Material Symbols Rounded.
- **Bố cục:** trang nằm bên phải thanh bên trái (240px, thu gọn 72px). Cột nội dung hiện rộng tối đa khoảng 1150px.
- **Chữ trên giao diện:** tiếng Việt, câu ngắn, không IN HOA nhãn. Thuật ngữ: Credit (không dùng "token", "xu"), phiếu hỗ trợ, góp ý.
- **Bàn giao:** bản máy tính (1440px) và điện thoại (390px).

## 3. Dữ liệu

### 3.1 Phiếu

| Trường | Ghi chú |
|---|---|
| Mã ẩn danh (`anonymousCode`) | `#ANON-1234`, mỗi phiếu một mã riêng |
| Tiêu đề | Bắt buộc, tối đa 300 ký tự. Có thể chứa tiếng Nhật |
| Loại (`category`) | Một trong 5 loại ở mục 3.3 |
| Trạng thái (`status`) | Một trong 3 trạng thái ở mục 3.4 |
| Admin đã xem (`adminSeenAt`) | Có giá trị khi admin mở phiếu lần đầu |
| Ngày tạo, ngày cập nhật, ngày đóng | Hiện dạng tương đối ("5 phút trước"); quá một tuần thì hiện ngày giờ |
| Tin nhắn | Danh sách theo thời gian, ít nhất một tin (nội dung lúc tạo phiếu) |

Danh sách phiếu xếp theo ngày cập nhật, mới nhất trước.

### 3.2 Tin nhắn và đính kèm

| Trường | Ghi chú |
|---|---|
| Người gửi (`senderRole`) | `LEARNER` (hiện "Bạn") hoặc `ADMIN` (hiện "Ban Quản trị Hỗ trợ") |
| Nội dung | Văn bản thường, giữ xuống dòng. Tin chỉ có tệp thì nội dung là "(Đính kèm tệp/ảnh)" |
| Thời gian | Như trên |
| Đính kèm | Ảnh (xem trước, bấm để phóng to) hoặc tệp (tên, dung lượng, mở ở tab mới) |

- **Tệp cho phép:** JPG, JPEG, PNG, WEBP, GIF, PDF, TXT, LOG, JSON, ZIP, DOC, DOCX.
- **Giới hạn:** mỗi tệp tối đa 5MB, chọn được nhiều tệp.

### 3.3 Loại phiếu

| Mã | Tên | Dùng cho |
|---|---|---|
| `PAYMENT_CREDIT` | Gói học & Credit | Thanh toán, cộng hoặc trừ Credit |
| `SYSTEM_BUG` | Lỗi kỹ thuật / Hệ thống | Micro, trình duyệt, trang không chạy |
| `SCENARIO_BUG` | Lỗi kịch bản / Nội dung | Sai chữ, thiếu furigana, nội dung bài học |
| `AI_ASSESSMENT` | Chấm điểm AI & Giọng nói | Chấm sai nhiệm vụ, nhận dạng giọng nói |
| `SUGGESTION` | Đề xuất & Góp ý | Góp ý một chiều (tab riêng) |

Bốn loại đầu là **sự cố**, cần trao đổi với admin. Mỗi loại cần một icon Material Symbols (đang dùng emoji, phải thay).

### 3.4 Trạng thái

| Mã | Nhãn | Ý nghĩa | Chuyển sang bằng cách |
|---|---|---|---|
| `PENDING` | Chờ Admin phản hồi | Đã gửi, admin chưa trả lời | Vừa tạo phiếu |
| `IN_PROGRESS` | Đang trò chuyện | Admin đã trả lời, hai bên trao đổi tiếp | Admin trả lời lần đầu |
| `CLOSED` | Đã đóng | Xử lý xong, không gửi thêm được | Admin đóng phiếu |

- Khi phiếu đang `PENDING`, cho biết thêm: **"Admin đã xem"** (đã mở, chưa trả lời) hoặc **"Chờ tiếp nhận"**.
- Chỉ admin đóng và mở lại phiếu. Mở lại thì về "Đang trò chuyện" nếu admin từng trả lời, không thì về "Chờ Admin phản hồi".
- Trạng thái phải phân biệt được bằng chữ hoặc icon, không chỉ bằng màu.

## 4. Màn học viên: đầu trang

- Tiêu đề (đang là "Trung tâm Hỗ trợ & Góp ý Hệ thống", được rút gọn) và một dòng mô tả: xử lý sự cố thanh toán, lỗi bài học, hoặc gửi góp ý.
- Chuyển giữa hai phần: **Hỗ trợ sự cố (số phiếu)** và **Góp ý**.
- Lối sang Diễn đàn: "Hỏi bài tại Diễn đàn".

## 5. Phần Hỗ trợ sự cố

Bố cục hiện tại: danh sách phiếu bên trái (khoảng 1/3), nội dung phiếu đang chọn bên phải (2/3). Được phép đề xuất bố cục khác.

### 5.1 Danh sách phiếu
- Tiêu đề "Phiếu hỗ trợ của tôi" và nút chính "Báo sự cố mới".
- Lọc theo trạng thái kèm số lượng: Tất cả, Chờ, Đang xử lý, Đóng.
- Mỗi dòng: nhãn trạng thái, thời gian cập nhật, tiêu đề (tối đa 2 dòng), loại sự cố, và "Admin đã xem" hoặc "Chờ tiếp nhận" khi đang chờ.
- Dòng đang chọn nổi rõ. Tự chọn phiếu đầu danh sách khi mở trang.

### 5.2 Nội dung phiếu
- **Đầu phiếu:** trạng thái, mã phiếu, loại, tiêu đề, thời gian tạo.
- **Luồng tin nhắn:** tin của "Bạn" (kèm mã ẩn danh) và tin của admin phải khác nhau rõ ràng. Có ảnh và tệp đính kèm. Mở phiếu thì thấy tin mới nhất.
- **Khung trả lời** (cuối phiếu):
  - Ô nhiều dòng, câu gợi ý "Bổ sung thông tin hoặc phản hồi cho Admin…".
  - Nút đính kèm, danh sách tệp đã chọn, nút bỏ từng tệp.
  - Nút "Gửi", khoá khi chưa có chữ và chưa có tệp, hoặc khi đang tải tệp.
- **Phiếu đã đóng:** thay khung trả lời bằng dòng "Sự cố này đã được xử lý xong và đóng lại." Có thể kèm nút "Báo sự cố mới".

### 5.3 Khung "Báo sự cố mới" (hộp thoại; điện thoại thì phủ toàn màn)
- **Loại sự cố:** 4 loại, mặc định "Gói học & Credit". Nên có mô tả ngắn để chọn đúng.
- **Tiêu đề:** bắt buộc, tối đa 300 ký tự, nên có bộ đếm. Gợi ý: "Đã thanh toán qua PayOS nhưng chưa cộng Credit".
- **Mô tả chi tiết:** bắt buộc. Gợi ý: nêu mã giao dịch, tên bài học bị lỗi.
- **Đính kèm:** ảnh chụp màn hình, hoá đơn. Mỗi tệp có trạng thái đang tải, đã tải, hoặc lỗi (quá 5MB, sai định dạng) ngay tại tệp đó.
- **Ghi chú ẩn danh:** admin chỉ thấy mã phiếu, không thấy tên và email.
- **Nút:** Huỷ, "Gửi yêu cầu". Khoá khi thiếu tiêu đề hoặc mô tả, hoặc đang tải tệp.
- **Gửi xong:** đóng khung, phiếu mới đứng đầu danh sách và được chọn, có thông báo đã gửi.

## 6. Phần Góp ý

- **Khung gửi góp ý:**
  - Mô tả ngắn: đề xuất về giao diện, tính năng, trải nghiệm học; đội ngũ ghi nhận, không phản hồi riêng.
  - "Chủ đề góp ý" (bắt buộc, tối đa 300 ký tự), "Chi tiết đề xuất" (bắt buộc). Không có đính kèm.
  - Nút "Gửi góp ý". Gửi xong thì xoá ô và báo "Góp ý đã được ghi nhận".
- **Các góp ý đã gửi (số):** mỗi mục có chủ đề, đoạn đầu nội dung (2 dòng), thời gian, dấu "Đã ghi nhận". Không có trạng thái xử lý, không có trả lời.

## 7. Màn admin (`/admin/feedback`)

- Đầu trang: tiêu đề quản trị hỗ trợ, hai tab **Sự cố** và **Góp ý**, nút tải lại, lối sang quản lý Diễn đàn.
- **Tab Sự cố:**
  - Danh sách phiếu của mọi học viên, tìm theo mã phiếu hoặc tiêu đề, lọc theo trạng thái kèm số lượng.
  - Mở một phiếu thì tự đánh dấu "Admin đã xem".
  - Nội dung phiếu như bên học viên, nhưng người gửi chỉ hiện mã ẩn danh.
  - Trả lời kèm tệp. Nút **Đóng phiếu** hoặc **Mở lại**. Phiếu đã đóng thì phải mở lại mới trả lời được.
- **Tab Góp ý:** lưới các góp ý, mỗi mục có mã ẩn danh, thời gian, chủ đề, toàn bộ nội dung. Chỉ đọc.
- Không hiện tên, email, ảnh đại diện hay mã tài khoản của học viên ở bất kỳ đâu.

## 8. Cập nhật dữ liệu
- Cả hai màn tự tải lại mỗi 10 giây. Thiết kế không được làm mất chữ đang gõ hoặc nhảy vị trí đang đọc khi có tin mới.
- Không có phân trang: tải toàn bộ phiếu một lần.

## 9. Trạng thái cần vẽ
- Đang tải lần đầu.
- Lỗi tải: thông báo kèm "Thử lại".
- Chưa có phiếu nào: giải thích trang dùng để làm gì, kèm nút "Báo sự cố mới".
- Lọc không ra phiếu nào.
- Chưa chọn phiếu (cột phải trống).
- Đang gửi; gửi lỗi (giữ nguyên nội dung đã gõ).
- Đang tải tệp lên; tệp lỗi. Màn hiện tại dùng hộp alert của trình duyệt, phải thay.
- Xem ảnh lớn (đóng bằng Esc).
- Chưa gửi góp ý nào.
- Điện thoại: danh sách phiếu và nội dung phiếu là hai màn, có nút quay lại.

## 10. Chưa có trong hệ thống (chỉ vẽ nếu ghi rõ "đề xuất")
- Đánh dấu tin admin mà học viên chưa đọc, chấm đỏ hay số tin mới ở menu.
- Thông báo qua email hoặc thông báo đẩy khi admin trả lời.
- Học viên tự đóng, mở lại, sửa hoặc xoá phiếu.
- Gắn phiếu với một giao dịch, một buổi luyện hay một bài học cụ thể.
- Mức ưu tiên, người phụ trách, thời gian phản hồi dự kiến.
- Đánh giá mức hài lòng sau khi đóng phiếu.
- Trạng thái xử lý cho góp ý (đã duyệt, đang làm, đã làm).
- Tìm kiếm ở màn học viên, phân trang.

## 11. Không làm
- Không thêm số liệu không có thật (thời gian phản hồi trung bình, số admin đang trực, "đang nhập…").
- Không dùng emoji làm icon, không dùng màu ngoài token.
- Không làm lộ danh tính học viên ở màn admin.

## 12. Cần bàn giao
- **1440px:** phần Hỗ trợ (phiếu đang trò chuyện, phiếu đang chờ, phiếu đã đóng), khung "Báo sự cố mới", phần Góp ý, màn admin (hai tab).
- **390px:** danh sách phiếu, nội dung phiếu, khung báo sự cố toàn màn, phần Góp ý.
- **Trạng thái:** các trạng thái ở mục 9.
- **Chế độ:** sáng và tối.
- **Ghi chú component:** ghi rõ component dùng ở từng phần, để dựng lại trong `jcap-web/src/components/`.
