# Remote pre-listen (away from the venue Wi-Fi)

Recommended: **Tailscale** (free). Nothing is opened to the public internet.

## One-time
1. Install Tailscale on the **OBS PC** and on every **phone / laptop** that will listen. Sign in to the same account.
2. On the OBS PC, run `audio-bridge\MK-Remote.bat`. It finds the PC's Tailscale address, writes `mediamtx-remote.yml`
   (so MediaMTX advertises that address and allows TCP fallback) and publishes the audio server over https with
   `tailscale serve`. It prints your address: `https://<pc-name>.<tailnet>.ts.net:8443`.
3. Start (or restart) MediaMTX with `MK-Start.bat`. It uses `mediamtx-remote.yml` automatically when it exists.
4. In OBS, SET UP IN OBS (MK Settings > Listen) or set the Recording output by hand, then press REC.

## On the phone / laptop
1. Open Tailscale and switch it on.
2. MK VISION > Settings > Listen:
   - Audio address: `https://<pc-name>.<tailnet>.ts.net:8443/mk/whep`
   - REMOTE LISTENING: ON
3. Press Pre-listen. Listening does not need the OBS connection.

## Why https
MK is served over https. Phones block an `http://` audio address from an https page, so the address must be https.
`tailscale serve` provides a real certificate for the `.ts.net` name.

## Without Tailscale (not recommended)
Forward TCP 8889, TCP 8189 and UDP 8189 on the router to the OBS PC, set `webrtcAdditionalHosts: [<public IP or DDNS>]`
in `mediamtx.yml`, and put MediaMTX behind https (a reverse proxy with a certificate). Turn REMOTE LISTENING on. If a
network blocks UDP, add a TURN server in Settings > Listen > Extra ICE servers as `turn:host:3478|user|password`.

## Notes
- Expect more delay than on the LAN, and Bluetooth headphones add more.
- If it connects but is silent: the address in `webrtcAdditionalHosts` is wrong, or the phone's Tailscale is off.
- The Tailscale address of the OBS PC is shown by `tailscale ip -4`.
