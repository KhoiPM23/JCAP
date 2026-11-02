# Nội dung Khám phá (mốc, bài học, "Một từ ở tỉnh")

`explore-content.json` là nội dung bản đồ Khám phá do admin soạn trên máy dev, đưa vào repo để cả nhóm đọc và
theo dõi thay đổi qua git. Bộ mẫu ra mắt (3 chương, 14 mốc ở Chiba, Tokyo, Kyoto, Nara) vẫn nằm trong
`ExploreSeedData.cs`; file này bổ sung thêm phía trên.

## Nạp vào database

Tự chạy mỗi lần khởi động backend (`SeedManager` → `ExploreSeeder` → `ExploreContentSeeder`). Tắt bằng
`"Explore": { "ImportContentPack": false }` trong `appsettings.Local.json`.

Chỉ **thêm phần còn thiếu**, không ghi đè những gì admin đã sửa trên máy:

| Thành phần | Quy tắc |
|---|---|
| Chương | Thêm chương theo `orderIndex` chưa có. Chỉ gắn các tỉnh chưa thuộc chương nào |
| Mốc | Khớp theo (tỉnh, `nameJp`, cấp độ). Đã có thì bỏ qua, không sửa tên, vị trí, nội dung |
| Liên kết bài | Mốc đã có mà bài chưa có ngữ pháp / từ vựng / hoạt động thì bổ sung loại còn trống |
| Tỉnh | Chỉ mở tỉnh đang đóng khi lần nạp này vừa thêm mốc đang dùng vào tỉnh đó. Admin đã đóng tỉnh thì không bị mở lại |
| Một từ ở tỉnh | Thêm cho tỉnh chưa có từ |

## Liên kết sang module khác

ID khác nhau giữa các máy nên file dùng khoá nội dung:

- Shadowing: `dialogueTitle` (tiêu đề bài hội thoại)
- Hội thoại AI: `scenarioCode` + `scenarioLevel` (vd. `SCN_25` + `N5`)
- Ngữ pháp: mẫu câu (`pattern`), từ vựng: `word`

Máy nào chưa có nội dung đó thì bỏ liên kết đó, mốc vẫn được tạo. Log lúc khởi động ghi rõ liên kết nào thiếu
(`Explore content pack: không tìm thấy ...`). Có nội dung rồi thì chạy lại backend để bổ sung.

## Sửa nội dung

Sửa trực tiếp `explore-content.json` rồi tạo PR. Câu mẫu chia đoạn `{ "text": "...", "reading": "..." }`, `reading` chỉ gồm
kana. Mỗi (tỉnh, `nameJp`, `level`) chỉ xuất hiện một lần. Test `ExploreContentSeederTests` kiểm tra định dạng này.
Mốc đã có sẵn trên máy thành viên không tự cập nhật theo file; muốn nạp lại thì sửa trong trang admin hoặc xoá mốc
đó khỏi database local (khoá `IsActive = false` không đủ, vì mốc ngừng dùng vẫn được tính là đã có).
