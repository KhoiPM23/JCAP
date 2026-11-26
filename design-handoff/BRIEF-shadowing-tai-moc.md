# Brief thiết kế: Shadowing tại mốc học trên Hành trình (JCAP)

Tài liệu này mô tả màn **Shadowing tại mốc**, một phòng luyện Shadowing mở ngay trên bản đồ Hành trình khi học viên bấm luyện ở một mốc học.

- Mọi dữ liệu, quy tắc chấm và quy tắc cấp dấu dưới đây là thứ hệ thống đang có.
- Phần nào cần làm thêm code thì ghi **(đề xuất)**.
- Màn Hội thoại AI tại mốc sẽ có brief riêng, sau brief này.

## 1. Vấn đề và mục tiêu

### Hiện nay

Học viên mở một mốc trên bản đồ, ví dụ "Sân bay Narita · Quầy nhập cảnh" ở tỉnh Chiba, thì thấy ngăn bài học bốn bước:

1. Hiểu câu mẫu
2. Luyện Shadowing
3. Kiểm tra nhanh
4. Hội thoại AI

Bấm "Bắt đầu Shadowing" ở bước 2 thì học viên bị chuyển hẳn sang trang `/shadowing/:id/practice`:

- Bản đồ biến mất. Giao diện đổi sang một phòng luyện đầy thẻ, cột và nút.
- Muốn thấy con dấu, học viên phải bấm "Xong" để quay về bản đồ.

Cảm giác đang đi một hành trình bị cắt ngang, và học viên mất hứng.

### Mục tiêu

- Luyện Shadowing xong một mốc mà **không có cảm giác rời bản đồ**.
- Khi luyện, trước mắt **chỉ có cuộc hội thoại**. Bối cảnh, từ vựng, nhận xét, tiến độ thu gọn ở hai bên, cần mới mở.
- Xong buổi là **thấy con dấu đóng ngay trong phòng**, rồi về đúng ngăn bài học của mốc.

### Phạm vi

- Đây là **một màn mới, dành riêng cho Hành trình**. Phòng Shadowing mở từ Thư viện (`/shadowing/:id/practice`) giữ nguyên.
- Màn mới dùng chung dữ liệu bài, cách thu âm, cách chấm và cách lưu với phòng cũ. Chỉ cách trình bày và luồng đi là khác.

## 2. Ràng buộc thiết kế (bắt buộc)

**Design system và theme**
- Theo design system JCAP trong `design-handoff/`: HANDOFF.md, `tokens/tokens.css`, `design-system/`. Màu, font, bo góc, đổ bóng chỉ lấy từ token. Không thêm mã màu mới.
- Bản đồ phía sau giữ `data-theme="kham-pha"`.
- Phòng luyện dùng `data-theme="phong-luyen"` với nền trung tính và nền chấm như HANDOFF mục 8. Chế độ tối dùng `phong-luyen-dem`. Thiết kế phải đọc rõ ở cả hai chế độ.

**Component**
- Dùng component có sẵn trong design system: `ChatBubble`, `JpText` (furigana), `WordDiff`, `ScoreRing`, `FeedbackItem`, `MicButton`, `ProgressBar`, `Badge`, `JlptBadge`, `Button`, `EmptyState`.
- **`RecordingBar` không nằm trong design system.** Đây là component riêng của app (`jcap-web/src/components/shadowing/RecordingBar.tsx`). Vẽ theo cách nó đang hiển thị: sóng âm, thời gian, Huỷ, Dừng.
- Con dấu dùng đúng con dấu mốc đang vẽ trên bản đồ (`SpotStampMark`): tròn, viền mực, chữ Nhật tên mốc và tên tỉnh, ngày đóng.
  - Hiện component chỉ có ba trạng thái: chưa có, mực xanh, mực son.
  - Hiệu ứng "đậm mực dần" và viền nét đứt ở mục 5.5 cần thêm prop mới **(đề xuất, cần làm code)**.

**Font và icon**
- Font: Be Vietnam Pro cho chữ Việt, Noto Sans JP cho tiếng Nhật, Noto Serif JP cho chữ Hán trang trí.
- Icon: Material Symbols Rounded.

**Chữ và thuật ngữ**
- Tiếng Việt, câu ngắn, không IN HOA nhãn.
- Dùng các từ: Shadowing, buổi luyện, câu, mốc, con dấu, dấu son.
- Không dùng chữ "thất bại", "token", "xu".

**Khổ màn cần thiết kế:** 1440px, 1280px, 390px.

## 3. Dữ liệu màn này nhận được

**Từ mốc học**

| Dữ liệu | Ví dụ |
|---|---|
| Tên mốc (Việt, Nhật, kana), tên tỉnh | Sân bay Narita · Quầy nhập cảnh / 成田空港 入国審査 / Chiba |
| Câu mẫu của mốc, nghĩa, ghi chú ngữ pháp, "dùng khi" | 観光です。 / Tôi đi du lịch. / N です: "là N" |
| Bài Shadowing gắn với mốc | `referenceId`, `title` ("Thủ tục nhập cảnh"). **Mỗi mốc có đúng một bài.** Trang quản trị chặn gắn hai bài cùng loại cho một mốc ("Mỗi loại hoạt động chỉ gắn một lần"), nên không cần thiết kế trường hợp nhiều bài |
| Ngưỡng đạt của mốc | `passThreshold`, mặc định 60 |
| Trạng thái của mốc | chưa có dấu / đã hiểu / có con dấu / có dấu son, kèm ngày đóng |

**Từ bài Shadowing**

| Dữ liệu | Ghi chú |
|---|---|
| Tên bài, cấp JLPT, tình huống | `title`, `jlptLevel`, `scenarioTitle`, mô tả tình huống |
| Các vai | thường là A và B, có tên vai. Dữ liệu đánh dấu vai dành cho học viên bằng "(Học viên)" |
| Các câu theo thứ tự | vai nói, câu tiếng Nhật, furigana, romaji (có thể trống), nghĩa tiếng Việt, audio giọng mẫu |
| Từ vựng của bài | từ, cách đọc, nghĩa, từ loại, câu ví dụ |
| Ngữ pháp của bài | mẫu, nghĩa, câu ví dụ |

**Tiến độ đã lưu trên server:** vai đang luyện, câu đang tới, số câu đã xong / tổng, điểm trung bình tạm. Mở lại phòng thì tiếp tục được từ chỗ dở.

## 4. Cách mở và đóng phòng

### Mở

- Học viên mở phòng bằng nút "Luyện Shadowing" ở bước 2 của ngăn bài học, hoặc nút chính ở thẻ tóm tắt mốc bên phải bản đồ.
- Phòng **nở ra từ chính chỗ học viên vừa bấm**, trong khoảng 300ms:
  - Bấm ở ngăn bài học: phòng nở từ thẻ bước 2.
  - Bấm ở thẻ tóm tắt mốc: phòng nở từ nút "Luyện Shadowing" của thẻ đó.
  - Vào bằng đường dẫn hoặc tải lại trang: không có chỗ để nở ra, phòng chỉ mờ dần hiện lên.
- Bản đồ vẫn còn phía sau, chỉ tối và mờ đi. Không có màn trắng chuyển trang.
- **Máy tính:** phòng là một tấm lớn chừa viền 16–24px quanh mép màn hình. Học viên vẫn thấy một dải bản đồ, để nhớ mình đang trong Hành trình.
- **Điện thoại:** phòng phủ toàn màn hình, trượt từ dưới lên.

### Đóng

- Bấm "← Về bài học" thì phòng thu ngược về chỗ đã mở ra, và ngăn bài học hiện lại như lúc rời đi.
- **Tiến độ luôn tự lưu trên server sau mỗi câu, nên rời phòng không hỏi xác nhận**:
  - Phòng đóng ngay.
  - Ngăn bài học hiện một thông báo nhỏ, tự ẩn: "Đã lưu. Lần sau bạn tiếp tục từ câu 4."
  - Chỉ hỏi xác nhận khi đang thu âm hoặc có bản thu chưa gửi (mục 10).
- Nếu vừa có dấu mới, con dấu ở đầu ngăn bài học đóng cộp thêm một lần nữa. Hiệu ứng này đang có sẵn.
- Khi bật giảm chuyển động, chỉ dùng hiệu ứng mờ dần vào và ra.

### Đường dẫn (đề xuất)

- Phòng có đường dẫn riêng, ví dụ `/explore?tinh=chiba&dd=1&luyen=shadowing`. Tải lại trang vẫn vào đúng phòng.
- Nút Back của trình duyệt hoạt động như "← Về bài học".
- Bản đồ phía sau giữ nguyên mức zoom và tỉnh đang chọn.

## 5. Bố cục

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ← Về bài học   (dấu)  Sân bay Narita · Quầy nhập cảnh   N5      ⚙       │ thanh trên 56px
│                       Thủ tục nhập cảnh · câu 3/6 của bạn                │
├─────┬─────────────────────────────────────────────────────────────┬─────┤
│ ▣   │                                                             │  ◔  │
│Bối  │  (nhân vật) ┌───────────────┐                               │Nhận │
│cảnh │             │ ご旅行の目的は？ │                               │ xét │
│     │             └───────────────┘                               │  •  │
│ ☰   │                               ┌────────────────────┐ (bạn)  │     │
│Cả   │                               │   観光です。     72 │        │ ☑   │
│bài  │                               └────────────────────┘        │Tiến │
│     │             ┌───────────────┐                               │ độ  │
│ あ  │             │ 何日間ですか？   │                               │     │
│Từ   │             └───────────────┘                               │     │
│vựng │                               ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐        │     │
│     │                               │ 五日間です。  Lượt của bạn │  │     │
│ 文  │                               └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘        │     │
│Ngữ  ├─────────────────────────────────────────────────────────────┤     │
│pháp │                    ( 🎙 )  Nghe mẫu                          │     │
└─────┴─────────────────────────────────────────────────────────────┴─────┘
 thanh gập trái 56px            khung hội thoại tối đa 720px      thanh gập phải 56px
```

### 5.1 Thanh trên (56px)

**Trái:**
- "← Về bài học".
- Con dấu mốc nhỏ, khoảng 36px (xem mục 5.5).
- Tên mốc, và dòng phụ "tên bài · câu 3/6 của bạn".

**Phải:**
- `JlptBadge`: chỉ hiển thị, không đổi cấp ở đây.
- Icon cài đặt, mở popover (mục 9).

Thanh trên không có nút "Kết thúc" riêng. Kết thúc sớm nằm trong ngăn "Tiến độ" (mục 7.2), để thanh trên gọn và học viên không bấm nhầm.

### 5.2 Khung hội thoại (giữa)

- Rộng tối đa 720px, nằm giữa phần còn lại sau khi trừ hai thanh gập và các ngăn đang mở.
- **Chỉ có bóng thoại và khung thu âm ở đáy.** Không thẻ thông tin, không banner, không hoạ tiết trang trí.
- **Hiện câu tới đâu:** chỉ hiện các câu tới câu đang tới lượt. Các câu sau chưa hiện, để giữ cảm giác đang nói chuyện thật. Muốn xem trước cả bài thì mở ngăn "Cả bài".

**Câu của nhân vật (vai còn lại)**
- Nằm bên trái, nền trắng, có avatar.
- Dưới câu có hai nút: Nghe, Dịch.

**Câu của học viên**
- Nằm bên phải, chữ to hơn bóng của nhân vật một bậc, như HANDOFF mục 8.
- **Chế độ sáng:** nền `--sumi`, chữ trắng.
- **Chế độ tối:** nền `--ai-soft`, viền `#3d4668`, chữ `--sumi`, theo HANDOFF mục 9b. Không dùng nền `--sumi`, vì trong `phong-luyen-dem` token này là màu sáng.
- **Điểm câu** là viên nhỏ đặt trên avatar học viên, màu theo mức: ≥ 80 tốt (`--score-good`), ≥ 65 khá (`--score-mid`), < 65 cần sửa (`--score-low`).
- Câu không chấm được thì viên điểm là dấu "–".
- Dưới câu có ba nút: Nói lại câu này, Nghe mẫu, Dịch.
- **Bấm vào bóng thoại** thì mở ngăn "Nhận xét" của câu đó.

**Câu đang tới lượt học viên**
- Viền nét đứt màu `--ai`, nhãn "Lượt của bạn".
- Câu mẫu hiện đầy đủ, có furigana nếu đang bật.

**Furigana và nghĩa**
- Furigana theo cài đặt chung (Cài đặt › Khi luyện tập).
- Nghĩa tiếng Việt hiện khi bấm Dịch trên từng câu.

**Cuộn:** tự cuộn xuống câu mới. Khi học viên đã cuộn lên xem lại, hiện nút tròn nhỏ "Về câu mới nhất".

### 5.3 Hai thanh gập

Thanh gập là một dải dọc 56px với icon và nhãn chữ ngắn bên dưới icon. Không dùng icon trơn không có nhãn.

**Mở ngăn**
- Bấm một mục thì ngăn của mục đó trượt ra **ngay sát khung hội thoại**, ở phía bên của thanh.
- Ngăn trái rộng 320px, ngăn phải rộng 360px.
- **≥ 1280px:** ngăn đẩy khung hội thoại sang. Khung co lại nhưng không bị che.
- **< 1280px:** ngăn nổi đè lên khung hội thoại, có nền mờ. Bấm ra ngoài thì ngăn đóng.

**Đóng ngăn và mở cùng lúc**
- Mỗi bên chỉ mở một ngăn một lúc.
- Bấm lại icon đang mở, hoặc nhấn Esc, thì ngăn gập lại.
- **Mở cả hai bên cùng lúc:**
  - **≥ 1440px:** được mở cả hai bên.
  - **1280–1439px:** mở ngăn bên này thì ngăn bên kia tự gập lại. Khung hội thoại không bao giờ hẹp hơn khoảng 560px.
  - **< 1280px:** chỉ một ngăn nổi một lúc.

**Báo có thông tin mới**
- Khi thanh đang gập mà có thông tin mới, hiện một chấm nhỏ trên icon. Ví dụ: vừa chấm xong một câu thì chấm hiện trên "Nhận xét".
- **Không tự bật ngăn** khi có thông tin mới.

**Lần đầu vào phòng (đề xuất)**
- Lần đầu vào phòng của một mốc, ngăn "Bối cảnh" mở sẵn, có nút "Bắt đầu luyện" để gập lại.
- Những lần sau, phòng mở với các ngăn đều gập.

### 5.4 Khung thu âm (đáy khung hội thoại)

- Luôn nằm cố định ở đáy và chỉ cao vừa nội dung, **không bao giờ che quá một phần ba khung hội thoại**.
- Phân tích dài không nằm ở đây mà nằm ở ngăn "Nhận xét".
- Các trạng thái xem mục 6.

### 5.5 Con dấu "hiện dần" (điểm nhấn riêng của màn này)

- Con dấu mốc nhỏ trên thanh trên có **hai lớp thông tin**:
  - **Độ đậm mực** đi theo số câu đã chấm trên tổng số câu của vai học viên. Chưa câu nào thì chỉ có nét viền mờ; 3/6 câu thì mực đậm nửa.
  - **Viền** đi theo điểm buổi hiện tại so với ngưỡng của mốc. Điểm còn dưới ngưỡng thì **viền nét đứt**; đạt ngưỡng thì viền liền.
- Nhờ hai lớp này, chấm đủ 6/6 câu mà điểm buổi mới 40 thì con dấu đậm mực nhưng viền vẫn nét đứt, không ngầm hứa là có dấu.
- Dù viền đã liền, con dấu vẫn **chưa "đóng"**. Con dấu chỉ đóng khi server xác nhận đã cấp dấu (mục 8).
- Mốc đã có con dấu từ trước: con dấu hiện rõ ngay từ đầu, với ngày đóng cũ.
- **Phần còn lại của phòng phải yên và gọn.** Con dấu là chi tiết đáng nhớ duy nhất. Không pháo giấy, không hoạ tiết sóng, không chữ Hán chìm trong khung hội thoại.

## 6. Một lượt luyện, từng trạng thái

Mỗi bài là chuỗi câu xen kẽ giữa nhân vật và học viên. Học viên chỉ thu âm câu của vai mình.

| Trạng thái | Khung hội thoại | Khung thu âm ở đáy |
|---|---|---|
| **Nhân vật đang nói** | Câu của nhân vật hiện ra, giọng mẫu tự phát | Sóng âm nhỏ, tên nhân vật, nút "Sang lượt của bạn" (bỏ qua phần nghe) |
| **Câu của nhân vật đang chờ, bấm để nghe** | Câu của nhân vật | "Nghe câu của Nhân viên" (chính), "Sang lượt của bạn". Dùng khi tiếp tục buổi dở, khi vào bằng đường dẫn hoặc tải lại trang (trình duyệt chặn tự phát âm thanh khi học viên chưa bấm gì), và khi tắt "Tự phát câu của nhân vật" |
| **Tới lượt bạn, chờ thu** | Câu mẫu viền nét đứt, nhãn "Lượt của bạn" | `MicButton` lớn ở giữa, bên cạnh là "Nghe mẫu" |
| **Đang thu** | Câu mẫu vẫn hiện để đọc theo | `RecordingBar`: sóng âm, thời gian, Huỷ, Dừng. Có thể hiện chữ trình duyệt nghe được ngay lúc nói, chữ mờ, chỉ để tham khảo, **không dùng để chấm** |
| **Đã thu, chưa gửi** | | Nghe lại, Thu lại, Bỏ, **Gửi chấm** (chính) |
| **Đang chấm** | | "Đang chấm câu của bạn…" (thường 1–3 giây) |
| **Có điểm** | Bóng thoại của bạn hiện lời bạn nói, viên điểm trên avatar, chấm mới trên icon "Nhận xét" | Một hàng gọn: `ScoreRing` nhỏ, một câu tóm tắt ("Khớp 5/6 từ, sai trường âm ở 旅行"), Nghe lại, Luyện lại câu, **Câu tiếp** (chính) |
| **Không chấm được, do bản thu** | Bóng thoại của bạn có viên "–" | Lý do ngắn, cách khắc phục, "Lần thử 2", Nghe lại bản thu, **Thu âm lại** (chính), Bỏ qua câu |
| **Không chấm được, do hệ thống** | Bóng thoại của bạn có viên "–" | Bản thu vẫn dùng được: lý do ngắn, **Gửi lại** (chính), Thu âm lại, Bỏ qua câu |
| **Hết câu** | Câu cuối của nhân vật (nếu có) | Chuyển sang màn tổng kết (mục 7) |

**Lý do không chấm được** đều đã có sẵn thông báo. Thiết kế một mẫu thông báo chung, gồm icon, câu lý do và câu hướng dẫn, với **hai kiểu nút**:

- **Do bản thu:** nút chính là "Thu âm lại". Các lý do:
  - Không nghe thấy tiếng nói.
  - Micro quá nhỏ hoặc nhiều tạp âm.
  - Bản ghi quá ngắn.
  - Lời nói không khớp với câu mẫu.
- **Do hệ thống:** bản thu vẫn dùng được, nút chính là "Gửi lại". Các lý do:
  - Hệ thống nhận dạng đang bận (`ASR_BUSY`).
  - Nhận dạng quá lâu (`ASR_TIMEOUT`).
  - Hệ thống đang bận chấm cho nhiều người (`SERVER_BUSY`), "Hãy gửi lại sau vài giây".
  - Hệ thống chấm tạm thời chưa sẵn sàng.

Lần thử không chấm được **không tính điểm và không trừ gì**.

**Bỏ qua câu** cần thêm một dòng nhắc nhỏ ngay dưới nút: "Câu bỏ qua tính 0 điểm. Muốn nhận con dấu, cần chấm đủ mọi câu."

**Luyện lại một câu:** học viên được thu lại bao nhiêu lần cũng được. **Hệ thống lấy lần có điểm cao nhất của mỗi câu**, nên luyện lại không bao giờ làm tụt điểm. Hãy nói rõ điều này ở nút hoặc ở ngăn Tiến độ: "Lấy lần tốt nhất".

## 7. Ngăn của hai thanh gập

### 7.1 Thanh trái: trước và trong khi nói

| Mục | Icon gợi ý | Nội dung ngăn |
|---|---|---|
| **Bối cảnh** | `image` | Ảnh bối cảnh, avatar và tên nhân vật. Tình huống của mốc (ví dụ "Bạn vừa xuống máy bay và đang xếp hàng ở quầy nhập cảnh…"). Câu mẫu của mốc kèm nghĩa (nhắc lại bước 1). Vai của bạn ("Bạn đóng vai Khách du lịch") và nút "Đổi vai" (mục 10) |
| **Cả bài** | `article` | Toàn bộ kịch bản theo thứ tự: tên vai, câu tiếng Nhật có furigana, nghĩa, nút nghe từng câu. Câu của vai bạn được đánh dấu. Bấm một câu của bạn thì cuộn tới câu đó trong hội thoại, nếu câu đó đã hiện |
| **Từ vựng** | `dictionary` | Từ vựng của bài: từ, cách đọc, nghĩa, từ loại, câu ví dụ, nút nghe |
| **Ngữ pháp** | `menu_book` | Ngữ pháp của bài: mẫu, nghĩa, câu ví dụ. Ghi chú ngữ pháp của câu mẫu mốc nằm trên cùng |

**(Đề xuất)** Mỗi từ vựng và mẫu ngữ pháp có nút lưu vào kho Flashcard, giống phòng Hội thoại AI. Cần làm thêm code cho Shadowing.

### 7.2 Thanh phải: sau khi nói

**Nhận xét** (icon `rate_review`): phân tích câu vừa chấm, hoặc câu học viên bấm chọn trong hội thoại.

- Đầu ngăn:
  - `ScoreRing` điểm câu /100, nhãn "Điểm nội dung".
  - "Lần thử n".
  - Nhãn mức: Khớp tốt / Khớp một phần / Cần luyện lại.
- **So từng từ:**
  - `WordDiff` trên câu mẫu: từ đúng, sai, thiếu, thừa.
  - Từ sai có nhãn loại lỗi: Trường âm, Âm ngắt っ, Âm mũi ん, Hữu thanh / vô thanh, Số mora, Thừa âm.
  - Bấm một từ sai thì hiện câu giải thích và cách sửa. Hệ thống đã có, ví dụ "Nối liền hai âm, không dừng hơi."
- **Bạn đã nói:** văn bản hệ thống nhận được.
- **Nhận xét ngắn** của hệ thống (`FeedbackItem`), có thể trống.
- **Ghi chú nhịp nói:** chỉ hiện khi có, và **không có điểm**. Hệ thống đo nhịp so với giọng mẫu và có thể đưa ra các ghi chú:
  - Trường âm hơi ngắn.
  - Nói chậm hơn giọng mẫu.
  - Nói nhanh hơn giọng mẫu.
  - Có chỗ ngắt nghỉ thừa.
  Trình bày như lời khuyên, không như điểm số hay biểu đồ.
- **Nghe so sánh:** hai nút liền nhau, "Giọng mẫu" và "Giọng bạn".
- Nút "Luyện lại câu này": đưa hội thoại về câu đó để thu lại.
- **Chưa có câu nào được chấm:** `EmptyState` "Nói câu đầu tiên để xem nhận xét ở đây".

**Tiến độ** (icon `checklist`): buổi luyện đang tới đâu, và còn cách con dấu bao xa.

- **Câu đã chấm:** "4/6 câu", kèm `ProgressBar`.
- **Điểm buổi hiện tại:**
  - Tính đúng như cách server sẽ tính: trung bình điểm tốt nhất của từng câu, câu chưa chấm tính 0.
  - `ProgressBar` có **vạch ngưỡng của mốc**, ví dụ vạch ở 60. Dòng chữ: "Điểm buổi: 48 · Cần 60 để nhận con dấu".
  - Ghi chú nhỏ: "Câu chưa chấm đang tính 0".
- **Danh sách câu của bạn:**
  - Mỗi dòng gồm số thứ tự, câu tiếng Nhật (một dòng, cắt bớt), điểm tốt nhất hoặc trạng thái (Chưa nói / Không chấm được / Đã bỏ qua).
  - Bấm một dòng thì đưa hội thoại về câu đó.
  - Đánh dấu các **"câu nên luyện lại"**: câu có điểm tốt nhất **dưới 65** hoặc chưa chấm được. Mốc 65 trùng với màu "cần sửa" và trùng danh sách câu nên luyện lại do server trả. Đây không phải ngưỡng con dấu của mốc (60).
- **Cuối ngăn:** nút phụ "Kết thúc buổi luyện" để lưu buổi và xem tổng kết sớm. Hai trường hợp:
  - **Đã chấm ít nhất một câu:**
    - Hộp xác nhận: "Còn 2 câu chưa chấm. Kết thúc bây giờ thì buổi này tính 0 cho các câu đó và không nhận được con dấu."
    - Hai nút: "Luyện tiếp" (chính), "Vẫn kết thúc".
  - **Chưa chấm câu nào:**
    - Server không lưu buổi không có câu nào được chấm, nên không có tổng kết.
    - Nút đổi thành "Về bài học" và đóng phòng như mục 4. Tiến độ vẫn được giữ.

## 8. Kết thúc buổi luyện và con dấu

### Khi nào kết thúc

- Khi học viên đã qua hết các câu của vai mình và câu cuối của nhân vật đã phát, khung giữa chuyển thành **màn tổng kết ngay trong phòng**. Không mở modal chồng lên.
- Hai thanh gập vẫn còn. Học viên mở "Nhận xét" để xem lại từng câu.

### Lưu buổi luyện

- Kết thúc thì hệ thống lưu buổi luyện, rồi đồng bộ tiến độ của tỉnh để server xét cấp dấu.
- Thiết kế ba trạng thái lưu:
  - Đang lưu: "Đang lưu buổi luyện…".
  - Lưu xong.
  - **Lưu lỗi:**
    - Thông báo: "Chưa lưu được buổi luyện. Con dấu chỉ được xét sau khi lưu." kèm nút "Lưu lại". Không cho học viên tưởng đã có dấu.
    - Màn tổng kết chỉ còn **điểm buổi, số câu đã chấm (tách theo mức) và thời gian luyện**. "Lỗi hay gặp", "Câu nên luyện lại" và kết cục con dấu chỉ có sau khi lưu xong; ở chỗ của chúng hiện khối trống nhẹ "Có sau khi lưu".
    - Bấm "Lưu lại" bao nhiêu lần cũng không tạo buổi thứ hai.

### Nội dung màn tổng kết

Tất cả là số liệu thật do hệ thống chấm:

- **Điểm buổi** /100, đặt cạnh ngưỡng của mốc: "72 · Cần 60". Màu và cách nói của điểm buổi **đi theo ngưỡng của mốc** (đạt / chưa đạt), không theo hạng.
- **Không hiện hạng S/A/B/C ở màn này.**
  - Ngưỡng mốc mặc định 60 thấp hơn mốc hạng B (65). Một buổi 62 điểm vừa nhận con dấu vừa bị xếp "Hạng C, cần luyện thêm", và học viên sẽ rối.
  - Hạng vẫn hiện ở trang Kết quả như cũ.
- **Câu đã chấm:** "6/6 câu", tách theo mức: khớp tốt (≥ 80) / khớp một phần (≥ 65) / cần luyện lại (< 65).
- **Độ khớp nội dung** (%).
- **Thời gian luyện** (phút:giây).
- **Lỗi hay gặp** (nếu có): ví dụ "Trường âm ×3 · Âm ngắt っ ×1".
- **Câu nên luyện lại:** hệ thống trả sẵn danh sách câu điểm thấp hoặc chưa chấm được, kèm lỗi chính của từng câu. Bấm một câu thì mở ngăn "Nhận xét" của câu đó.
- Nếu một số câu có micro nhỏ hoặc nhiều tạp âm, thêm một dòng: "Dùng tai nghe có micro sẽ cho kết quả ổn định hơn."

### Ba kết cục (thiết kế riêng từng kết cục)

**1. Nhận con dấu**

Điều kiện: đạt ngưỡng, chấm đủ mọi câu, và đã bấm "Tôi đã hiểu" ở bước 1.

- Sau khi server xác nhận, con dấu nhỏ trên thanh trên **lớn dần ra giữa màn tổng kết và đóng cộp**. Dùng đúng hiệu ứng đóng dấu đang có trên bản đồ, ngày đóng in trên dấu.
- Dòng chữ: "Bạn đã có con dấu Sân bay Narita."
- Nếu đây là con dấu cuối cùng của tỉnh, tiếp theo hiện **con dấu tỉnh** với dòng "Bạn đã có con dấu tỉnh Chiba".
- Các nút:
  - **"Về bài học"** (chính).
  - "Đến mốc tiếp theo" **(đề xuất)**: về bản đồ và mở mốc kế tiếp chưa có dấu trong tỉnh.
  - "Luyện lại" (phụ, dạng chữ).
- Mốc này có Hội thoại AI và học viên **chưa** có dấu son: thêm một dòng nhẹ "Hội thoại AI ở mốc này sẽ cho bạn dấu son." Không thêm nút mua hay nút nhấn mạnh.

**1b. Nhận con dấu và dấu son cùng lúc**

- Trường hợp này xảy ra khi học viên đã hoàn thành Hội thoại AI của mốc từ trước, rồi mới đạt Shadowing.
- Server xét dấu son ngay sau con dấu trong cùng một lần đồng bộ, nên hai dấu đến cùng lúc.
- Con dấu đóng cộp bằng mực xanh, rồi chuyển sang mực son ngay sau đó, như dấu son đè lên. Dòng chữ: "Bạn có cả con dấu và dấu son Sân bay Narita."
- Không hiện dòng gợi ý Hội thoại AI.
- Nếu đủ điều kiện tỉnh, con dấu tỉnh và dấu son tỉnh cũng có thể đến cùng lúc.

**2. Đạt điểm nhưng chưa bấm "Tôi đã hiểu"**

- "Bạn đã đạt điểm. Còn bước Hiểu câu mẫu để nhận con dấu."
- Đặt câu mẫu, nghĩa và nút "Tôi đã hiểu" ngay trong màn tổng kết.
- Bấm vào thì server tự xét lại và cấp dấu, rồi chạy luôn hiệu ứng của kết cục 1 hoặc 1b. Học viên không phải quay lại bước 1.
- API đánh dấu đã hiểu đã tự xét lại dấu, nên phần này chỉ cần làm frontend.
- Server xét mọi buổi Shadowing đã lưu từ trước, không chỉ buổi này. Ai từng đạt mà chưa bấm "Tôi đã hiểu" thì bấm ở ngăn bài học cũng có dấu ngay, không phải luyện lại.

**3. Chưa đủ điều kiện**

Hai trường hợp, mỗi trường hợp có câu riêng:
- **Chưa đạt ngưỡng:** "Còn thiếu 8 điểm để nhận con dấu."
- **Còn câu chưa chấm:** "Còn 2 câu chưa chấm. Cần chấm đủ mọi câu để nhận con dấu."

Các nút:
- **"Luyện lại các câu chưa tốt"** (chính, **đề xuất**): quay lại hội thoại, chỉ đi qua các câu dưới 65 điểm hoặc chưa chấm (cùng danh sách "câu nên luyện lại"). Điểm tốt nhất của những câu khác vẫn giữ.
- "Luyện lại cả bài".
- "Về bài học".

Giọng văn chỉ hướng làm tiếp, không chê.

**Mốc đã có con dấu từ trước:** màn tổng kết chỉ hiện kết quả buổi luyện, không đóng dấu lại. Thêm dòng "Bạn đã có con dấu mốc này từ 12/11/2026."

### Nhận xét AI cho buổi luyện (đề xuất)

- Hệ thống đã có API tạo nhận xét AI cho một buổi Shadowing. API chỉ tạo khi học viên bấm, miễn phí và không lưu.
- Nội dung gồm:
  - Tóm tắt.
  - Việc nên ưu tiên.
  - Phần Phát âm: một câu đánh giá và tối đa 3 vấn đề, mỗi vấn đề có bằng chứng và cách sửa.
  - Phần Lưu loát: cùng cấu trúc, có thể không có.
- Đặt một nút "Nhờ AI nhận xét buổi này" ở cuối màn tổng kết, kết quả mở trong ngăn phải.

## 9. Cài đặt (popover từ icon ⚙)

- **Micro và loa:** chọn thiết bị, thử micro. Đã có sẵn hộp cài đặt thiết bị.
- **Hiện furigana:** đang là cài đặt chung. **(Đề xuất)** bật/tắt ngay trong phòng.
- **Tự phát câu của nhân vật:** **(đề xuất)** bật/tắt.
- **Tốc độ giọng mẫu:** **(đề xuất, cần kiểm tra với nhóm code)** ví dụ 0,75× / 1×.
- Chấm nhỏ trên icon ⚙ khi có cài đặt khác mặc định.

## 10. Tình huống đặc biệt

| Tình huống | Cách xử lý |
|---|---|
| **Có buổi đang dở của bài này** | Mở phòng thì hội thoại hiện lại tới câu đang dở, với các điểm đã có. Một dòng nhỏ đầu hội thoại: "Tiếp tục từ câu 4". Kèm nút phụ "Làm lại từ đầu" |
| **Làm lại từ đầu** | Không xoá gì: lần dở cũ vẫn giữ trong lịch sử, lần mới bắt đầu chưa có điểm nào. Hộp xác nhận: "Bắt đầu lại từ câu 1. Điểm các câu đã nói lần này không tính vào lần mới." Hai nút: "Bắt đầu lại", "Huỷ" |
| **Đổi vai** | Nút trong ngăn Bối cảnh. Mỗi vai có tiến độ riêng: đổi vai không mất gì, quay lại vai cũ vẫn tiếp tục được. Đổi ngay không hỏi. Sau khi đổi, hiện một dòng nhỏ: "Đã đổi sang vai Nhân viên. Tiến độ vai Khách du lịch vẫn được giữ." Chỉ hỏi xác nhận khi đang thu hoặc có bản thu chưa gửi. Vai nào cũng được tính con dấu. Vai mặc định là vai dữ liệu đánh dấu "(Học viên)", nếu không có thì vai A |
| **Chưa cấp quyền micro / không có micro** | Khung thu âm thay `MicButton` bằng hướng dẫn cấp quyền và nút "Thử lại". Học viên vẫn đọc và nghe được bài |
| **Micro vừa bị rút ra** | Thông báo nhẹ: "Đã chuyển sang micro mặc định". Không chặn luyện |
| **Không đồng bộ được tiến độ với server** | Dòng cảnh báo nhỏ trong khung thu âm. Vẫn luyện được, nhưng phải lưu được buổi luyện ở cuối thì mới xét con dấu |
| **Không tải được bài** | Trạng thái lỗi trong phòng, kèm "Thử lại" và "Về bài học" |
| **Mốc chưa có bài Shadowing** | Không mở phòng. Ngăn bài học giữ dòng "Mốc này chưa có bài Shadowing" như hiện nay |
| **Rời phòng giữa chừng** ("← Về bài học", Back, Esc) | Thường thì đóng ngay, không hỏi, kèm thông báo nhỏ ở ngăn bài học: "Đã lưu. Lần sau bạn tiếp tục từ câu 4." **Chỉ hỏi khi đang thu hoặc có bản thu chưa gửi:** "Bản thu của câu này chưa được gửi và sẽ bị bỏ." Hai nút: "Ở lại", "Bỏ và rời phòng" |

## 11. Thay đổi ở ngăn bài học trên bản đồ

- Bước 2, nút đổi theo trạng thái:
  - "Luyện Shadowing" khi chưa có buổi dở.
  - "Tiếp tục (câu 4/6)" khi có buổi dở **(đề xuất, cần đọc tiến độ server)**.
  - "Luyện lại" khi đã có dấu.
  - Bấm nút nào cũng mở phòng.
- Bỏ câu "Làm xong, quay lại bản đồ để nhận con dấu". Thay bằng "Đọc theo cả bài, đạt từ 60 điểm để nhận con dấu."
- Thẻ tóm tắt mốc bên phải bản đồ giữ nguyên. Nút "Luyện Shadowing" ở thẻ đó cũng mở thẳng phòng.

## 12. Bàn phím và trợ năng

- Phòng là hộp thoại (`role="dialog"`, `aria-modal`, tiêu đề là tên mốc). Tiêu điểm nằm trong phòng. Đóng phòng thì tiêu điểm trả về nút đã mở nó.
- Esc gập ngăn đang mở. Nếu không có ngăn nào mở, Esc rời phòng theo quy tắc ở mục 10: chỉ hỏi khi có bản thu chưa gửi.
- **Phím tắt (đề xuất):**
  - Phím cách: bắt đầu và dừng thu.
  - Enter: gửi chấm hoặc sang câu tiếp.
  - `R`: thu lại.
  - `[` và `]`: mở và gập thanh trái, thanh phải.
- Mỗi mục trên thanh gập có nhãn chữ và `aria-expanded`. Chấm báo mới có nhãn cho trình đọc màn hình: "Nhận xét, có kết quả mới".
- Điểm câu không chỉ dựa vào màu: luôn có số, và nhãn mức trong ngăn Nhận xét.
- Kết quả chấm được đọc qua vùng `aria-live`: "Câu 3: 72 điểm, khớp một phần."
- Vùng chạm tối thiểu 44×44px. Riêng `MicButton` trên điện thoại tối thiểu 64px.
- Khi bật giảm chuyển động: tắt hiệu ứng nở phòng, đóng dấu và đậm mực dần; chỉ đổi trạng thái tức thì hoặc mờ dần.

## 13. Điện thoại (390px)

- Phòng phủ toàn màn hình.
- **Thanh trên:** "←", con dấu nhỏ, tên mốc (một dòng), ⚙.
- **Thay cho hai thanh gập:** một hàng icon có nhãn ngay dưới thanh trên: Bối cảnh, Cả bài, Từ vựng, Ngữ pháp, Nhận xét, Tiến độ. Hàng này cuộn ngang được.
- Mỗi ngăn mở thành tấm trượt từ dưới lên, cao khoảng 70% màn hình, có thanh kéo để đóng.
- **Khung thu âm** cố định ở đáy, tránh vùng an toàn của máy. `MicButton` nằm giữa, các nút phụ ở hai bên.
- **Bóng thoại** rộng tối đa 85% màn. Câu của học viên vẫn to hơn một bậc.
- **Màn tổng kết** cuộn dọc. Con dấu đóng ở trên cùng, nút "Về bài học" dính ở đáy.

## 14. Không làm

- **Không hiện điểm Phát âm hay Ngữ điệu.** Hệ thống chỉ có điểm theo độ khớp nội dung. Nhịp nói chỉ là ghi chú, không có điểm.
- **Không hứa dấu trước khi server xác nhận.** Hiệu ứng đóng dấu chỉ chạy sau khi có kết quả từ server.
- **Không dùng chữ trình duyệt nghe được** (hiện lúc đang nói) làm điểm hay làm "lời bạn nói" trong kết quả.
- **Không thêm bộ chọn cấp JLPT** trong phòng: bài của mốc có cấp cố định.
- **Không thay đổi phòng Shadowing ở Thư viện.**

## 15. Cần bàn giao

**Khung tổng**

1. Phòng vừa mở lần đầu, ngăn Bối cảnh mở sẵn.
2. Phòng đang luyện, mọi ngăn gập.
3. Ngăn Nhận xét mở (1280px, đẩy khung hội thoại).
4. Ngăn Từ vựng và ngăn Tiến độ cùng mở (1440px).

**Khung thu âm**

5. Đủ các trạng thái ở mục 6:
   - nhân vật đang nói, câu đang chờ bấm để nghe
   - chờ thu, đang thu, đã thu, đang chấm
   - có điểm
   - không chấm được do bản thu, không chấm được do hệ thống

**Màn tổng kết**

6. Kết cục 1, có khoảnh khắc đóng dấu: khung trước, trong và sau khi đóng.
7. Kết cục 1 kèm con dấu tỉnh.
8. Kết cục 1b, con dấu và dấu son cùng lúc.
9. Kết cục 2.
10. Kết cục 3, cả hai trường hợp.
11. Mốc đã có dấu từ trước.
12. Lưu lỗi.

**Tình huống đặc biệt**

13. Có buổi dở, kèm hộp "Làm lại từ đầu".
14. Đổi vai (dòng thông báo sau khi đổi).
15. Chưa cấp quyền micro.
16. Rời phòng khi có bản thu chưa gửi (hộp xác nhận), và thông báo "Đã lưu" ở ngăn bài học.
17. Không tải được bài.

**Ngoài phòng**

18. Ngăn bài học trên bản đồ với nút bước 2 đã đổi (mục 11).
19. Khung minh hoạ chuyển cảnh: phòng nở từ thẻ bước 2 và thu về.

**Khổ màn và chế độ** (đã giảm, không cần mọi khung × mọi khổ × mọi chế độ):

| Khổ / chế độ | Những khung cần vẽ |
|---|---|
| 1440px, sáng | Đủ 19 khung ở trên |
| 1280px, sáng | Khung 3, và một khung có hai ngăn: mở ngăn thứ hai thì ngăn bên kia tự gập |
| 390px, sáng | Khung 2, khung 5 (các trạng thái chính: chờ thu, đang thu, có điểm, không chấm được), khung 3 dạng bottom sheet, khung 6 và khung 10 |
| Tối (1440px) | Khoảng 5 màn tiêu biểu: khung 2, khung 3, khung 5 lúc có điểm, khung 6 sau khi đóng dấu, khung 10 |

**Ghi chú dựng lại:** component dùng ở từng phần, để dựng trong `jcap-web/src/components/jcap/`. Riêng `SpotStampMark` cần ghi rõ prop mới cho độ đậm mực và viền nét đứt.
