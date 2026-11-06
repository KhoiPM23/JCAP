# Dữ liệu roadmap (Khám phá) dùng chung

`explore-content.json` là bản sao dữ liệu roadmap trong database của người soạn: chương, tỉnh đang mở, mốc, bài học,
"Một từ ở tỉnh", cùng phần ngữ pháp, từ vựng, kịch bản, bài Shadowing mà các mốc dùng tới. Cả nhóm xem thay đổi nội dung
qua git diff của file này.

**Không sửa tay file này.** Sửa trong trang admin rồi xuất lại.

## Cập nhật file (người soạn)

```powershell
node tools/explore-content/export.mjs
```

Lệnh chỉ đọc database (chuỗi kết nối trong `appsettings.Local.json`), ghi lại file và in ra những gì đã đổi cùng các mục
cần xem lại (dấu `{ }` thừa, tên tiếng Nhật không có chữ Nhật, mốc đang dùng mà nội dung quá ngắn). Nội dung vẫn được xuất
đúng như database, phần nhắc chỉ để bạn biết.

Chạy lệnh này trước mỗi commit, hoặc cài git hook ở cuối trang để nó tự chạy. Máy người soạn nên đặt
`"Explore": { "ImportContentPack": false }` trong `appsettings.Local.json`, vì database ở đó là nguồn của file này.

## Nạp vào máy thành viên

Tự chạy mỗi lần khởi động backend (`SeedManager` → `ExploreSeeder` → `ExploreContentSeeder`). Bộ mẫu ra mắt
(`ExploreSeedData.cs`) luôn nạp trước, file này nạp sau.

`explore-content.history.json` giữ các phiên bản đã từng xuất của từng mục. Nhờ vậy backend phân biệt được:

- **Dòng trong DB đúng y bản mẫu ra mắt hoặc một phiên bản cũ:** chưa ai sửa trên máy này, được cập nhật theo bản mới.
- **Dòng khác tất cả:** thành viên đã tự sửa, giữ nguyên.

| Thành phần | Quy tắc |
|---|---|
| Ngữ pháp, từ vựng, kịch bản, bài Shadowing | Thêm nếu chưa có (theo mẫu câu, từ, tiêu đề). Đã có thì không đụng tới |
| Chương | Thêm chương chưa có, cập nhật theo quy tắc trên. Chỉ gắn thêm các tỉnh chưa thuộc chương nào, không chuyển tỉnh giữa các chương. Chương người soạn đã xoá (không còn trong file) thì tắt theo như admin xoá chương, nếu máy đó chưa tự sửa chương ấy |
| Mốc | Tìm theo phiên bản đã biết, rồi theo (tỉnh, `nameJp`, cấp độ). Không thấy thì thêm. Xoá khỏi file không xoá trên máy thành viên |
| Liên kết bài | Ngữ pháp, từ vựng: thay khi đang trống hoặc đúng phiên bản cũ. Hoạt động: xử lý từng loại (Shadowing, Roleplay) theo cùng quy tắc |
| Tỉnh | Mở tỉnh vừa được thêm mốc đang dùng. Tỉnh người soạn từng đổi trạng thái thì theo trạng thái mới nhất của người soạn |
| Một từ ở tỉnh | Thêm cho tỉnh chưa có từ, cập nhật theo quy tắc trên |

Log lúc khởi động ghi kết quả và liên kết nào không tìm thấy (`Explore content pack: ...`). Tắt việc nạp bằng
`"Explore": { "ImportContentPack": false }`.

## Liên kết sang module khác

ID và mã kịch bản khác nhau giữa các máy nên file dùng khoá nội dung: `dialogueTitle` (tiêu đề bài Shadowing),
`scenarioTitle` + `scenarioLevel`, mẫu câu `pattern`, từ `word`. File chỉ mang đúng phần các mốc dùng, không phải cả module.

## Những gì file này không mang theo

- **Cờ test `Explore:CountAnyShadowingSession`** nằm trong `appsettings.Local.json` (không lên git). Bật cờ thì chỉ cần kết thúc bài
  Shadowing là có con dấu; tắt (mặc định) thì phải chấm đủ mọi câu và đạt điểm ngưỡng. Hai máy khác cờ sẽ thấy cách nhận con dấu khác nhau.
- **Database mới hoàn toàn** phải chạy `Data/Seeds/LearningContentSample/bootstrap-legacy-scenario-tables.sql` trước, xem README ở thư mục đó.
  Nếu không, migration `AddScenarioContentTables` dừng ở bước đầu, backend vẫn chạy nhưng không có bảng Khám phá
  (log có dòng `Cannot find the object "Missions"`).
- Tiến độ, con dấu của người học.

## Git hook trên máy người soạn (tuỳ chọn)

Tạo file `.git/hooks/pre-commit` (không lên git, chỉ có ở máy cài):

```sh
#!/bin/sh
node tools/explore-content/export.mjs --hook
git add Data/Seeds/ExploreContent/explore-content.json Data/Seeds/ExploreContent/explore-content.history.json
```

Không kết nối được database thì hook chỉ cảnh báo, không chặn commit.
