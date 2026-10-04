@echo off
rem MK VISION one-click start: MediaMTX (pre-listen server), then OBS, then the MK page.
rem Edit the three paths below once.
set MEDIAMTX_DIR=C:\Users\HomePC\Downloads\mediamtx_v1.21.1_windows_amd64
set OBS_DIR=C:\Program Files\obs-studio\bin\64bit
set MK_URL=https://pic-perfect-render-17.lovable.app

set CFG=%~dp0mediamtx.yml
if exist "%~dp0mediamtx-remote.yml" set CFG=%~dp0mediamtx-remote.yml

tasklist /FI "IMAGENAME eq mediamtx.exe" | find /I "mediamtx.exe" >nul
if errorlevel 1 start "MediaMTX" /D "%MEDIAMTX_DIR%" "%MEDIAMTX_DIR%\mediamtx.exe" "%CFG%"

tasklist /FI "IMAGENAME eq obs64.exe" | find /I "obs64.exe" >nul
if errorlevel 1 start "OBS" /D "%OBS_DIR%" "%OBS_DIR%\obs64.exe"

timeout /t 6 >nul
start "" "%MK_URL%"
