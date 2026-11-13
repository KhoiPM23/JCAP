# Shadowing V2 — Báo cáo Milestone 2–6, kiến trúc cuối và hướng dẫn triển khai

Ngày: 2026-11-12. Nhánh `feature/sprint-2/gkhoi`. Trước đó: `PHASE-0-CURRENT-STATE-AUDIT.md`, `MILESTONE-1-PLAN.md`, `MILESTONE-1-REPORT.md`.
Số milestone theo kế hoạch đã duyệt trong audit (M2 dữ liệu câu mẫu, M3 ASR, M4 chấm theo chiều, M5 giao diện, M6 tổng kết/lịch sử/gợi ý).

```text
Milestone: 2–6 (Shadowing V2)
Completed: M2 dữ liệu câu mẫu tính sẵn · M3 dịch vụ Faster-Whisper + provider + benchmark · M4 chấm theo chiều ·
           M5 giao diện theo chiều, Furigana, tốc độ giọng mẫu · M6 tổng kết buổi, lịch sử lần gửi, gợi ý luyện tập
Commits: 1bd98db (M2), a6ec267 + 8132362 (M3), 6b8e16f (M4), eae057a (M5), 5eabe4c + 9ed56b0 (M6), 1beba6a (tích hợp)
Database Changes: 20261111175033_AddShadowingSentenceAssets (bảng mới), 20261111180228_AddShadowingEvaluationDimensions (3 cột)
                  — chỉ bảng của giakhoiquang; CHƯA áp vào JCAP_DB
Tests Executed: backend 737 (728 qua, 9 bỏ qua có chủ đích: bench/SQL Server/ASR thật), SQL Server thật 4/4,
                tích hợp ASR thật 2/2, frontend 192/192, npm run build qua
Tests Failed: 0
```

## 1. Kiến trúc cuối

```
React (LearnerShadowingPracticeView)
  ├─ phiên luyện ở server (/api/shadowing/progress), localStorage chỉ là bản sao cho màn hình cũ
  ├─ thu: micro mở sẵn → PCM có thu trước → WAV 16 kHz mono → NGHE LẠI → gửi chấm (progressId, clientSubmissionId, quá 60 s → gửi lại)
  ├─ Furigana (GET /{id}/furigana), tốc độ giọng mẫu 0.75/0.9/1×, Web Speech chỉ hiện chữ trực tiếp
  └─ kết quả theo chiều + "Điểm nội dung"; tổng kết buổi + gợi ý từ backend
.NET 8 API
  ├─ ShadowingAudioValidator (định dạng thật, thời lượng, im lặng/nhỏ/ồn/vỡ tiếng)
  ├─ Content: ISpeechRecognitionService → FasterWhisperSpeechRecognitionService ──HTTP nội bộ──▶ tools/shadowing-asr (Python, Faster-Whisper)
  │           → KanaMoraComparer (cách đọc câu mẫu từ ShadowingSentenceAssets; transcript: OpenJTalk của dịch vụ ASR nếu có)
  ├─ Pronunciation: UNAVAILABLE (PronunciationAligner + mô hình âm vị chỉ còn dùng khi Shadowing:Content:Provider=phoneme / bench)
  ├─ Fluency: FluencyAnalyzer/Comparer với giọng mẫu đã lưu (StoredReferenceVoiceProvider) — số đo, không điểm
  ├─ Lưu: ShadowingSentenceEvaluations (mỗi lần gửi), ShadowingPracticeProgresses, ShadowingPracticeSessions (bất biến)
  └─ ShadowingSessionInsightsService: tổng kết, lịch sử lần gửi, gợi ý theo quy tắc
VOICEVOX: CHỈ khi tạo dữ liệu câu mẫu (tác vụ nền / API admin) và phát giọng mẫu chưa có trong cache.
```

## 2. Milestone

| | Nội dung | File chính |
|---|---|---|
| **M2** | Bảng `ShadowingSentenceAssets` (cách đọc, mora, ranh giới từ, Furigana; theo giọng: WAV mẫu + mốc mora). `StoredKanaReader` là nguồn cách đọc đầu tiên, `StoredReferenceVoiceProvider` cho giọng mẫu. Tác vụ nền bù câu thiếu/đổi chữ khi khởi động; API admin xem tình trạng/tạo lại. Câu đổi chữ → dữ liệu cũ không dùng. | `ShadowingSentenceAssetService.cs`, `StoredShadowingReferences.cs`, `ShadowingAssetBackfillService.cs`, `ShadowingAssetsController.cs` |
| **M3** | Dịch vụ `tools/shadowing-asr` (FastAPI + Faster-Whisper): xử lý trong bộ nhớ, không lưu âm thanh, chỉ 127.0.0.1, token nội bộ, giới hạn kích thước/thời lượng/lượt đồng thời, health. `ISpeechRecognitionService` + provider HTTP (quá hạn/bận/tắt → unavailable, không tự đổi nhà cung cấp). `AsrBench`. | `tools/shadowing-asr/app/main.py`, `FasterWhisperSpeechRecognitionService.cs`, `JCAP.Tests/Bench/AsrBench.cs` |
| **M4** | `dimensions` Content/Pronunciation/Fluency/Prosody; Content từ ASR; Pronunciation UNAVAILABLE; Fluency không điểm; `overallScoreBasis="content"`; `scoringVersion = shadowing-score/v3-dimensions`; lưu `DimensionsJson`, `AsrModel`, `ProcessingMs`. | `ShadowingEvaluationService.cs`, `ShadowingAudioEvaluationDto.cs` |
| **M5** | Thẻ kết quả theo chiều ("chưa khả dụng" thay vì số), "Điểm nội dung", Furigana (ruby, chỉ khi khớp đúng chữ), tốc độ giọng mẫu. | `EvaluationDimensionsRow.tsx`, `ShadowingSentenceResultCard.tsx`, `utils/furigana.ts` |
| **M6** | Tổng kết buổi (lần gửi/không điểm, câu cần luyện lại, trạng thái chiều, lỗi theo loại), `GET history/{sessionId}` (mọi lần gửi, lần nào được tính), `totalSubmissions` trong lịch sử, `GET recommendations` (lỗi lặp ≥ 3 lần trên ≥ 2 câu trong 60 ngày → bài có âm đó). Màn tổng kết dùng số của backend. | `ShadowingSessionInsightsService.cs`, `SessionSummaryPanel.tsx` |

## 3. API (thêm, không xóa/đổi tên)

| Endpoint | |
|---|---|
| `GET /api/shadowing/{id}/furigana` | Furigana theo Id câu |
| `GET /api/shadowing/history/{sessionId}` | Chi tiết buổi + mọi lần gửi chấm (chỉ chủ buổi) |
| `GET /api/shadowing/recommendations?excludeDialogueId=` | Gợi ý theo quy tắc |
| `GET/POST /api/admin/shadowing-assets/dialogues/{id}[/generate]` | Admin: tình trạng / tạo lại dữ liệu câu mẫu (`force`, `speakers`) |
| `POST /api/shadowing/evaluate-audio` | Thêm vào kết quả: `dimensions`, `overallScoreBasis`, `asrModel`, `processingMs`; `recognitionSource = faster-whisper` |
| `POST /api/shadowing/session/complete` | Thêm `summary` |
| `GET /api/shadowing/history` | Thêm `totalSubmissions` (null với buổi cũ) |

## 4. Triển khai

1. **Model âm vị** (chỉ cần nếu dùng `Shadowing:Content:Provider=phoneme` hoặc bench): `scripts/download-speech-models.ps1`.
2. **Dịch vụ ASR**: `pip install -r tools/shadowing-asr/requirements.txt` (gồm `pyopenjtalk-plus` để không cần VOICEVOX lúc chấm),
   rồi `scripts/run-shadowing-asr.ps1 -Model small` (CPU int8) hoặc `$env:ASR_DEVICE="cuda"; $env:ASR_COMPUTE_TYPE="float16"` trên GPU.
   Chỉ nghe 127.0.0.1; đặt `ASR_TOKEN` và cùng giá trị ở backend `Shadowing:Asr:Token`. Docker: chưa có Dockerfile (chưa chốt hạ tầng — Decision 4).
3. **Backend** (`appsettings.Local.json` hoặc biến môi trường):

| Khóa | Mặc định | |
|---|---|---|
| `Shadowing:Content:Provider` | `faster-whisper` | `phoneme` = đường mô hình âm vị (chuyển tiếp) |
| `Shadowing:Asr:BaseUrl` / `Token` / `TimeoutMs` | `http://127.0.0.1:50023` / — / 20000 | |
| `Shadowing:Assets:BackfillOnStartup` / `Speakers` / `BackfillDelaySeconds` / `BatchSize` | true / [3] / 30 / 20 | Giọng 3 là giọng mặc định của trang luyện |
| `Shadowing:Reading:UseVoiceVox` | true | `false`: lúc chấm không gọi VOICEVOX để lấy cách đọc (chỉ dùng dữ liệu tính sẵn) |
| `Shadowing:Fluency:UseVoiceVoxAtRuntime` | true | `false`: so nhịp nói chỉ với giọng mẫu đã lưu |
| `Shadowing:Recognition:MaxConcurrent` / `QueueTimeoutMs` | lõi/2 · 10000 | Chỉ cho mô hình âm vị |

4. **Migration**: backend tự áp mọi migration khi khởi động (`SeedManager`). Ba migration của V2 chỉ thêm bảng/cột (`AddShadowingPracticeProgress`,
   `AddShadowingSentenceAssets`, `AddShadowingEvaluationDimensions`). Lần chạy đầu: tác vụ nền tạo dữ liệu câu mẫu khi VOICEVOX đang chạy.
5. **Kiểm tra**: `dotnet test JCAP.Tests`; SQL Server thật `JCAP_SQLSERVER_TEST=1`; ASR thật `JCAP_ASR_URL=… JCAP_ASR_TOKEN=…`;
   benchmark `JCAP_BENCH=1 JCAP_ASR_URL=… dotnet test --filter AsrBench` (+ `JCAP_REAL_DIR` cho bản ghi giọng thật).

## 5. Kết quả kiểm thử

| Bộ | Kết quả |
|---|---|
| Backend unit/integration (InMemory) | 728 qua, 0 lỗi |
| SQL Server thật (database tạm) | 4/4 — 12 request đồng thời tạo đúng 1 phiên; DB tự chặn phiên trùng; làm lại đồng thời; gửi trùng lần chấm |
| Pipeline với Faster-Whisper thật | 2/2 — chấm Content, Pronunciation UNAVAILABLE; dịch vụ tắt → ASR_UNAVAILABLE |
| Frontend | 192/192, `npm run build` qua |
| Benchmark ASR `base` (giọng VOICEVOX, KHÔNG đại diện người học) | CER 2.1%, 124/144 câu đúng hoàn toàn; false acceptance 28/78; ~0.6 s/câu (CPU int8) |

## 6. Vấn đề còn tồn tại / chưa làm được (và lý do)

1. **Chưa có dữ liệu giọng người học** → chưa benchmark Whisper `small`/`medium` trên giọng thật, chưa chọn model, chưa hiệu chỉnh ngưỡng âm thanh;
   chiều Phát âm phải giữ UNAVAILABLE (đúng Decision 1, 3). Công cụ đã sẵn: nút "Tải bản ghi" (dev) + `AsrBench`/`RealRecordingBench` với `JCAP_REAL_DIR`.
2. **`pyopenjtalk-plus` chưa cài trên máy dev** (cài gói ngoài bị chặn trong phiên làm việc): khi thiếu, transcript được đọc qua VOICEVOX lúc chấm.
   Cài theo `requirements.txt` để lúc chấm không cần VOICEVOX.
3. **Chưa kiểm tra tay trên trình duyệt** (cần chạy backend → tự áp migration vào `JCAP_DB`; cần bạn đồng ý).
4. **Model Whisper lớn hơn `base` chưa tải/đo** (cần tải model từ Hugging Face; chạy `AsrBench` với `ASR_MODEL=small|medium`).
5. **Lưu loát chưa có điểm**, **Ngữ điệu chưa làm** — cần dữ liệu và thuật toán kiểm chứng (đúng nguyên tắc V2).
6. Gợi ý luyện tập dựa trên lỗi nội dung (ASR), chưa có lỗi nhịp nói (số liệu nhịp nói không được lưu theo lần chấm).
7. Màn hình của KhoiPM23 (Dashboard, danh sách Shadowing, phát giọng mẫu qua `voicevoxService`/`TtsController`) chưa dùng API mới — phát giọng mẫu
   vẫn qua TTS (đọc cache đĩa nên chạy được khi đã tạo sẵn). Đề nghị chuyển dần.
8. Chưa có Dockerfile cho dịch vụ ASR (chờ chốt hạ tầng CPU/GPU).
9. Cần cập nhật mục Database Design của Report4 theo các bảng V2.
