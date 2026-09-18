# Antigravity Agent Guidelines & Rules — JCAP Project

## 1. File Encoding Standard (MANDATORY & CRITICAL)
- **Chuẩn mã hóa bắt buộc:** Mọi tệp tin trong toàn bộ repository này PHẢI LUÔN LUÔN được lưu theo chuẩn **UTF-8 without BOM (utf-8 without signature)**.
- **Tuyệt đối không sử dụng:** `utf-8-bom` hoặc bất kỳ định dạng nào có chứa Byte Order Mark (`\uFEFF`).
- **Tuân thủ EditorConfig:** Mọi công cụ, editor và agent phải tuân thủ nghiêm ngặt cấu hình tại `.editorconfig` ở thư mục gốc (`charset = utf-8`).
- **Lưu ý khi chạy PowerShell / CLI:**
  - Lệnh PowerShell mặc định trên Windows (`Out-File -Encoding utf8`) thường tự động chèn BOM.
  - Khi cần ghi file từ command-line, BẮT BUỘC dùng cơ chế không chèn BOM:
    - Trong PowerShell 7: `Set-Content -Encoding utf8NoBOM`
    - Hoặc .NET API: `[System.IO.File]::WriteAllText($path, $content, [System.Text.UTF8Encoding]::new($false))`
- **Quy tắc sửa file cũ:** Khi can thiệp hoặc chỉnh sửa bất kỳ tệp tin cũ nào, luôn đảm bảo lưu lại theo chuẩn **UTF-8 without signature**.

