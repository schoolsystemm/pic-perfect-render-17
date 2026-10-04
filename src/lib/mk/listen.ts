// Listen on this device: plays the OBS program audio through this phone / laptop.
// OBS pushes audio-only to a small MediaMTX server on the OBS PC; this file pulls it
// back over WebRTC (WHEP). The OBS WebSocket itself cannot carry audio.
import { useSyncExternalStore } from "react";

export interface PreviewEq {
  gain: number;
  hi: number;
  mid: number;
  lo: number;
}

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

/** True when an https page would be blocked from calling this address (mixed content). localhost is exempt. */
export function isMixedContentBlocked(url: string): boolean {
  if (typeof location === "undefined" || location.protocol !== "https:") return false;
  if (!/^http:\/\//i.test(url.trim())) return false;
  try {
    const h = new URL(url.trim()).hostname;
    return !(h === "localhost" || h === "127.0.0.1" || h === "[::1]");
  } catch {
    return true;
  }
}

export const MIXED_CONTENT_MESSAGE =
  "Blocked: this page is https, the audio address is http. Run MK-Remote.bat on the OBS PC and paste the https://…ts.net:8443/mk/whep address in Settings > Listen";

export interface IceOptions {
  /** Add a public STUN server so it also connects across routers / the internet. */
  remote: boolean;
  /** Extra servers separated by `;`. A TURN server is `turn:host:3478|user|password`. */
  extra: string;
}

export function buildIceServers(o?: IceOptions): RTCIceServer[] {
  const servers: RTCIceServer[] = [];
  if (o?.remote) servers.push({ urls: "stun:stun.l.google.com:19302" });
  for (const part of (o?.extra ?? "").split(";")) {
    const [urls, username, credential] = part.trim().split("|");
    if (!urls) continue;
    servers.push(username && credential ? { urls, username, credential } : { urls });
  }
  return servers;
}

class Listener {
  private state: ListenState = { status: "off", message: "" };
  private listeners = new Set<() => void>();
  private pc: RTCPeerConnection | null = null;
  private audio: HTMLAudioElement | null = null;
  private wanted = false;
  private url = "";
  private volume = 1;
  private ice: IceOptions | undefined;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private preview: PreviewEq | null = null;
  private ctx: AudioContext | null = null;
  private fx: { src: MediaStreamAudioSourceNode; lo: BiquadFilterNode; mid: BiquadFilterNode; hi: BiquadFilterNode; out: GainNode } | null = null;

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
  async start(url: string, volume: number, ice?: IceOptions) {
    if (!url) {
      this.set({ status: "error", message: "No audio address — set it in Settings → Listen" });
      return;
    }
    if (isMixedContentBlocked(url)) {
      this.wanted = false;
      this.set({ status: "error", message: MIXED_CONTENT_MESSAGE });
      return;
    }
    this.wanted = true;
    this.url = url;
    this.volume = volume;
    this.ice = ice;
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
    this.applyPreview();
  }

  /**
   * Hear a staged gain / EQ change before it is on air. Runs the incoming feed through a small browser EQ
   * (shelves at 800 Hz and 5 kHz, a bell between). Only this device hears it. null = flat = bypass.
   */
  setPreviewEq(eq: PreviewEq | null) {
    const flat = !eq || (Math.abs(eq.gain) < 0.05 && Math.abs(eq.hi) < 0.05 && Math.abs(eq.mid) < 0.05 && Math.abs(eq.lo) < 0.05);
    this.preview = flat ? null : eq;
    this.applyPreview();
  }

  private applyPreview() {
    const stream = this.audio?.srcObject as MediaStream | null | undefined;
    if (!this.audio || !stream || !this.preview) return this.dropPreview();
    try {
      if (!this.ctx || !this.fx) {
        const ctx = new AudioContext();
        const src = ctx.createMediaStreamSource(stream);
        const lo = ctx.createBiquadFilter();
        lo.type = "lowshelf";
        lo.frequency.value = 800;
        const mid = ctx.createBiquadFilter();
        mid.type = "peaking";
        mid.frequency.value = 2000;
        mid.Q.value = 0.5;
        const hi = ctx.createBiquadFilter();
        hi.type = "highshelf";
        hi.frequency.value = 5000;
        const out = ctx.createGain();
        src.connect(lo);
        lo.connect(mid);
        mid.connect(hi);
        hi.connect(out);
        out.connect(ctx.destination);
        this.ctx = ctx;
        this.fx = { src, lo, mid, hi, out };
        this.audio.muted = true;
      }
      void this.ctx.resume();
      const { lo, mid, hi, out } = this.fx;
      lo.gain.value = this.preview.lo;
      mid.gain.value = this.preview.mid;
      hi.gain.value = this.preview.hi;
      out.gain.value = Math.pow(10, this.preview.gain / 20) * this.volume;
    } catch {
      this.dropPreview();
    }
  }

  private dropPreview() {
    if (this.fx) {
      try {
        this.fx.src.disconnect();
        this.fx.out.disconnect();
      } catch {
        /* already gone */
      }
      this.fx = null;
    }
    if (this.ctx) {
      void this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    if (this.audio) this.audio.muted = false;
  }

  private close() {
    this.dropPreview();
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
      const pc = new RTCPeerConnection({ iceServers: buildIceServers(this.ice) }); // empty = same network
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
          this.applyPreview();
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
      this.fail(
        isMixedContentBlocked(this.url)
          ? MIXED_CONTENT_MESSAGE
          : "Can't reach the audio server — is MediaMTX running?",
      );
    }
  }
}

export const listener = new Listener();

const SERVER_LISTEN: ListenState = { status: "off" as ListenStatus, message: "" };

export function useListen(): ListenState {
  return useSyncExternalStore(listener.subscribe, listener.getSnapshot, () => SERVER_LISTEN);
}
