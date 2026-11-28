# Brief thiết kế: trang Kết quả (JCAP)

Tài liệu này mô tả chức năng trang **Kết quả** của JCAP để thiết kế lại giao diện. Mọi trường dữ liệu dưới đây là dữ liệu thật mà hệ thống đang trả về. Không thêm số liệu, biểu đồ hay chức năng mà danh sách này không có, trừ khi ghi rõ là đề xuất (mục 6).

## 1. Bối cảnh

- **Sản phẩm:** JCAP, nền tảng luyện nói tiếng Nhật cho người Việt, trình độ JLPT N5–N3. Hai cách luyện chính: **Hội thoại AI** (nói chuyện với nhân vật AI theo tình huống, có nhiệm vụ, tốn Credit) và **Shadowing** (nghe câu mẫu rồi nói theo, hệ thống chấm từng câu, miễn phí).
- **Người dùng:** học viên đã đăng nhập, mở trang này sau khi luyện để xem lại mình làm thế nào và nên luyện gì tiếp.
- **Việc chính của trang:** cho học viên thấy kết quả các buổi đã luyện, và mở được chi tiết của một buổi.
- **Đường dẫn:** `/roleplay/results` (tab Hội thoại AI) và `/roleplay/results?tab=shadowing` (tab Shadowing). Mục "Kết quả" trên thanh bên trái dẫn tới đây.

## 2. Ràng buộc thiết kế (bắt buộc)

- Theo design system JCAP trong `design-handoff/` (HANDOFF.md, `tokens/tokens.css`, `design-system/`). Màu, font, bo góc, đổ bóng chỉ lấy từ token. Không dùng mã màu mới.
- Khu vực này là trang học viên: `data-theme="hoc-tap"`, nền `--paper-100`. Có chế độ tối `hoc-tap-dem`, thiết kế phải đọc rõ ở cả hai chế độ.
- Dùng component có sẵn: `SegmentedControl`, `Tabs`, `Badge`, `JlptBadge`, `ScoreRing`, `ProgressBar`, `EmptyState`, `Button`, `JpText` (câu tiếng Nhật có furigana), `WordDiff` (so từng từ đã nói với câu mẫu). Không tự vẽ lại nút, badge, thanh tiến độ.
- Font: Be Vietnam Pro (chữ Việt), Noto Sans JP (tiếng Nhật), Noto Serif JP (chữ Hán trang trí). Icon: Material Symbols Rounded.
- Trang nằm bên phải thanh bên trái (rộng 240px, thu gọn 72px). Cột nội dung hiện rộng tối đa 1024px, có thể đề xuất rộng hơn.
- Chữ trên giao diện: tiếng Việt, câu ngắn, không IN HOA nhãn. Thuật ngữ: Credit, Hội thoại AI, Shadowing, buổi luyện.
- Cần có bản máy tính (1440px) và điện thoại (390px), trạng thái đang tải, lỗi và rỗng cho mỗi tab.

## 3. Khung trang

```
Kết quả                                   [ Hội thoại AI | Shadowing ]
Xem lại các buổi đã luyện và điểm của từng buổi.
─────────────────────────────────────────────────────────────
(nội dung của tab đang chọn)
```

- Tiêu đề "Kết quả" và dòng mô tả ngắn.
- Nút chuyển nhỏ hai lựa chọn: **Hội thoại AI** (icon `forum`) và **Shadowing** (icon `record_voice_over`). Tab đang chọn lưu trên URL, nên nút Back của trình duyệt quay lại tab trước.
- Hai tab có dữ liệu khác nhau nên bố cục bên trong có thể khác, nhưng phần đầu tab (số liệu tổng, bộ lọc, danh sách) nên cùng một nhịp để chuyển qua lại không thấy lạc.

## 4. Tab Hội thoại AI

### 4.1 Số liệu tổng (hồ sơ phản xạ của học viên)

Lấy từ hồ sơ học viên, 4 chỉ số đang hiển thị:

| Chỉ số | Dữ liệu | Ví dụ |
|---|---|---|
| Phiên hoàn thành | `totalSessionsCompleted`, kèm `totalPracticeTurns` (số lượt đối thoại) | 1 phiên, 9 lượt |
| Điểm phản xạ | `speakingReflexIndex` /100 | 42/100 |
| Chuẩn trợ từ | `particleAccuracyRate` (%), độ đúng は / が / を / に / で | 76% |
| Vững kính ngữ | `keigoCommandScore` (%), mức dùng lịch sự và kính ngữ | 49% |

Hồ sơ còn các trường có thể dùng thêm: `strengths` (điểm mạnh, dạng danh sách chữ), `targetFocusAreas` (cần tập trung), `lastPracticedAtUtc` (lần luyện gần nhất), `nextRecommendedScenarioTitle` (tình huống nên luyện tiếp). Học viên mới chưa có hồ sơ: hiện trạng thái chưa có dữ liệu, không hiện số 0 giả.

### 4.2 Danh sách kết quả

- **Bộ lọc:** Tất cả / Đạt chuẩn / Cần rèn luyện (lọc theo `passStatus`). Hiện tổng số kết quả (`totalCount`).
- **Phân trang:** 8 kết quả mỗi trang (`page`, `totalPages`).
- **Mỗi kết quả có:**
  - Tên tình huống (`scenarioTitle`), ví dụ "Gọi món tại quán mì Ramen".
  - Cấp độ JLPT (`jlptLevel`).
  - Điểm tổng /100 (`overallScore`).
  - Đạt hay chưa đạt (`passStatus`). Đang thể hiện bằng con dấu triện (hanko).
  - Thời điểm hoàn thành (`completedAt`).
  - Số phiên (`roleplaySessionId`), hiện đang ghi "Phiên đối thoại #1". Đây là số kỹ thuật, có thể bỏ.
- **Hạng theo điểm** (đang dùng, giữ thang này):

  | Điểm | Chữ Hán | Tên hạng |
  |---|---|---|
  | ≥ 90 | 極 | Xuất sắc |
  | ≥ 80 | 優 | Ưu tú |
  | ≥ 70 | 良 | Khá tốt |
  | ≥ 60 | 可 | Đạt chuẩn |
  | < 60 | 研 | Cần rèn luyện thêm |

- **Biểu trưng tình huống:** hiện mỗi kết quả có một ô chữ Hán đoán từ tên tình huống (食 quán ăn, 駅 nhà ga/sân bay, 店 cửa hàng, 宿 khách sạn, 道 hỏi đường, 医 khám bệnh, 会 còn lại). Có thể giữ hoặc thay.
- **Bấm một kết quả:** mở trang chi tiết `/roleplay/results/:id`. Trang chi tiết nằm ngoài phạm vi brief này.

### 4.3 Trạng thái

- Đang tải danh sách.
- Lỗi tải: thông báo lỗi và cách thử lại.
- Rỗng theo bộ lọc: "Chưa có kết quả trong danh mục này", kèm lối đi tới trang Hội thoại AI (`/scenarios`) để bắt đầu một buổi.

## 5. Tab Shadowing

### 5.1 Số liệu tổng

- **Điểm trung bình** của mọi buổi đã lưu (/100). Chưa có buổi nào thì hiện "chưa có", không hiện 0.
- **Tổng thời lượng luyện** (phút). Chỉ cộng các buổi có lưu thời lượng.

### 5.2 Tìm và lọc

- Ô tìm theo tên bài hoặc tên tình huống.
- Hiện có thêm bộ lọc "Giáo trình", nhưng **dữ liệu từ server không có giáo trình** nên lọc này gần như vô dụng. Đề xuất bỏ, hoặc thay bằng lọc theo cấp JLPT (`jlptLevel` có sẵn).

### 5.3 Danh sách buổi luyện

Phân trang 5 buổi mỗi trang. Mỗi buổi có:

| Trường | Ghi chú |
|---|---|
| Ngày giờ hoàn thành | `completedAt` |
| Tên bài | `dialogueTitle`, ví dụ "Hội thoại 01: クラブ紹介の案内 (Ngày giới thiệu CLB)" (có thể chứa tiếng Nhật) |
| Tình huống | `scenarioTitle`, có thể trống (bài không gắn tình huống) |
| Cấp JLPT | `jlptLevel` |
| Vai đã luyện | A hoặc B (bài hội thoại có hai vai) |
| Điểm tổng kết | `averageScore` /100 |
| Hạng | Hạng S Rất xuất sắc (≥ 90), Hạng A Rất tốt (≥ 80), Hạng B Đạt chuẩn (≥ 65), Hạng C Cần luyện thêm (< 65) |
| Thời lượng | `durationSeconds`, có thể không có |
| Số câu đã chấm | `sentenceScores.length` trên `totalSentences` |
| Độ khớp nội dung | % số từ nói đúng, có thể không có |
| Bản ghi cũ | Buổi luyện tạo trước phiên bản chấm điểm hiện tại: gắn nhãn "Bản ghi cũ", không hiện hạng |

Bảng hiện tại có hai cột "Giáo trình" và "Bài học" luôn trống với dữ liệu thật. Đề xuất bỏ.

**Hành động trên mỗi buổi:**
- **Chi tiết:** mở rộng ngay tại chỗ (không chuyển trang).
- **Luyện lại:** vào phòng luyện của bài đó, cùng vai.

### 5.4 Chi tiết một buổi (khi mở rộng)

- Tóm tắt: độ khớp nội dung, số câu đã chấm, hạng.
- **Từng câu học viên đã nói**, mỗi câu gồm:
  - Câu mẫu tiếng Nhật có furigana, so từng từ với lời học viên đã nói. Mỗi từ có trạng thái đúng, sai, thiếu hoặc thừa, dùng component `WordDiff`.
  - Lời học viên đã nói (văn bản hệ thống nhận được).
  - Nghĩa tiếng Việt của câu.
  - Điểm câu /100, tô màu theo mức: ≥ 80 tốt, ≥ 65 khá, < 65 cần sửa (token `--score-good`, `--score-mid`, `--score-low`).
  - Nhận xét ngắn của hệ thống cho câu đó (`feedback`), có thể trống.
  - Nút nghe câu mẫu.
- Nút "Luyện tập lại toàn bài này".

### 5.5 Trạng thái

- Đang tải.
- Chưa có buổi nào: mời chọn một bài trong thư viện Shadowing (`/shadowing`).
- Có buổi nhưng tìm không ra: gợi ý đổi từ khoá.

## 6. Dữ liệu có sẵn nhưng chưa hiển thị (đề xuất, cần làm thêm phần code)

Nếu thiết kế dùng các phần dưới đây, ghi rõ là đề xuất để nhóm làm thêm. Hệ thống đã có API, chỉ chưa đưa lên giao diện.

- **Nhận xét AI cho một buổi Shadowing:** chỉ tạo khi học viên bấm, miễn phí, không lưu. Gồm: tóm tắt, việc nên ưu tiên, phần Phát âm (một câu đánh giá và tối đa 3 vấn đề, mỗi vấn đề có bằng chứng và cách sửa), phần Lưu loát (cùng cấu trúc, có thể không có).
- **Gợi ý luyện Shadowing tiếp theo:** các lỗi lặp lại gần đây (loại lỗi, số lần, số câu) và danh sách bài nên luyện cho từng lỗi.
- **Điểm lưu loát** của buổi Shadowing (`fluencyScore`): nhiều buổi chưa có số này. Chỉ hiện khi có, không ước lượng.

## 7. Không làm

- Không bịa số liệu hay biểu đồ tiến độ theo thời gian. API không trả sẵn chuỗi điểm theo ngày. Nếu muốn biểu đồ, chỉ được vẽ từ danh sách buổi đã có, và ghi rõ là đề xuất.
- Không hiện điểm Phát âm hay Ngữ điệu cho Shadowing: hệ thống chưa chấm hai phần này.
- Không thêm chức năng xoá kết quả.

## 8. Cần bàn giao

- Màn hình 1440px và 390px cho cả hai tab.
- Tab Shadowing có một buổi đang mở chi tiết.
- Các trạng thái: đang tải, lỗi, rỗng (học viên mới), rỗng theo bộ lọc.
- Chế độ sáng và tối.
- Ghi chú component dùng ở từng phần, để dựng lại trong `jcap-web/src/components/jcap/`.
