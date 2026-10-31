@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup.ps1" %*
if errorlevel 1 (
  echo.
  echo Setup paused or failed. Run setup.cmd again to resume.
  pause
  exit /b 1
)
