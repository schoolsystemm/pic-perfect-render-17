# Two mixes: MAIN (final out) and PRE (pre-listen)

Every audio input in the app (mic, desktop, browser sources, sounds) is an equal strip with:
- **MAIN** → the input goes to the FINAL mix = OBS Track 1 = what YouTube and the recording get.
- **PRE** → the input goes to the PRE-LISTEN mix = OBS Track 2 = what the phone's Listen button plays.
- **PC** → also plays on the OBS PC's own headphones (optional).
The **MASTER** strip on the right shows the final output level. **HEAR FINAL** turns PRE on for
everything that is on MAIN, so Listen plays the whole final mix; turn it off to pre-listen only what you pick.

Keep OBS Stream and Recording on **Track 1 only** (Settings → Output → Streaming/Recording → Audio Track 1).

# Hear OBS audio on your phone / laptop (MK VISION → Listen)

OBS's WebSocket only carries controls and meters, never sound. So OBS sends an
audio-only feed to a tiny free server (MediaMTX) on the OBS PC, and the
controller plays it back.

## 1. On the OBS PC — start MediaMTX
1. Download MediaMTX (free, one file) from https://github.com/bluenviron/mediamtx/releases
2. Put `mediamtx.yml` from this folder next to it (or just run it without a file — defaults work).
3. Run `mediamtx` (Windows: double-click `mediamtx.exe`). Leave the window open.
4. Windows Firewall: allow it on private networks (TCP 8889, UDP 8189, UDP 8890).

## 2. In OBS — send audio-only to it
Settings → Output → Output Mode: **Advanced** → **Recording** tab:
- Type: **Custom Output (FFmpeg)**
- FFmpeg Output Type: **Output to URL**
- File path or URL: `srt://127.0.0.1:8890?streamid=publish:mk&pkt_size=1316`
- Container Format: **mpegts**
- Video Encoder: **Disable** (audio only, costs no CPU)
- Audio Encoder: **libopus** (or "opus"), bitrate 128
- Audio Track: **2** (the PRE-LISTEN mix — NOT track 1, which is your final mix)

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
