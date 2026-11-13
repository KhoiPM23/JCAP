# Shadowing V2 — Kế hoạch Milestone 1: Ổn định luyện tập

Ngày: 2026-11-12. Dựa trên `PHASE-0-CURRENT-STATE-AUDIT.md` và các quyết định đã xác nhận (Decision 1–4).
Baseline: commit `da8ac09` trên `feature/sprint-2/gkhoi`.

## 1. Phạm vi

**Trong Milestone 1:**

| # | Hạng mục | Kết quả mong đợi |
|---|---|---|
| M1.1 | **Phiên luyện phía server** (`ShadowingPracticeProgress`) | Bắt đầu / tiếp tục / làm lại / cập nhật vị trí / hoàn thành. Không tạo phiên trùng. Tiếp tục được trên máy khác. |
| M1.2 | **Ghi âm → nghe lại → thu lại → xác nhận gửi** | Bấm dừng KHÔNG gửi ngay. Người học nghe lại bản ghi, chọn "Thu lại" hoặc "Gửi chấm". |
| M1.3 | **Trạng thái từng câu** | NOT_STARTED, RECORDING, RECORDED, EVALUATING, EVALUATED, EVALUATION_FAILED; hiển thị trong danh sách câu. |
| M1.4 | **Lưu mọi lần gửi chấm**, kể cả "chưa chấm được" | Phân biệt "đã gửi nhưng không chấm được" với "đã chấm"; buổi luyện vẫn chỉ tính lượt có điểm. |
| M1.5 | **Bỏ Web Speech khỏi chấm điểm** (Decision 1) | Không có mô hình âm vị / WAV hỏng → `UNAVAILABLE` (`RECOGNIZER_UNAVAILABLE`), không chấm bằng Web Speech. Web Speech chỉ còn hiện chữ trực tiếp. |
| M1.6 | **Kiểm tra âm thanh phía backend** | Backend tự kiểm tra WAV phân tích (định dạng, độ dài, im lặng, quá nhỏ, vỡ tiếng) thay vì chỉ tin `audioGateStatus` của client. |

**Ngoài Milestone 1** (không làm bây giờ): `ShadowingSentenceAssets` và tách VOICEVOX khỏi lúc chấm (M2); Faster-Whisper, `ISpeechRecognitionService` (M3);
tách Content/Pronunciation, nâng `scoringVersion`, DTO theo chiều (M4); Furigana, chỉnh tốc độ, Session Summary mới (M5).

Ghi chú về `scoringVersion`: M1 không đổi công thức điểm. M1.5 chỉ đổi khi nào "không chấm" (trước: chấm bằng Web Speech; sau: `UNAVAILABLE`), không tạo
điểm khác cho cùng một bản ghi đã chấm được, nên giữ `shadowing-score/p2-content-word`. Để phân biệt kết quả chấm theo câu mẫu và nhận dạng tự do đã lưu,
M1 lưu thêm cột `RecognitionMode`. Phiên bản chấm mới được nâng ở M4 khi tách Content/Pronunciation.

## 2. Thiết kế dữ liệu và migration dự kiến

**Điều kiện trước:** trao đổi với người phụ trách database về ERD dưới đây trước khi tạo migration. Không sửa bảng của thành viên khác
(`ShadowingSentences`, `ShadowingDialogues`). Hai bảng bị ảnh hưởng (`ShadowingSentenceEvaluations`, mới `ShadowingPracticeProgresses`) do giakhoiquang quản lý.

### 2.1 Bảng mới `ShadowingPracticeProgresses` (thuật ngữ mới, thêm vào GLOSSARY)

> **ShadowingPracticeProgress**: tiến độ một lần luyện đang diễn ra của một người học cho một bài và một vai; trở thành `ShadowingPracticeSession`
> (bất biến) khi hoàn thành. _Avoid_: draft session, temp session.
> Không dùng `ShadowingPracticeSession` cho phiên đang luyện vì GLOSSARY định nghĩa nó là bản ghi bất biến của buổi đã hoàn thành.

| Cột | Kiểu | Ghi chú |
|---|---|---|
| Id | uniqueidentifier PK | |
| UserId | nvarchar(450) FK → AspNetUsers (Restrict) | |
| ShadowingDialogueId | int FK → ShadowingDialogues (Restrict) | |
| LearnerRole | nvarchar(5) | A / B |
| Status | nvarchar(20) | `in_progress` / `completed` / `abandoned` (làm lại hoặc bỏ dở; không xóa cứng) |
| CurrentSentenceIndex | int | Vị trí đang luyện |
| StartedAt, LastActivityAt | datetime2 | |
| CompletedAt | datetime2 null | |
| ShadowingPracticeSessionId | uniqueidentifier null FK → ShadowingPracticeSessions (Restrict) | Buổi bất biến được tạo khi hoàn thành |

Chỉ mục: **duy nhất có lọc** `(UserId, ShadowingDialogueId, LearnerRole) WHERE Status = 'in_progress'` (chặn phiên trùng); `(UserId, LastActivityAt)` cho "Tiếp tục".

### 2.2 Mở rộng `ShadowingSentenceEvaluations` (chỉ thêm / nới lỏng, không mất dữ liệu)

| Thay đổi | Lý do |
|---|---|
| `ContentMatchScore`, `OverallScore`: `int` → `int null` | Lưu cả lần gửi "chưa chấm được" (không biến thành 0). Dữ liệu cũ giữ nguyên giá trị. |
| Thêm `ShadowingPracticeProgressId` uniqueidentifier null FK (Restrict) + index | Gắn lần chấm với phiên đang luyện; hoàn thành theo phiên, không cần client gửi danh sách Id. |
| Thêm `RecognitionMode` nvarchar(20) default `''` | `aligned` / `free`; dữ liệu cũ rỗng. |
| Thêm `ErrorCode` nvarchar(50) null | Lý do "chưa chấm được" (NO_SPEECH_DETECTED, AUDIO_QUALITY_INSUFFICIENT…). |

Migration dự kiến: `AddShadowingPracticeProgress` (một migration, chỉ thêm bảng/cột/index và nới `NOT NULL` → `NULL`). Rollback: `Down` xóa bảng/cột mới;
cột điểm trở lại `NOT NULL` chỉ được khi không còn dòng null → `Down` phải xóa các dòng chưa chấm được (ghi rõ trong migration, chỉ dùng ở môi trường dev).

## 3. API thêm / sửa

Tất cả dưới `ShadowingController` (`[Authorize]`); mọi truy vấn lọc theo `UserId` của token (không truy cập được phiên người khác).

| Endpoint | Loại | Mô tả |
|---|---|---|
| `POST /api/shadowing/progress` | **Thêm** | Body `{ dialogueId, learnerRole, restart? }`. Có phiên `in_progress` cùng bài + vai → trả phiên đó; `restart=true` → đánh dấu phiên cũ `abandoned`, tạo phiên mới. Bài không tồn tại / không active → 400. |
| `GET /api/shadowing/progress?dialogueId=&role=` | **Thêm** | Phiên đang luyện (kèm trạng thái từng câu tính từ các lần chấm đã lưu) hoặc `null`. |
| `GET /api/shadowing/progress/latest` | **Thêm** | Phiên đang luyện gần nhất (cho "Tiếp tục" ở thanh bên/dashboard). |
| `PUT /api/shadowing/progress/{id}` | **Thêm** | Body `{ currentSentenceIndex }`; kiểm tra chủ sở hữu, trạng thái `in_progress`, chỉ số trong phạm vi bài. |
| `POST /api/shadowing/evaluate-audio` | **Sửa (tương thích)** | Thêm trường tùy chọn `progressId`. Lưu cả lượt không chấm được (trả `evaluationId` cho mọi lượt có `sentenceId`). Bỏ chấm bằng `clientTranscript` (vẫn nhận trường này để client cũ không lỗi, nhưng bỏ qua). Thêm kiểm tra âm thanh phía backend. |
| `POST /api/shadowing/session/complete` | **Sửa (tương thích)** | Thêm `progressId` tùy chọn: có thì lấy các lần chấm của phiên (lượt có điểm cao nhất mỗi câu) và chuyển phiên sang `completed`; không có thì chạy như cũ theo `EvaluationIds`. Gọi lại với cùng phiên → trả buổi đã tạo, không tạo buổi thứ hai. |
| `GET /api/shadowing/history` | Giữ | Không đổi. |

Mã lỗi mới trong kết quả chấm: `RECOGNIZER_UNAVAILABLE` (thiếu mô hình/WAV), `AUDIO_TOO_SHORT`, `AUDIO_SILENT`, `AUDIO_TOO_QUIET`, `AUDIO_CLIPPED` (kiểm tra phía backend).

## 4. File dự kiến thay đổi

### Backend
| File | Thay đổi | Chủ sở hữu |
|---|---|---|
| `Models/ShadowingPracticeProgress.cs` | **Mới** | giakhoiquang |
| `Models/ShadowingSentenceEvaluation.cs` | Điểm nullable, ProgressId, RecognitionMode, ErrorCode | giakhoiquang |
| `Data/AppDbContext.cs` | DbSet + cấu hình bảng mới, index lọc | giakhoiquang (đoạn Shadowing) |
| `Migrations/<timestamp>_AddShadowingPracticeProgress.cs` | **Mới** | |
| `DTOs/Shadowing/ShadowingPracticeProgressDto.cs` | **Mới**: request/response tiến độ, trạng thái từng câu | |
| `DTOs/Shadowing/ShadowingAudioEvaluationDto.cs` | `ProgressId` trong request | giakhoiquang |
| `DTOs/Shadowing/ShadowingSessionCompleteDto.cs` | `ProgressId` tùy chọn | giakhoiquang |
| `Services/Interfaces/IShadowingService.cs`, `Services/Implementations/ShadowingService.cs` | Các thao tác tiến độ; lưu lượt không chấm được; hoàn thành theo phiên; bỏ qua dòng điểm null | giakhoiquang |
| `Controllers/ShadowingController.cs` | 4 endpoint mới; truyền `progressId` | giakhoiquang |
| `Services/Implementations/ShadowingEvaluationService.cs` | Bỏ nhánh chấm Web Speech; gọi kiểm tra âm thanh backend | giakhoiquang |
| `Services/Implementations/ShadowingAudioValidator.cs` | **Mới**: kiểm tra WAV (dùng `WavPcmReader` + VAD của `FluencyAnalyzer`) | |
| `GLOSSARY.md` | Thêm `ShadowingPracticeProgress` | giakhoiquang |
| `docs/shadowing-evaluation.md` | Cập nhật nguồn chấm, mã lỗi, luồng phiên | |

### Frontend
| File | Thay đổi | Chủ sở hữu |
|---|---|---|
| `src/views/shadowing/LearnerShadowingPracticeView.tsx` | Tạo/khôi phục phiên qua API; trạng thái RECORDED (nghe lại / thu lại / gửi); trạng thái từng câu; hoàn thành theo `progressId`; vẫn ghi `localStorage` song song | giakhoiquang |
| `src/components/shadowing/RecordingBar.tsx` | Nút "Gửi" thành "Dừng" | giakhoiquang |
| `src/components/shadowing/RecordingReviewBar.tsx` | **Mới**: nghe lại, thu lại, gửi chấm (dùng component `src/components/jcap/`) | |
| `src/utils/sentencePracticeState.ts` (+ `.test.ts`) | **Mới**: máy trạng thái từng câu (thuần, kiểm thử bằng Node) | |
| `src/services/shadowingService.ts` | Các hàm tiến độ; `progressId` khi chấm và hoàn thành | giakhoiquang (phần cuối file có code của KhoiPM23: không đụng) |
| `src/types/shadowing.ts`, `src/types/shadowingProgress.ts` | Kiểu dữ liệu tiến độ server, mã lỗi mới | giakhoiquang |
| `src/components/jcap/shell/AppSidebar.tsx` | "Tiếp tục" đọc `/progress/latest`, `localStorage` làm dự phòng | giakhoiquang |

**Không sửa** (của KhoiPM23): `LearnerDashboardView.tsx`, `LearnerShadowingListView.tsx` — vẫn đọc `localStorage`, nên trang luyện tiếp tục ghi `localStorage` song song.
Đề nghị KhoiPM23 chuyển sang API mới ở milestone sau.

## 5. Test cần bổ sung

**Backend (xUnit, EF InMemory như các test Shadowing hiện có).** InMemory không kiểm tra index duy nhất có lọc, nên chống trùng phiên
được kiểm bằng logic dịch vụ; ràng buộc ở SQL Server được kiểm tay sau khi áp migration lên DB local.
1. Bắt đầu phiên: chưa có → tạo mới; đã có `in_progress` cùng bài + vai → trả phiên cũ; khác vai → phiên riêng.
2. `restart=true`: phiên cũ thành `abandoned` (không xóa), phiên mới được tạo; lịch sử chấm của phiên cũ giữ nguyên.
3. Bài không tồn tại / không active → lỗi; vai không hợp lệ → lỗi.
4. Cập nhật vị trí: chỉ số ngoài phạm vi → lỗi; phiên của người khác → không tìm thấy; phiên đã hoàn thành → lỗi.
5. Trạng thái từng câu: không có lần chấm → NOT_STARTED; chỉ lượt không chấm được → EVALUATION_FAILED; có lượt có điểm → EVALUATED.
6. Lưu lượt không chấm được: lưu với điểm null + `ErrorCode`; không có `sentenceId` → không lưu.
7. Hoàn thành theo `progressId`: chỉ tính lượt có điểm, lượt điểm cao nhất mỗi câu; phiên thành `completed`; gọi lại → trả cùng buổi, không tạo buổi thứ hai; phiên người khác → lỗi.
8. Hoàn thành kiểu cũ theo `EvaluationIds` vẫn chạy (bỏ qua dòng điểm null).
9. Không còn chấm bằng Web Speech: thiếu mô hình / thiếu WAV / WAV hỏng + có `clientTranscript` → `unavailable`, `RECOGNIZER_UNAVAILABLE`, điểm null. (Sửa các test hiện có đang kỳ vọng dự phòng Web Speech.)
10. Kiểm tra âm thanh backend: im lặng, quá ngắn, quá nhỏ, vỡ tiếng → mã lỗi tương ứng; giọng bình thường → qua.
11. `ExploreService` vẫn đọc đúng buổi luyện đã hoàn thành (hồi quy).

**Frontend (Node test):**
1. Máy trạng thái câu: chuyển hợp lệ (ready → recording → recorded → evaluating → evaluated/failed; recorded → recording khi thu lại); không gửi khi chưa có bản ghi; hủy khi đang ghi về NOT_STARTED/giữ kết quả cũ.
2. Ánh xạ tiến độ server ↔ `ShadowingProgress` cục bộ (để ghi song song đúng định dạng cũ).

**Kiểm tra tay** (ghi lại kết quả): luyện trọn một bài; thu lại nhiều lần; nghe lại trước khi gửi; tải lại trang giữa chừng → tiếp tục đúng câu; mở trên trình duyệt khác → tiếp tục; làm lại từ đầu; rút micro khi đang ghi; tắt mô hình → "chưa chấm được".

## 6. Rủi ro tương thích

| Rủi ro | Ảnh hưởng | Cách xử lý |
|---|---|---|
| `ContentMatchScore`/`OverallScore` thành nullable | Mọi nơi đọc các cột này | Chỉ `ShadowingService` đọc (đã kiểm tra); thêm lọc `!= null`. |
| Dashboard và danh sách Shadowing (KhoiPM23) đọc `localStorage` | Mất trạng thái "đang học" nếu ngừng ghi `localStorage` | Ghi song song trong M1; báo KhoiPM23. |
| `ExploreService` đọc `ShadowingPracticeSessions` | Bảng không đổi | Test hồi quy. |
| Bỏ dự phòng Web Speech | Máy chưa tải mô hình âm vị thì **mọi câu** đều "chưa chấm được" | Thông báo rõ lỗi `RECOGNIZER_UNAVAILABLE`; README/triển khai bắt buộc chạy `scripts/download-speech-models.*`; health log khi khởi động thiếu mô hình. |
| Client cũ (chưa cập nhật) vẫn gửi `EvaluationIds`, không gửi `progressId` | | Cả hai đường đều hoạt động. |
| Phiên trùng do bấm nhiều lần / hai tab | | Index duy nhất có lọc + bắt lỗi trùng khóa → trả phiên hiện có. |
| Tiến độ cũ trong `localStorage` của người dùng hiện tại | Lần đầu sau cập nhật không có phiên server | Không tự chuyển dữ liệu; nếu `localStorage` có tiến độ cùng bài + vai thì dùng `currentSentenceIndex` của nó khi tạo phiên server đầu tiên. |
| Bước "nghe lại trước khi gửi" làm thêm một lần bấm | Thay đổi thói quen | Có thể thêm tùy chọn "Gửi ngay khi dừng" ở Cài đặt > Khi luyện tập (mặc định tắt) — chỉ làm nếu được yêu cầu. |
| Migration trên DB dùng chung của nhóm | | Chỉ thêm/nới lỏng; báo người phụ trách DB trước khi `database update`; kiểm tra DB đích theo cấu hình local trước khi chạy. |

## 6b. Thiết kế chi tiết bổ sung (theo yêu cầu duyệt M1)

Đối chiếu ERD/DB và đề xuất CSDL đầy đủ: `M1-DATABASE-REVIEW.md` (thêm `ClientSubmissionId` để chống lưu trùng khi gửi lại).

### Chống tạo phiên trùng
- **DB:** index duy nhất có lọc `(UserId, ShadowingDialogueId, LearnerRole) WHERE Status = 'in_progress'`.
- **Ứng dụng:** `StartAsync` tìm phiên `in_progress` → có thì trả về; không có thì chèn. Hai request đồng thời: một bên chèn được, bên kia gặp lỗi trùng khóa
  (SqlException 2601/2627) → bắt lỗi, đọc lại và trả phiên vừa được tạo (không trả lỗi cho người dùng).
- **Làm lại (restart):** client gửi `expectedProgressId` (phiên mà nó đang thấy). Phiên `in_progress` hiện tại khác `expectedProgressId` (vd. tab khác vừa làm lại) → trả phiên hiện tại, không tạo thêm. Đúng → trong một transaction: phiên cũ `abandoned`, chèn phiên mới.
- **Kiểm chứng trên SQL Server thật:** test tích hợp chỉ chạy khi `JCAP_SQLSERVER_TEST=1`, tạo database tạm riêng trên `.\SQLEXPRESS`, áp migration, bắn song song N request bắt đầu, kiểm tra đúng 1 phiên, rồi xóa database tạm. Không dùng `JCAP_DB`.

### Trạng thái từng câu: ở đâu, khôi phục thế nào
| Trạng thái | Nơi tồn tại | Ý nghĩa |
|---|---|---|
| NOT_STARTED | server (suy ra) | Phiên chưa có lần chấm nào cho câu này |
| RECORDING | chỉ client | Đang ghi |
| RECORDED | chỉ client | Có bản ghi trong bộ nhớ, chưa gửi (nghe lại / thu lại / gửi) |
| EVALUATING | chỉ client | Đang chờ kết quả |
| EVALUATED | server (suy ra) | Có ít nhất một lần chấm có điểm trong phiên |
| EVALUATION_FAILED | server (suy ra) / client | Chỉ có các lần "chưa chấm được"; hoặc request lỗi mạng/quá giờ ở client |

Server không bao giờ lưu RECORDING/EVALUATING, nên **không thể kẹt vĩnh viễn**. Khôi phục:
- **Tải lại trang / đóng tab / mở máy khác:** trạng thái từng câu lấy lại từ server (NOT_STARTED/EVALUATED/EVALUATION_FAILED), vị trí từ `CurrentSentenceIndex`.
  Bản ghi chưa gửi (RECORDED) bị mất vì không lưu âm thanh; báo "Bản ghi chưa gửi đã bị bỏ, hãy thu lại".
- **Gián đoạn khi đang chấm:** server vẫn chấm xong và lưu (nếu request đã tới server) → lần mở sau thấy EVALUATED/EVALUATION_FAILED. Client đặt giới hạn 60 s:
  quá hạn → EVALUATION_FAILED kèm nút "Gửi lại" (dùng lại bản ghi trong bộ nhớ, cùng `clientSubmissionId`). Server thấy `clientSubmissionId` đã có
  → không lưu dòng mới, trả lại kết quả đã lưu (chống trùng khi mạng chập chờn).
- **Giới hạn ghi:** tự dừng sau 30 s (bằng giới hạn của mô hình) → RECORDED.
- **Micro bị rút khi đang ghi:** dừng, giữ phần đã ghi ở RECORDED nếu đủ dài, nếu không về NOT_STARTED và báo lỗi thiết bị.

### Đồng bộ localStorage (lớp tương thích tạm thời)
- **Server là nguồn chính thức** cho: vai, trạng thái phiên, `CurrentSentenceIndex`, trạng thái từng câu, hoàn thành.
- **Trang luyện ghi đè `localStorage` bằng dữ liệu server** (cùng định dạng `ShadowingProgress` cũ: status, currentSentenceIndex, completedSentenceCount,
  totalSentenceCount, startedAt, lastPracticedAt, completedAt) mỗi khi tải phiên, đổi câu, chấm xong, hoàn thành. Không có chiều ngược lại.
- **Không để dữ liệu cũ ghi đè server:** `localStorage` chỉ được dùng **một lần** để gợi ý vị trí bắt đầu khi server *chưa từng* có phiên nào (mọi trạng thái)
  cho bài + vai đó. Có phiên trên server thì luôn bỏ qua `localStorage`.
- **Hai nguồn lệch nhau:** server thắng; các màn hình chỉ đọc `localStorage` (Dashboard, danh sách — của KhoiPM23) có thể hiển thị cũ cho tới lần mở trang luyện kế tiếp trên máy đó. Chấp nhận trong M1; ghi vào báo cáo.
- Thanh bên "Tiếp tục" (giakhoiquang) đọc `GET /progress/latest`; chỉ dùng `localStorage` khi request lỗi.

### Kiểm tra âm thanh phía backend (không tin kết quả của client)
Thứ tự, dừng ở lỗi đầu tiên; mọi lỗi → `unavailable` + `ErrorCode`, vẫn lưu lần chấm (điểm null):
1. Kích thước: tổng request ≤ 8 MB (đã có), `analysisWav` ≤ giới hạn hiện có; rỗng → `EMPTY_AUDIO`.
2. Định dạng thực tế (đọc byte đầu, không tin `Content-Type`): `analysisWav` phải là RIFF/WAVE PCM 16-bit mono 16 kHz → không đúng: `INVALID_AUDIO_FORMAT`.
   Bản ghi gốc `audio` (nếu gửi) phải có chữ ký WebM/Ogg/MP4/WAV → không đúng: `INVALID_AUDIO_FORMAT`. Thiếu `analysisWav` → `ANALYSIS_AUDIO_MISSING` (trước đây chấm bằng Web Speech).
3. Thời lượng 0.4–30 s → `AUDIO_TOO_SHORT` / `AUDIO_TOO_LONG`.
4. Tín hiệu (dùng lại VAD của `FluencyAnalyzer`): không có tín hiệu / chỉ có nền ồn / quá nhỏ / vỡ tiếng nặng → `AUDIO_SILENT`, `AUDIO_NOISE_ONLY`, `AUDIO_TOO_QUIET`, `AUDIO_CLIPPED`.
   Ngưỡng là heuristic hiện có (chưa hiệu chỉnh trên micro thật) — ghi rõ trong tài liệu.
5. Giới hạn tài nguyên trước khi gọi mô hình: tối đa N lượt nhận dạng chạy đồng thời (cấu hình `Shadowing:Recognition:MaxConcurrent`, mặc định = số lõi / 2);
   chờ quá 10 s → `SERVER_BUSY`. Rate limit 30 lượt/phút/người giữ nguyên.
6. Mô hình không khả dụng → `RECOGNIZER_UNAVAILABLE`.

`audioGateStatus` của client chỉ còn để hiển thị/ghi log, **không quyết định có chấm hay không**; `AudioQualityStatus` lưu theo kết quả kiểm tra của backend.

### Test bổ sung (ngoài mục 5)
- Hai request bắt đầu phiên song song → 1 phiên (dịch vụ: giả lập lỗi trùng khóa; SQL Server thật: test tích hợp có cờ).
- Làm lại với `expectedProgressId` cũ → không tạo phiên thứ hai.
- Gửi lại cùng `clientSubmissionId` → không tạo dòng mới.
- Kiểm tra âm thanh: từng mã lỗi ở trên; `Content-Type` giả (khai là WAV nhưng nội dung không phải) → `INVALID_AUDIO_FORMAT`.
- Client cũ: không gửi `progressId`, không gửi `analysisWav`, có `clientTranscript` → `unavailable / ANALYSIS_AUDIO_MISSING`, có lưu lần chấm, không lỗi 500.
- Frontend: máy trạng thái (gồm quá hạn chấm, gửi lại, tự dừng 30 s); ánh xạ server → `localStorage`; quy tắc "chỉ gợi ý từ localStorage khi server chưa từng có phiên".

## 7. Thứ tự thực hiện và báo cáo

1. Backend dữ liệu: model + migration + cấu hình (chưa áp dụng vào DB dùng chung trước khi được duyệt).
2. Backend dịch vụ + API tiến độ + test 1–8, 11.
3. Bỏ Web Speech khỏi chấm + kiểm tra âm thanh backend + test 9–10.
4. Frontend: máy trạng thái câu + test; bước nghe lại / thu lại / gửi; phiên server; ghi `localStorage` song song.
5. `npm run build`, `npm test`, `dotnet test`; kiểm tra tay theo mục 5; cập nhật tài liệu; báo cáo theo mẫu Milestone.

Mỗi bước build + test xong mới sang bước kế tiếp; commit riêng từng bước để rollback được.
