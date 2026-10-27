# Model học từ vựng, ngữ pháp và Topic

Phạm vi: mở rộng kho `Vocabulary` / `Grammar` hiện có, thêm Topic phẳng,
ví dụ và thông tin nguồn. Chưa triển khai API/UI/import hoặc nối Topic vào
Scenario, Shadowing, Explore, Flashcard, tài khoản hay lịch sử học.

## Các quyết định đã áp dụng

- Giữ một bản nội dung, liên kết được với nhiều Topic. Truy vấn gộp Topic nên
  dùng `Any` trên bảng nối hoặc loại trùng theo ID nội dung.
- Topic không có cha/con và không có level. JLPT nằm ở Vocabulary/Grammar;
  một Topic có thể chứa nội dung N5, N4, N3.
- `Explanation` chứa giải thích nghĩa, cách dùng và ngữ cảnh. `UsageNotes`
  chứa lưu ý, ngoại lệ và lỗi dễ mắc; cả hai là văn bản dài và cho phép null.
  Nội dung Explanation cũ được giữ nguyên, không tự đoán để tách văn bản đã gộp.
- Không thêm Romaji, bảng đồng/trái nghĩa, Kanji, cách viết khác hay Status.
- Giữ tên, ID, các trường và khóa ngoại hiện tại để tương thích module cũ.
  `AudioUrl` và `Grammar.ExampleSentence` cũ vẫn còn vì lý do tương thích.
- `Meaning` là chuỗi nghĩa tiếng Việt, tối đa 1.000 ký tự; nhập nhiều nghĩa
  theo thứ tự có thể xuống dòng. `PartOfSpeech` giữ dạng chuỗi tối đa 100 ký tự,
  chứa nhiều nhãn đã chuẩn hóa, ví dụ `Động từ nhóm 2; tha động từ`.
- `Formation` hỗ trợ nhiều công thức bằng các dòng văn bản trong cùng trường.
- Giờ hệ thống lưu UTC. `UpdatedAt` nullable và được luồng chỉnh sửa cập nhật;
  model chưa tự cập nhật ngày sửa qua `SaveChanges`.

## Các bảng

| Bảng | Trường chính / thay đổi |
|---|---|
| Vocabularies | Giữ trường cũ; Meaning tăng từ 200 lên 1.000 ký tự; thêm UsageNotes nullable và navigation TopicVocabularies, Examples, Sources |
| Grammars | Tương tự; thêm Reading (nullable, 200 ký tự), UsageNotes nullable; giữ ExampleSentence (500 ký tự) |
| LearningTopics | Id, Code (50), Name (200), Description (1.000, nullable), IsActive, CreatedAt, UpdatedAt |
| TopicVocabularies | TopicId + VocabularyId là khóa chính ghép; OrderIndex không âm |
| TopicGrammars | TopicId + GrammarId là khóa chính ghép; OrderIndex không âm |
| VocabularyExamples | Id, VocabularyId, JapaneseText (2.000), VietnameseTranslation (2.000, nullable), Furigana (4.000, nullable), OrderIndex, SourceId?, ExternalId? |
| GrammarExamples | Tương tự, thuộc GrammarId |
| LearningContentSources | Id, Name (100), Version (100), SourceUrl (1.000), License (100), LicenseUrl (1.000), Attribution (văn bản dài) |
| VocabularySources | VocabularyId + SourceId + ExternalId (200) là khóa chính ghép |
| GrammarSources | GrammarId + SourceId + ExternalId (200) là khóa chính ghép |

`Code` là mã Topic ổn định cho Excel, không phải mã JLPT. Code và Name là duy
nhất trong danh mục. Tên hiển thị đổi được mà vẫn giữ mã liên kết.

JapaneseText bắt buộc, bản dịch và furigana có thể bổ sung sau. Khi nhập nguồn,
giữ câu Nhật gốc riêng; Furigana chuẩn hóa về ký hiệu `{漢字|かな}`, ví dụ
`パンを{食|た}べます。`. Chưa có bộ chuyển ký hiệu/import ở bước này.

Nguồn thủ công không bắt buộc có bản ghi nguồn. Nội dung nhập từ dataset phải
giữ tên nguồn, phiên bản (hoặc `unversioned`), ID nguồn, URL, license và lời
ghi công. SourceId và ExternalId của ví dụ cho phép ghi nguồn câu riêng với
nguồn của từ/ngữ pháp. Nếu có ExternalId thì bắt buộc có SourceId.

Một nội dung có thể ghép nhiều bản ghi nguồn. Không đặt unique trên Word,
Word+Reading hay Pattern vì cùng cách viết có thể có mục nghĩa/cách dùng khác.
Khi viết import, phải đối chiếu ID nguồn và mục nghĩa, không tự ghép chỉ vì tên
giống nhau. Index SourceId+ExternalId hỗ trợ bước đối chiếu; chưa có import API.

## Ràng buộc và xóa

- Khóa ghép bảng nối ngăn gắn cùng nội dung hai lần vào một Topic.
- Xóa Topic chỉ xóa các dòng nối của Topic, không xóa từ/ngữ pháp.
- Xóa từ/ngữ pháp xóa các ví dụ, dòng nối Topic và tham chiếu nguồn thuộc nó;
  các khóa ngoại Restrict của module cũ vẫn có thể chặn xóa như trước.
- Xóa một ví dụ không ảnh hưởng nội dung cha hoặc ví dụ khác.
- Source đang được nội dung/ví dụ tham chiếu không được xóa dây chuyền,
  nhằm giữ thông tin ghi nguồn.
- Các chỉ số thứ tự phải không âm. Topic và thông tin nguồn không được trống.

## Các liên kết có sẵn và giới hạn tích hợp

Vocabulary/Grammar hiện được Shadowing, Explore, Bookmark và Flashcard tham
chiếu. Các quan hệ đó không bị gỡ, đổi ID hoặc chuyển sang kho riêng.
TargetVocabulary/TargetGrammar của Scenario vẫn là các bảng riêng như trước.

LearningTopics chỉ liên kết TopicVocabularies và TopicGrammars. Không thêm FK
từ Scenario, Shadowing, Explore, User hoặc FlashcardStudySession đến Topic mới.
`DefaultLearningTopicLookup` của Flashcard vẫn dùng danh mục giả theo level;
`FlashcardStudySession.TopicId` chưa phải FK tới LearningTopics. Bước nối service
này với Topic thật sẽ thực hiện riêng khi được yêu cầu.

## Migration và tương thích

Migration mới: `AddSelfStudyTopicsExamplesAndSources`, tiếp theo là
`SeparateLearningContentUsageNotes` để thêm hai cột UsageNotes nullable.

- Tạo 8 bảng mới, thêm Grammar.Reading nullable, mở rộng Meaning của hai bảng
  nội dung. Không xóa bảng/cột/khóa ngoại cũ trong Up.
- Đồng bộ FlashcardReviewLogs.MeaningSnapshot lên 1.000 ký tự để nội dung dài
  vẫn lưu được lịch sử. Không đổi thuật toán Flashcard.
- Thay index Word+Meaning / Pattern+Meaning bằng index Word / Pattern để nghĩa
  dài không vượt giới hạn kích thước khóa index của SQL Server.
- Sao chép ExampleSentence không trống vào GrammarExamples, giữ nguyên cột cũ.
  Translation, Furigana, SourceId để null khi không có thông tin thật.
- Migration UsageNotes chỉ thêm cột, không thay đổi Explanation cũ. Khi chuẩn
  hóa nguồn mới: Nihongo Mono `summary` → Explanation, `pitfalls` → UsageNotes
  (mỗi ý một dòng); Hanabira `long_explanation` → Explanation; ghi chú chưa
  phân loại rõ cần được biên tập trước khi chọn trường đích. Bản Excel/import
  sau này cần hai cột Explanation và UsageNotes.
- Snapshot và Designer được kiểm tra với model hiện tại; thứ tự migration phải
  sau migration Flashcard đã có trên nhánh.
- Sửa test migration cũ để so sánh hai phiên bản lịch sử liên tiếp, không so
  migration cũ với toàn bộ model mới khi có thêm tính năng.

Đây là phần model/mapping/migration và kiểm thử. Chưa áp dụng lên DB đang dùng,
chưa nhập dữ liệu thực tế. Down xóa các bảng mới và đưa độ dài về giới hạn cũ;
chỉ rollback khi đã lưu giữ dữ liệu cần thiết và kiểm tra dữ liệu dài.

## Kết quả kiểm tra ngày 27/10/2026

- Nhánh làm việc: `feature/flashcards`, lấy từ origin ở commit `20a0a87`.
- Tích hợp `origin/develop` ở `726815f` bằng merge không commit; không có file
  xung đột. Chưa tạo commit/push, bản merge chờ lệnh commit của người dùng.
- Backend build thành công. Toàn bộ test trước khi tách UsageNotes: 426 pass,
  3 fail; các fail là lỗi có
  sẵn của CreditServiceTests.PurchasePackageAsync_MockMode_CreatesPaidTransactionAndUpdatesBalance,
  ScenarioServiceTests.CreateScenarioAsync_ValidDto_CreatesScenarioWithLevels,
  ScenarioServiceTests.UpdateScenarioAsync_ValidId_UpdatesScenarioInfo.
- 12 test mới về model/Topic/ví dụ/nguồn/migration và 2 test mới lưu nghĩa dài
  vào lịch sử Flashcard đều pass. Test lịch sử migration cũ đã sửa cũng pass.
- Frontend build thành công, 73 test frontend pass.
- EF xác nhận không còn model change thiếu migration. Test kiểm tra latest
  migration, snapshot và runtime model khớp nhau.
- Sau khi tách UsageNotes: 77 test liên quan model, Flashcard, Shadowing và
  Explore pass; build thành công và EF không báo thiếu migration.
- Script SQL cho hai migration mới nằm ở `output/self-study-model-migration.sql`.
  Migration tách UsageNotes chỉ thêm hai cột nullable, không tự chia lại văn bản
  Explanation đã có. Chưa thực thi trên SQL Server.
