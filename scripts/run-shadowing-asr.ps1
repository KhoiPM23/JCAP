# Chạy dịch vụ ASR (Faster-Whisper) cho chấm Shadowing tại http://127.0.0.1:50023.
# Cài đặt một lần trước: .\scripts\setup-shadowing.ps1 (tạo môi trường ảo tools/shadowing-asr/.venv)
param(
    [string]$Model = $(if ($env:ASR_MODEL) { $env:ASR_MODEL } else { "small" }),
    [string]$Device = $(if ($env:ASR_DEVICE) { $env:ASR_DEVICE } else { "cpu" }),
    [string]$ComputeType = $(if ($env:ASR_COMPUTE_TYPE) { $env:ASR_COMPUTE_TYPE } else { "int8" })
)
$ErrorActionPreference = "Stop"
$env:ASR_MODEL = $Model
$env:ASR_DEVICE = $Device
$env:ASR_COMPUTE_TYPE = $ComputeType
$asrDir = Join-Path $PSScriptRoot "..\tools\shadowing-asr"
# Ưu tiên môi trường ảo do scripts/setup-shadowing.ps1 tạo; không có thì dùng python trên PATH
$venvPython = Join-Path $asrDir ".venv\Scripts\python.exe"
$python = if (Test-Path $venvPython) { $venvPython } else { "python" }
$ErrorActionPreference = "Continue"
& $python -c "import faster_whisper, fastapi, uvicorn" 2>$null
$ErrorActionPreference = "Stop"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Chưa cài thư viện nhận dạng. Chạy một lần: .\scripts\setup-shadowing.ps1" -ForegroundColor Red
    exit 1
}
Push-Location $asrDir
try {
    Write-Host "JCAP Shadowing ASR: model=$Model device=$Device compute=$ComputeType python=$python"
    & $python -m app.main
} finally {
    Pop-Location
}
