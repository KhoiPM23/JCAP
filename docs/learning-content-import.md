# Nhập Excel vào kho học liệu

## Phạm vi và thao tác

Admin vào `/admin/topics`, `/admin/vocabularies` hoặc `/admin/grammars` → **Nhập Excel**.
Luồng dùng chung một popup: **Tải mẫu Excel → điền file → kiểm tra → đọc lỗi/lưu ý → xác nhận nhập**.
Hỗ trợ nhập chủ đề, từ vựng, ngữ pháp, nhiều ví dụ và nguồn/giấy phép; không nhập audio.
Không cần bảng mới hoặc migration mới. Backend dùng ClosedXML 0.105.1 (MIT); `dotnet restore` cài thư viện.
Frontend không thêm thư viện đọc Excel: file được phân tích và kiểm tra tại backend.

Mẫu tải từ server là nguồn chuẩn cho cấu trúc v1. Sheet `Guide` có hướng dẫn;
các dòng minh họa cần xóa/thay trước khi nhập thật. Các sheet không dùng có thể xóa
hoặc để trống dữ liệu, nhưng sheet đang dùng phải đủ tên cột. Có thể đổi thứ tự cột.
Không nhận tên sheet/cột tự đặt, công thức, ô lỗi, macro hoặc liên kết workbook ngoài.

Giới hạn: `.xlsx` tối đa **5 MB**, gói giải nén tối đa **25 MB** và 1.000 thành phần;
mỗi sheet Topics/Vocabularies/Grammars tối đa **500 mục**; toàn file tối đa **3.000 dòng dữ liệu**.
File phải có ít nhất một mục Topics/Vocabularies/Grammars. Không xử lý `.xls` hoặc CSV.

## Cấu trúc sheet

Tên cột giữ bằng tiếng Anh; giá trị nội dung có thể chứa tiếng Nhật và tiếng Việt.

| Sheet | Cột | Ý nghĩa |
|---|---|---|
| Topics | Code, Name, JLPTLevel, Description | Code/Name/level bắt buộc; mô tả tùy chọn |
| Vocabularies | Key, Word, Reading, Meaning, JLPTLevel, PartOfSpeech, Explanation, UsageNotes, TopicCodes, SourceKey, ExternalId | Key/Word/Meaning/level bắt buộc |
| Grammars | Key, Pattern, Reading, Meaning, JLPTLevel, Formation, Explanation, UsageNotes, TopicCodes, SourceKey, ExternalId | Key/Pattern/Meaning/level bắt buộc |
| Examples | Kind, ContentKey, JapaneseText, VietnameseTranslation, Furigana, SourceKey, ExternalId | Kind/ContentKey/JapaneseText bắt buộc |
| Sources | Key, Name, Version, SourceUrl, License, LicenseUrl, Attribution | Tất cả cột bắt buộc nếu có dòng nguồn |

- `Key` là mã trong file, không phải ID của database. Duy nhất trong từng sheet;
  chữ Latin, số, `_`, `-`, tối đa 100 ký tự. Mã không phân biệt hoa/thường khi đối chiếu.
- `Topics.Code` tối đa 50 ký tự, cùng quy tắc mã; mã mới chuyển thành chữ hoa.
  Name tối đa 200, Description 1.000; level chỉ nhận N5/N4/N3/N2/N1.
- `Word`/`Pattern` tối đa 100; Reading từ vựng 100, ngữ pháp 200;
  Meaning/Formation 1.000; PartOfSpeech 100; Explanation/UsageNotes 20.000 ký tự.
- `TopicCodes`: nhiều mã cách nhau bằng `;`, ví dụ `LIFE_N5;DINING_N5`.
  Mã có thể đã có trong kho hoặc được khai báo ở Topics trong cùng file.
  Chỉ gán các chủ đề cùng level; tối đa 100 chủ đề/mục. Để trống thì không gán.
- `Kind`: chính xác `vocabulary` hoặc `grammar`. `ContentKey` tham chiếu Key
  trong Vocabularies hoặc Grammars tương ứng của cùng file.
- Mỗi nội dung tối đa 50 ví dụ, theo thứ tự dòng Examples; JapaneseText tối đa 2.000;
  VietnameseTranslation 2.000, Furigana 4.000. Ví dụ đầu ngữ pháp tối đa 500
  và được đồng bộ vào ExampleSentence cũ. Furigana tùy chọn: `{猫|ねこ}`.
- `SourceKey` tham chiếu Sources.Key trong file. Nội dung dẫn nguồn phải có
  cả SourceKey và ExternalId. Ví dụ có thể có SourceKey mà chưa có ExternalId;
  có ExternalId luôn cần SourceKey. ExternalId tối đa 200 ký tự.
- Sources.Name/Version/License tối đa 100; URL tối đa 1.000 và phải http/https;
  Attribution tối đa 20.000. Hệ thống lưu nguyên giấy phép/ghi công do admin cung cấp,
  không tự xác nhận tính pháp lý hay chất lượng ngôn ngữ của dữ liệu.

## Quy tắc trùng và bảo toàn dữ liệu

1. Chủ đề: nhận diện bằng Code; mã đã có phải khớp tên và level. Giữ mô tả,
   trạng thái và thứ tự hiện tại. Không tạo tên trùng trong cùng level với mã khác.
2. Từ vựng: so Word + Reading; ngữ pháp: so Pattern. Nếu khớp duy nhất và cùng
   level, dùng mục có sẵn, **không ghi đè** nghĩa, giải thích, nguồn, ví dụ,
   audio hoặc trạng thái. Không khôi phục mục ẩn. Chỉ thêm liên kết chủ đề còn thiếu,
   nối vào cuối thứ tự hiện tại; không gỡ liên kết cũ.
3. Nếu có nhiều mục cùng khóa tự nhiên hoặc mục giống đang ở level khác,
   báo lỗi để admin xử lý thủ công; không chọn ngẫu nhiên hoặc tạo bản sao.
   Muốn thêm nghĩa/cách dùng riêng, dùng form thủ công với xác nhận trùng sẵn có.
4. Một file không được lặp Word + Reading hoặc Pattern với nhiều Key khác nhau.
   Dùng một dòng và nhiều TopicCodes. Key/Code trùng trong sheet cũng là lỗi.
5. Với mục đã có, các dòng ví dụ trong file được kiểm tra cấu trúc nhưng **bỏ qua**,
   không thay hoặc thêm vào ví dụ hiện tại; hiện lưu ý rõ trong preview.
6. Nguồn nhận diện bằng Name + Version. Nếu đã có mà URL, giấy phép hoặc ghi công
   khác thì báo lỗi; không sửa nguồn đang được nội dung khác sử dụng.
   Nguồn mới không được nội dung/ví dụ mới sử dụng sẽ bị bỏ qua, không tạo nguồn rời.
7. Nhập lại cùng file không nhân bản master, ví dụ, nguồn hoặc liên kết. Preview
   vẫn hiện các dòng dùng lại/bỏ qua để admin biết file thực sự thêm gì.

Chuỗi được trim hai đầu; nhận diện trong import chuẩn hóa Unicode NFC và bỏ phân biệt
hoa/thường. Không tự sửa chính tả, đổi chữ Nhật, dịch nội dung hoặc gộp các mục theo nghĩa.
Các ràng buộc duy nhất của SQL Server vẫn áp dụng; nếu phát sinh xung đột lúc lưu,
giao dịch bị hủy và admin cần kiểm tra lại file.

## Lưu dữ liệu

- Preview không SaveChanges và không tạo lô import trong database.
- File có lỗi ở bất kỳ sheet nào: không lưu bất kỳ dòng nào. Các số đếm lúc này
  chỉ là dự kiến từ những dòng hợp lệ, không phải số đã nhập.
- Confirm gửi lại cùng file + SHA-256 `fileHash` từ preview. Thay file thì phải kiểm tra lại.
  Hash gắn xác nhận với đúng file; không thay thế kiểm tra nghiệp vụ/quyền truy cập.
- Confirm kiểm tra lại database hiện tại trong transaction SQL Server Serializable,
  dùng một SaveChanges cho toàn đồ thị; lỗi lúc ghi/hoàn tất sẽ rollback toàn file.
  Không tin các số đếm client gửi lên và không giữ file upload lâu dài.
- Tất cả ba API tải mẫu/preview/confirm yêu cầu JWT role Admin; learner bị 403,
  chưa đăng nhập bị 401.

## Chuẩn bị từ nguồn mở / AI

Các nguồn đã chọn trước đây vẫn là OpenJLPT (mục từ và câu Tatoeba qua OpenJLPT)
và Nihongo Mono Grammar. File thô của nguồn **không phải** mẫu upload trực tiếp:
cần chuyển cột, chọn level, biên tập nghĩa/giải thích tiếng Việt và khai báo ghi công.
Nguồn mẫu có pin phiên bản và thông báo giấy phép trong `Data/Seeds/LearningContentSample`.

Có thể nhờ AI bên ngoài chuẩn bị file theo mẫu. Admin phải kiểm tra lại nội dung,
bản dịch, level, nguồn/giấy phép và các mã liên kết. Import không gọi AI, không crawl
nguồn, không tự suy diễn thông tin thiếu và không coi AI là nguồn dữ liệu gốc.

Prompt gợi ý:

> Dựa trên workbook mẫu JCAP được đính kèm, điền dữ liệu thành file .xlsx giữ đúng
> tên sheet và tất cả tiêu đề cột. Chỉ dùng giá trị tĩnh; không công thức.
> Xóa các dòng minh họa. Tạo Key duy nhất cho mỗi mục và tham chiếu đúng ContentKey,
> SourceKey. Mỗi mục xuất hiện một lần; nhiều chủ đề cách nhau bằng dấu ; trong
> TopicCodes, chỉ gán chủ đề cùng JLPTLevel. Tách Meaning (nghĩa ngắn), Explanation
> (giải thích), UsageNotes (lưu ý); Formation chỉ dành cho ngữ pháp. Ví dụ để từng
> dòng ở Examples, Kind là vocabulary/grammar, dịch tiếng Việt đúng câu.
> Chỉ dùng dữ liệu từ nguồn tôi cung cấp; ghi đúng phiên bản, URL, giấy phép,
> ghi công và mã bản ghi gốc. Không bịa nguồn hay thông tin chưa xác minh.
> Tuân thủ giới hạn trong sheet Guide. Phạm vi dữ liệu: [admin điền].

## Test nhanh

1. `dotnet restore`, chạy backend 5254 và frontend 5173 như setup hiện tại.
2. Đăng nhập admin, mở một trong ba trang quản lý → Nhập Excel → Tải mẫu.
3. Điền một chủ đề và 1–2 từ/mẫu ngữ pháp cùng level, kèm ví dụ; kiểm tra preview.
   Chưa xác nhận thì các mục chưa xuất hiện trong kho.
4. Đọc các lưu ý, tick xác nhận rồi nhập. Kiểm tra mục mới, chủ đề, thứ tự ví dụ
   và thông tin nguồn trong trang chi tiết.
5. Chọn lại cùng file: số mục mới/ví dụ/liên kết phải bằng 0 cho các mục đã nhập.
6. Đổi TopicCodes thành mã không tồn tại, đổi level chủ đề, dùng ContentKey sai,
   để trống nghĩa hoặc dùng công thức: phải báo đúng sheet/dòng/cột và chặn nhập.
7. Sửa/ẩn một mục trong admin rồi nhập lại file gốc: mục vẫn giữ nội dung/trạng thái;
   liên kết mới hợp lệ có thể được thêm, liên kết cũ không bị xóa.

Kiểm chứng lúc triển khai: unit test backend cho parser/service; test frontend cho
multipart/hash/lỗi; smoke qua HTTP + SQL Server; thao tác file lỗi và nhập thành công
trên trình duyệt. Có kiểm tra rollback thật bằng lỗi được chèn sau SaveChanges trước commit.
