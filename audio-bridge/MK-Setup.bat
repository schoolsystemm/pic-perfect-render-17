@echo off
rem MK VISION one-click pre-listen setup AND start (run on the OBS PC). Safe to run again any time.
rem Installs ffmpeg + MediaMTX if missing, opens the firewall for the local network, writes the config, starts the server.
net session >nul 2>&1
if errorlevel 1 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0MK-Setup.ps1"
pause
