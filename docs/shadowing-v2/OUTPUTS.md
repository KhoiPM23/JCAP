# Shadowing — Hệ thống chấm xuất ra những gì

Tổng hợp mọi đầu ra của phần chấm và nhận xét Shadowing (scoring version `shadowing-score/v3-dimensions`, so khớp `kana-word-v2`).
Cập nhật: 2026-11-12. Chi tiết thuật toán: `docs/shadowing-evaluation.md`; số liệu kiểm chứng: `REAL-VOICE-REPORT.md`.

## 0. Tóm tắt

| Nhóm | Có xuất ra | Ghi chú |
|---|---|---|
| Điểm **Nội dung** (0–100) | ✅ | Điểm duy nhất; cũng là điểm tổng |
| Lỗi theo **từ** và theo **từng âm** | ✅ | Kèm nhận xét tiếng Việt viết sẵn |
| **Lưu loát** | ✅ số liệu + nhận xét | Tham khảo, **không có điểm** |
| **Phát âm** | ❌ | `UNAVAILABLE` cho tới khi kiểm chứng trên giọng người học |
| **Ngữ điệu** | ❌ | Chưa làm |
| Kiểm tra chất lượng âm thanh | ✅ | Có mã lỗi và lời nhắc |
| Furigana câu mẫu | ✅ | |
| Tổng kết buổi, lịch sử | ✅ | Tính ở backend |
| Gợi ý luyện tập | API còn, **không hiển thị** | Bỏ khỏi màn tổng kết từ 2026-11-13 |

Nguyên tắc: không đo được thì trả **null + mã lý do**, không bao giờ trả 0; không dùng Web Speech để chấm; không suy ra chiều này từ chiều khác.

---

## 1. Mỗi lần chấm một câu — `POST /api/shadowing/evaluate-audio`

### 1.1 Trạng thái và nguồn

| Trường | Giá trị | Ý nghĩa |
|---|---|---|
| `evaluationStatus` | `completed` · `unavailable` · `failed` | Chấm được / chưa chấm được (lỗi hệ thống hoặc âm thanh) / lỗi |
| `recognitionStatus` | `recognized` · `no_speech` · `unavailable` | Có nghe ra lời nói không |
| `recognitionSource` | `faster-whisper` (mặc định) · `phoneme` | Nguồn nhận dạng |
| `asrModel` | vd. `faster-whisper:small` | Mô hình đã dùng |
| `processingMs` | ms | Thời gian backend xử lý |
| `scoringVersion` · `comparisonMethod` | `shadowing-score/v3-dimensions` · `kana-word-v2` | Phiên bản công thức (để so kết quả cũ/mới) |
| `evaluationId` | Guid | Id lần chấm đã lưu (mọi lần gửi đều được lưu, kể cả không chấm được) |

### 1.2 Chất lượng âm thanh (backend tự kiểm tra)

| Trường | Giá trị |
|---|---|
| `audioQualityStatus` | `good` · `acceptable` (nhỏ, đã khuếch đại, hoặc hơi vỡ tiếng) · `needs_retry` |
| `audioQualityDetail` | Lời nhắc tiếng Việt |

Bản ghi nhỏ nhưng rõ được **tự khuếch đại** (tối đa +40 dB) thay vì từ chối.

### 1.3 Nội dung (điểm duy nhất)

| Trường | Ý nghĩa |
|---|---|
| `contentMatchScore` | 0–100: tỷ lệ âm (mora) thuộc các **từ đọc đúng hoàn toàn**, trừ âm nói thừa. Null nếu không chấm được |
| `overallScore` | = điểm nội dung |
| `overallScoreBasis` | `content` (ghi rõ điểm tổng chỉ là điểm nội dung) |
| `tier` | `green` (≥ 80) · `yellow` (≥ 65) · `red` |
| `recognizedText` | Transcript Whisper đã được chấm |
| `recognizedDisplayText` | "Bạn đã nói": từ đúng dùng chữ của câu mẫu, phần sai giữ kana như đã nghe |
| `targetReading` · `recognizedReading` · `readingSource` | Cách đọc (hiragana) hai phía và nguồn cách đọc |
| `feedback` | Câu nhận xét tổng, vd. *"Khá tốt! Còn một số từ chưa đúng. Lưu ý: 「エクスプレス」: Thừa âm ngắt 「っ」 sau 「え」…"* |
| `missingWords` · `mismatchedWords` | Danh sách từ thiếu / từ sai |

Quy tắc chấm đáng chú ý: một từ chỉ đúng khi **mọi âm** đều đúng; chữ Hán Whisper viết đúng thì tính đúng dù hai bộ đọc khác nhau (日本: にほん/にっぽん);
何 chấp nhận なに/なん; từ katakana trong cụm dài được chấm riêng; số viết bằng chữ số hay chữ Hán đều được (1枚 = 一枚).

### 1.4 Lỗi theo từ và từng âm — `diffTokens[]`

| Trường | Ý nghĩa |
|---|---|
| `text` | Đoạn của câu mẫu (gộp các từ đúng liền nhau) |
| `status` | `correct` · `mismatched` (sai) · `missing` (thiếu) |
| `spokenPart` | Người học nói gì ở vị trí này |
| `expectedReading` | Cách đọc đúng |
| `errorType` | `chouon` (trường âm) · `sokuon` (っ) · `hatsuon` (ん) · `voicing` (âm đục/trong) · `mora` (sai âm) · `extra` (nói thừa) |
| `issues[]` | **Lỗi từng âm**: `kind` (`extra` / `missing` / `substitute`), `expected`, `spoken`, `after` (âm đứng trước, để chỉ chỗ), `errorType`, `message` |

Ví dụ `issues[].message`: *"Thừa âm ngắt 「っ」 sau 「え」: nối liền, không dừng hơi."* · *"「く」 đọc thành 「ぐ」: âm này là âm trong, đọc nhẹ, không rung cổ họng."* ·
*"Trường âm 「ー」 sau 「ぽ」 bị đọc thành âm ngắt 「っ」: kéo dài âm, không ngắt."* Tối đa 4 lỗi mỗi từ; quá nửa số âm khác (nói từ khác hẳn) thì không liệt kê.

### 1.5 Các chiều đánh giá — `dimensions`

Mỗi chiều: `status` (`COMPLETED` · `UNAVAILABLE` · `FAILED`), `score`, `reason`, `source`.

| Chiều | Hiện tại |
|---|---|
| `content` | `COMPLETED` + điểm (nguồn `faster-whisper:small`) |
| `pronunciation` | `UNAVAILABLE` / `INSUFFICIENT_ACOUSTIC_EVIDENCE` |
| `fluency` | `COMPLETED` không điểm / `SCORE_NOT_VALIDATED`; hoặc lý do không so được (`CONTENT_BELOW_THRESHOLD`, `REFERENCE_UNAVAILABLE`…); tắt thì `NOT_ENABLED` |
| `prosody` | `UNAVAILABLE` / `NOT_IMPLEMENTED` |

`pronunciationScore` và `fluencyScore` luôn null. `unavailableDimensions` liệt kê các chiều chưa có điểm.

### 1.6 Lưu loát — `fluency` (tham khảo, không có điểm)

Bốn lớp:
1. **Số đo người học**: thời lượng, im lặng đầu/cuối, khoảng nói, thời gian có tiếng, số chỗ ngừng (≥ 250 ms), tổng/dài nhất, tỷ lệ ngừng,
   danh sách chỗ ngừng, tốc độ nói và tốc độ phát âm (mora/giây), **nói liền trung bình** (`meanRunMs`, `meanRunMoras`).
2. **Số đo giọng mẫu** (`reference`): cùng chỉ số, quy đổi theo tốc độ người học nghe mẫu nếu được gửi (`playbackRate`; trang luyện hiện không còn ô chỉnh tốc độ nên luôn là 1).
3. **So sánh** (`comparison`, chỉ khi nội dung ≥ 70, số âm khớp 80–125%, đủ dài, có giọng mẫu):
   `articulationRateRatio` / `speakingRateRatio` = tốc độ người học / tốc độ mẫu (< 1 là chậm hơn), số chỗ ngừng hai bên,
   `extraPauseCount` (ngừng ≥ 400 ms ở giữa câu mà mẫu không ngừng), `hesitationCount` (ngừng **giữa một từ**).
4. **Nhận xét** (tối đa 3, kèm số đo và ngưỡng): chậm hơn mẫu (tỷ lệ ≤ 0,70), nhanh bất thường (≥ 2,5), dừng thừa (nêu vị trí theo từ nếu được),
   trường âm ngắn (thử nghiệm).

Ngưỡng là thử nghiệm (đối chiếu với 150 câu người Nhật FLEURS). VOICEVOX là mốc phản hồi cho Shadowing, không phải chuẩn lưu loát.
Tắt toàn bộ: `Shadowing:Fluency:Enabled=false`.

### 1.7 Mã lỗi khi không chấm được — `errorCode` / `errorMessage`

| Nhóm | Mã |
|---|---|
| Âm thanh | `EMPTY_AUDIO` · `ANALYSIS_AUDIO_MISSING` · `INVALID_AUDIO_FORMAT` · `AUDIO_TOO_LARGE` · `AUDIO_TOO_SHORT` · `AUDIO_TOO_LONG` (> 30 s) · `AUDIO_SILENT` · `AUDIO_TOO_QUIET` · `AUDIO_NOISE_ONLY` · `AUDIO_CLIPPED` |
| Nhận dạng (Whisper) | `ASR_UNAVAILABLE` (dịch vụ tắt) · `ASR_BUSY` · `ASR_TIMEOUT` · `ASR_REJECTED_AUDIO` · `ASR_ERROR` · `ASR_UNRELIABLE` (văn bản lặp vô nghĩa, hoặc không có tiếng Nhật) · `NO_SPEECH_DETECTED` (kể cả khi Whisper "ảo giác" lúc im lặng: mọi đoạn no_speech_prob ≥ 0,6, hoặc câu bịa quen thuộc như 「ご視聴ありがとうございました」) |
| Khác | `READING_UNAVAILABLE` (không đọc được câu mẫu/transcript, vd. chữ Latin) · `MISSING_TARGET_TEXT` · `SERVER_BUSY` |

`errorMessage` là lời tiếng Việt cho người học; lỗi hệ thống không bao giờ bị coi là người học nói sai.

---

## 2. Furigana câu mẫu — `GET /api/shadowing/{dialogueId}/furigana`

Mỗi câu: danh sách đoạn `{ text, reading }` (reading chỉ có ở chữ Hán), tính sẵn từ cách đọc VOICEVOX. Trang luyện hiển thị dạng ruby.

## 3. Tổng kết buổi — `POST /api/shadowing/session/complete` → `summary`

| Trường | Ý nghĩa |
|---|---|
| `totalSentenceCount` · `learnerSentenceCount` · `evaluatedSentenceCount` | Số câu cả bài / của vai người học / đã chấm được |
| `totalSubmissions` · `unscoredSubmissions` | Số lần gửi chấm / số lần không chấm được |
| `contentAccuracy` | Độ chính xác nội dung của buổi |
| `pronunciationStatus` · `fluencyStatus` · `prosodyStatus` | `COMPLETED` / `UNAVAILABLE` (không hiện số khi chưa có điểm) |
| `sentencesToRetry[]` | Câu nên luyện lại (điểm tốt nhất < 65 hoặc chưa chấm được): câu, điểm tốt nhất, lý do, loại lỗi chính |
| `errorTypeCounts` | Đếm lỗi theo loại trong buổi (trường âm, っ, ん, âm đục/trong…) |

## 4. Lịch sử — `GET /api/shadowing/history`, `GET /api/shadowing/history/{sessionId}`

Danh sách buổi đã luyện (có `totalSubmissions`); chi tiết một buổi gồm `summary` và **từng lần gửi chấm**
(thời điểm, trạng thái, mã lỗi, điểm nội dung, tier, transcript, nguồn/mô hình, phiên bản chấm, có được tính vào buổi không).

## 5. Gợi ý luyện tập — `GET /api/shadowing/recommendations` (không còn hiển thị)

Màn tổng kết đã bỏ khối này (2026-11-13); API vẫn còn ở backend.

Theo quy tắc (không dùng AI): trong 60 ngày gần nhất, loại lỗi xuất hiện **≥ 3 lần trên ≥ 2 câu khác nhau** (trường âm, っ, ん, âm đục/trong)
→ `focus[]` (loại lỗi, số lần, số câu, lời khuyên) và `dialogues[]` (bài hội thoại có nhiều câu chứa âm đó).

## 6. Tiến độ luyện — `/api/shadowing/progress`

Lưu ở server: bài đang luyện, câu hiện tại, trạng thái từng câu; tiếp tục được trên máy khác. localStorage chỉ là bản sao.

---

## 7. Đầu ra cho phát triển và kiểm chứng (không hiện cho người học)

| Công cụ | Xuất ra |
|---|---|
| Nút **Tải bản ghi** (chỉ `npm run dev`) | Cặp `.wav` (đúng bản backend chấm) + `.json` (câu mẫu, cấu hình micro, kết quả) |
| `RealScoringBench` | Chấm lại cả thư mục bản ghi bằng pipeline sản phẩm: điểm lúc thu so với hiện tại, transcript, từ sai, lỗi từng âm |
| `FluencyBaselineBench` | Phân bố chỉ số nhịp nói (phân vị) của bản ghi và giọng mẫu; tỷ lệ bị nhận xét chậm/nhanh/dừng thừa |
| `FluencyPlaybackRateBench` | Sai số quy đổi theo tốc độ phát giọng mẫu |
| `AsrBench` · `RealRecordingBench` | Tỷ lệ lỗi nhận dạng của Whisper và mô hình âm vị |

Biến môi trường chung: `JCAP_BENCH=1`, `JCAP_ASR_URL=http://127.0.0.1:50023`, `JCAP_REAL_DIR=<thư mục>`; cần VOICEVOX.
