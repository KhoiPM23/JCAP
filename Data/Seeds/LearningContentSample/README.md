# Bộ mẫu từ vựng / ngữ pháp cho phát triển

15 từ vựng (5 từ/mức N5–N3), 6 mẫu ngữ pháp (2 mẫu/mức), mỗi mục 2 câu
ví dụ Nhật–Việt. Không tạo Topic, liên kết chủ đề, audio hoặc liên kết sang
Scenario/Shadowing/Explore. Không cần gọi AI hay tải nguồn khi chạy import.

## Chạy trên máy thành viên

Trong thư mục gốc repository, cấu hình kết nối SQL Server local trong
`appsettings.Local.json` như khi chạy backend, rồi dùng:

```powershell
dotnet run --no-launch-profile -- --import-learning-sample --dry-run
dotnet run --no-launch-profile -- --import-learning-sample
```

- Dry run chỉ đọc, liệt kê migration còn thiếu và nội dung trùng tên.
- Lệnh thực thi áp dụng các migration hiện có (tạo database ứng dụng nếu
  chưa có), rồi nhập trong một transaction. Không tạo migration mới.
- Chỉ cho phép SQL Server local. Chương trình thoát trước khi chạy web hoặc
  các seed tài khoản, credit, scenario, shadowing, explore.
- Chạy lại không sinh thêm bản ghi: đối chiếu tên/phiên bản nguồn + ID gốc.
  Nếu chưa có nguồn, chỉ ghép mục đã có khi toàn bộ trường nhận diện nghĩa
  tương ứng khớp chính xác. Không gộp chỉ vì trùng Word/Reading/Pattern.
- Không ghi đè nội dung, trạng thái, audio hay câu ví dụ admin đã sửa. Trường
  hợp một ID nguồn đã được gắn với nhiều bản nội dung, lệnh dừng để kiểm tra
  thay vì tự chọn một mục. Không xóa dữ liệu.
- Dữ liệu cũ có cách diễn đạt nghĩa/từ loại khác có thể là cùng nghĩa hoặc
  khác nghĩa; cần kiểm tra thủ công trước khi nhập trên database đã có nhiều
  dữ liệu. Dry run hiển thị ứng viên trùng tên để hỗ trợ đối chiếu.
- Từ mới có `AudioUrl = null`; `Grammar.ExampleSentence` giữ câu đầu tiên
  cho các module vẫn đọc trường cũ. Ví dụ đầy đủ nằm ở hai bảng Examples.

### Lưu ý khi tạo database từ đầu

Chuỗi migration cũ hiện thiếu thao tác tạo 5 bảng Scenario ban đầu:
`20260922171220_AddScenarioContentTables` sửa `Missions.CompletionCriteria`
trước khi bảng được tạo. Trên DB local tạo mới, migration có thể dừng ở đây.
Đây là lỗi có từ trước bộ mẫu; không sửa hay đánh dấu bỏ qua các migration cũ.

Nếu gặp đúng lỗi này và migration cuối đã chạy là
`20260916160000_AddJLPTLevelToApplicationUser`, mở đúng database ứng dụng
trong SQL Server, chạy `bootstrap-legacy-scenario-tables.sql` tại thư mục này,
rồi chạy lại lệnh import. Script chỉ thêm 5 bảng còn thiếu theo model lịch sử
của repo, có transaction và kiểm tra trạng thái trước khi chạy; không thêm
nội dung Scenario và không cập nhật bảng lịch sử migration.

Database đang chạy đầy đủ của các thành viên không cần bước bootstrap.

## Nguồn và các thay đổi

`sample.json` là bản sẵn sàng nhập, `upstream-selected.json` giữ nguyên 21
bản ghi đã chọn từ nguồn, bao gồm câu Nhật, gloss tiếng Anh và ghi chú gốc.

| Dữ liệu | Nguồn | Phiên bản cố định | License |
|---|---|---|---|
| 15 từ và level | [OpenJLPT](https://github.com/evanclan/OpenJLPT) | `0d1d3410bec90bd4098a7c72de820543cb4f707c` | CC BY-SA 4.0 |
| 30 câu Nhật cho từ vựng | Tatoeba/Tanaka Corpus, qua cùng bản OpenJLPT | ID từng câu được giữ tại ExternalId | CC BY 2.0 FR |
| 6 mẫu và 12 câu Nhật ngữ pháp | [Nihongo Mono](https://github.com/stndaru/nihongo-mono/tree/ec0ba4a0ce1611c568b0e4f8a223eb8029249a25/src/data/grammar) | `ec0ba4a0ce1611c568b0e4f8a223eb8029249a25` | MIT theo LICENSE-DATA.md |

JLPT là phân loại tham khảo của nguồn, không phải danh sách chính thức của
đơn vị tổ chức kỳ thi. Giữ nguyên level, cách viết, cách đọc và câu Nhật từ
nguồn. Furigana ngữ pháp đổi từ `｜漢字[かな]` thành `{漢字|かな}`. Nguồn không có
furigana thì giữ null, không tự đoán cách đọc.

Nghĩa, giải thích, lưu ý và bản dịch tiếng Việt được JCAP biên soạn/chuyển
ngữ với hỗ trợ AI; một số công thức ngữ pháp được làm rõ thêm. Đã rà soát
trong quá trình chuẩn bị bộ mẫu, **chưa có chuyên gia/người bản ngữ thẩm định**.
Đây là dữ liệu hỗ trợ phát triển, chưa phải bộ nội dung học chính thức.

`LearningContentSources`, hai bảng nối Sources và trường nguồn từng ví dụ
lưu phiên bản, ID, URL và ghi công. Ví dụ Tatoeba có thể mở theo
`https://tatoeba.org/sentences/show/<ExternalId>` để xem câu và người đóng góp.
Giấy phép/thông báo nguồn được giữ trong thư mục này. Phần dữ liệu từ vựng
phái sinh và phần biên soạn bổ sung cho từ vựng được phân phối CC BY-SA 4.0;
phần ngữ pháp phái sinh giữ MIT. Không áp giấy phép dữ liệu lên mã ứng dụng.

## Bảng có dữ liệu được thêm

`Vocabularies`, `Grammars`, `VocabularyExamples`, `GrammarExamples`,
`LearningContentSources`, `VocabularySources`, `GrammarSources`.

Database mới sẽ có 15 / 6 / 30 / 12 / 3 / 15 / 6 bản ghi tương ứng.
Các bảng khác chỉ được tạo cấu trúc bởi migration, không nạp dữ liệu vào đó.
Tài khoản thành viên hoặc dữ liệu module khác vẫn theo setup chung của team.

Đây là tiện ích nhập bộ mẫu đã chuẩn bị sẵn; chưa phải chức năng admin
import Excel, API CRUD hoặc bộ nhập toàn bộ dataset.
