# MK audio: MAIN and SOLO monitor (console style)

Every audio input is a strip with: **MN** (red, on air: OBS Track 1 = YouTube + recording), **SOLO** (green),
**PC** (amber, OBS PC headphones), MUTE and a fader.

The **Monitor** section (next to the mixer) is what your phone / laptop headphones play (OBS Track 2):
- **MAIN** (red, default): headphones follow the final mix. Pressing MAIN also drops any change you did not TAKE.
- **SOLO** (green): arms the SOLO keys on the strips (green outline). Press SOLO on one or more strips: you hear only
  those, before their fader, and nothing changes on air. An off-air input that is muted or faded down is lifted
  while soloed and put back after.
- **GAIN / HIGH / MID / LOW** knobs act on the input shown (click a name in the Monitor section to pick it).
  While soloed, a change is STAGED: amber, heard only in your headphones (browser preview EQ). **TAKE** writes it to
  OBS (MK Gain + MK EQ filters on the input); **ALL** takes every staged input. **COPY** / **PASTE** move gain + EQ
  between inputs (paste lands as staged on every soloed input).
- Outside SOLO mode the knobs change the input directly (on air).
- On connect MK puts Track 2 in step with the mode automatically (MAIN: every MN input is on Track 2).

Keep OBS Stream and Recording on **Track 1 only**.

# Hear OBS audio on your phone / laptop (MK VISION → Listen)

OBS's WebSocket only carries controls and meters, never sound. So OBS sends an
audio-only feed to a tiny free server (MediaMTX) on the OBS PC, and the
controller plays it back.

## 1. On the OBS PC — start MediaMTX
1. Download MediaMTX (free, one file) from https://github.com/bluenviron/mediamtx/releases
2. Put `mediamtx.yml` from this folder next to it (or just run it without a file — defaults work).
3. Run `mediamtx` (Windows: double-click `mediamtx.exe`). Leave the window open.
4. Windows Firewall: allow it on private networks (TCP 8889, TCP 8554, UDP 8189).

## 2. In OBS — send audio-only to it
Settings → Output → Output Mode: **Advanced** → **Recording** tab:
- Type: **Custom Output (FFmpeg)**
- FFmpeg Output Type: **Output to URL**
- File path or URL: `rtsp://127.0.0.1:8554/mk`
- Container Format: **rtsp**
- Video Encoder: **Disable** (audio only, costs no CPU)
- Audio Encoder: **libopus** (or "opus"), bitrate 128
- Audio Track: **2 only** (untick 1; the monitor mix, NOT your final mix)

Then press **Start Recording** in OBS. The pre-listen feed flows while it is running.

> ⚠ This uses OBS's Recording slot, so normal file recording is unavailable
> while it's set this way. If you need file recording too, use a multi-output
> plugin (e.g. Aitum Multistream / obs-multi-rtmp) to add a second SRT output
> instead, or record from a different tool.

## 3. On the phone / laptop
1. MK VISION → Settings → **Listen**: leave the address empty to use
   `http://<OBS host>:8889/mk/whep`, or paste your own.
2. Back on the switcher, tap **Listen** (top right). It shows LIVE when audio arrives.
   Use the slider for volume. It reconnects by itself if the link drops.

## Troubleshooting
- "stream not found" → OBS is not sending yet; press Start Recording in OBS.
- "Can't reach the audio server" → MediaMTX not running, wrong IP, or firewall.
- No sound but LIVE → raise the Listen slider and the phone's media volume; iPhone silent switch doesn't matter for web audio but volume does.
- Page served over https can't call an http address (same rule as the OBS
  connection). Run MK VISION from http on your network, or put MediaMTX behind https.
- Expect roughly 0.2–0.5 s delay: fine for monitoring, not for lip-sync with a live mic in the same room.

---
# Sounds library (no setup needed)
Add audio files on the **Sounds** page. **CUE** (headphones button) plays on
this phone/laptop only — OBS never hears it. **AIR** plays it through OBS
(clips up to 2 MB). Files stay in this browser. This does NOT need MediaMTX.

---
# Set up the OBS output from MK
MK VISION > Settings > Listen > **SET UP IN OBS** writes the Recording output for you (Custom FFmpeg to
`rtsp://127.0.0.1:8554/mk`, audio Track 2 only) and reports every line. **CHECK** only reads. **RESTORE MY OLD SETTINGS**
puts your previous Recording settings back. Three things MK cannot change and will tell you about: Output Mode =
Advanced, audio encoder = libopus, video encoder = Disable Encoder (set those once in OBS). It uses the Recording slot:
no file recording while it is set. For remote listening see `REMOTE.md`.
