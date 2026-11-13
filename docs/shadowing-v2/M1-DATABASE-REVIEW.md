# Shadowing V2 — M1: Đối chiếu ERD và đề xuất thay đổi CSDL (gửi người phụ trách database)

Ngày: 2026-11-12. Người đề xuất: giakhoiquang. Trạng thái: **đã duyệt** (2026-11-12).

> **Quy tắc của nhóm: bảng của ai người đó quản lý.** Mọi bảng M1 thay đổi hoặc tạo mới (`ShadowingSentenceEvaluations`, `ShadowingPracticeSessions`,
> `ShadowingPracticeProgresses`) do giakhoiquang tạo và quản lý (migration `20261017214745_AddShadowingPracticeHistory`). Bảng của thành viên khác
> (`ShadowingSentences`, `ShadowingDialogues`, `AspNetUsers`…) **không bị sửa**; chỉ được tham chiếu bằng khóa ngoại đặt trên bảng của giakhoiquang.
> Migration chỉ áp lên DB local của giakhoiquang để thử; DB dùng chung/triển khai do nhóm quyết định.

## 1. Ba nguồn đã đối chiếu

| Nguồn | Shadowing phiên/lượt luyện được mô tả thế nào |
|---|---|
| **Report4 – Software Design Document** (mục 2, bảng 36–37, bản 2026-10-14) | `ShadowingPracticeSessions`: một phiên, có *status*, tốc độ phát, snapshot bài, tóm tắt đánh giá. `ShadowingSentenceAttempts`: mỗi lượt thu, có vị trí file ghi âm, chữ nhận dạng, chi tiết đánh giá; FK ghép `(PracticeSessionId, ShadowingDialogueId)` và `(ShadowingSentenceId, ShadowingDialogueId)`. |
| **Code + migration đã áp** (`20261017214745_AddShadowingPracticeHistory`) | `ShadowingPracticeSessions`: **chỉ buổi đã hoàn thành, bất biến** (không có status). `ShadowingSentenceEvaluations`: một dòng mỗi lượt **có điểm**, FK đơn. Không lưu file ghi âm. |
| **DB thật** (`.\SQLEXPRESS` / `JCAP_DB`, SQL Server 2025 Express 17.0) | Khớp hoàn toàn với code: cột, kiểu, nullable, FK `NO ACTION` (Restrict). 77 dòng chấm, 7 buổi luyện, 66 dòng chấm chưa thuộc buổi nào. Migration mới nhất `20261111054905_ClearLearningTopics` = nhánh hiện tại. |

**Kết luận:** ERD trong Report4 đã lệch với hệ thống thật từ trước M1 (thiết kế "session có status + attempts lưu file" chưa bao giờ được làm; nhóm đã chọn "session bất biến + evaluation" và ghi vào GLOSSARY).
Đề xuất M1 giữ hướng của code/GLOSSARY và **cập nhật Report4 theo hệ thống thật** sau khi M1 được duyệt.

## 2. Thay đổi đề xuất

### 2.1 Bảng mới `ShadowingPracticeProgresses`

| Cột | Kiểu SQL | Null | Ghi chú |
|---|---|---|---|
| Id | uniqueidentifier | không | PK |
| UserId | nvarchar(450) | không | FK → AspNetUsers.Id, NO ACTION |
| ShadowingDialogueId | int | không | FK → ShadowingDialogues.Id, NO ACTION |
| LearnerRole | nvarchar(5) | không | `A` / `B` |
| Status | nvarchar(20) | không | `in_progress` / `completed` / `abandoned` (không xóa cứng) |
| CurrentSentenceIndex | int | không | |
| StartedAt | datetime2 | không | UTC |
| LastActivityAt | datetime2 | không | UTC |
| CompletedAt | datetime2 | có | |
| ShadowingPracticeSessionId | uniqueidentifier | có | FK → ShadowingPracticeSessions.Id, NO ACTION; buổi bất biến tạo khi hoàn thành |

Index:
- `UX_ShadowingPracticeProgresses_ActivePerRole`: **UNIQUE** `(UserId, ShadowingDialogueId, LearnerRole) WHERE Status = N'in_progress'` — chống phiên trùng ở mức DB.
- `(UserId, LastActivityAt)` — "Tiếp tục" gần nhất.

### 2.2 `ShadowingSentenceEvaluations` (chỉ thêm / nới lỏng)

| Thay đổi | Dữ liệu cũ |
|---|---|
| `ContentMatchScore`, `OverallScore`: `int NOT NULL` → `int NULL` | Giữ nguyên giá trị (77 dòng đều có điểm). |
| + `ShadowingPracticeProgressId` uniqueidentifier NULL, FK → ShadowingPracticeProgresses.Id NO ACTION, index | NULL cho dòng cũ. |
| + `RecognitionMode` nvarchar(20) NOT NULL DEFAULT N'' | `''` cho dòng cũ (không biết chế độ). |
| + `ErrorCode` nvarchar(50) NULL | NULL. |
| + `ClientSubmissionId` uniqueidentifier NULL; UNIQUE `(UserId, ClientSubmissionId) WHERE ClientSubmissionId IS NOT NULL` | NULL. Chống lưu trùng khi client gửi lại cùng một lần chấm do mất mạng. |

Không đụng `ShadowingSentences`, `ShadowingDialogues`, `ShadowingPracticeSessions`.

### 2.3 Toàn vẹn dữ liệu (kiểm ở tầng ứng dụng)

Report4 dùng FK ghép để bảo đảm "câu thuộc đúng bài của phiên". Làm vậy cần thêm khóa thay thế `(Id, ShadowingDialogueId)` trên `ShadowingSentences` (bảng của thành viên khác) nên **không** làm trong M1.
Thay bằng kiểm tra trong `ShadowingService`: câu của lần chấm phải thuộc bài và vai của phiên; phiên phải là của người dùng trong token và đang `in_progress`.

### 2.4 Migration

Một migration `AddShadowingPracticeProgress`: tạo bảng + index, thêm cột, `ALTER COLUMN` cho phép NULL. Không xóa, không đổi tên.
`Down` (chỉ dùng ở dev): xóa cột/bảng mới; muốn trả cột điểm về `NOT NULL` phải xóa các dòng có điểm NULL — ghi rõ trong migration.

## 3. Quyết định và lưu ý

1. Tên bảng/cột, index lọc, `ClientSubmissionId`, kiểm tra "câu thuộc đúng bài" ở tầng ứng dụng: **đồng ý** (bảng của giakhoiquang).
2. Index lọc được kiểm chứng trên **database tạm riêng** cùng instance `.\SQLEXPRESS` (tạo và xóa trong test), không dùng `JCAP_DB`.
3. **Lưu ý cho nhóm (không chặn M1):** `origin/develop` (commit `375c8a7`, AkaiZed, 2026-11-11) thêm 4 DbSet Diễn đàn **chưa có migration**.
   Migration Shadowing được tạo trên nhánh hiện tại (chưa gộp develop) nên chỉ chứa bảng của giakhoiquang. Khi gộp, `AppDbContextModelSnapshot.cs` sẽ cần
   giải quyết xung đột; migration Diễn đàn vẫn do AkaiZed tạo — không được để migration Shadowing "ôm" bảng Diễn đàn.
4. Cập nhật mục Database Design của Report4 theo hệ thống thật sau khi M1 xong.
