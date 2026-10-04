@echo off
rem MK VISION remote listening (OBS PC). Needs Tailscale installed and signed in on this PC and on the phone / laptop.
rem Writes mediamtx-remote.yml with this PC's Tailscale address, then publishes the audio server over https.
set TS=tailscale
where tailscale >nul 2>nul || set TS="C:\Program Files\Tailscale\tailscale.exe"

for /f %%i in ('%TS% ip -4') do set TSIP=%%i
if "%TSIP%"=="" (
  echo Tailscale is not running or not signed in on this PC.
  pause
  exit /b 1
)

(
echo webrtcAdditionalHosts: [%TSIP%]
echo webrtcLocalTCPAddress: :8189
echo paths:
echo   mk:
) > "%~dp0mediamtx-remote.yml"

%TS% serve --bg --https=8443 http://127.0.0.1:8889
echo.
echo Done. Restart MediaMTX with MK-Start.bat so it loads mediamtx-remote.yml.
echo Your remote audio address is:
%TS% serve status
echo Put  https://YOUR-PC-NAME.YOUR-TAILNET.ts.net:8443/mk/whep  in MK Settings - Listen, and turn REMOTE LISTENING on.
pause
