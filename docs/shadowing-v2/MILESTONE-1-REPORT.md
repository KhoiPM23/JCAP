# Shadowing V2 — Báo cáo Milestone 1: Ổn định luyện tập

Ngày: 2026-11-12. Nhánh `feature/sprint-2/gkhoi`. Kế hoạch: `MILESTONE-1-PLAN.md`; đối chiếu CSDL: `M1-DATABASE-REVIEW.md`.

```text
Milestone: 1 – Stabilize Existing Shadowing
Completed: 6/6 hạng mục (phiên luyện ở server, nghe lại trước khi gửi, trạng thái từng câu, lưu mọi lần chấm,
           bỏ Web Speech khỏi chấm điểm, kiểm tra âm thanh phía backend)
Commits: 24a8533 (dữ liệu), b801542 (backend), commit frontend + tài liệu (bước 4)
Database Changes: migration 20261111171341_AddShadowingPracticeProgress (CHƯA áp vào JCAP_DB — xem mục 5)
Tests Executed: backend 700 (692 qua, 8 bỏ qua có chủ đích), SQL Server thật 4/4, frontend 189/189, npm run build qua
Tests Failed: 0
Known Issues / Remaining Tasks: mục 6, 7
```

## 1. Đã làm

| # | Hạng mục | Kết quả |
|---|---|---|
| 1 | Phiên luyện ở server | Bảng `ShadowingPracticeProgresses`; bắt đầu / tiếp tục (cả trên thiết bị khác) / làm lại / cập nhật vị trí. Chống phiên trùng ở **cả** ứng dụng (bắt lỗi trùng khóa → trả phiên của request thắng) **và** CSDL (index duy nhất có lọc), đã kiểm trên SQL Server thật với 12 request đồng thời. |
| 2 | Nghe lại trước khi gửi | Bấm dừng **không** gửi ngay: bước "đã thu" với Nghe lại / Thu lại / Bỏ / Gửi chấm. Tự dừng sau 30 s. |
| 3 | Trạng thái từng câu | NOT_STARTED / EVALUATED / EVALUATION_FAILED lưu ở server (suy ra từ các lần chấm); RECORDING / RECORDED / EVALUATING chỉ ở client → không kẹt. Hiện nhãn trên từng câu. Gửi lỗi mạng/quá 60 s → giữ bản thu, "Gửi lại" cùng mã lần gửi. |
| 4 | Lưu mọi lần chấm | Mỗi lần gửi (có `sentenceId`) là một `ShadowingSentenceEvaluation`, kể cả chưa chấm được: điểm **null** + `ErrorCode`, không bao giờ 0. Thu lại / gửi lại không ghi đè. `ClientSubmissionId` chống lưu trùng (kiểm trên SQL Server với 5 request đồng thời). |
| 5 | Bỏ Web Speech khỏi chấm | Không còn nhánh chấm bằng transcript trình duyệt. Thiếu mô hình / mô hình lỗi → `RECOGNIZER_UNAVAILABLE`; client cũ không gửi WAV → `ANALYSIS_AUDIO_MISSING`. Web Speech chỉ hiện chữ trực tiếp. |
| 6 | Kiểm tra âm thanh phía backend | `ShadowingAudioValidator`: định dạng thật theo byte đầu (không tin Content-Type), kích thước, thời lượng 0.4–30 s, im lặng / quá nhỏ / chỉ ồn / vỡ tiếng. `audioGateStatus` của client không còn quyết định. Giới hạn số lượt nhận dạng đồng thời (`SERVER_BUSY`). |

## 2. File thay đổi

**Mới (backend):** `Models/ShadowingPracticeProgress.cs`, `DTOs/Shadowing/ShadowingPracticeProgressDto.cs`, `Services/Interfaces/IShadowingPracticeProgressService.cs`,
`Services/Implementations/{ShadowingPracticeProgressService, ShadowingAudioValidator, ShadowingRecognitionThrottle}.cs`,
`Migrations/20261111171341_AddShadowingPracticeProgress(.Designer).cs`.
**Sửa (backend):** `Models/ShadowingSentenceEvaluation.cs`, `Data/AppDbContext.cs` (đoạn Shadowing), `Migrations/AppDbContextModelSnapshot.cs`,
`DTOs/Shadowing/{ShadowingAudioEvaluationDto, ShadowingSessionCompleteDto}.cs`, `Services/Interfaces/IShadowingService.cs`,
`Services/Implementations/{ShadowingService, ShadowingEvaluationService}.cs`, `Controllers/ShadowingController.cs` (chỉ phần của giakhoiquang + 1 dòng `using`),
`Program.cs` (2 dòng đăng ký), `.gitignore` (sửa `/models/` khớp nhầm `Models/` trên Windows).
**Mới (frontend):** `src/utils/{sentencePracticeState, shadowingProgressSync}.ts` (+ test), `src/components/shadowing/RecordingReviewBar.tsx`.
**Sửa (frontend):** `src/views/shadowing/LearnerShadowingPracticeView.tsx`, `src/components/shadowing/RecordingBar.tsx`, `src/services/shadowingService.ts` (phần của giakhoiquang),
`src/types/shadowing.ts`, `src/components/jcap/shell/AppSidebar.tsx`.
**Test:** mới `ShadowingPracticeProgressServiceTests`, `ShadowingAudioValidatorTests` (+ throttle), `Integration/ShadowingProgressSqlServerTests`;
viết lại theo nguồn chấm mới `ShadowingEvaluationServiceTests`, `ShadowingPhonemeSourceTests`, `ShadowingControllerTests`, `ShadowingServiceCompleteSessionTests`.
**Tài liệu:** `GLOSSARY.md` (+ ShadowingPracticeProgress), `docs/shadowing-evaluation.md`, `docs/shadowing-audio-status.md`, `docs/shadowing-v2/*`.
**Không đụng:** bảng/code của thành viên khác (`ShadowingSentences`, `LearnerDashboardView`, `LearnerShadowingListView`, `SttController`…).

## 3. API

| Endpoint | Thay đổi |
|---|---|
| `POST /api/shadowing/progress` | **Mới** — `{ dialogueId, learnerRole, restart?, expectedProgressId?, suggestedSentenceIndex? }` |
| `GET /api/shadowing/progress?dialogueId=&role=` | **Mới** — phiên đang luyện hoặc `null` |
| `GET /api/shadowing/progress/latest` | **Mới** — cho "Tiếp tục" |
| `PUT /api/shadowing/progress/{id}` | **Mới** — `{ currentSentenceIndex }` |
| `POST /api/shadowing/evaluate-audio` | **Thêm** `progressId`, `clientSubmissionId` (tùy chọn). Lưu cả lần chưa chấm được. `audio` gốc thành tùy chọn. `clientTranscript` vẫn nhận nhưng bỏ qua. Mã lỗi mới: xem `docs/shadowing-evaluation.md`. |
| `POST /api/shadowing/session/complete` | **Thêm** `progressId` (tùy chọn; gọi lại trả đúng buổi đã tạo). Không có → chạy như cũ theo `evaluationIds`. |
| Response chấm | Không xóa/đổi tên trường nào. |

Tương thích client cũ: có test cho client không gửi `progressId` / `clientSubmissionId`; client cũ **không** gửi `analysisWav` sẽ nhận `ANALYSIS_AUDIO_MISSING` (trước đây được chấm bằng Web Speech — thay đổi có chủ đích theo Decision 3).

## 4. Đồng bộ localStorage (lớp tương thích tạm thời)

Server là nguồn chính thức. Trang luyện ghi đè `localStorage` (định dạng cũ) bằng dữ liệu server khi mở bài, chuyển câu, hoàn thành; không có chiều ngược lại.
`localStorage` chỉ gợi ý vị trí khi server **chưa từng** có phiên cho bài + vai. Server lỗi → trang chạy như cũ bằng `localStorage` và báo "chưa đồng bộ được".
Dashboard / danh sách Shadowing (KhoiPM23) vẫn đọc `localStorage` nên có thể hiển thị cũ trên máy chưa mở trang luyện — chấp nhận trong M1.

## 5. Migration — cần biết trước khi chạy

- `AddShadowingPracticeProgress`: tạo bảng + 2 index lọc, thêm 4 cột, cho phép NULL ở 2 cột điểm. Chỉ đụng bảng của giakhoiquang; không xóa dữ liệu.
- **Backend tự áp mọi migration khi khởi động** (`Data/Seeds/SeedManager.cs:16`, cơ chế có sẵn của dự án): lần `dotnet run` đầu tiên với code này sẽ tự áp vào DB đang cấu hình.
  Trong M1 **chưa** chạy backend nên `JCAP_DB` chưa bị đổi (đã kiểm: chưa có dòng migration này). Kiểm thử SQL Server dùng database tạm và đã xóa.
- DB triển khai/dùng chung sẽ nhận migration khi bản này được triển khai — nhóm cần biết.
- `Down` chỉ dùng ở dev: xóa các lần chấm không có điểm trước khi trả cột về NOT NULL (không đổi null thành 0).

## 6. Vấn đề còn tồn tại

1. **Chưa kiểm tra tay trên trình duyệt** (cần chạy backend → sẽ tự áp migration vào `JCAP_DB`, chờ bạn đồng ý). Danh sách kiểm tra tay: mục 5 của kế hoạch.
2. Ngưỡng kiểm tra âm thanh backend là heuristic (VAD hiện có), chưa hiệu chỉnh trên micro thật — có thể từ chối nhầm giọng rất nhỏ.
3. Hoàn thành bài mà không có câu nào chấm được: phiên server vẫn `in_progress` ở câu cuối (không tạo buổi "0 điểm"), nên "Tiếp tục" vẫn hiện bài đó.
4. Hai request "hoàn thành" cùng phiên đến **đồng thời** có thể tạo hai buổi (không có khóa lạc quan trên phiên); gọi lại tuần tự thì an toàn.
5. Chế độ dev (React StrictMode) gọi bắt đầu phiên hai lần khi mở trang `?restart=true` → thêm một phiên `abandoned`; không xảy ra ở bản build.
6. Hai màn hình của KhoiPM23 vẫn đọc `localStorage` (mục 4) — đề nghị chuyển sang `GET /progress` ở milestone sau.
7. Bản ghi gốc (`audio`) vẫn được gửi lên dù backend chỉ kiểm tra định dạng.

## 7. Chưa triển khai (ngoài phạm vi M1)

`ShadowingSentenceAssets` và tách VOICEVOX khỏi lúc chấm (M2); Faster-Whisper + `ISpeechRecognitionService` + benchmark (M3); tách Content / Pronunciation,
trạng thái theo chiều, nâng `scoringVersion` (M4); Furigana, chỉnh tốc độ, Session Summary mới (M5); gợi ý luyện tập (M6); cập nhật Report4.
