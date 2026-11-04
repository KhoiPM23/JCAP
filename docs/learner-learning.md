# Learner: học từ vựng và ngữ pháp theo chủ đề

## Luồng và giao diện

Menu learner **Kho học liệu** → chọn chủ đề → tab **Từ vựng / Ngữ pháp** → chọn mục → trang chi tiết.
Giao diện dùng LearnerShell, font, token màu theo theme, icon, button, nhãn JLPT và hiển thị furigana của web hiện có.
Ba màn được tải thành các chunk riêng khi cần. Không dùng dữ liệu mock hoặc thêm thư viện.

- Chủ đề: thẻ tên/mô tả/level, số từ và ngữ pháp đang hiển thị; lọc N5–N1,
  tìm theo tên/mô tả, **12 chủ đề/trang**. Mặc định xem tất cả level.
- Nội dung: hai tab có số lượng, tìm theo từ/mẫu, cách đọc và nghĩa;
  ngữ pháp tìm thêm cấu trúc. **20 mục/trang**, theo thứ tự admin đã sắp xếp,
  hòa thứ tự thì theo ID để không lặp/mất mục qua trang.
- Chi tiết: từ/mẫu, cách đọc, nghĩa, từ loại/cấu trúc, giải thích, lưu ý,
  các ví dụ theo thứ tự kèm bản dịch và nút hiện/ẩn furigana. Giữ nguồn,
  phiên bản, giấy phép, ghi công của nội dung và của từng câu ví dụ.
- Có mục trước/tiếp theo, đi được qua ranh giới trang và cùng kết quả tìm kiếm.
  Liên kết về danh sách giữ tab, từ khóa và trang. Về kho chủ đề giữ bộ lọc
  và trang của kho; thay chủ đề từ chi tiết sẽ mở danh sách mới từ trang đầu.
- Chuyển tab/xóa hoặc đổi từ khóa/bộ lọc về trang 1. Có loading, lỗi, thử lại,
  trạng thái rỗng; trang vượt giới hạn tự về trang cuối hợp lệ.
- Không thêm kiểm tra/chấm điểm, audio, thuộc/chưa thuộc hoặc thay đổi nghiệp vụ Flashcard/Bookmark.

## Quy tắc dữ liệu và quyền truy cập

- API chỉ đọc, yêu cầu đăng nhập. Admin cũng có thể đọc; phần quản trị vẫn dùng API admin riêng.
- Chỉ trả Topic đang hiển thị. Nội dung phải đang hiển thị, cùng level với Topic
  và có liên kết trong Topic đó; level cũ null được hiểu N5.
- Số đếm, tìm kiếm và phân trang đều thực hiện trên dữ liệu hợp lệ ở backend,
  không tải toàn kho về rồi lọc tại trình duyệt.
- Topic trống vẫn mở được; hiển thị trạng thái rỗng từng tab. Khi chọn thẻ chỉ có
  ngữ pháp, hệ thống mở sẵn tab ngữ pháp.
- URL detail trực tiếp cũng kiểm tra trạng thái, level và liên kết; không hợp lệ trả 404.
  Chủ đề liên quan ở detail chỉ gồm Topic đang hiển thị, cùng level.
- Không sửa, xóa hoặc tạo tiến độ khi đọc nội dung. Không có model/migration mới.
- Ngữ pháp cũ chỉ có ExampleSentence: dùng làm ví dụ dự phòng khi chưa có danh sách
  ví dụ cấu trúc; không tạo thêm dòng DB. Không có bản dịch thì ghi rõ còn thiếu.
- Link nguồn chỉ mở http/https. Furigana chỉ dùng khi khớp câu tiếng Nhật gốc,
  không thay nguyên câu bằng chuỗi chú âm khác nội dung.

## URL và API

| URL web | Màn |
|---|---|
| `/learning/topics` | Kho chủ đề |
| `/learning/topics/{topicId}?tab=vocabularies` | List từ vựng |
| `/learning/topics/{topicId}?tab=grammars` | List ngữ pháp |
| `/learning/topics/{topicId}/{vocabularies\|grammars}/{id}` | Chi tiết |

Query URL giữ `page`, `keyword`, `level` của kho; danh sách giữ `tab`, `page`,
`keyword` và `catalogPage/catalogKeyword/catalogLevel` cho đường quay lại.
Không nhận URL quay về tùy ý hoặc redirect ra ngoài hệ thống.

| API GET dưới `/api/learning` | Kết quả |
|---|---|
| `topics?jlptLevel=&keyword=&page=&pageSize=` | Chủ đề phân trang, mặc định 12 |
| `topics/{topicId}` | Metadata và số nội dung hợp lệ |
| `topics/{topicId}/{vocabularies\|grammars}?keyword=&page=&pageSize=` | Metadata Topic và nội dung phân trang, mặc định 20 |
| `topics/{topicId}/{vocabularies\|grammars}/{id}?keyword=&pageSize=` | Detail, nguồn, chủ đề liên quan và mục trước/sau cùng số trang |

Page 1–1.000.000, pageSize 1–100, keyword tối đa 200 ký tự. Frontend dùng pageSize cố định 12/20.
Các API admin/import hiện tại giữ nguyên.

## Test nhanh

1. Chạy backend 5254 và frontend 5173 với DB mẫu hiện có; không cần migration mới.
2. Đăng nhập learner, mở `http://127.0.0.1:5173/learning/topics` hoặc menu Kho học liệu.
3. Bộ mẫu có 15 Topic nên kiểm tra được 2 trang (12 + 3). Tìm/lọc level phải
   áp dụng trên cả kho và tự về trang 1.
4. Chọn Ăn uống N5; thử hai tab, tìm `たべる`/`てください`, mở chi tiết, xem
   cấu trúc, ví dụ, furigana, lưu ý và nguồn/giấy phép. Về danh sách giữ từ khóa/tab.
5. Muốn test hơn 20 mục: tạo một Topic QA với 23 từ và 23 mẫu ngữ pháp bằng admin/import.
   Kiểm tra trang 2 có 3 mục; đổi từ khóa từ trang 2 về trang 1; mục trước/sau ở detail
   nối đúng sang trang 1/2 và nút quay lại giữ trang tương ứng.
6. Ẩn từ/ngữ pháp hoặc Topic trong admin; danh sách/số đếm learner cập nhật khi tải lại,
   URL detail cũ trả 404. Khôi phục thì dữ liệu có thể đọc lại; liên kết vẫn giữ.
7. Tải lại URL list/detail hoặc dùng Back/Forward: không mất bộ lọc, tab hoặc trang.

Kiểm chứng lúc triển khai: unit test nghiệp vụ và trạng thái URL; smoke HTTP trên SQL Server
với 23 mục mỗi loại, ẩn/khôi phục và link trực tiếp; thao tác thật bằng tài khoản learner.

## Đồng bộ develop ngày 04/11/2026

Phần learner không đổi model, nhưng develop bổ sung hai migration Intelligence/Subscription
và model Feedback trước đó được tạo bảng qua seeder. Bản merge có thêm
`20261104045633_ReconcileDevelopFeedbackSchema` để EF quản lý ba bảng Feedback.
Migration nhận lại các bảng đã có từ seeder hoặc tạo khi thiếu, giữ dữ liệu hiện tại;
Down không xóa bảng Feedback vì có thể các bảng đã tồn tại trước migration này.
Sau khi lấy code, chạy `dotnet ef database update` (hoặc startup theo SeedManager hiện có).
Không cần xóa DB hay tạo lại các migration cũ.
