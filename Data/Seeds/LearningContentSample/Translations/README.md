# Việt hóa theo lô

Phạm vi là bộ N5–N3 đã ghim phiên bản trong `../learning-n5-n3.json`.
Giữ nguyên chữ Nhật, cách đọc, furigana, level, ID và thông tin nguồn.
Không thêm chủ đề hoặc thay đổi quan hệ giữa các module.

## Quy trình

- Tối đa 20 từ vựng hoặc 5 mẫu ngữ pháp mỗi lô, theo thứ tự nguồn trong từng level N5 → N4 → N3.
- Từ vựng: nghĩa, từ loại, giải thích, lưu ý nếu cần và toàn bộ bản dịch ví dụ.
- Ngữ pháp: nghĩa, cấu trúc, giải thích, lưu ý và toàn bộ bản dịch ví dụ.
- Giải thích từ vựng được biên soạn thêm vì nguồn chủ yếu có nghĩa ngắn.
- Không suy nghĩa chỉ từ tiếng Anh khi câu Nhật cho thấy nghĩa khác. Những chỗ cần sửa/đối chiếu ghi trong `ReviewNotes`.
- `reviewed-by-agent` là AI đã đọc lại theo ngữ cảnh Nhật, không phải chứng nhận chuyên gia hoặc bản dịch chính thức từ nguồn.
- Các bản dịch trong bộ mẫu và SQL food-permission được giữ lại. Chúng được tính riêng, chưa được rà soát lại trong đợt này.

## Tệp và cách tiếp tục

- `batches/*.json`: nội dung từng lô, hash của từng bản ghi nguồn và ghi chú rà soát.
- `previous-translations.json`: bản dịch đã phát hành được hiệu đính, dùng để cập nhật đúng bản lỗi trên DB cũ.
- `queue.json`: toàn bộ danh sách công việc, chia lô cố định và đánh dấu lô đã có bản dịch.
- `../../../../docs/learning-translation-progress.md`: tóm tắt và lô tiếp theo.
- `verification.md`: kết quả kiểm tra và áp dụng vào DB; tách biệt với việc đã dịch trong source.
- `reviewed.sql`: SQL sinh tự động để backend seed. Không sửa trực tiếp.

Chạy từ thư mục repository, chỉ cần Node.js cho bước biên soạn:

```powershell
node Data/Seeds/LearningContentSample/Translations/build.mjs
node Data/Seeds/LearningContentSample/Translations/build.mjs --check
```

Để xem một lô, đọc phần tử tương ứng trong `queue.json`, không đọc toàn bộ dataset vào context.
Tạo JSON theo mẫu lô trước. `SourceHash` lấy từ queue; công cụ kiểm tra lại với bản gốc để tránh áp nhầm bản dịch khi đổi nguồn.
Khóa trong `Examples` là ID ví dụ gốc, không phải số thứ tự hay ID trong database.
Lô chưa dịch đủ ví dụ không được đưa vào `batches/`. Lưu nháp ngoài thư mục đó và ghi rõ trong sổ tiến độ nếu cần.

## Áp dụng

Backend tự áp dụng `reviewed.sql` sau seed nội dung và đợt Việt hóa cũ, cùng transaction của seed.
Máy chạy ứng dụng không cần Node.js, Python hay dịch vụ AI cho bước seed.
Để áp dụng riêng lên DB local đã có dữ liệu:

```powershell
sqlcmd -S localhost -E -C -d JCAP_DB -b -f 65001 -i Data/Seeds/LearningContentSample/Translations/reviewed.sql
```

SQL đối chiếu nguồn, phiên bản, ID gốc và trường nhận diện. Nội dung chính được thay khi toàn bộ trường còn khớp nguyên bản hoặc khớp bản dịch cũ đã ghi trong `previous-translations.json`. Ví dụ được cập nhật khi câu Nhật còn nguyên và bản dịch đang trống hoặc khớp chính xác bản dịch cũ cần hiệu đính. Bản ghi mất nguồn hoặc đổi nhận diện được bỏ qua và đếm. Nguồn bị gắn trùng làm transaction dừng để kiểm tra. Các chỉnh sửa riêng của admin được giữ lại cùng với ID, trạng thái và quan hệ. Chạy lại sau khi hiệu đính sẽ bỏ qua các mục đã cập nhật.

Các số liệu trong tiến độ là độ bao phủ ở source. DB đã được admin chỉnh sửa có thể bỏ qua một số mục.
Không cần migration vì chỉ bổ sung nội dung.

## Nguồn và giấy phép

Thông tin attribution/version/license giữ tại `../README.md` và dataset gốc.
Nghĩa từ vựng được chuyển thể từ OpenJLPT (CC BY-SA 4.0); câu từ vựng từ Tatoeba qua OpenJLPT (CC BY 2.0 FR); ngữ pháp và câu ví dụ từ Nihongo Mono (MIT). Bản chuyển thể từ vựng tiếp tục theo CC BY-SA 4.0.
Nguồn từ điển hoặc tài liệu hướng dẫn đối chiếu trong `ReviewNotes` chỉ dùng kiểm tra nghĩa; không chép hàng loạt phần giải thích từ các trang đó.
