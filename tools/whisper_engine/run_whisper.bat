@echo off
title JCAP Whisper Engine (Port 50022)
echo ========================================================
echo  Starting JCAP Whisper Speech-to-Text Engine (Port 50022)
echo ========================================================
if exist "%~dp0venv\Scripts\python.exe" (
    "%~dp0venv\Scripts\python.exe" "%~dp0server.py"
) else (
    python "%~dp0server.py"
)
pause
