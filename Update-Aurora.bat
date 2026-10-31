@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Update-Aurora.ps1" %*
