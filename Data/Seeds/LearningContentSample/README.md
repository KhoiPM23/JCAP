# Bộ mẫu từ vựng / ngữ pháp cho phát triển

15 từ vựng (5 từ/mức N5–N3), 6 mẫu ngữ pháp (2 mẫu/mức), mỗi mục 2 câu
ví dụ Nhật–Việt. Từ 30/10/2026 có 15 Topic phẳng (5 tên × N5/N4/N3), mỗi
Topic chỉ nhận nội dung cùng level; chưa có audio hoặc liên kết Topic sang
Scenario/Shadowing/Explore.
Không cần gọi AI hay tải nguồn khi chạy import.

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

## Chủ đề mẫu

Sau khi nhập bộ nội dung, cùng lệnh trên chạy `LearningTopicSeeder`:

| Code | Chủ đề | Từ vựng | Ngữ pháp |
|---|---|---:|---:|
| DAILY_LIFE | Sinh hoạt hằng ngày | 7 | 5 |
| DINING | Ăn uống | 5 | 3 |
| SHOPPING | Mua sắm | 4 | 3 |
| TRANSPORT | Di chuyển | 4 | 3 |
| STUDY_WORK | Học tập và công việc | 8 | 6 |

Các số lượng trong bảng là tổng của 3 level trong mỗi tên chủ đề.
Tổng cộng 15 Topic, 28 liên kết từ vựng và 20 liên kết ngữ pháp; vẫn chỉ có
15 từ và 6 mẫu gốc. Một nội dung xuất hiện trong nhiều chủ đề cùng level
qua bảng nối, không nhân bản nội dung. Code N5 giữ mã gốc trong bảng;
code N4/N3 có hậu tố `_N4`/`_N3`.

Migration `20261030094500_AddLearningTopicLevel` chuyển 5 Topic hỗn hợp cũ
thành các Topic theo level: giữ ID cũ cho level dễ nhất, tạo các Topic khác
và chuyển liên kết sang đúng level. Không xóa từ/ngữ pháp, ví dụ hay snapshot
lịch sử. Khi rollback, giữ các Topic đã tách và phân biệt tên để không vi
phạm index tên duy nhất của schema cũ; không tự ghép lại dữ liệu.

Seeder đối chiếu nguồn/phiên bản/ID nguồn, không dựa vào ID database hoặc
tên hiển thị có thể bị admin đổi. Topic mới nhận các liên kết theo thứ tự
đã định. Topic đã tồn tại theo Code được giữ nguyên, kể cả tên, mô tả,
IsActive, thứ tự và các liên kết admin đã xóa; không tự khôi phục mỗi lần
khởi động. Nếu dữ liệu nguồn chưa đủ, seeder bỏ qua Topic đó và trả về Code
trong `SkippedTopicCodes`, không tạo chủ đề rỗng.

`SeedManager` cũng gọi seeder khi mở backend, nhưng chỉ gắn bộ nội dung mẫu
đã được nhập trước đó; không tự tải nguồn hoặc nhập thêm từ/ngữ pháp. Các
module sử dụng `DefaultLearningTopicLookup` hiện đọc trực tiếp các bảng Topic
và bảng nối này theo code develop đã merge, có lọc theo level của nội dung.

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
`LearningContentSources`, `VocabularySources`, `GrammarSources`,
`LearningTopics`, `TopicVocabularies`, `TopicGrammars`.

Database mới sẽ có 15 / 6 / 30 / 12 / 3 / 15 / 6 / 15 / 28 / 20 bản ghi tương ứng.
Các bảng khác chỉ được tạo cấu trúc bởi migration, không nạp dữ liệu vào đó.
Tài khoản thành viên hoặc dữ liệu module khác vẫn theo setup chung của team.

Đây là tiện ích nhập bộ mẫu đã chuẩn bị sẵn; chưa phải chức năng admin
import Excel, API CRUD hoặc bộ nhập toàn bộ dataset.
