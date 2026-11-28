# JCAP — Japanese Conversation AI Platform (FPTU SEP490-SE_54)

## TL;DR

**JCAP** là nền tảng web fullstack hỗ trợ người Việt luyện giao tiếp tiếng Nhật trình độ **JLPT N5–N3** qua hội thoại nhập vai AI (**FE-03**), luyện nói đuổi Shadowing chấm âm học tự động (**FE-04**), kho từ vựng/ngữ pháp & Flashcard SRS/Quiz (**FE-05**), bản đồ khám phá 47 tỉnh Nhật Bản (**FE-06**), kiểm tra xếp lớp & hồ sơ năng lực thích ứng (**FE-07**), ví Credit/Subscription qua PayOS (**FE-02**), tài khoản/phân quyền (**FE-01**), và diễn đàn cộng đồng/hỗ trợ (**FE-08**).

---

## Overview

### Kiến trúc & Công nghệ Thực tế (Evidence-Based)

| Thành phần | Công nghệ đang vận hành |
|---|---|
| **Backend API** | ASP.NET Core 8 Web API (`.NET 8.0`), Entity Framework Core 8 (Code-First, **57 DbSets**, **43 Migrations**), ASP.NET Core Identity + JWT Bearer + Google OAuth 2.0, **30 Controllers / 191 Endpoints** |
| **Frontend SPA** | `jcap-web` — React 19.3, TypeScript 6, Vite 8, Tailwind CSS 3, React Router 7 (**98 Views**, route-level `React.lazy` code-splitting) |
| **Database** | SQL Server 2022 (`JCAP_DB`) |
| **LLM Engine** | Google Gemini API (`GeminiAiClient` với chuỗi fallback nhiều model & cooldown tracker) + `OpenAiCompatibleAiClient` qua `IAiClient` |
| **Speech-to-Text (STT)** | Dual-Engine: Web Speech API (live interim) + Local **Faster-Whisper** Python HTTP services (cổng `50022` cho Roleplay, `50023` cho Shadowing ASR) |
| **Text-to-Speech (TTS)** | Local **VOICEVOX Engine** (cổng `50021`, cache 3 tầng RAM/Disk/IndexedDB) + fallback Web Speech Synthesis |
| **Acoustic & Phoneme Scoring** | `Microsoft.ML.OnnxRuntime` (`OnnxPhonemeRecognizer`) + bộ phân tích C# tất định (`KanaMoraComparer`, `FluencyAnalyzer`, `MoraDurationAnalyzer`, `PronunciationAligner`, DTW, CTC) |
| **Thanh toán, Lưu trữ & Mail** | PayOS (`payOS 2.1.0`), Cloudinary (`CloudinaryDotNet`), MailKit SMTP (`smtp4dev` ở dev), ClosedXML (import/export Excel `.xlsx`) |

---

## Details — Cấu Hình Môi Trường & Bí Mật

Backend ASP.NET Core 8 nạp cấu hình nhiều lớp theo thứ tự ưu tiên tăng dần:

1. **`appsettings.json` (Git-tracked):** Cấu hình mặc định chung (logging, cổng local của Whisper/VOICEVOX, chuỗi fallback model Gemini, flashcard quota). **Không lưu API key thật vào file này.**
2. **`appsettings.Development.json` (Git-tracked):** Cấu hình riêng cho môi trường phát triển.
3. **`appsettings.Local.json.template` (Git-tracked):** Mẫu cấu hình bí mật cho thành viên mới.
4. **`appsettings.Local.json` (Git-ignored):** File cấu hình cá nhân chứa credentials thật (ConnectionString cá nhân, `Gemini:ApiKey`, `PayOS`, `Authentication:Google:ClientSecret`, `Email`, `Cloudinary`, `Jwt:Key`).

---

## Examples — Hướng Dẫn Khởi Chạy

### 1. Chạy Local Development

1. **Chuẩn bị cấu hình:** Copy `appsettings.Local.json.template` thành `appsettings.Local.json` tại thư mục gốc và điền các key cần thiết (`ConnectionStrings:DefaultConnection`, `Gemini:ApiKey`, `PayOS`, v.v.).
2. **Khởi chạy SMTP local (tuỳ chọn cho luồng xác thực email):**
   ```powershell
   docker compose up -d
   ```
3. **Cập nhật Database SQL Server:**
   ```powershell
   dotnet ef database update
   ```
4. **Chạy Backend API (`http://localhost:5254`, Swagger tại `/swagger`):**
   ```powershell
   dotnet run
   ```
   *(Ở môi trường Development, backend tự chạy `SeedManager.SeedAllAsync` và tự khởi động Faster-Whisper local nếu bật `Whisper:AutoStart` / `Shadowing:Asr:AutoStart`.)*
5. **Chạy VOICEVOX Engine (tuỳ chọn):** Khởi chạy VOICEVOX cục bộ tại `http://127.0.0.1:50021` (nếu không chạy, frontend tự fallback sang Web Speech Synthesis).
6. **Chạy Frontend (`http://localhost:5173`):**
   ```powershell
   cd jcap-web
   npm install
   npm run dev
   ```

### 2. Chạy Self-Host bằng Docker Compose

Hệ thống hỗ trợ đóng gói trọn bộ 4 container (`sqlserver`, `whisper`, `voicevox`, `jcap-api`) qua `docker-compose.selfhost.yml`:

```powershell
docker compose -f docker-compose.selfhost.yml up -d --build
```

### 3. Chạy Kiểm Thử & Build

```powershell
# Backend tests (78 test files)
dotnet test JCAP.Tests/JCAP.Tests.csproj -c Release --verbosity minimal

# Frontend unit tests (42 test files) & Production build
npm --prefix jcap-web test -- --run
npm --prefix jcap-web run build
```

---

## Best Practices

- Mọi file mã nguồn và tài liệu phải lưu dưới định dạng **UTF-8 without BOM**.
- Không commit `appsettings.Local.json` hay bất kỳ secret thật nào lên Git; trên Production luôn ghi đè `Jwt:Key`, `PlacementTest:AllowRetakeForTesting=false` và API keys qua biến môi trường.
- Trước khi mở Pull Request, luôn đảm bảo `dotnet test`, `npm --prefix jcap-web test -- --run`, và `npm --prefix jcap-web run build` đạt 0 lỗi.

---

## References

- Kiến trúc, WBS & đặc tả phân hệ (FE-01..FE-08, UC-01..UC-92): [JCAP_PROJECT_CONTEXT.md](JCAP_PROJECT_CONTEXT.md)
- Từ điển thuật ngữ miền nghiệp vụ: [GLOSSARY.md](GLOSSARY.md)
- Cấu hình triển khai Docker self-host: [docker-compose.selfhost.yml](docker-compose.selfhost.yml)
