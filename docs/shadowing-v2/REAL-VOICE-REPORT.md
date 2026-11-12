# Shadowing V2 — Kết quả chạy trên giọng người học thật (đợt 1)

Ngày đo: 2026-11-12. Đây là đợt đo đầu tiên trên giọng người thật (các số liệu trước đó chỉ đo trên giọng tổng hợp VOICEVOX).

## 1. Dữ liệu

| Mục | Giá trị |
|---|---|
| Người nói | 1 người học Việt Nam (thành viên nhóm) |
| Số câu khác nhau | 13 (bài nhập cảnh: s34–s39; bài ga tàu: s114–s120) |
| Số lượt thu | 46 (1–7 lượt mỗi câu) |
| Cách thu | Trang luyện (`npm run dev` → "Tải bản ghi"), WAV 16 kHz mono do chính trang tạo (bản PCM thu trực tiếp), khử nhiễu trình duyệt TẮT |
| Nhãn (người nói thật sự đã nói gì) | **Chưa có.** Một số lượt là cố ý nói sai/nói câu khác, nhưng chưa ghi nhãn từng lượt |

Vì chưa có nhãn, báo cáo này **không** đưa ra tỷ lệ nhận dạng đúng hay tỷ lệ phát hiện lỗi. Các con số dưới đây là điểm hệ thống cho, không phải độ chính xác.

## 2. Lỗi của bộ chấm phát hiện nhờ giọng thật (đã sửa)

Chấm lại toàn bộ 46 lượt bằng `RealScoringBench` sau mỗi bản sửa; lượt không liên quan giữ nguyên điểm.

| # | Lỗi | Ví dụ | Trước → sau | Sửa |
|---|---|---|---|---|
| 1 | Hai bộ G2P đọc cùng chữ Hán khác nhau | 何日、日本にいますか: Whisper viết đúng từng chữ; VOICEVOX đọc 日本 = にっぽん, OpenJTalk = にほん | 46 → 100 (4 lượt) | Từ có chữ Hán viết đúng (theo thứ tự) thì tính đúng (`CompareTranscriptAsync`) |
| 2 | Gióng chữ ↔ âm sai khi hai cụm chữ Hán cách nhau bởi dấu câu | 十時四十分発、七号車: 十時四十分発 chỉ nhận "じゅ" | 56 → 83 | `JapaneseSurfaceAligner` chọn cách gióng cân đối (~2 âm/chữ), dấu câu ở ranh giới cụm; furigana gióng lại |
| 3 | Whisper (ép tiếng Nhật) trả câu tiếng Anh | 一週間です → "It's your godness." | 0 → chưa chấm (ASR_UNRELIABLE) | Transcript không có kana/chữ Hán thì không chấm |
| 4 | Một âm sai trong từ katakana làm mất cả cụm dài | 成田エクスプレスですね = 1 từ, sai エクスプレス mất 50 điểm | 50 → 75 | Tách từ katakana khỏi cụm trọng âm |
| 5 | Nhận xét chỉ nói "cả cụm sai" | 「成田エクスプレスですね」 đọc chuẩn là … | — | Lỗi từng âm: "Thừa âm ngắt っ sau え", "く đọc thành ぐ" |

Tổng: điểm trung bình 46 lượt từ 56,5 lên 67,3; số lượt 100 điểm từ 10 lên 14; 15 lượt đổi điểm, 1 lượt chuyển sang "chưa chấm được" (lỗi 3).

## 3. So sánh mô hình Faster-Whisper `base` và `small` (CPU, int8)

Cùng 46 lượt, cùng pipeline chấm:

| | `small` | `base` |
|---|---|---|
| Lượt 100 điểm | **14** | 5 |
| Điểm trung bình (lượt chấm được) | **64,6** | 50,6 |
| Lượt không chấm được | 1 | 2 |
| Ví dụ nghe sai câu dễ | — | 観光です → 完環です; 入国 → 夕黒; はい、どうぞ → どうぞ |

Kết luận: `base` không đủ cho giọng người học; dùng `small`. `medium` chưa đo (cần tải ~1,5 GB, chậm hơn ~2–3 lần trên CPU).
Thời gian xử lý `small` trên CPU: ~1,5 s cho câu ngắn. Lần chạy đầu cần tải mô hình (~460 MB) và vượt hạn 20 s của backend.

## 4. Đối chiếu hai bộ nhận dạng độc lập

Câu 成田エクスプレスですね (7 lượt) được nghe bằng Whisper (đoán từ) và mô hình âm vị HuBERT (chỉ ghi âm nghe được, không đoán từ):

| Lượt | Whisper | Mô hình âm vị |
|---|---|---|
| 1 | エッグスプレイスト | えっくすぷ…れえすと |
| 3 | エキスプレッス | えくすぷれっす |
| 4 | エッグスプレス | えっくすぷれっすい |
| 7 | えぐすぶれす | えぐすぶれす |

Hai bộ độc lập cùng thấy những lệch lặp lại: thừa っ (えっくす, ぷれっす), く→ぐ, ぷ→ぶ. Cũng thấy パ→バ (パスポート, cả hai bộ) và で→れ (電車, Whisper viết 連射/連載). Đây là dấu hiệu nhận xét phản ánh lỗi phát âm có thật chứ không phải nhiễu nhận dạng, nhưng **chưa phải bằng chứng định lượng** (một người nói, chưa có nhãn).

Phát lại giọng mẫu VOICEVOX qua loa vào micro thì được nhận dạng đúng: micro, thu âm và dịch vụ hoạt động bình thường.

## 5. Quan sát về thu âm

- Khử nhiễu TẮT: mức giọng khoảng −33 dBFS, đỉnh −21 dBFS, nền −44 dBFS (chênh ~11 dB). Nhỏ nhưng vẫn qua kiểm tra âm thanh của backend. Đã thêm chuẩn hoá âm lượng **chỉ khi nghe lại** (bản gửi chấm giữ nguyên).
- **Lưu ý:** cả 46 lượt thu với khử nhiễu + tự chỉnh âm lượng TẮT (nút thử nghiệm trên máy người thu), trong khi người học dùng cấu hình mặc định BẬT.
  Sau đợt này nút đã bỏ và cấu hình luôn BẬT; dữ liệu các đợt sau sẽ đúng với cấu hình người học. So sánh BẬT/TẮT chưa đo.
- Chưa thấy lượt nào bị từ chối nhầm vì âm lượng/tiếng ồn (ngưỡng `ShadowingAudioValidator` vẫn là heuristic).

## 5b. Kiểm tra "nói đúng có bị chấm oan không" trên nhiều giọng: Google FLEURS

Dữ liệu: [Google FLEURS](https://huggingface.co/datasets/google/fleurs) tiếng Nhật, phần test (CC-BY-4.0). 150 câu chọn ngẫu nhiên
(75 nam, 75 nữ; 1–25 giây), người bản xứ đọc đúng câu cho sẵn. Chuyển float → WAV PCM 16-bit 16 kHz như trình duyệt gửi.
Dữ liệu chỉ để đo, không đưa vào repo. Chạy bằng `RealScoringBench` (mỗi câu một cặp .wav + .json có `targetText`).

| | Trước khi sửa | Sau khi sửa |
|---|---|---|
| Câu chấm được | 65/150 | **147/150** |
| Bị từ chối "âm lượng quá nhỏ" | 75 (**toàn bộ giọng nữ**) | 0 |
| Bị từ chối "chỉ có tiếng ồn" | 7 | 0 |
| Không đọc được (chữ Latin: M16, pH) | 3 | 3 |
| Điểm nội dung trung bình / trung vị | 86,6 / 87 | 88,3 / 90 |
| Câu 100 điểm · ≥ 90 · ≥ 80 | 14 · 27 · 47 | 39 · 78 · 116 |
| Giọng nữ (trung bình) | không chấm được | 90,1 |

Nguyên nhân và cách sửa (`ShadowingAudioValidator`, `FluencyAnalyzer`):
- Giọng nữ FLEURS ghi rất nhỏ (mức tiếng nói −58…−51 dB, ngưỡng cũ −50 dB) nhưng rất sạch. Nay bản ghi nhỏ mà sạch được **khuếch đại**
  (mức < −40 dB → ~−25 dB, tối đa +40 dB, không vỡ tiếng) trước khi nhận dạng; chất lượng ghi là "acceptable" để nhắc nói to hơn.
  Bản ghi vốn nhỏ mà sau khuếch đại chỉ còn nhiễu vẫn báo "âm lượng quá nhỏ".
- 7 giọng nam trên nền ồn có chênh tiếng nói/nền 10,5–12 dB (ngưỡng cũ 12 dB). Ngưỡng hạ còn **9 dB** (tiếng ồn thuần thường 2–6 dB).
- 46 bản ghi của người học (mục 1) giữ nguyên điểm sau bản sửa.

Điểm chưa đạt 100 trên câu FLEURS chủ yếu do Whisper `small` nghe nhầm tên riêng nước ngoài và chữ Hán hiếm (ビシュケク → 美視県, 徘徊 → 拝開);
câu FLEURS (Wikipedia) khó hơn nhiều so với câu N5–N3. Không phải lỗi bộ chấm; muốn cải thiện cần mô hình lớn hơn.

## 5c. Lưu loát: mức nhịp nói bình thường (người Nhật FLEURS) và người học

Đo bằng `FluencyBaselineBench` (cùng VAD và tiêu chí khoảng dừng với sản phẩm; giọng mẫu VOICEVOX speaker 3 đọc cùng câu).
Phân vị 5 · 50 · 95. Câu FLEURS dài (~60 mora), câu người học ngắn (~15 mora).

| Chỉ số | Người Nhật (FLEURS, 150) | Người học (46 bản ghi, 44 đo được) |
|---|---|---|
| Tốc độ phát âm so với mẫu (mẫu / người nói; < 1 là chậm hơn) | 0,73 · 0,94 · 2,14 | 0,47 · 0,99 · 1,23 |
| Bị coi là "chậm hơn mẫu" (≤ 0,70) | 2/150 | 7/44 |
| Bị coi là "nhanh hơn mẫu" (≥ 1,40, ngưỡng cũ) | **26/150** | 1/44 |
| Có ≥ 1 khoảng dừng thừa (≥ 400 ms, giữa câu) | 26/150 | 16/44 |
| Nói liền trung bình (mora/đoạn) — mẫu VOICEVOX | 15 — 20 | **6** — 12 |

Quyết định theo số liệu:
- Giữ ngưỡng "chậm" 0,70 (gần như không bắt nhầm người bản xứ).
- Người Nhật thật thường nói **nhanh hơn VOICEVOX**: ngưỡng nhận xét "nhanh" nâng từ 1,40 lên 2,5 (chỉ khi bất thường); giao diện ghi "nhanh hơn mẫu" như thông tin, không đánh dấu là vấn đề.
- Giữ ngưỡng khoảng dừng thừa 400 ms: người học có tỷ lệ bản ghi có dừng thừa cao gấp đôi dù câu ngắn hơn ~4 lần.
- "Nói liền trung bình" (mean length of run) phân biệt rõ: người học ~½ mẫu, người bản xứ gần bằng mẫu.

Hiển thị: khối "Lưu loát" trên thẻ kết quả (tham khảo, chưa tính điểm) gồm tốc độ so với mẫu, số lần dừng, số lần **ngập ngừng giữa từ**
(khoảng dừng thừa nằm giữa một từ, xác định bằng mốc mora của giọng mẫu), nói liền trung bình và nhận xét. Quy ra điểm: để sau khi có thêm dữ liệu người học.

## 6. Giới hạn

- 1 người nói, 46 lượt, không nhãn: không đủ để nêu độ chính xác hay mở chiều Phát âm (Decision 3 cần 3–5 người, 10–15 câu × 2–3 lượt, có nhãn).
- Nhận xét từng âm dựa trên chữ Whisper viết: khi Whisper nghe nhầm (nhất là câu nhiều số), nhận xét sai theo.
- Whisper vẫn có thể "sửa" lỗi phát âm thành từ đúng; trên giọng VOICEVOX là 28/78 câu đọc sai. Chưa đo được trên giọng thật vì thiếu nhãn.

## 7. Việc tiếp theo

1. Ghi nhãn 46 lượt (thực sự đã nói gì) → tính tỷ lệ lỗi mora của Whisper và tỷ lệ phát hiện lỗi cố ý trên giọng thật.
2. Thu thêm 2–4 người theo Decision 3.
3. Quyết định có đo `medium` không.
4. Chạy lại: `JCAP_BENCH=1 JCAP_ASR_URL=http://127.0.0.1:50023 JCAP_REAL_DIR=<thư mục> dotnet test JCAP.Tests --filter "FullyQualifiedName~RealScoringBench"` (cần VOICEVOX).
