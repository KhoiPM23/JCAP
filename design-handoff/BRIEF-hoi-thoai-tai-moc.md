# Brief nháp: Hội thoại AI tại mốc học (để hoàn thiện sau)

Bản nháp, tách ra từ brief chung. Hoàn thiện theo cùng khung với `BRIEF-shadowing-tai-moc.md` (cách mở phòng, bố cục hai thanh gập, con dấu hiện dần, trợ năng, điện thoại).

## 5. Màn B: Hội thoại AI tại mốc

**Dữ liệu đầu vào từ mốc:**
- Kịch bản: `scenarioId`, `title`.
- Cấp JLPT của kịch bản tại mốc.
- Số Credit: `creditCost`.
- Mốc chỉ gắn **một cấp cố định** của kịch bản, nên màn này **không có bộ chọn cấp** như trang kịch bản ở Thư viện.

### 5.1 Màn chuẩn bị (trước khi bắt đầu, vì buổi này tốn Credit)

Mở phòng ra là thấy ngay màn chuẩn bị ở khung giữa, không phải trang kịch bản riêng.

- **Nhân vật:** avatar, tên vai, mô tả ngắn.
- **Bối cảnh:** một hai câu.
- **Danh sách nhiệm vụ** cần hoàn thành (dạng checklist, chưa đánh dấu).
- **Chi phí:** "Buổi này dùng 2 Credit · Số dư của bạn: 15 Credit" (`CreditBadge`).
- **Nút chính:** "Bắt đầu hội thoại · 2 Credit".
- **Trạng thái đặc biệt:**
  - **Không đủ Credit:** thay nút chính bằng "Bạn cần thêm 1 Credit". Nút "Mua Credit" mở trang Credit; mua xong quay lại đúng phòng này.
  - **Có buổi đang dở của kịch bản này:** nút chính là "Tiếp tục buổi đang dở", kèm tiến độ "Đã xong 1/3 nhiệm vụ". Nút phụ là "Bắt đầu lại". Bắt đầu lại sẽ tạo buổi mới theo quy tắc Credit hiện có; ghi rõ số Credit nếu có trừ.
  - **Chưa có con dấu của mốc:** hiện một dòng nhắc nhẹ: "Dấu son chỉ được cấp sau khi bạn có con dấu (Shadowing đạt)". Không chặn học viên bắt đầu.

### 5.2 Thanh trên (khi đang hội thoại)

- "← Về bài học".
- Con dấu mốc nhỏ (hiện dần theo số nhiệm vụ đã xong), tên kịch bản, `JlptBadge`.
- `CreditBadge` số dư.
- Icon cài đặt, mở popover:
  - Furigana
  - Hiện nghĩa tiếng Việt
  - Tự phát giọng AI
  - Tốc độ giọng
  - Chọn giọng nhân vật
  - Chế độ rảnh tay (nói liên tục không cần bấm)
- "Kết thúc sớm" (Button danger sm).

### 5.3 Giữa: hội thoại

Giữ cách hiển thị bóng thoại của phòng Hội thoại AI (HANDOFF mục 9):
- **Câu của nhân vật:** có nghĩa và nút Nghe.
- **Câu của học viên:** nền `--sumi`, có điểm. **Bấm vào câu của mình thì mở ngăn "Nhận xét"** với câu đó.
- **Ô trả lời ở đáy** (một thanh bo tròn):
  - Nút Gợi ý: mở thẻ gợi ý ngay trên thanh, có câu gợi ý, Nghe và "Dùng câu này".
  - Ô nhập (Enter gửi).
  - Nút Gửi.
  - Nút mic tròn. Khi đang thu có sóng âm, Huỷ, Gửi.
- **Xong một nhiệm vụ:** một dòng ghi nhận nhỏ ngay trong dòng hội thoại ("Đã xong: Nói mục đích chuyến đi"), và chấm trên icon "Nhiệm vụ" ở thanh gập trái.
- Không bắn pháo giấy, không hiện chuỗi combo.

### 5.4 Thanh gập trái

| Mục | Icon gợi ý | Nội dung trong ngăn |
|---|---|---|
| Nhiệm vụ | `flag` | Tiến độ x/y + `ProgressBar`, `Stepper` dọc các nhiệm vụ (xong / đang làm / chưa làm) |
| Mẫu câu | `menu_book` | Từ vựng và ngữ pháp trọng tâm của kịch bản (`JpText` + nghĩa + nút nghe), mỗi mục có nút lưu vào kho Flashcard |
| Bối cảnh | `person` | Nhân vật và tình huống, để đọc lại khi cần |

### 5.5 Thanh gập phải

| Mục | Icon gợi ý | Nội dung trong ngăn |
|---|---|---|
| Nhận xét | `rate_review` | Câu học viên đang chọn: nghe lại giọng mình và giọng mẫu (nếu lượt đó nói bằng mic), các nhận xét về cách nói, cách diễn đạt tự nhiên hơn kèm nút Nghe và Sao chép. Chưa có câu nào: `EmptyState` "Bấm vào một câu của bạn để xem nhận xét" |
| Các câu của bạn | `format_list_bulleted` | Danh sách mọi câu học viên đã nói kèm điểm, bấm để xem nhận xét |

### 5.6 Kết thúc buổi hội thoại

- **Xong đủ nhiệm vụ và nhân vật chốt hội thoại** (hệ thống chỉ cấp dấu son trong trường hợp này):
  - Thẻ "Hoàn thành" xuất hiện trong dòng hội thoại.
  - Ô trả lời đổi thành nút "Hoàn tất buổi hội thoại".
  - Bấm vào thì hệ thống tổng hợp kết quả. Màn chờ ngắn ngay trong phòng: "Đang tổng hợp kết quả…".
- **Màn kết quả trong phòng:**
  - Điểm tổng /100 và hạng (thang 極 / 優 / 良 / 可 / 研 đang dùng ở trang Kết quả).
  - Đạt hay chưa đạt.
  - Số nhiệm vụ đã xong.
  - Nút "Xem đánh giá đầy đủ": mở trang chi tiết kết quả `/roleplay/results/:id`; từ đó có đường quay về bản đồ.
- **Dấu son:**
  - Học viên đã có con dấu của mốc: con dấu nhỏ trên thanh trên đổi sang **mực son**, lớn dần ra giữa và đóng cộp.
  - Học viên chưa có con dấu: báo "Hoàn thành hội thoại. Dấu son sẽ được cấp khi bạn có con dấu của mốc này", kèm nút "Luyện Shadowing".
- **Kết thúc sớm:** hộp xác nhận phải nói rõ hai điều:
  - Buổi chưa xong nhiệm vụ thì **không được dấu son**.
  - Credit đã trừ không được hoàn lại.
- **Rời phòng giữa chừng** ("← Về bài học"):
  - Buổi vẫn đang mở, lần sau vào lại thì tiếp tục. Hộp xác nhận nói đúng điều đó.
  - Ngăn bài học hiện nhãn "Đang dở 1/3 nhiệm vụ" ở bước Hội thoại AI.

## Quy tắc dấu son

| Dấu | Điều kiện hệ thống đang dùng |
|---|---|
| Dấu son | Đã có con dấu + có một buổi Hội thoại AI của đúng kịch bản và cấp đó, **kết thúc tự nhiên** (đủ nhiệm vụ, nhân vật chốt). Không xét điểm |
| Dấu son tỉnh | Mọi mốc có Hội thoại AI trong tỉnh đều có dấu son |
