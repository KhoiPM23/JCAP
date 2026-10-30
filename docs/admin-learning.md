# Quản trị Topic, từ vựng và ngữ pháp

## Phạm vi

- `/admin/topics`, `/admin/vocabularies`, `/admin/grammars` trong menu admin.
- Giao diện dùng lại khung Header/Navbar, Modal và Toast của admin hiện có;
  danh sách, bộ lọc, form thêm/sửa, quản lý ví dụ và gán nội dung dùng popup.
- Chưa có import file, upload audio, tự sinh giọng đọc hoặc liên kết Topic
  sang Scenario/Shadowing/Explore.

## Quy tắc

- Một Topic có một JLPTLevel (N5–N1), chỉ chứa từ/ngữ pháp cùng level.
- Code duy nhất, giữ cố định sau khi tạo; tên chỉ phải duy nhất trong level.
- Đổi level của Topic có nội dung: gỡ các liên kết không phù hợp trước.
  Đổi level của từ/ngữ pháp: bỏ các Topic không phù hợp khỏi lựa chọn khi lưu.
- Gán/bỏ Topic chỉ sửa bảng nối, không nhân bản hoặc xóa nội dung trong kho.
- Cảnh báo từ trùng Word + Reading / mẫu trùng Pattern bằng HTTP 409.
  Admin có thể xác nhận giữ mục riêng nếu khác nghĩa/cách dùng.
- Giữ ID nội dung khi sửa. Ví dụ được sửa theo ID, giữ thông tin nguồn;
  không cho truyền ID ví dụ của bản nội dung khác. Có thể thêm, xóa, đổi thứ tự.
- Meaning tối đa 1.000 ký tự; Word/Pattern tối đa 100; Reading từ vựng 100,
  ngữ pháp 200; Formation 1.000; mỗi mục tối đa 50 ví dụ. Câu đầu ngữ pháp
  tối đa 500 ký tự vì được đồng bộ vào `Grammar.ExampleSentence` cũ.
- Nội dung nguồn đã import hiển thị tên, giấy phép, ghi công và ID nguồn;
  không cho sửa nguồn qua form này. Nội dung thủ công không bắt buộc có nguồn.
- Thao tác lưu và đổi trạng thái cập nhật UpdatedAt theo UTC.

## Ẩn / khôi phục

- Không cung cấp xóa cứng nội dung/Topic trong admin.
- Ẩn từ/ngữ pháp bằng IsActive=false: loại khỏi Topic lookup và Flashcard,
  Bookmark, các danh sách chọn nội dung mới, phần mục từ/ngữ pháp dùng chung
  trong chi tiết Shadowing, các mục chữ trong lịch sử Flashcard. Chặn gửi
  đánh giá Flashcard cho nội dung vừa bị ẩn.
- Các bảng tiến độ, bookmark, log và liên kết được giữ nguyên trong DB;
  khôi phục nội dung làm các mục hiện lại. Thống kê buổi học cũ vẫn giữ.
- Ẩn Topic chỉ ẩn Topic đó; không đổi trạng thái các nội dung còn được dùng
  ở Topic khác. Từ/ngữ pháp có trạng thái riêng để admin ẩn trên toàn kho.
- Explore hiện không trả các mục Vocabulary/Grammar qua learner lesson DTO;
  bộ chọn admin của Explore đã lọc IsActive. Không sửa/xóa câu văn tự do,
  ghi chú nhập tay hoặc bản sao TargetVocabulary/TargetGrammar độc lập của
  Scenario bằng cách dò chuỗi giống từ đang ẩn.

## API

Tất cả endpoint `/api/admin/learning` yêu cầu JWT với role Admin.

| Endpoint | Chức năng |
|---|---|
| GET topics | Tìm kiếm, lọc level/trạng thái, phân trang |
| GET topics/options | Danh sách Topic dùng cho bộ lọc và chọn liên kết |
| GET topics/{id} | Chi tiết và nội dung theo thứ tự |
| POST topics / PUT topics/{id} | Thêm/sửa thông tin |
| PUT topics/{id}/contents | Lưu danh sách từ/ngữ pháp đã chọn và thứ tự |
| GET vocabularies / GET grammars | Lọc keyword, level, TopicId, Untopiced, IsActive; từ vựng thêm PartOfSpeech |
| GET vocabularies/{id} / grammars/{id} | Nội dung, ví dụ, nguồn và số nơi sử dụng |
| POST vocabularies / grammars | Thêm nội dung |
| PUT vocabularies/{id} / grammars/{id} | Sửa nội dung và các liên kết Topic |
| PUT {topics,vocabularies,grammars}/{id}/status | Ẩn/khôi phục |
| POST assign-topics | Gán nhiều nội dung cùng level vào nhiều Topic cùng level |
| POST bulk-status | Ẩn/khôi phục nhiều từ hoặc mẫu ngữ pháp; kiểm tra đủ ID trước khi thay đổi |

Hai GET API cũ `/api/admin/vocabularies`, `/api/admin/grammars` giữ nguyên
định dạng DTO cho các module khác, lọc mục đang hiển thị. Trang quản lý kho
mới dùng namespace `/api/admin/learning`, bao gồm cả nội dung đã ẩn.

## Test nhanh trên local

1. Lấy code, cấu hình SQL Server local như hướng dẫn chung của team.
2. Chạy `dotnet run --no-launch-profile -- --import-learning-sample` để áp
   dụng migration và có bộ mẫu. DB tạo từ đầu gặp lỗ hổng migration cũ thì
   xem hướng dẫn bootstrap trong thư mục bộ mẫu.
3. Chạy backend và frontend theo setup chung. Mở
   `http://127.0.0.1:5173/admin/topics`, đăng nhập tài khoản admin mẫu.
4. Tạo Topic N5; chọn nội dung, tìm kiếm và đổi thứ tự. Thử gửi nội dung N4
   vào Topic N5 phải bị chặn ở server.
5. Thêm từ/ngữ pháp, sửa ví dụ, lọc kết hợp level + chủ đề. Thử mục trùng để
   thấy cảnh báo và xác nhận giữ mục nghĩa riêng khi cần.
6. Ẩn rồi khôi phục nội dung; learner không thấy khi ẩn, dữ liệu và liên kết
   vẫn giữ khi khôi phục. Learner gọi API admin bị 403, chưa đăng nhập bị 401.

Không cần dịch vụ AI hoặc SMTP để test các thao tác quản lý kho này.
