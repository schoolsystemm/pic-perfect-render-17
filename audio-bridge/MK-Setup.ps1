$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
function Say($t) { Write-Host $t -ForegroundColor Cyan }

# 1. ffmpeg
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  Say 'Installing ffmpeg (winget)...'
  winget install --id Gyan.FFmpeg -e --accept-package-agreements --accept-source-agreements
  $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
}
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) { throw 'ffmpeg is still not found. Close this window, open a new one and run MK-Setup.bat again.' }

# 2. MediaMTX: reuse the one you already have, else download the latest
$dir = $null
$saved = Join-Path $here 'mediamtx-dir.txt'
$candidates = @()
if (Test-Path $saved) { $candidates += (Get-Content $saved -Raw).Trim() }
$candidates += 'C:\Users\HomePC\Downloads\mediamtx_v1.21.1_windows_amd64'
$candidates += (Join-Path $here 'mediamtx')
foreach ($c in $candidates) { if ($c -and (Test-Path (Join-Path $c 'mediamtx.exe'))) { $dir = $c; break } }
if (-not $dir) {
  Say 'Downloading MediaMTX...'
  $dir = Join-Path $here 'mediamtx'
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $rel = Invoke-RestMethod 'https://api.github.com/repos/bluenviron/mediamtx/releases/latest' -Headers @{ 'User-Agent' = 'mk-vision' }
  $asset = $rel.assets | Where-Object { $_.name -like '*windows_amd64.zip' } | Select-Object -First 1
  $zip = Join-Path $env:TEMP 'mediamtx.zip'
  Invoke-WebRequest $asset.browser_download_url -OutFile $zip
  Expand-Archive $zip -DestinationPath $dir -Force
}
Set-Content -Path $saved -Value $dir -Encoding ASCII

# 3. This PC's LAN address (phones and other PCs connect to it)
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
  $_.IPAddress -match '^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)' -and $_.InterfaceAlias -notmatch 'vEthernet|VirtualBox|VMware|Tailscale|Loopback'
} | Select-Object -First 1).IPAddress
if (-not $ip) { throw 'No LAN address found. Connect this PC to the network first.' }

# 4. Firewall (private/local network only)
Get-NetFirewallRule -DisplayName 'MK pre-listen*' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName 'MK pre-listen TCP' -Direction Inbound -Protocol TCP -LocalPort 8889,8554,1935,9997,8189 -Profile Private,Domain -Action Allow | Out-Null
New-NetFirewallRule -DisplayName 'MK pre-listen UDP' -Direction Inbound -Protocol UDP -LocalPort 8189 -Profile Private,Domain -Action Allow | Out-Null

# 5. Config
$cfg = @'
# Written by MK-Setup.bat. Aitum Multistream -> RTMP "raw" -> ffmpeg -> Opus "mk" -> phones (WebRTC).
api: yes
apiAddress: :9997
apiAllowOrigin: '*'
webrtcAdditionalHosts: [__LAN__]
paths:
  raw:
    runOnAvailable: ffmpeg -i rtsp://127.0.0.1:$RTSP_PORT/$MTX_PATH -vn -c:a libopus -b:a 128k -ar 48000 -ac 2 -f rtsp rtsp://127.0.0.1:$RTSP_PORT/mk
    runOnAvailableRestart: yes
  mk:
'@
$cfg = $cfg.Replace('__LAN__', $ip)
[IO.File]::WriteAllText((Join-Path $here 'mediamtx.yml'), $cfg, (New-Object Text.UTF8Encoding($false)))

# 6. (Re)start MediaMTX with the new PATH so it finds ffmpeg
Get-Process mediamtx -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1
Start-Process -FilePath (Join-Path $dir 'mediamtx.exe') -ArgumentList ('"' + (Join-Path $here 'mediamtx.yml') + '"') -WorkingDirectory $dir

Write-Host ''
Write-Host "MediaMTX is running. This PC: $ip" -ForegroundColor Green
Write-Host 'Phones / other PCs on the same network: open MK, Settings > Listen, leave the address empty, press Listen.'
Write-Host ''
Write-Host 'ONE TIME in Aitum Multistream (OBS): add output > custom RTMP' -ForegroundColor Yellow
Write-Host '   Server: rtmp://127.0.0.1:1935     Key: raw     Audio track: 2 only'
Write-Host 'Then start that output. MK Settings > Listen shows each step as OK.'
