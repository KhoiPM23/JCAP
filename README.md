# FPTU-SEP490-FA26-CAPSTONE-JS
Capstone Project FA26 | Japanese Conversation AI Platform (JCAP) | Enterprise Web Application | FPT University Da Nang.

---

## ⚙️ Cấu Hình Môi Trường & Bí Mật (Environment & Secret Settings)

Hệ thống backend ASP.NET Core 8 được thiết kế theo cấu trúc cấu hình nhiều lớp (Multi-layer configuration):

1. **`appsettings.json` (Git Tracked - Đẩy lên Git)**:
   - Chứa cấu hình mặc định chung cho toàn bộ thành viên trong nhóm (Log level, JWT Issuer, API endpoints mặc định).
   - **Tuyệt đối không lưu API Key / Credentials thật vào file này.**

2. **`appsettings.Development.json` (Git Tracked - Đẩy lên Git)**:
   - Cấu hình môi trường phát triển chung (Database connection string mặc định, Port chạy local...).

3. **`appsettings.Local.json.template` (Git Tracked - Đẩy lên Git)**:
   - File mẫu hướng dẫn cấu hình API Key bí mật cho các thành viên mới khi clone dự án.

4. **`appsettings.Local.json` (GIT IGNORED - KHÔNG ĐẨY LÊN GIT)**:
   - File cấu hình cá nhân của từng lập trình viên (dùng để điền Key thật: PayOS, Google Auth, OpenAI, Azure Speech, ConnectionString cá nhân...).
   - Đã được khai báo trong `.gitignore` để bảo vệ an toàn thông tin bí mật.

### 🚀 Hướng dẫn cho thành viên mới trong nhóm:
1. Clone dự án về máy.
2. Tạo file `appsettings.Local.json` nằm tại thư mục gốc backend (bằng cách copy từ `appsettings.Local.json.template`).
3. Điền các API Key tương ứng (PayOS ClientId, ApiKey, ChecksumKey...) vào `appsettings.Local.json`.
4. Chạy `dotnet run`.

