# Kiểm tra đợt Việt hóa 2026-11-13

## Trạng thái bàn giao 18/11/2026

Đã hoàn tất dữ liệu trong source cho 2.963 từ vựng và 556 mẫu ngữ pháp N5–N3. `build.mjs --check` kiểm tra đạt 259 lô, không còn lô pending. Có 124 chủ đề đóng gói cùng seed. Đây là độ bao phủ dữ liệu, chưa phải xác nhận mọi nghĩa/từ loại/cách gán nhóm đều đã được thẩm định; đợt rà soát ngôn ngữ vẫn còn cần thực hiện.

Kiểm tra trước khi chia sẻ: 84 test liên quan học liệu đạt, frontend build thành công. Import thật qua UI/API/SQL Server đạt các trường hợp hợp lệ, nhập lại không trùng, file thiếu dữ liệu/khác level/sai tham chiếu và đổi file sau preview. Dữ liệu kiểm thử đã được dọn, số bản ghi của 10 bảng liên quan trở về đúng ban đầu.

Các phần bên dưới là nhật ký lịch sử từng lô; các dòng “lô tiếp theo” hoặc “chưa commit/push” mô tả trạng thái tại thời điểm ghi nhật ký, không phải trạng thái hiện tại. Hướng dẫn bàn giao nằm ở `docs/learning-content-handoff.md` từ thư mục gốc repository.

## Phạm vi hoàn tất

- N5-V-001: 20 từ, 40 câu ví dụ.
- N5-V-002: 20 từ, 40 câu ví dụ.
- N5-G-001: 5 mẫu, 10 câu ví dụ.
- N5-G-002: 5 mẫu, 10 câu ví dụ.

Đã đọc lại bản dịch theo từng câu Nhật. Các điểm nguồn thiếu hoặc dễ hiểu sai ghi trong `ReviewNotes` của từng JSON. Đây là rà soát của AI, chưa có chuyên gia độc lập duyệt.

## Kết quả kỹ thuật

- `build.mjs --check` thành công: đủ ID, hash nguồn đúng, không dịch trùng, đủ ví dụ và các trường bắt buộc trong 4 lô; các đầu ra SQL/queue/tiến độ khớp với JSON.
- Build backend Release thành công.
- Backend tests: 776 pass, 0 fail. Các cảnh báo nullable có sẵn trong bộ test.
- Kiểm tra SQL thật trên `JCAP_DB` trong transaction rồi rollback: 50 mục nội dung và 100 câu ví dụ khớp toàn bộ bản dịch dự kiến.
- Chạy SQL lần hai trong transaction: 0 cập nhật; so sánh cả dòng, bao gồm `UpdatedAt`, không thay đổi dữ liệu ở các bảng nội dung, ví dụ và chủ đề.
- Thử sửa nghĩa/giải thích từ vựng, cấu trúc/nghĩa ngữ pháp, bản dịch ví dụ, chữ Nhật trong ví dụ và chữ Nhật của từ; thử xóa một ví dụ. Seed giữ các chỉnh sửa này, không tạo lại câu đã xóa, không dịch câu Nhật đã bị đổi. Toàn bộ thao tác thử đã rollback.

## Áp dụng local

Đã lưu bản sao 40 từ + 10 mẫu + 100 câu ví dụ trước khi cập nhật tại `output/learning-translations-before-20261113.json` (ignored, chỉ trên máy local).

Đã áp dụng `reviewed.sql` vào SQL Server local `JCAP_DB`: 50 mục và 100 câu được cập nhật; không có nguồn bị thiếu hoặc nhận diện bị đổi. Backend đã nhúng SQL này để chạy cùng seed ở những lần khởi động sau.

Không tạo migration; không thêm chủ đề, đổi chữ Nhật/cách đọc hay liên kết; chưa commit/push.

## Tiếp tục

Lô tiếp theo trong hàng đợi là **N5-V-003**. Lô ngữ pháp kế tiếp là **N5-G-003**. Đọc danh sách tương ứng trong `queue.json`; không cần đọc lại toàn bộ dữ liệu hoặc lịch sử chat.

Không chạy lại script QA trong `output/verify-learning-translations.sql` trên DB đã áp dụng để kiểm tra nguyên trạng ban đầu: script đó giả định nội dung vẫn là tiếng Anh. Dùng `output/check-learning-translations.sql` để kiểm tra bản dịch hiện tại; nếu cần lặp lại thử nghiệm từ dữ liệu gốc, dùng database thử nghiệm riêng.

## N5-V-003

Đã dịch 20 từ và toàn bộ 36 câu ví dụ trong nguồn. Hai mục あれ và いいえ không có câu ví dụ trong bộ nguồn.

Đã kiểm tra đầu ra bằng `build.mjs --check`. Kiểm tra SQL trong transaction rồi rollback xác nhận 20 từ và 36 câu được cập nhật. Lần chạy thứ hai cập nhật 0 bản ghi. Một lượt kiểm tra riêng xác nhận SQL giữ nghĩa và bản dịch do admin nhập, đồng thời bỏ qua ví dụ có câu Nhật đã sửa.

Đã áp dụng vào `JCAP_DB` và đối chiếu các bản dịch sau khi cập nhật. Bản sao trước khi cập nhật nằm tại `output/n5-v-003-before-20261113.json`.

Lô tiếp theo là **N5-V-004**. Bắt đầu lô đó khi người dùng ra tín hiệu tiếp tục.

## N5-V-004

Đã dịch 20 từ và 40 câu ví dụ. Câu chứa 五つ木通り giữ tên đường bằng chữ Nhật. Phần lưu ý ở mục 五つ giải thích đây là tên riêng.

Kiểm tra `build.mjs --check` đạt. Kiểm tra SQL xác nhận 20 từ và 40 câu được cập nhật, lần chạy thứ hai cập nhật 0 bản ghi và dữ liệu admin chỉnh sửa được giữ lại.

Đã áp dụng và đối chiếu bản dịch trong `JCAP_DB`. Bản sao trước khi cập nhật nằm tại `output/n5-v-004-before-20261113.json`.

Lô tiếp theo là **N5-V-005**. Bắt đầu khi người dùng ra tín hiệu tiếp tục.

## N5-V-005

Đã dịch 20 từ và 40 câu ví dụ. Ghi chú làm rõ cách dùng 起きている, 大きな, 多い và nghĩa của かぎ trong câu treo áo.

Kiểm tra `build.mjs --check` đạt. Kiểm tra SQL xác nhận 20 từ và 40 câu được cập nhật, lần chạy thứ hai cập nhật 0 bản ghi. Kiểm tra riêng xác nhận giữ nghĩa và bản dịch do admin sửa, bỏ qua câu Nhật đã thay đổi.

Đã áp dụng và đối chiếu bản dịch trong `JCAP_DB`. Bản sao trước khi cập nhật nằm tại `output/n5-v-005-before-20261113.json`.

Lô tiếp theo là **N5-V-006**. Bắt đầu khi người dùng ra tín hiệu tiếp tục.

## N5-V-006

Đã dịch 20 từ và 39 câu ví dụ. Mục 一昨年 có một câu ví dụ trong nguồn.

Kiểm tra dữ liệu nguồn và SQL đạt. Lần đầu cập nhật 20 từ và 39 câu, lần thứ hai cập nhật 0 bản ghi. Thử nghiệm chỉnh sửa nghĩa, bản dịch và câu Nhật xác nhận giữ dữ liệu admin.

Đã áp dụng và đối chiếu bản dịch trong JCAP_DB. Bản sao trước cập nhật nằm tại `output/n5-v-006-before-20261113.json`.

Lô tiếp theo là **N5-V-007**, chờ tín hiệu tiếp tục của người dùng.

## N5-V-007

Đã dịch 20 từ và 40 câu ví dụ. Mục 伯母さん có ghi chú về cách viết 叔母さん trong hai câu nguồn.

Kiểm tra dữ liệu và SQL đạt. Lượt chạy lại cập nhật 0 bản ghi. Thử nghiệm xác nhận giữ chỉnh sửa của admin.

Đã cập nhật và đối chiếu bản dịch trong JCAP_DB. Bản sao trước cập nhật nằm tại `output/n5-v-007-before-20261113.json`.

Lô tiếp theo là **N5-V-008**, chờ tín hiệu tiếp tục của người dùng.

## N5-V-008

Đã dịch 20 từ và 40 câu ví dụ. Các mục かかる và かける có ghi chú về nghĩa dùng trong từng câu nguồn.

Kiểm tra dữ liệu và SQL đạt. Chạy lại cập nhật 0 bản ghi và thử nghiệm xác nhận giữ chỉnh sửa của admin.

Đã cập nhật và đối chiếu bản dịch trong JCAP_DB. Bản sao trước cập nhật nằm tại `output/n5-v-008-before-20261113.json`.

Lô tiếp theo là **N5-V-009**, chờ tín hiệu tiếp tục của người dùng.

## N5-V-009

Đã dịch 20 từ và 40 câu ví dụ. Câu 80097 dùng lại bản dịch từ N5-V-002 để nhất quán.

Kiểm tra dữ liệu và SQL đạt. Chạy lại cập nhật 0 bản ghi. Thử nghiệm xác nhận giữ chỉnh sửa của admin.

Đã cập nhật và đối chiếu bản dịch trong JCAP_DB. Bản sao trước cập nhật nằm tại `output/n5-v-009-before-20261113.json`.

Lô tiếp theo là **N5-V-010**, chờ tín hiệu tiếp tục của người dùng.

## N5-V-010

Đã dịch 20 từ và 40 câu ví dụ. Ba câu xuất hiện ở các lô trước dùng lại bản dịch để nhất quán.

Kiểm tra dữ liệu và SQL đạt. Lượt chạy lại cập nhật 0 bản ghi. Thử nghiệm xác nhận giữ chỉnh sửa của admin.

Đã cập nhật và đối chiếu bản dịch trong JCAP_DB. Bản sao trước cập nhật nằm tại `output/n5-v-010-before-20261113.json`.

Lô tiếp theo là **N5-V-011**, chờ tín hiệu tiếp tục của người dùng.

## N5-V-011

Đã dịch 20 từ và 40 câu ví dụ. Mục グラム có ghi chú vì hai câu nguồn dùng プログラム và インスタグラム.

Kiểm tra dữ liệu và SQL đạt. Lượt chạy lại cập nhật 0 bản ghi. Thử nghiệm xác nhận giữ chỉnh sửa của admin.

Đã áp dụng và đối chiếu bản dịch trong JCAP_DB. Bản sao trước cập nhật nằm tại `output/n5-v-011-before-20261113.json`.

Lô tiếp theo là **N5-V-012**, chờ tín hiệu tiếp tục của người dùng.

## N5-V-012

Đã dịch 20 từ và 35 câu ví dụ. Nguồn không có câu cho ここ và コップ, và có một câu cho コート.

Kiểm tra SQL xác nhận chạy lại cập nhật 0 bản ghi và giữ các chỉnh sửa của admin. Đã áp dụng và đối chiếu bản dịch trong JCAP_DB. Bản sao trước cập nhật nằm tại `output/n5-v-012-before-20261113.json`.

Lô tiếp theo là **N5-V-013**, chờ tín hiệu tiếp tục của người dùng.

## N5-V-013

Đã dịch 20 từ và 39 câu ví dụ. Mục 再来年 có một câu nguồn. Mục 今週 ghi chú dạng viết chuẩn いらっしゃいました cho câu 172375.

Kiểm tra SQL xác nhận chạy lại cập nhật 0 bản ghi và giữ các chỉnh sửa của admin. Đã áp dụng và đối chiếu bản dịch trong JCAP_DB. Bản sao trước cập nhật nằm tại `output/n5-v-013-before-20261113.json`.

Lô tiếp theo là **N5-V-014**, chờ tín hiệu tiếp tục của người dùng.

## N5-V-014

Đã dịch 20 từ và 40 câu ví dụ. Câu 201896 dịch 閉まっていた là cửa đóng theo câu Nhật.

Kiểm tra SQL xác nhận chạy lại cập nhật 0 bản ghi và giữ các chỉnh sửa của admin. Đã áp dụng và đối chiếu bản dịch trong JCAP_DB. Bản sao trước cập nhật nằm tại `output/n5-v-014-before-20261113.json`.

Lô tiếp theo là **N5-V-015**, chờ tín hiệu tiếp tục của người dùng.

## N5-V-015

Đã dịch 20 từ và 39 câu ví dụ. Mục しょうゆ có một câu nguồn. Câu 172985 dùng lại bản dịch của mục 黒.

Kiểm tra SQL xác nhận chạy lại cập nhật 0 bản ghi và giữ các chỉnh sửa của admin. Đã áp dụng và đối chiếu bản dịch trong JCAP_DB. Bản sao trước cập nhật nằm tại `output/n5-v-015-before-20261113.json`.

Lô tiếp theo là **N5-V-016**, chờ tín hiệu tiếp tục của người dùng.

## N5-V-016

Đã dịch 20 từ và 40 câu ví dụ. Ba câu dùng lại bản dịch đã có. Mục ズボン có ghi chú cách diễn đạt tự nhiên hơn cho câu 202838.

Kiểm tra SQL xác nhận chạy lại cập nhật 0 bản ghi và giữ các chỉnh sửa của admin. Đã áp dụng và đối chiếu bản dịch trong JCAP_DB. Bản sao trước cập nhật nằm tại `output/n5-v-016-before-20261113.json`.

Lô tiếp theo là **N5-V-017**, chờ tín hiệu tiếp tục của người dùng.

## N5-V-017

Đã dịch 20 từ và 38 câu ví dụ. Mục その không có câu nguồn. Câu 213883 được dịch theo bản Nhật vì câu tiếng Anh nguồn khác nghĩa.

Kiểm tra SQL xác nhận chạy lại cập nhật 0 bản ghi và giữ các chỉnh sửa của admin. Đã áp dụng và đối chiếu bản dịch trong JCAP_DB. Bản sao trước cập nhật nằm tại `output/n5-v-017-before-20261113.json`.

Lô tiếp theo là **N5-V-018**, chờ tín hiệu tiếp tục của người dùng.

## N5-V-018

Đã dịch 20 từ và 40 câu ví dụ. Mục たて giải thích phương dọc và kích thước theo phương đó.

Kiểm tra SQL xác nhận chạy lại cập nhật 0 bản ghi và giữ các chỉnh sửa của admin. Đã áp dụng và đối chiếu bản dịch trong JCAP_DB. Bản sao trước cập nhật nằm tại `output/n5-v-018-before-20261113.json`.

Lô tiếp theo là **N5-V-019**, chờ tín hiệu tiếp tục của người dùng.

## N5-V-019

Đã dịch 20 từ và 40 câu ví dụ. Câu 201736 được dịch như lời giải thích theo bản Nhật. Mục 手 ghi nghĩa quai và cách làm theo hai câu nguồn.

Kiểm tra SQL xác nhận chạy lại cập nhật 0 bản ghi và giữ các chỉnh sửa của admin. Đã áp dụng và đối chiếu bản dịch trong JCAP_DB. Bản sao trước cập nhật nằm tại `output/n5-v-019-before-20261113.json`.

Lô tiếp theo là **N5-V-020**, chờ tín hiệu tiếp tục của người dùng.

## N5-V-020

Đã dịch 20 từ và 38 câu ví dụ. Mục どう không có câu nguồn. Mục できる có ghi chú về nghĩa quan hệ tình cảm trong câu 230516.

Kiểm tra SQL xác nhận chạy lại cập nhật 0 bản ghi và giữ các chỉnh sửa của admin. Đã áp dụng và đối chiếu bản dịch trong JCAP_DB. Bản sao trước cập nhật nằm tại `output/n5-v-020-before-20261113.json`.

Lô tiếp theo là **N5-V-021**, chờ tín hiệu tiếp tục của người dùng.

## N5-V-021

Đã dịch 20 từ và 40 câu ví dụ. Sáu câu xuất hiện ở lô trước dùng lại bản dịch để nhất quán.

Kiểm tra SQL xác nhận chạy lại cập nhật 0 bản ghi và giữ các chỉnh sửa của admin. Đã áp dụng và đối chiếu bản dịch trong JCAP_DB. Bản sao trước cập nhật nằm tại `output/n5-v-021-before-20261113.json`.

Lô tiếp theo là **N5-V-022**, chờ tín hiệu tiếp tục của người dùng.

## N5-V-022

Đã dịch 20 từ và 38 câu ví dụ. Mục どれ không có câu nguồn. Câu 201917 dùng lại bản dịch ở mục 外.

Kiểm tra SQL xác nhận chạy lại cập nhật 0 bản ghi và giữ các chỉnh sửa của admin. Đã áp dụng và đối chiếu bản dịch trong JCAP_DB. Bản sao trước cập nhật nằm tại `output/n5-v-022-before-20261113.json`.

Lô tiếp theo là **N5-V-023**, chờ tín hiệu tiếp tục của người dùng.

## N5-V-023

Đã dịch 20 từ và 40 câu ví dụ. Giữ nhất quán bốn câu đã xuất hiện ở các lô trước.

Kiểm tra SQL xác nhận chạy lại cập nhật 0 bản ghi và giữ các chỉnh sửa của admin. Đã áp dụng và đối chiếu bản dịch trong JCAP_DB. Bản sao trước cập nhật nằm tại `output/n5-v-023-before-20261113.json`.

Lô tiếp theo là **N5-V-024**, chờ tín hiệu tiếp tục của người dùng.

## N5-V-024

Đã dịch 20 từ và 39 câu ví dụ. Mục バス có một câu nguồn. Ba câu xuất hiện ở lô trước dùng lại bản dịch.

Kiểm tra SQL xác nhận chạy lại cập nhật 0 bản ghi và giữ các chỉnh sửa của admin. Đã áp dụng và đối chiếu bản dịch trong JCAP_DB. Bản sao trước cập nhật nằm tại `output/n5-v-024-before-20261113.json`.

Lô tiếp theo là **N5-V-025**, chờ tín hiệu tiếp tục của người dùng.

## N5-V-025

Đã dịch 20 từ và 40 câu ví dụ. Mục 半分 dùng nghĩa một nửa theo câu Nhật, thay cho chú giải tiếng Anh sai trong nguồn.

Kiểm tra SQL xác nhận chạy lại cập nhật 0 bản ghi và giữ các chỉnh sửa của admin. Đã áp dụng và đối chiếu bản dịch trong JCAP_DB. Bản sao trước cập nhật nằm tại `output/n5-v-025-before-20261113.json`.

Lô tiếp theo là **N5-V-026**, chờ tín hiệu tiếp tục của người dùng.

## N5-V-026

Đã dịch 20 từ và 38 câu ví dụ. Mục フォーク không có câu nguồn. Bốn câu xuất hiện ở lô trước dùng lại bản dịch.

Kiểm tra SQL xác nhận chạy lại cập nhật 0 bản ghi và giữ các chỉnh sửa của admin. Đã áp dụng và đối chiếu bản dịch trong JCAP_DB. Bản sao trước cập nhật nằm tại `output/n5-v-026-before-20261113.json`.

Lô tiếp theo là **N5-V-027**, chờ tín hiệu tiếp tục của người dùng.

## N5-V-027

Đã dịch 20 từ và 40 câu ví dụ. Ba câu đã có ở các lô trước dùng lại bản dịch.

Kiểm tra SQL xác nhận chạy lại cập nhật 0 bản ghi và giữ các chỉnh sửa của admin. Đã áp dụng và đối chiếu bản dịch trong JCAP_DB. Bản sao trước cập nhật nằm tại `output/n5-v-027-before-20261113.json`.

Lô tiếp theo là **N5-V-028**, chờ tín hiệu tiếp tục của người dùng.

## N5-V-028

Đã dịch 20 từ và 39 câu ví dụ. Câu 219866 theo dạng trần thuật của bản Nhật. Năm câu dùng lại bản dịch đã có.

Kiểm tra SQL xác nhận chạy lại cập nhật 0 bản ghi và giữ các chỉnh sửa của admin. Đã áp dụng và đối chiếu bản dịch trong JCAP_DB. Bản sao trước cập nhật nằm tại `output/n5-v-028-before-20261113.json`.

Lô tiếp theo là **N5-V-029**, chờ tín hiệu tiếp tục của người dùng.

## N5-V-029

Đã dịch 20 từ và 40 câu ví dụ. Ba câu dùng lại bản dịch đã có.

Kiểm tra SQL xác nhận chạy lại cập nhật 0 bản ghi và giữ các chỉnh sửa của admin. Đã áp dụng và đối chiếu bản dịch trong JCAP_DB. Bản sao trước cập nhật nằm tại `output/n5-v-029-before-20261113.json`.

Lô tiếp theo là **N5-V-030**, chờ tín hiệu tiếp tục của người dùng.

## N5-V-030

Đã dịch 20 từ và 39 câu ví dụ. Mục メートル có một câu nguồn. Mục 門 ghi chú cách ngắt câu 79781.

Kiểm tra SQL xác nhận chạy lại cập nhật 0 bản ghi và giữ các chỉnh sửa của admin. Đã áp dụng và đối chiếu bản dịch trong JCAP_DB. Bản sao trước cập nhật nằm tại `output/n5-v-030-before-20261113.json`.

Lô tiếp theo là **N5-V-031**, chờ tín hiệu tiếp tục của người dùng.

## N5-V-031

Đã dịch 20 từ và 40 câu ví dụ. Mục よく giải thích sắc thái cảm kích và bực tức trong hai câu nguồn.

Kiểm tra SQL xác nhận chạy lại cập nhật 0 bản ghi và giữ các chỉnh sửa của admin. Đã áp dụng và đối chiếu bản dịch trong JCAP_DB. Bản sao trước cập nhật nằm tại `output/n5-v-031-before-20261113.json`.

Lô tiếp theo là **N5-V-032**, chờ tín hiệu tiếp tục của người dùng.

## N5-V-032

Đã dịch 20 từ và 37 câu ví dụ. Mục 零 không có câu nguồn. Câu 78052 giữ cách phủ định một phần theo bản Nhật.

Kiểm tra SQL xác nhận chạy lại cập nhật 0 bản ghi và giữ các chỉnh sửa của admin. Đã áp dụng và đối chiếu bản dịch trong JCAP_DB. Bản sao trước cập nhật nằm tại `output/n5-v-032-before-20261113.json`.

Lô tiếp theo là **N5-V-033**, chờ tín hiệu tiếp tục của người dùng.

## N5-V-033

Đã dịch và đối chiếu 8 từ cùng 16 câu ví dụ trong JCAP_DB. Kiểm tra SQL xác nhận chạy lại cập nhật 0 bản ghi và giữ các chỉnh sửa của admin. Bản sao trước cập nhật nằm tại `output/n5-v-033-before-20261113.json`.

Đã phủ đủ 674 mục từ vựng N5, gồm 26 mục có bản dịch từ trước và 648 mục mới.

Lô tiếp theo là **N5-G-003**, chờ tín hiệu tiếp tục của người dùng.

## N5-G-003

Đã dịch 5 mẫu ngữ pháp và 10 câu ví dụ. Kiểm tra SQL xác nhận chạy lại cập nhật 0 bản ghi và giữ các chỉnh sửa của admin.

Đã áp dụng và đối chiếu trong JCAP_DB. Bản sao trước cập nhật nằm tại `output/n5-g-003-before-20261113.json`.

Lô tiếp theo là **N5-G-004**, chờ tín hiệu tiếp tục của người dùng.

## N5-G-004

Đã dịch và đối chiếu 5 mẫu ngữ pháp cùng 10 câu ví dụ trong JCAP_DB. Kiểm tra SQL xác nhận chạy lại cập nhật 0 bản ghi và giữ các chỉnh sửa của admin. Bản sao trước cập nhật nằm tại `output/n5-g-004-before-20261113.json`.

Lô tiếp theo là **N5-G-005**, chờ tín hiệu tiếp tục của người dùng.

## N5-G-005

Đã dịch và đối chiếu 5 mẫu ngữ pháp cùng 10 câu ví dụ trong JCAP_DB. Kiểm tra SQL xác nhận chạy lại cập nhật 0 bản ghi và giữ các chỉnh sửa của admin. Bản sao trước cập nhật nằm tại `output/n5-g-005-before-20261113.json`.

Lô tiếp theo là **N5-G-006**, chờ tín hiệu tiếp tục của người dùng.

## N5-G-006 đến N5-G-015

Đã dịch 50 mẫu ngữ pháp và 100 câu ví dụ. Đã áp dụng và đối chiếu trong JCAP_DB. Kiểm tra SQL xác nhận lượt chạy lại cập nhật 0 bản ghi và giữ chỉnh sửa của admin. Bản sao trước cập nhật nằm tại `output/n5-g-006-015-before-20261114.json`.

Còn 40 mẫu ngữ pháp N5. Lô kế tiếp bắt đầu từ **N5-G-016**.

## N5-G-016 đến N5-G-023 và N4-V-001 đến N4-V-002

Đã dịch 40 mẫu ngữ pháp N5, 40 từ vựng N4 và 158 câu ví dụ. Kiểm tra SQL trong transaction xác nhận đủ bản dịch và lượt chạy lại cập nhật 0 bản ghi. Đã áp dụng và đối chiếu trong JCAP_DB. Bản sao trước cập nhật nằm tại `output/n5-g-016-n4-v-002-before-20261114.json`.

Đã hoàn thành N5. Lô kế tiếp bắt đầu từ **N4-V-003**.

## N4-V-003 đến N4-V-012

Đã dịch 200 từ và 392 câu ví dụ. Kiểm tra SQL trong transaction xác nhận đủ dữ liệu và lượt chạy lại cập nhật 0 bản ghi. Đã áp dụng và đối chiếu trong JCAP_DB. Bản sao trước cập nhật nằm tại `output/n4-v-003-012-before-20261114.json`.

Lô kế tiếp bắt đầu từ **N4-V-013**.

## N4-V-013 đến N4-V-022

Đã dịch 200 từ và 393 câu ví dụ. Kiểm tra SQL trong giao dịch thử xác nhận đủ dữ liệu và lượt chạy lại cập nhật 0 bản ghi. Đã áp dụng và đối chiếu trong JCAP_DB. Bản sao trước cập nhật nằm tại `output/n4-v-013-022-before-20261114.json`.

Lô kế tiếp bắt đầu từ **N4-V-023**.

## N4-V-023 đến N4-V-032

Đã dịch 185 từ và 365 câu ví dụ. Kiểm tra SQL xác nhận dữ liệu đã lưu trong JCAP_DB, ID giữ nguyên và lượt chạy lại cập nhật 0 bản ghi. Bản sao trước cập nhật nằm tại `output/n4-v-023-032-before-20261114.json`.

Đã hoàn thành từ vựng N4. Lô kế tiếp bắt đầu từ **N4-G-001**.

## N4-G-001 đến N4-G-010

Đã dịch nghĩa, cấu trúc và cách dùng của 50 mẫu ngữ pháp, cùng 100 câu ví dụ. Đã áp dụng và đối chiếu trong JCAP_DB. Kiểm tra SQL xác nhận lượt chạy lại cập nhật 0 bản ghi. Bản sao trước cập nhật nằm tại `output/n4-g-001-010-before-20261114.json`.

Lô kế tiếp bắt đầu từ **N4-G-011**.

## N4-G-011 đến N4-G-020

Đã dịch 50 mẫu ngữ pháp và 100 câu ví dụ. Đã áp dụng và đối chiếu trong JCAP_DB. Kiểm tra SQL xác nhận lượt chạy lại cập nhật 0 bản ghi. Bản sao trước cập nhật nằm tại `output/n4-g-011-020-before-20261114.json`.

Lô kế tiếp bắt đầu từ **N4-G-021**.

## N4-G-021 đến N4-G-030

Đã dịch 50 mẫu ngữ pháp và 100 câu ví dụ. Đã áp dụng và đối chiếu trong JCAP_DB. Kiểm tra SQL xác nhận lượt chạy lại cập nhật 0 bản ghi. Bản sao trước cập nhật nằm tại `output/n4-g-021-030-before-20261114.json`.

Lô kế tiếp bắt đầu từ **N4-G-031**.

## N4-G-031 đến N4-G-038 và N3-V-001 đến N3-V-002

Đã dịch 37 mẫu ngữ pháp N4, 40 từ vựng N3 và 152 câu ví dụ. Đã áp dụng và đối chiếu trong JCAP_DB. Kiểm tra SQL xác nhận lượt chạy lại cập nhật 0 bản ghi. Bản sao trước cập nhật nằm tại `output/n4-g-031-n3-v-002-before-20261114.json`.

Đã hoàn thành N4. Lô kế tiếp bắt đầu từ **N3-V-003**.

## N3-V-003 đến N3-V-012

Đã dịch 200 từ và 386 câu ví dụ. Đã áp dụng và đối chiếu trong JCAP_DB. Kiểm tra SQL xác nhận lượt chạy lại cập nhật 0 bản ghi. Bản sao trước cập nhật nằm tại `output/n3-v-003-012-before-20261114.json`.

Lô kế tiếp bắt đầu từ **N3-V-013**.

## N3-V-013 đến N3-V-022

Đã dịch 200 từ và 389 câu ví dụ. Đã áp dụng và đối chiếu trong JCAP_DB. Kiểm tra SQL xác nhận lượt chạy lại cập nhật 0 bản ghi. Bản sao trước cập nhật nằm tại `output/n3-v-013-022-before-20261114.json`.

Lô kế tiếp bắt đầu từ **N3-V-023**.

## N3-V-023 đến N3-V-032

Đã dịch 200 từ và 384 câu ví dụ. Đã áp dụng và đối chiếu trong JCAP_DB. Kiểm tra SQL xác nhận lượt chạy lại cập nhật 0 bản ghi. Bản sao trước cập nhật nằm tại `output/n3-v-023-032-before-20261114.json`.

Lô kế tiếp bắt đầu từ **N3-V-033**.

## N3-V-033 đến N3-V-042

Đã dịch 200 từ và 392 câu ví dụ. Đã áp dụng và đối chiếu trong JCAP_DB. Kiểm tra SQL xác nhận lượt chạy lại cập nhật 0 bản ghi. Bản sao trước cập nhật nằm tại `output/n3-v-033-042-before-20261114.json`.

Lô kế tiếp bắt đầu từ **N3-V-043**.

## N3-V-043 đến N3-V-052

Đã dịch 200 từ và 394 câu ví dụ. Đã áp dụng và đối chiếu trong JCAP_DB. Kiểm tra SQL xác nhận lượt chạy lại cập nhật 0 bản ghi. Bản sao trước cập nhật nằm tại `output/n3-v-043-052-before-20261114.json`.

Lô kế tiếp bắt đầu từ **N3-V-053**.

## N3-V-053 đến N3-V-062

Đã dịch 200 từ và 394 câu ví dụ. Đã áp dụng và đối chiếu trong JCAP_DB. Kiểm tra SQL xác nhận lượt chạy lại cập nhật 0 bản ghi. Bản sao trước cập nhật nằm tại `output/n3-v-053-062-before-20261114.json`.

Lô kế tiếp bắt đầu từ **N3-V-063**.

## N3-V-063 đến N3-V-072

Đã dịch 200 từ và 381 câu ví dụ. Đã áp dụng và đối chiếu trong JCAP_DB. Kiểm tra SQL xác nhận lượt chạy lại cập nhật 0 bản ghi. Bản sao trước cập nhật nằm tại `output/n3-v-063-072-before-20261114.json`.

Lô kế tiếp bắt đầu từ **N3-V-073**.

## N3-V-073 đến N3-V-082

Đã dịch 200 từ và 384 câu ví dụ. Đã áp dụng và đối chiếu trong JCAP_DB. Kiểm tra SQL xác nhận lượt chạy lại cập nhật 0 bản ghi. Bản sao trước cập nhật nằm tại `output/n3-v-073-082-before-20261114.json`.

Lô kế tiếp bắt đầu từ **N3-V-083**.

## N3-V-083 và N3-G-001 đến N3-G-009

Đã dịch 14 từ, 45 mẫu ngữ pháp và 116 câu ví dụ. Đã áp dụng và đối chiếu trong JCAP_DB. Kiểm tra SQL xác nhận lượt chạy lại cập nhật 0 bản ghi. Bản sao trước cập nhật nằm tại `output/n3-v-083-n3-g-009-before-20261114.json`.

Đã hoàn thành từ vựng N3. Lô kế tiếp bắt đầu từ **N3-G-010**.

## N3-G-010 đến N3-G-019

Đã dịch 50 mẫu ngữ pháp và 100 câu ví dụ. Đã áp dụng và đối chiếu trong JCAP_DB. Kiểm tra SQL xác nhận lượt chạy lại cập nhật 0 bản ghi. Bản sao trước cập nhật nằm tại `output/n3-g-010-019-before-20261114.json`.

Lô kế tiếp bắt đầu từ **N3-G-020**.

## N3-G-020 đến N3-G-029

Đã dịch 50 mẫu ngữ pháp và 100 câu ví dụ. Đã áp dụng và đối chiếu trong JCAP_DB. Kiểm tra SQL xác nhận lượt chạy lại cập nhật 0 bản ghi. Bản sao trước cập nhật nằm tại `output/n3-g-020-029-before-20261114.json`.

Lô kế tiếp bắt đầu từ **N3-G-030**.

## N3-G-030 đến N3-G-039

Đã dịch 50 mẫu ngữ pháp và 100 câu ví dụ. Đã áp dụng và đối chiếu trong JCAP_DB. Kiểm tra SQL xác nhận lượt chạy lại cập nhật 0 bản ghi. Bản sao trước cập nhật nằm tại `output/n3-g-030-039-before-20261114.json`.

Lô kế tiếp bắt đầu từ **N3-G-040**.

## N3-G-040 đến N3-G-049

Đã dịch 50 mẫu ngữ pháp và 100 câu ví dụ. Đã áp dụng và đối chiếu trong JCAP_DB. Kiểm tra SQL xác nhận lượt chạy lại cập nhật 0 bản ghi. Bản sao trước cập nhật nằm tại `output/n3-g-040-049-before-20261114.json`.

Lô kế tiếp bắt đầu từ **N3-G-050**.

## N3-G-050

Đã dịch mẫu んだって và 2 câu ví dụ. Đã áp dụng và đối chiếu trong JCAP_DB. Chạy lại seed cập nhật 0 bản ghi. Bản sao trước cập nhật nằm tại `output/n3-g-050-before-20261114.json`.

Hoàn thành 3.519/3.519 mục N5–N3.

## Hiệu đính nghĩa theo mục từ

Đã sửa nghĩa hoặc giải thích của 11 mục và hai câu ví dụ của ノー. Đã tái tạo SQL và chạy `build.mjs --check`. SQL Server QA và JCAP_DB đều cập nhật 11 mục, 2 ví dụ. Lượt chạy lại trên JCAP_DB cập nhật 0 mục và 0 ví dụ. Một phép thử trên QA trong transaction có rollback xác nhận nội dung chính và ví dụ do admin sửa được giữ lại.

Đợt này xác nhận các lỗi tìm được khi sàng lọc dữ liệu. Phạm vi kiểm tra chưa phải thẩm định ngôn ngữ từng nghĩa và từng câu ví dụ.
