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

Backend tự áp dụng migration hiện có. Nếu chưa nạp thành công phiên bản học liệu hiện tại, backend nạp dataset, bản tiếng Việt và danh mục chủ đề; mặc định timeout riêng của lần nạp là 600 giây. Sau khi toàn bộ transaction thành công, backend lưu dấu phiên bản vào `LearningContentSeedStates`. Những lần khởi động tiếp theo chỉ kiểm tra dấu này rồi bỏ qua xử lý học liệu.

Không cần tải lại dữ liệu từ nguồn, chạy Python, nhập Excel hoặc gọi AI. Đợi backend seed xong và bắt đầu lắng nghe cổng 5254 trước khi đăng nhập. Máy đã seed bằng code cũ cần chạy một lần theo cơ chế mới để ghi dấu thành công. Dữ liệu seed thay đổi sẽ có fingerprint mới và được xử lý một lần nữa; vẫn giữ nguyên các quy tắc bảo toàn chỉnh sửa admin.

Migration `20261118052838_TrackLearningContentSeedVersion` chỉ thêm bảng theo dõi seed, không đổi/xóa các bảng học liệu. Nếu máy chưa áp dụng migration cũ `20261111054905_ClearLearningTopics`, migration cũ đó sẽ xóa các chủ đề/liên kết cũ một lần; seed sau đó tạo danh mục hiện tại. Không xóa database để cập nhật dữ liệu.

Đã sửa bước `20260922171220_AddScenarioContentTables` để tạo các bảng Scenario nền còn thiếu trước khi sửa `Missions` và các khóa ngoại về sau. Chuỗi migration có thể chạy từ DB trắng. DB đã áp dụng migration cũ không chạy lại bước đó; bản nâng cấp chỉ thêm migration theo dõi seed, giữ nội dung và các liên kết đang có.

### Nạp riêng trước khi chạy web

```powershell
dotnet run --no-launch-profile -- --seed-learning-content
```

Lệnh này áp dụng migration còn thiếu và chạy đầy đủ dataset, bản tiếng Việt và cả hai bộ chủ đề, rồi thoát; không khởi động web hoặc chạy các seed module khác. Chạy lại cùng phiên bản sẽ trả `UpToDate`. Lệnh nhập cũ `--import-learning-full=...` chỉ nhập file nguồn, không thay thế lệnh này.

Nếu muốn chủ động chạy lại toàn bộ pipeline, dùng `--seed-learning-content --force`. `--force` bỏ qua dấu phiên bản, không bỏ qua các quy tắc bảo vệ chỉnh sửa admin. `--seed-learning-content --dry-run` chỉ liệt kê phiên bản, timeout và số migration còn thiếu; không ghi DB.

Cấu hình mặc định (có thể ghi đè trong `appsettings.Local.json`):

```json
{
  "Seed": {
    "LearningContent": {
      "Enabled": true,
      "CommandTimeoutSeconds": 600
    }
  }
}
```

Đặt `Enabled=false` nếu không muốn startup tự seed; lệnh CLI nạp riêng vẫn chạy được. Timeout chỉ áp dụng cho pipeline học liệu và được trả về giá trị cũ sau khi hoàn tất hoặc gặp lỗi. Nếu lỗi giữa chừng, dữ liệu của lần nạp và dấu phiên bản đều rollback; lần sau vẫn thử lại được.

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

Sửa timeout seed và migration DB trắng (18/11/2026): kiểm tra SQL Server được bật và chạy riêng trên DB tạm. Chuỗi migration tạo đủ mọi bảng/cột trong model; nâng cấp schema cũ giữ nội dung, ID và các liên kết. Timeout SQL thực tế rollback toàn bộ, nạp lại thành công đủ dữ liệu, startup cùng phiên bản chỉ có một truy vấn trạng thái, force/đổi phiên bản không nhân đôi nội dung và giữ chỉnh sửa admin, timeout được phục hồi sau cả lỗi và thành công. DB QA tạm được dọn sau kiểm tra. CLI trên DB local hiện có chạy `Applied` khoảng 35,69 giây, lần sau `UpToDate` khoảng 0,09 giây. Model khớp migration mới.
