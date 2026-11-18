# Cài đặt một lần để chạy và test Shadowing (chấm bằng Faster-Whisper) trên máy mới.
# Chạy ở thư mục gốc repo:   .\scripts\setup-shadowing.ps1
# Chỉ kiểm tra, không cài gì:  .\scripts\setup-shadowing.ps1 -CheckOnly
#
# Việc script làm:
#   1. Kiểm tra .NET 8, Node.js, Python 3.10–3.12, VOICEVOX, appsettings.Local.json (không in giá trị bí mật).
#   2. Tạo môi trường ảo Python riêng tools/shadowing-asr/.venv (đã có trong .gitignore; không đụng Python chung
#      hay dịch vụ Whisper của Hội thoại AI) và cài thư viện trong tools/shadowing-asr/requirements.txt.
#   3. Tải sẵn model Whisper (mặc định "small", ~460 MB) để lần chấm đầu tiên không bị quá giờ.
#   4. npm install cho jcap-web nếu chưa có node_modules.
param(
    [switch]$CheckOnly,
    [string]$Model = "small"
)
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$asrDir = Join-Path $root "tools\shadowing-asr"
$venv = Join-Path $asrDir ".venv"
$venvPython = Join-Path $venv "Scripts\python.exe"
$problems = New-Object System.Collections.Generic.List[string]
$warnings = New-Object System.Collections.Generic.List[string]

function Ok($text) { Write-Host "  [OK]   $text" -ForegroundColor Green }
function Warn($text) { Write-Host "  [!]    $text" -ForegroundColor Yellow; $warnings.Add($text) }
function Bad($text) { Write-Host "  [THIẾU] $text" -ForegroundColor Red; $problems.Add($text) }

Write-Host "`n== 1. Kiểm tra máy ==" -ForegroundColor Cyan

# .NET 8
$dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
if ($dotnet -and ((& dotnet --list-sdks) -match '^8\.')) { Ok ".NET 8 SDK" } else { Bad ".NET 8 SDK (https://dotnet.microsoft.com/download/dotnet/8.0)" }

# Node.js
if (Get-Command node -ErrorAction SilentlyContinue) { Ok "Node.js $(& node --version)" } else { Bad "Node.js (https://nodejs.org)" }

# Python 3.10–3.12: thử py launcher trước, rồi python
$python = $null
foreach ($candidate in @(@("py", "-3.12"), @("py", "-3.11"), @("py", "-3.10"), @("python"))) {
    $exe = $candidate[0]
    if (-not (Get-Command $exe -ErrorAction SilentlyContinue)) { continue }
    $probeArgs = @($candidate | Select-Object -Skip 1) + @("-c", "import sys; print('%d.%d' % sys.version_info[:2])")
    try { $version = (& $exe @probeArgs 2>$null | Select-Object -First 1) } catch { continue }
    if ($version -in @("3.10", "3.11", "3.12")) { $python = $candidate; break }
}
if ($python) { Ok "Python $version ($($python -join ' '))" } else { Bad "Python 3.10, 3.11 hoặc 3.12 (https://www.python.org/downloads/)" }

# VOICEVOX
try {
    $vv = Invoke-RestMethod -Uri "http://127.0.0.1:50021/version" -TimeoutSec 3
    Ok "VOICEVOX đang chạy (bản $vv)"
} catch {
    Warn "VOICEVOX chưa chạy: cài/mở VOICEVOX (https://voicevox.hiroshiba.jp) TRƯỚC khi chạy backend lần đầu để tạo dữ liệu câu mẫu"
}

# appsettings.Local.json (chỉ kiểm tra có/không, không in giá trị)
$local = Join-Path $root "appsettings.Local.json"
if (Test-Path $local) {
    try {
        $cfg = Get-Content $local -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($cfg.ConnectionStrings -and $cfg.ConnectionStrings.DefaultConnection) { Ok "Chuỗi kết nối CSDL (nhớ trỏ vào CSDL trên máy mình, không dùng CSDL chung)" } else { Bad "ConnectionStrings:DefaultConnection trong appsettings.Local.json" }
        if ($cfg.Jwt -and $cfg.Jwt.Key) { Ok "Jwt:Key" } else { Bad "Jwt:Key trong appsettings.Local.json (backend không khởi động được nếu thiếu)" }
        if (($cfg.Gemini -and $cfg.Gemini.ApiKey) -or ($cfg.AI -and $cfg.AI.ApiKey)) { Ok "Khoá Gemini (Gemini:ApiKey hoặc AI:ApiKey)" } else { Warn "Thiếu Gemini:ApiKey: nút 'Nhận xét phát âm và lưu loát từ AI' sẽ báo lỗi" }
    } catch {
        Bad "appsettings.Local.json không đọc được (sai định dạng JSON?)"
    }
} else {
    Bad "appsettings.Local.json ở thư mục gốc repo (xin bản mẫu từ nhóm)"
}

if ($CheckOnly) {
    Write-Host "`nChỉ kiểm tra (-CheckOnly): không cài gì." -ForegroundColor Cyan
    if ($problems.Count -gt 0) { exit 1 } else { exit 0 }
}
if (-not $python) { Write-Host "`nCài Python 3.10–3.12 rồi chạy lại script." -ForegroundColor Red; exit 1 }

Write-Host "`n== 2. Môi trường ảo Python và thư viện nhận dạng ==" -ForegroundColor Cyan
if (-not (Test-Path $venvPython)) {
    $pyArgs = @($python | Select-Object -Skip 1) + @("-m", "venv", $venv)
    & $python[0] @pyArgs
    if ($LASTEXITCODE -ne 0) { throw "Không tạo được môi trường ảo." }
    Ok "Đã tạo $venv"
} else {
    Ok "Đã có $venv"
}
& $venvPython -m pip install --disable-pip-version-check -r (Join-Path $asrDir "requirements.txt")
if ($LASTEXITCODE -ne 0) { throw "Cài thư viện nhận dạng thất bại (xem lỗi pip ở trên)." }
Ok "Đã cài thư viện trong requirements.txt"

Write-Host "`n== 3. Tải sẵn model Whisper '$Model' (lần đầu ~460 MB với small) ==" -ForegroundColor Cyan
& $venvPython -c "from faster_whisper import WhisperModel; WhisperModel('$Model', device='cpu', compute_type='int8'); print('ok')"
if ($LASTEXITCODE -ne 0) { throw "Không tải được model Whisper." }
Ok "Model '$Model' sẵn sàng"

Write-Host "`n== 4. Thư viện frontend ==" -ForegroundColor Cyan
$web = Join-Path $root "jcap-web"
if (-not (Test-Path (Join-Path $web "node_modules"))) {
    Push-Location $web
    try { npm install; if ($LASTEXITCODE -ne 0) { throw "npm install thất bại." } } finally { Pop-Location }
    Ok "Đã npm install"
} else {
    Ok "jcap-web/node_modules đã có"
}

Write-Host "`n== Xong. Mỗi lần test: ==" -ForegroundColor Cyan
Write-Host "  1. Mở VOICEVOX"
Write-Host "  2. Cửa sổ PowerShell riêng:  .\scripts\run-shadowing-asr.ps1   (để nguyên cửa sổ)"
Write-Host "  3. dotnet run   (lần đầu tự áp migration vào CSDL trên máy và tạo dữ liệu câu mẫu)"
if ($warnings.Count -gt 0) { Write-Host "`nCòn $($warnings.Count) cảnh báo ở trên, xem lại trước khi test." -ForegroundColor Yellow }
