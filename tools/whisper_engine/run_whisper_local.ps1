$ErrorActionPreference = "Stop"

$whisperDir = $PSScriptRoot
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
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
