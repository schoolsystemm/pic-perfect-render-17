// Listen on this device: plays the OBS program audio through this phone / laptop.
// OBS pushes audio-only to a small MediaMTX server on the OBS PC; this file pulls it
// back over WebRTC (WHEP). The OBS WebSocket itself cannot carry audio.
import { useSyncExternalStore } from "react";

export type ListenStatus = "off" | "connecting" | "live" | "error";

export interface ListenState {
  status: ListenStatus;
  message: string;
}

/** WHEP address: the saved one, or MediaMTX on the same PC as OBS. */
export function resolveListenUrl(saved: string, obsHost: string): string {
  const s = saved.trim();
  if (s) return s;
  return obsHost ? `http://${obsHost}:8889/mk/whep` : "";
}

class Listener {
  private state: ListenState = { status: "off", message: "" };
  private listeners = new Set<() => void>();
  private pc: RTCPeerConnection | null = null;
  private audio: HTMLAudioElement | null = null;
  private wanted = false;
  private url = "";
  private volume = 1;
  private retry: ReturnType<typeof setTimeout> | null = null;

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getSnapshot = () => this.state;

  private set(state: ListenState) {
    this.state = state;
    this.listeners.forEach((l) => l());
  }

  /** Must be called from a tap/click so the browser allows sound. */
  async start(url: string, volume: number) {
    if (!url) {
      this.set({ status: "error", message: "No audio address — set it in Settings → Listen" });
      return;
    }
    this.wanted = true;
    this.url = url;
    this.volume = volume;
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.autoplay = true;
      (this.audio as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
    }
    this.audio.volume = volume;
    // Unlock playback inside the user gesture (iOS / Safari).
    void this.audio.play().catch(() => {});
    await this.connect();
  }

  stop() {
    this.wanted = false;
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    this.close();
    this.set({ status: "off", message: "" });
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.audio) this.audio.volume = v;
  }

  private close() {
    if (this.pc) {
      this.pc.onconnectionstatechange = null;
      this.pc.ontrack = null;
      this.pc.close();
      this.pc = null;
    }
    if (this.audio) this.audio.srcObject = null;
  }

  private fail(message: string) {
    this.close();
    this.set({ status: "error", message });
    if (this.wanted && !this.retry) {
      this.retry = setTimeout(() => {
        this.retry = null;
        if (this.wanted) void this.connect();
      }, 2500);
    }
  }

  private async connect() {
    this.close();
    this.set({ status: "connecting", message: "" });
    try {
      const pc = new RTCPeerConnection({ iceServers: [] }); // same network, no STUN needed
      this.pc = pc;
      pc.addTransceiver("audio", { direction: "recvonly" });
      pc.ontrack = (e) => {
        try {
          // Ask for a tight jitter buffer: keeps the delay low.
          (e.receiver as RTCRtpReceiver & { jitterBufferTarget?: number }).jitterBufferTarget = 60;
        } catch {
          /* not supported */
        }
        if (this.audio) {
          this.audio.srcObject = e.streams[0] ?? new MediaStream([e.track]);
          this.audio.volume = this.volume;
          void this.audio.play().catch(() => {
            this.set({ status: "error", message: "Tap Listen again to allow sound" });
          });
        }
      };
      pc.onconnectionstatechange = () => {
        if (pc !== this.pc) return;
        if (pc.connectionState === "connected") this.set({ status: "live", message: "" });
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          this.fail("Audio connection lost — retrying");
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === "complete") return resolve();
        const done = () => {
          if (pc.iceGatheringState === "complete") {
            pc.removeEventListener("icegatheringstatechange", done);
            resolve();
          }
        };
        pc.addEventListener("icegatheringstatechange", done);
        setTimeout(resolve, 2000);
      });

      const res = await fetch(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: pc.localDescription?.sdp ?? "",
      });
      if (res.status === 404) return this.fail("OBS is not sending audio yet (stream not found)");
      if (!res.ok) return this.fail(`Audio server said ${res.status}`);
      await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });
    } catch {
      this.fail("Can't reach the audio server — is MediaMTX running?");
    }
  }
}

export const listener = new Listener();

const SERVER_LISTEN: ListenState = { status: "off" as ListenStatus, message: "" };

export function useListen(): ListenState {
  return useSyncExternalStore(listener.subscribe, listener.getSnapshot, () => SERVER_LISTEN);
}
