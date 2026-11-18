# Kho học liệu — bản dùng chung cho nhóm

Nhánh: `feature/vocabulary-grammar`.

## Dữ liệu đi kèm code

| JLPT | Từ vựng | Ngữ pháp |
|---|---:|---:|
| N5 | 674 | 119 |
| N4 | 630 | 189 |
| N3 | 1.659 | 248 |
| Tổng | 2.963 | 556 |

- Có nghĩa tiếng Việt, từ loại, giải thích/cấu trúc và bản dịch ví dụ theo các lô đã biên soạn. Nguồn có 5.776 ví dụ từ vựng và 1.112 ví dụ ngữ pháp; 51 từ không có ví dụ trong nguồn.
- Có 124 chủ đề phẳng theo trình độ và các liên kết đã chuẩn bị. Một số từ mơ hồ còn chưa gán; xem `learning-topics-review-n5-n3.csv` trong cùng thư mục.
- Nguồn: OpenJLPT, Tatoeba và Nihongo Mono; phiên bản, ID gốc, giấy phép và ghi công được giữ trong dataset và các bảng nguồn.
- Đây là bản phục vụ phát triển. Đã có bản tiếng Việt trong source nhưng vẫn cần rà soát nghĩa, từ loại và cách gán chủ đề; không coi tỷ lệ đã dịch là tỷ lệ nội dung đã được thẩm định.
- DB có thể có nhiều mục hơn các số trên vì các seed Scenario/Shadowing cũng bổ sung nội dung riêng.

## Lấy code và chạy

Lấy nhánh trên về, hoặc tích hợp qua PR của nhóm. Dùng cấu hình SQL Server local như các chức năng hiện có; không đưa secret vào Git.

Từ thư mục gốc JCAP:

```powershell
docker compose up -d
dotnet restore
dotnet run --no-launch-profile --urls http://localhost:5254
```

Ở terminal khác:

```powershell
cd jcap-web
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

Backend tự áp dụng migration hiện có, nạp dataset, bản tiếng Việt và danh mục chủ đề. Không cần tải lại dữ liệu từ nguồn, chạy Python, nhập Excel hoặc gọi AI. Đợi backend seed xong và bắt đầu lắng nghe cổng 5254 trước khi đăng nhập.

Bản thay đổi này không tạo migration mới. Nếu máy chưa áp dụng migration cũ `20261111054905_ClearLearningTopics`, migration đó sẽ xóa các chủ đề/liên kết cũ một lần; seed sau đó tạo danh mục hiện tại. Không xóa database để cập nhật dữ liệu.

## Kiểm tra nhanh

- Admin: `http://127.0.0.1:5173/admin/topics`, `/admin/vocabularies`, `/admin/grammars`.
- Learner: `http://127.0.0.1:5173/learning/topics`.
- Admin mẫu: `admin1@jcap.com` / `Admin@123!`.
- Learner mẫu: `learner1@jcap.com` / `Learner@123!`.
- Thử chuyển tab, lọc JLPT/chủ đề, tìm kiếm, phân trang, xem chi tiết và mở popup Sửa.
- Tab Chủ đề có một popup lưu cả thông tin và nội dung; filter của tab Từ vựng/Ngữ pháp chỉ liệt kê chủ đề có loại nội dung tương ứng.
- Nhập Excel: tải mẫu → xóa dòng minh họa, điền dữ liệu → kiểm tra → đọc lỗi/lưu ý → tích xác nhận → nhập.

## Khi sửa dữ liệu sau này

- Giữ ID trong DB và ID nguồn; module khác nên tham chiếu ID, không gắn cứng tên/ nghĩa hoặc giả định ID giống nhau trên mọi máy.
- Sửa trên admin chỉ cập nhật DB đang kết nối, không tự lan sang máy khác qua Git.
- Import Excel giữ nội dung đã có, không dùng để ghi đè bản dịch cũ.
- Seed chỉ thêm nội dung/chủ đề thiếu; SQL Việt hóa chỉ cập nhật các giá trị gốc hoặc bản cũ được chỉ định, giữ chỉnh sửa riêng của admin. Sửa tên/chủ đề/liên kết đã tồn tại cần một bản cập nhật dữ liệu rõ ràng, không chỉ sửa file JSON rồi giả định mọi DB sẽ tự đổi.

## Kiểm tra đã thực hiện

Import thật qua browser/API/SQL Server: file hợp lệ lưu đủ chủ đề, từ vựng, ngữ pháp, ví dụ, nguồn và liên kết; nhập lại không trùng; thiếu trường, khác level, sai tham chiếu hoặc đổi file sau preview bị chặn. Đã dọn dữ liệu test và đối chiếu số bản ghi của 10 bảng liên quan về đúng ban đầu.
