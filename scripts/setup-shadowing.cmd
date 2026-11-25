@echo off
rem Cai dat mot lan de test Shadowing. Dan vao terminal o thu muc goc repo: scripts\setup-shadowing.cmd
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-shadowing.ps1" %*
