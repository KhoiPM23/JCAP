$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$whisperDir = Join-Path $repoRoot "tools\whisper_engine"
$venvPython = Join-Path $whisperDir "venv\Scripts\python.exe"
$serverScript = Join-Path $whisperDir "server.py"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " Starting JCAP Whisper ASR / STT Engine (Port 50022)" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

if (Test-Path $venvPython) {
    & $venvPython $serverScript
} else {
    python $serverScript
}
