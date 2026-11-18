# Shadowing V2 — Phase 0: Khảo sát hiện trạng

Ngày khảo sát: 2026-11-11. Nhánh `feature/sprint-2/gkhoi`. Đối chiếu với code thực tế (kể cả phần **chưa commit** trên nhánh).
Không có thay đổi code nào trong bước này.

> Lưu ý quan trọng: phần lớn pipeline âm thanh hiện tại (nhận dạng âm vị, chấm theo câu mẫu, micro mở sẵn, công cụ thu dữ liệu) **chưa được commit**.
> Cần commit/chốt trước khi bắt đầu Milestone 1 để có điểm rollback.

---

## 1. Kiến trúc hiện tại

```
React (LearnerShadowingPracticeView)
  ├─ phát giọng mẫu: nativeAudioUrl (admin upload) hoặc VOICEVOX qua /api/tts/synthesize (cache wwwroot/audio-cache)
  ├─ thu âm: micro mở sẵn (WarmMic) → PCM có thu trước 0.5 s → WAV 16 kHz mono  +  MediaRecorder (nghe lại)
  ├─ cổng âm thanh phía client (audioGate.ts) + Web Speech (chỉ hiện chữ trực tiếp, dự phòng)
  └─ POST /api/shadowing/evaluate-audio (multipart, JWT, ≤ 8 MB, 30 lượt/phút/người)
        │
.NET 8 API — ShadowingController → ShadowingEvaluationService (IAiShadowingAssessmentService)
  ├─ OnnxPhonemeRecognizer (HuBERT phoneme-CTC, ONNX Runtime, CPU, singleton) trên analysisWav
  ├─ VoiceVoxKanaReader → cách đọc câu mẫu (G2P của VOICEVOX, gọi lúc chấm, có cache trong RAM)
  ├─ PronunciationAligner + CtcScorer → chuỗi "đã nghe" theo câu mẫu (mặc định) | nhận dạng tự do khi đọc câu khác
  ├─ KanaMoraComparer → so theo từ, điểm, diffTokens, "Bạn đã nói", nhận xét
  ├─ FluencyAnalyzer / FluencyComparer / PausePositionLocator / MoraDurationAnalyzer → nhịp nói so với giọng mẫu VOICEVOX
  └─ ShadowingService.RecordSentenceEvaluationAsync → bảng ShadowingSentenceEvaluations
SQL Server (EF Core Code First)
```

Dịch vụ ngoài: **VOICEVOX engine** (cổng 50021) — bắt buộc cho chấm điểm và cho giọng mẫu. **Whisper Engine** (Python, cổng 50022) chỉ dùng cho Hội thoại AI, không dùng trong Shadowing.

## 2. Luồng người dùng hiện tại

| # | Luồng | Hiện trạng (file) |
|---|---|---|
| 1 | Mở bài | `/shadowing` → danh sách theo N5/N4/N3, tìm kiếm, kịch bản (`LearnerShadowingListView`, KhoiPM23) → chi tiết `/shadowing/:id` (`LearnerShadowingDetailView`) → `/shadowing/:id/practice`. |
| 2 | Khởi tạo phiên | **Không có phiên phía server.** Tiến độ (câu hiện tại, vai) lưu ở `localStorage` (`shadowingStorageService`); khôi phục khi mở lại cùng máy/trình duyệt. |
| 3 | Phát giọng mẫu | `nativeAudioUrl` nếu là URL http; không thì VOICEVOX `/api/tts/synthesize` (tải trước câu hiện tại + 2 câu sau); VOICEVOX lỗi → Web Speech Synthesis. Không chỉnh tốc độ. Không có Furigana (chỉ romaji + bản dịch). |
| 4 | Ghi âm | Người học bấm ghi; lượt đối phương tự phát (không thu). Micro mở sẵn khi tới lượt người học (nếu đã có quyền), đóng khi phát âm thanh. |
| 5 | Xử lý âm thanh | Client: cổng âm thanh (RMS, SNR, vỡ tiếng, độ dài ≥ 0.4 s) → WAV 16 kHz từ PCM (dự phòng: giải mã MediaRecorder). |
| 6 | Gửi lên backend | **Bấm dừng = gửi ngay** (RecordingBar: Hủy / Gửi). Không có bước nghe lại trước khi gửi. |
| 7 | Nhận kết quả | `ShadowingSentenceResultCard`: điểm + tier, "Đối chiếu câu mẫu", "Bạn đã nói", nghe lại bản ghi, nhận xét nhịp nói. |
| 8 | Luyện lại | Nút "Thu lại" (mỗi lượt có điểm là một bản ghi mới trong CSDL). |
| 9 | Chuyển câu | Người học bấm "Tiếp" (không tự chuyển sau khi có kết quả). Lượt đối phương sau đó tự phát. |
| 10 | Hoàn thành | `POST /api/shadowing/session/complete` với danh sách `EvaluationIds` → backend tính điểm buổi, lưu `ShadowingPracticeSession`. |
| 11 | Lịch sử | `GET /api/shadowing/history` + lịch sử cũ trong `localStorage` (gộp ở `LearnerShadowingListView`). |

## 3. API hiện tại

| Endpoint | Auth | Mô tả |
|---|---|---|
| `GET /api/shadowing` | JWT | Danh sách bài (lọc keyword, level, scenario; chỉ `IsActive`). |
| `GET /api/shadowing/{id}` | JWT | Chi tiết bài: câu, vai, từ vựng, ngữ pháp. |
| `POST /api/shadowing/evaluate-audio` | JWT, ≤ 8 MB, rate limit 30/phút | Chấm một câu. Đầu vào/đầu ra: xem mục 5 và `DTOs/Shadowing/ShadowingAudioEvaluationDto.cs`. |
| `POST /api/shadowing/session/complete` | JWT | Tạo buổi luyện từ các kết quả đã lưu (không nhận điểm từ client). |
| `GET /api/shadowing/history` | JWT | Lịch sử buổi luyện của người dùng. |
| `GET /api/tts/voices`, `POST /api/tts/synthesize` | (TtsController, KhoiPM23) | Danh sách giọng / tổng hợp giọng VOICEVOX, cache file. |
| `/api/admin/shadowing/*` | Admin | CRUD bài, sinh hội thoại bằng AI, gợi ý dịch, upload audio, mẫu CSV. |

Chưa có: start/get/update session, trạng thái đánh giá bất đồng bộ, retry evaluation, chi tiết buổi luyện, danh sách lượt thu.

## 4. Cơ sở dữ liệu hiện tại

| Bảng | Khóa / quan hệ | Ghi chú |
|---|---|---|
| `ShadowingDialogues` | PK Id; FK ScenarioId (tùy chọn) | Title, JLPTLevel, SpeakerRoleA/B_Name, SpeakerRolesJson, IsActive. |
| `ShadowingSentences` | PK Id; FK ShadowingDialogueId; index (DialogueId, OrderIndex) | SpeakerRole, JapaneseText, RomajiText, VietnameseTranslation, NativeAudioUrl, AudioDurationMs. **Không có cách đọc/Furigana/metadata giọng.** (Model của KhoiPM23.) |
| `ShadowingDialogueVocabularies`, `ShadowingDialogueGrammars` | PK ghép (DialogueId, VocabId/GrammarId) | |
| `ShadowingSentenceEvaluations` | PK Guid; FK UserId, ShadowingSentenceId, ShadowingPracticeSessionId (null tới khi hoàn thành); index (UserId, SentenceId, CreatedAt) | **Một dòng mỗi lượt CÓ ĐIỂM** (không ghi đè). Lưu RecognizedText, ContentMatch, Overall, Tier, trạng thái, nguồn, phiên bản chấm, phương pháp so khớp, chất lượng âm thanh, Feedback, DiffTokensJson. |
| `ShadowingPracticeSessions` | PK Guid; FK UserId, DialogueId (Restrict) | Lịch sử bất biến: vai, thời gian, ContentMatch, FluencyScore (null), WeightedOverall, ScoringVersion, RankTitle, số câu, IsActive. |

Trả lời các câu hỏi kiểm tra:
- Nhiều lần thu âm: **có** (mỗi lượt có điểm một dòng); lượt **không chấm được thì không lưu** → không phân biệt được "lần thu" và "lần đánh giá".
- Trạng thái đánh giá, nguồn nhận dạng, phiên bản chấm: **có**. **Không lưu** `RecognitionMode`, tên/phiên bản model, thời gian xử lý, số liệu nhịp nói.
- Lịch sử điểm cũ: giữ nguyên (không ghi đè). Buổi luyện chọn lượt điểm cao nhất mỗi câu; câu chưa chấm tính 0.
- Không lưu audio của Shadowing (đúng chính sách).

## 5. Pipeline đánh giá AI hiện tại (thực thi thật)

| Hạng mục | Thực tế |
|---|---|
| Model | HuBERT base phoneme-CTC tiếng Nhật (`prj-beatrice/japanese-hubert-base-phoneme-ctc`, Apache-2.0), ONNX int8 ~123 MB, 47 nhãn, khung 20 ms. Tải bằng `scripts/download-speech-models.*` (có SHA-256), thư mục `models/phoneme` (gitignore). |
| Audio gửi model | `analysisWav` do client tạo: PCM 16-bit, mono, 16 kHz (render qua OfflineAudioContext, một lần resample). Backend kiểm tra header (WavPcmReader), giới hạn 30 s. Bản ghi gốc `audio` được gửi nhưng **không dùng**. |
| Xử lý trước | Lọc thông cao 80 Hz + đệm 0.5 s lặng hai đầu (chọn bằng RecognitionRobustnessBench). |
| Nhận dạng | Mặc định **chấm theo câu mẫu** (`recognitionMode=aligned`): cách đọc câu mẫu (VOICEVOX) → âm vị → với mỗi mora so log-xác suất CTC của câu mẫu với biến thể lỗi (mất mora/phụ âm, đổi phụ âm/mora hay nhầm, đổi nguyên âm, thiếu/thừa trường âm, thiếu っ); ngưỡng 4 nat (+2 cho nguyên âm). `ん`, `r` không xét. Lệch câu mẫu > 2.5 nat/khung → nhận dạng tự do (`free`). |
| So khớp | `KanaMoraComparer` (`kana-word-v1`): từ = cụm trọng âm; một từ đúng khi mọi mora đúng; dấu câu tách từ; 何 chấp nhận なに/なん. |
| Điểm | ContentMatch = mora của các từ đúng − âm thừa đứng riêng, /tổng mora; 100 chỉ khi hoàn hảo. Overall = ContentMatch (`shadowing-score/p2-content-word`). Tier ≥80 xanh, ≥65 vàng. |
| Pronunciation / Fluency score | Luôn `null`. |
| Nhịp nói | VAD năng lượng (FluencyAnalyzer), so với giọng VOICEVOX đã nghe (FluencyComparer): chậm < 0.70, nhanh > 1.40, dừng thừa ≥ 400 ms (vị trí theo từ). Trường âm ngắn bằng DTW/MFCC (thử nghiệm, < 55%). Không tính điểm. |
| Fallback | Thiếu model/WAV hỏng/`Source=web_speech` → chấm theo transcript Web Speech đã chốt. VOICEVOX không trả cách đọc → `failed / READING_UNAVAILABLE`. |
| Ngưỡng tin cậy | 1 mora với độ tin < 0.6 → không có tiếng nói. Cổng âm thanh client `needs_retry` → không chấm. |
| `null` / unavailable | MISSING_TARGET_TEXT, EMPTY_AUDIO, AUDIO_QUALITY_INSUFFICIENT, NO_SPEECH_DETECTED, BROWSER_STT_UNSUPPORTED, BROWSER_STT_ERROR, READING_UNAVAILABLE, EVALUATION_EXCEPTION. |
| Dữ liệu giả lập | **Không còn** trong luồng chấm (đã gỡ Fluency gán cứng 88, Gemini dùng `Random`). Không tìm thấy `GeminiShadowingAssessmentService`, `AudioValidationService` trong code. Gemini chỉ còn ở phần Admin (sinh hội thoại, gợi ý dịch). |
| Độ chính xác đã đo | Chỉ trên giọng VOICEVOX (`AlignmentBench`): đọc đúng đạt 100 141/144 (có ồn 134/144); đọc sai một âm bị phát hiện 38/78. **Chưa đo trên giọng người học.** |

So sánh Faster-Whisper đã thử (model `base`, cùng cấu hình Hội thoại AI, 13 câu VOICEVOX): 3/6 câu đọc đúng bị nghe sai (アスポート, 天気, 服上), 2/7 lỗi cố ý bị "sửa" thành chữ đúng (がこう → 学校). Chỉ là thăm dò, chưa có số liệu giọng thật.

## 6. Phân loại KEEP / REFACTOR / REMOVE / NEW

| Thành phần | Nhóm | Lý do |
|---|---|---|
| Danh sách/chi tiết bài, CRUD admin | KEEP | Hoạt động; ngoài phạm vi chấm. |
| `audioDevice.ts`, `AudioDeviceSettingsModal` (chọn thiết bị, mặc định hệ thống, báo cắm/rút) | KEEP | Đã làm theo yêu cầu thiết bị. |
| `WarmMic`, `PcmTakeBuffer`, `wavEncoder` (WAV 16 kHz một lần resample) | KEEP | Chuẩn đầu vào đã đúng đề xuất. |
| `audioGate.ts` (cổng client) | REFACTOR | Giữ làm phản hồi nhanh; thêm cổng chất lượng **phía backend** (spec: backend là nguồn chính thức), ngưỡng hiệu chỉnh theo micro thật. |
| `OnnxPhonemeRecognizer`, `CtcScorer`, `PronunciationAligner` | KEEP → tách thành chiều **Pronunciation** | Là bằng chứng âm học; hiện đang trộn vào điểm Content (xem Nợ kỹ thuật #1). |
| `KanaMoraComparer`, `JapaneseMora`, `JapaneseSurfaceAligner` | KEEP | Dùng cho Content Alignment (thiếu/thừa/thay thế theo từ). |
| `VoiceVoxKanaReader` gọi lúc chấm | REFACTOR | Spec: không phụ thuộc VOICEVOX khi đánh giá → tính sẵn cách đọc khi tạo nội dung và lưu. |
| `VoiceVoxReferenceProvider` (tổng hợp giọng mẫu lúc chấm) | REFACTOR | Lưu sẵn giọng mẫu + mốc mora khi tạo nội dung. |
| Fallback Web Speech để chấm | REMOVE (khỏi chấm) | Spec cấm Web Speech làm nguồn chính thức → trả UNAVAILABLE; giữ Web Speech để hiện chữ trực tiếp. |
| Upload bản ghi gốc `audio` (không dùng) | REFACTOR | Chỉ gửi WAV phân tích, hoặc dùng bản gốc làm nguồn cho ASR. |
| `ShadowingScoring` (Overall = Content) | REFACTOR | Trạng thái riêng từng chiều; Overall chỉ khi đủ chiều đã kiểm chứng. |
| `FluencyAnalyzer/Comparer` | REFACTOR | Giữ số đo; bỏ dùng tốc độ VOICEVOX làm chuẩn tuyệt đối (spec), chuẩn hóa theo mora/câu. |
| `MoraDurationAnalyzer` (DTW trường âm) | REMOVE hoặc giữ thử nghiệm | Trùng với chấm theo câu mẫu (trường âm 11/18 so với DTW ~35%). |
| `RecordingDevTools`, `RealRecordingBench`, `AlignmentBench` | KEEP (dev) | Phục vụ dataset kiểm thử giọng thật. |
| Tiến độ trong `localStorage` | REFACTOR | Phiên phía server (start/resume/complete). |
| `ShadowingSentenceEvaluation` | REFACTOR (mở rộng) | Thêm lượt không chấm được, kết quả theo chiều, metadata model. |
| Faster-Whisper ASR service cho Shadowing | NEW | Theo spec, sau benchmark; tách khỏi `tools/whisper_engine` của Hội thoại AI (xem Rủi ro #4). |
| `ISpeechRecognitionService` | NEW | Trừu tượng hóa nhà cung cấp ASR. |
| Phiên server, lịch sử lượt thu, Session Summary chi tiết | NEW | |
| Furigana, chỉnh tốc độ giọng mẫu, bước nghe lại trước khi gửi | NEW | |

## 7. Nợ kỹ thuật

1. **Content và Pronunciation đang trộn.** Ở chế độ `aligned`, điểm "Content Match" thực chất là kết quả âm học từng mora (pronunciation). Spec yêu cầu tách: Content từ ASR, Pronunciation từ bằng chứng âm học, mỗi chiều có trạng thái riêng.
2. **VOICEVOX là phụ thuộc lúc chạy** của cả chấm điểm (cách đọc), nhịp nói (giọng mẫu) và phát giọng mẫu cho học viên. Engine tắt → `READING_UNAVAILABLE`.
3. **Ngưỡng chỉ hiệu chỉnh trên giọng tổng hợp** (cổng âm thanh, VAD, Margin, nhịp nói).
4. **`LearnerShadowingPracticeView.tsx` 2.457 dòng**: trạng thái ghi âm, phát, Web Speech, chấm, tiến độ nằm chung; khó kiểm thử.
5. Phiên luyện chỉ có ở client (`localStorage`): không tiếp tục được trên máy khác, lịch sử gộp hai nguồn.
6. Không có trạng thái theo câu NOT_STARTED/RECORDED/EVALUATING… như spec (chỉ `practiceState` của câu hiện tại).
7. Lượt không chấm được không được lưu → thiếu dữ liệu "Attempt".
8. Không lưu metadata model/thời gian xử lý/RecognitionMode vào CSDL.
9. Pipeline âm thanh lớn chưa commit.

## 8. Lỗi đã biết

1. Giọng thật: nhận dạng tự do ra kana lộn xộn (vd. パスポート → すぽうっと). Chấm theo câu mẫu đã giảm báo nhầm trên giọng VOICEVOX, **chưa xác nhận trên giọng thật**.
2. Không phát hiện được `ん`, `し/すぃ`, `つ/ちゅ`, `ら/だ`; つ→す bị bỏ sót trong một ca thử.
3. Web Speech luôn nghe micro mặc định của hệ điều hành (không theo micro đã chọn); chỉ còn dùng để hiện chữ và dự phòng.
4. VOICEVOX xếp hàng tuần tự: lấy cách đọc có thể chờ lâu khi đang tổng hợp giọng (timeout 10 s).
5. Câu học viên chưa chấm tính 0 vào điểm buổi (có chủ đích, nhưng spec muốn tách "đã đánh giá" và "đã hoàn thành").

## 9. Phụ thuộc

- **Backend:** ONNX Runtime 1.22.1; file model ngoài repo; VOICEVOX engine (G2P + TTS); SQL Server; rate limiter `shadowing-evaluate`.
- **Frontend:** Web Audio (AudioWorklet), MediaRecorder, Web Speech (hiện chữ), `setSinkId` (chọn loa).
- **Phụ thuộc chéo người phụ trách:** `Models/ShadowingSentence.cs`, `ShadowingSentenceDto`, `TtsController`, `VoiceVoxService`, `voicevoxService.ts`, `LearnerShadowingListView`, `SttController`/`WhisperSttService`/`tools/whisper_engine` là code của **KhoiPM23** → phải hỏi trước khi sửa (vd. thêm cột cách đọc vào `ShadowingSentences`).
- **Kiểm thử hiện có:** backend 650 test (Shadowing: EvaluationService, PhonemeSource, PronunciationAligner, KanaMoraComparer, Fluency*, MoraDuration, PausePositionLocator, CompleteSession…), 4 bench chạy khi `JCAP_BENCH=1`; frontend 176 test (audioGate, audioDevice, wavEncoder, pcmTakeBuffer, speechTranscriptCollector…).

## 10. Rủi ro

1. **Chọn Faster-Whisper làm ASR chính chưa có số liệu ủng hộ.** Thăm dò trên giọng VOICEVOX cho thấy `base` nghe sai câu đúng và "sửa" lỗi phát âm. Whisper hợp với chiều **Content** (người học có nói đúng các từ không), **không** dùng được cho Pronunciation. Phải benchmark (small/medium/large-v3) trên giọng người học thật trước khi chốt.
2. **Không có dataset giọng thật.** Mọi kết luận độ chính xác hiện nay chỉ dựa vào VOICEVOX. Cần thu bộ dữ liệu (người Việt, N5–N3, đúng/sai có chủ đích) và người biết tiếng Nhật gán nhãn — đây là điều kiện để mở chiều Pronunciation.
3. **Hạ tầng:** thêm dịch vụ Python (Whisper) làm tăng độ phức tạp triển khai; `medium`/`large-v3` trên CPU có thể chậm (cần đo).
4. **Bảo mật dịch vụ Whisper hiện có** (Hội thoại AI): `SttController` là `[AllowAnonymous]` và lưu mọi file ghi âm vào `wwwroot/audio/roleplay` (đang có 131 file, phục vụ công khai qua static files). Không được tái dùng nguyên trạng cho Shadowing (trái chính sách không lưu audio). Báo cho người phụ trách.
5. Thay đổi schema `ShadowingSentences` đụng code của thành viên khác.
6. Tách Content/Pronunciation làm **thay đổi điểm hiển thị** và ý nghĩa `contentMatchScore` đã lưu trong lịch sử → cần phiên bản chấm mới và giữ dữ liệu cũ.

## 11. Chiến lược chuyển đổi đề xuất

Nguyên tắc: giữ API `evaluate-audio` và các trường DTO cũ (chỉ thêm), mỗi bước có cấu hình bật/tắt để rollback, phiên bản chấm mới cho mọi thay đổi ý nghĩa điểm.

| Bước | Nội dung | Rollback |
|---|---|---|
| M0.5 | Commit pipeline hiện tại; thu dataset giọng thật bằng nút "Tải bản ghi" (mục tiêu ≥ 5 người × 20 câu, đúng + sai có chủ đích) và gán nhãn. | — |
| M1 | Ổn định: bước **nghe lại → thu lại → xác nhận gửi**; trạng thái từng câu; phiên server (start/resume/complete) thay `localStorage`; lưu cả lượt không chấm được (Attempt). | Cờ tính năng frontend; bảng mới, không sửa bảng cũ. |
| M2 | **Tách khỏi VOICEVOX lúc chấm**: tính sẵn cách đọc + giọng mẫu + mốc mora khi admin lưu bài (bảng riêng, vd. `ShadowingSentenceReferences`, hoặc cột trên `ShadowingSentences` nếu KhoiPM23 đồng ý). | Đọc từ VOICEVOX nếu chưa có bản lưu. |
| M3 | **ASR service + benchmark**: `ISpeechRecognitionService`, dịch vụ Faster-Whisper riêng cho Shadowing (không lưu audio, có auth nội bộ, timeout, health). Benchmark Whisper small/medium/large-v3 với nhận dạng âm vị trên dataset M0.5. | `Shadowing:Recognition:Provider`. |
| M4 | **Đánh giá theo chiều**: Content (ASR + KanaMoraComparer), Pronunciation (PronunciationAligner — `UNAVAILABLE / INSUFFICIENT_ACOUSTIC_EVIDENCE` cho tới khi đạt chỉ tiêu trên dataset), Fluency (số đo + trạng thái), Prosody `UNAVAILABLE`. DTO thêm `dimensions[]`; giữ `contentMatchScore`/`overallScore`. Bỏ Web Speech khỏi chấm. | Phiên bản chấm cũ vẫn chạy bằng cờ. |
| M5 | Feedback UX theo chiều; Session Summary; History chi tiết lượt; Furigana, chỉnh tốc độ. | |
| M6 | Rule-based recommendation (trường âm, っ, ngập ngừng) chỉ từ lỗi có độ tin cậy. | |

**Đề nghị quyết định trước khi làm M1:**
1. Đồng ý tách **Content (ASR)** và **Pronunciation (âm học)** như trên, chấp nhận điểm hiển thị thay đổi (phiên bản chấm mới)?
2. Nơi lưu cách đọc/giọng mẫu tính sẵn: bảng riêng (không đụng code KhoiPM23) hay thêm cột vào `ShadowingSentences` (cần KhoiPM23 đồng ý)?
3. Ai thu và gán nhãn dataset giọng thật (cần người biết tiếng Nhật)?
4. Hạ tầng cho Faster-Whisper khi triển khai (CPU hay GPU) — quyết định cỡ model nào đáng benchmark.
