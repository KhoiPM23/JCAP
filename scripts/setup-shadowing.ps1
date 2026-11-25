# Cài đặt một lần để chạy và test Shadowing (chấm bằng Faster-Whisper) trên máy mới.
# Cách chạy dễ nhất (dán vào terminal ở thư mục gốc repo, không vướng ExecutionPolicy):  scripts\setup-shadowing.cmd
# Chỉ kiểm tra, không cài gì:  scripts\setup-shadowing.cmd -CheckOnly
#
# Việc script làm:
#   1. Kiểm tra .NET 8, Node.js, Python 3.10–3.14 (thiếu thì tự cài 3.12 bằng winget), VOICEVOX, appsettings.Local.json (không in giá trị bí mật).
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

# Python: thư viện nhận dạng có bản cài sẵn cho 3.10–3.14 (3.15 chưa có, pip sẽ phải tự biên dịch và hỏng).
# Ưu tiên 3.12. Thử py launcher, python trên PATH, rồi chỗ cài mặc định của python.org.
$supported = @("3.12", "3.13", "3.11", "3.14", "3.10")
function Find-Python {
    $candidates = New-Object System.Collections.Generic.List[object]
    foreach ($v in $supported) { $candidates.Add([pscustomobject]@{ Exe = "py"; Args = @("-$v") }) }
    $candidates.Add([pscustomobject]@{ Exe = "python"; Args = @() })
    foreach ($v in $supported) {
        $path = Join-Path $env:LOCALAPPDATA ("Programs\Python\Python" + ($v -replace '\.', '') + "\python.exe")
        $candidates.Add([pscustomobject]@{ Exe = $path; Args = @() })
    }
    foreach ($c in $candidates) {
        if (-not (Get-Command $c.Exe -ErrorAction SilentlyContinue)) { continue }
        $probe = @($c.Args) + @("-c", "import sys; print('%d.%d' % sys.version_info[:2])")
        $v = $null
        try { $v = (& $c.Exe @probe 2>$null | Select-Object -First 1) } catch { continue }
        if ($v -in $supported) { return [pscustomobject]@{ Exe = $c.Exe; Args = @($c.Args); Version = $v } }
    }
    return $null
}
$python = Find-Python
if ($python) {
    Ok "Python $($python.Version) ($($python.Exe) $($python.Args -join ' '))"
} elseif (Get-Command winget -ErrorAction SilentlyContinue) {
    Warn "Chưa có Python 3.10–3.14 (bản 3.15 chưa dùng được). Script sẽ tự cài Python 3.12 cho riêng tài khoản này"
} else {
    Bad "Python 3.12 (https://www.python.org/downloads/release/python-3120/), bản 3.15 chưa dùng được"
}

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

if (-not $python) {
    Write-Host "`n== Cài Python 3.12 ==" -ForegroundColor Cyan
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Write-Host "Máy không có winget. Tải và cài Python 3.12 tại https://www.python.org/downloads/ rồi chạy lại." -ForegroundColor Red
        exit 1
    }
    & winget install -e --id Python.Python.3.12 --scope user --silent --accept-package-agreements --accept-source-agreements
    $python = Find-Python
    if (-not $python) {
        Write-Host "Cài Python 3.12 chưa xong. Tải tại https://www.python.org/downloads/ rồi chạy lại." -ForegroundColor Red
        exit 1
    }
    Ok "Đã cài Python $($python.Version)"
}

Write-Host "`n== 2. Môi trường ảo Python và thư viện nhận dạng ==" -ForegroundColor Cyan
# Môi trường ảo cũ tạo bằng Python không hỗ trợ (vd. 3.15) hoặc bị hỏng thì tạo lại
if (Test-Path $venv) {
    $venvVersion = $null
    try { $venvVersion = (& $venvPython -c "import sys; print('%d.%d' % sys.version_info[:2])" 2>$null | Select-Object -First 1) } catch { }
    if ($venvVersion -notin $supported) {
        Warn "Môi trường ảo cũ dùng Python '$venvVersion' không hợp, tạo lại"
        Remove-Item -Recurse -Force $venv
    }
}
if (-not (Test-Path $venvPython)) {
    $venvArgs = @($python.Args) + @("-m", "venv", $venv)
    & $python.Exe @venvArgs
    if ($LASTEXITCODE -ne 0) { throw "Không tạo được môi trường ảo." }
    Ok "Đã tạo $venv"
} else {
    Ok "Đã có $venv"
}
& $venvPython -m pip install --disable-pip-version-check --upgrade pip
& $venvPython -m pip install --disable-pip-version-check --prefer-binary -r (Join-Path $asrDir "requirements.txt")
if ($LASTEXITCODE -ne 0) { throw "Cài thư viện nhận dạng thất bại (xem lỗi pip ở trên)." }
$check = "import importlib.util as u; m=[n for n in ('faster_whisper','fastapi','uvicorn','multipart','numpy','pyopenjtalk') if u.find_spec(n) is None]; print(','.join(m))"
$missing = (& $venvPython -c $check | Select-Object -First 1)
if ($missing) { throw "Vẫn thiếu thư viện: $missing (xem lỗi pip ở trên)." }
Ok "Đã cài đủ thư viện nhận dạng"

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

Write-Host "`n== Xong. Mỗi lần test: mở VOICEVOX rồi dotnet run ==" -ForegroundColor Cyan
Write-Host "  dotnet run tự bật dịch vụ nhận dạng; lần đầu tự áp migration vào CSDL trên máy và tạo dữ liệu câu mẫu."
if ($problems.Count -gt 0) { Write-Host "`nCòn $($problems.Count) mục THIẾU ở phần 1, sửa trước khi test." -ForegroundColor Red }
if ($warnings.Count -gt 0) { Write-Host "Còn $($warnings.Count) cảnh báo ở phần 1, xem lại trước khi test." -ForegroundColor Yellow }
