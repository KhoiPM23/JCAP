# Chạy dịch vụ ASR (Faster-Whisper) cho chấm Shadowing tại http://127.0.0.1:50023.
# Cài phụ thuộc trước: pip install -r tools/shadowing-asr/requirements.txt
param(
    [string]$Model = $(if ($env:ASR_MODEL) { $env:ASR_MODEL } else { "small" }),
    [string]$Device = $(if ($env:ASR_DEVICE) { $env:ASR_DEVICE } else { "cpu" }),
    [string]$ComputeType = $(if ($env:ASR_COMPUTE_TYPE) { $env:ASR_COMPUTE_TYPE } else { "int8" })
)
$ErrorActionPreference = "Stop"
$env:ASR_MODEL = $Model
$env:ASR_DEVICE = $Device
$env:ASR_COMPUTE_TYPE = $ComputeType
Push-Location (Join-Path $PSScriptRoot "..\tools\shadowing-asr")
try {
    Write-Host "JCAP Shadowing ASR: model=$Model device=$Device compute=$ComputeType"
    python -m app.main
} finally {
    Pop-Location
}
