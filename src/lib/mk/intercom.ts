import { useSyncExternalStore } from "react";
import type { DataConnection, MediaConnection, Peer } from "peerjs";

/**
 * Crew comms: camera tally + instant voice (push-to-talk), peer-to-peer over WebRTC (PeerJS).
 *
 *   DIRECTOR (the switcher window)  <——— data + audio ———>  CAMERA OPERATOR (phone, /cam page)
 *
 * - The switcher is the HOST. It opens a room; each camera has a QR code → /cam?room=…&cam=N.
 * - Tally: the host pushes which cams are on air (PGM) / next (PVW); the operator's whole screen lights.
 * - Voice: operators hold TALK to speak to the director; the director holds TALK ALL / TALK CAM N.
 *   "Who is talking" comes from the push-to-talk signal, so it is instant and exact.
 * Only the connection set-up goes through the free PeerJS cloud; audio flows directly between devices.
 */

const PREFIX = "mkv";
export const dirPeerId = (room: string) => `${PREFIX}-${room}-dir`;

const ROOM_KEY = "mk-comms-room";
const BASE_KEY = "mk-comms-base";
const HEARTBEAT_MS = 3000;
const STALE_MS = 10000;

export type TalkTarget = "off" | "all" | number;

export interface Tally {
  /** Cam indexes (0-based) that are on air. */
  pgm: number[];
  /** Cam indexes that are next (preview). */
  pvw: number[];
  scenes: (string | null)[];
}

type ToOperator = ({ t: "tally" } & Tally) | { t: "dir"; on: boolean };
type ToDirector = { t: "talk"; on: boolean } | { t: "hb" };

export interface CommsPeer {
  id: string;
  cam: number;
  name: string;
  talking: boolean;
}

export interface CommsState {
  running: boolean;
  starting: boolean;
  room: string;
  baseUrl: string;
  /** Soft problem to show to the director (mic blocked, signalling server unreachable…). */
  error: string | null;
  peers: CommsPeer[];
  talk: TalkTarget;
  tally: Tally;
}

const IDLE_TALLY: Tally = { pgm: [], pvw: [], scenes: [] };

const store = {
  get: (k: string) => {
    try {
      return typeof localStorage === "undefined" ? null : localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
};

function newRoom() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/** The link an operator opens (what the QR code holds). `cam` is 0-based. */
export function joinUrl(baseUrl: string, room: string, cam: number) {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/cam?room=${encodeURIComponent(room)}&cam=${cam + 1}`;
}

/** Which cams are on air / next, from the switcher state. */
export function tallyOf(s: {
  program: number | null;
  preview: number | null;
  fx: { layout: string | null };
  live: { pip: boolean[] };
  config: { camScenes: (string | null)[]; pips: { scene: string | null }[] };
}): { pgm: number[]; pvw: number[] } {
  const pgm = new Set<number>();
  const pvw = new Set<number>();
  if (s.program !== null) pgm.add(s.program);
  // A held Merge shows PGM and PVW side by side: both are on air.
  if (s.fx.layout === "merge" && s.preview !== null) pgm.add(s.preview);
  // PIPs that are showing put their camera on air too.
  s.config.pips.forEach((p, i) => {
    if (!s.live.pip[i] || !p.scene) return;
    const cam = s.config.camScenes.indexOf(p.scene);
    if (cam >= 0) pgm.add(cam);
  });
  if (s.preview !== null && !pgm.has(s.preview)) pvw.add(s.preview);
  return { pgm: [...pgm].sort((a, b) => a - b), pvw: [...pvw].sort((a, b) => a - b) };
}

// ======================================================================================== director

class CommsHost {
  private state: CommsState = {
    running: false,
    starting: false,
    room: "",
    baseUrl: "",
    error: null,
    peers: [],
    talk: "off",
    tally: IDLE_TALLY,
  };
  private subs = new Set<() => void>();
  private peer: Peer | null = null;
  private mic: MediaStream | null = null;
  private conns = new Map<string, DataConnection>();
  private info = new Map<string, { cam: number; name: string; talking: boolean; seen: number }>();
  private out = new Map<string, MediaStream>();
  private audio = new Map<string, HTMLAudioElement>();
  private sentDir = new Map<string, boolean>();
  private timer: ReturnType<typeof setInterval> | null = null;

  subscribe = (f: () => void) => {
    this.subs.add(f);
    return () => {
      this.subs.delete(f);
    };
  };
  getSnapshot = () => this.state;

  private patch(p: Partial<CommsState>) {
    this.state = { ...this.state, ...p };
    this.subs.forEach((f) => f());
  }

  /** Load the saved room / base URL (client only). */
  init() {
    if (this.state.room) return;
    let room = store.get(ROOM_KEY);
    if (!room) {
      room = newRoom();
      store.set(ROOM_KEY, room);
    }
    this.patch({ room, baseUrl: store.get(BASE_KEY) || window.location.origin });
  }

  setBaseUrl(baseUrl: string) {
    store.set(BASE_KEY, baseUrl);
    this.patch({ baseUrl });
  }

  newRoomCode() {
    this.stop();
    const room = newRoom();
    store.set(ROOM_KEY, room);
    this.patch({ room });
  }

  async start() {
    if (this.state.running || this.state.starting) return;
    this.init();
    this.patch({ starting: true, error: null });
    try {
      this.mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      this.mic = null;
      this.patch({ error: "Microphone blocked — you can hear the crew but not talk. Allow the mic for this site." });
    }
    try {
      const { Peer } = await import("peerjs");
      const peer = new Peer(dirPeerId(this.state.room));
      this.peer = peer;
      peer.on("open", () => this.patch({ running: true, starting: false }));
      peer.on("error", (e) => {
        if (e.type === "unavailable-id") {
          this.fail("This room is already open in another window. Use NEW ROOM, or close the other window.");
        } else if (["network", "server-error", "socket-error", "socket-closed"].includes(e.type)) {
          this.patch({ error: "Cannot reach the connection server — check the internet on this PC." });
        }
      });
      peer.on("disconnected", () => {
        try {
          peer.reconnect();
        } catch {
          /* ignore */
        }
      });
      peer.on("connection", (conn) => this.onConnection(conn));
      peer.on("call", (call) => this.onCall(call));
      this.timer = setInterval(() => this.beat(), HEARTBEAT_MS);
    } catch (error) {
      this.fail(error instanceof Error ? error.message : "Could not start comms");
    }
  }

  private fail(error: string) {
    this.stop();
    this.patch({ error });
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.audio.forEach((a) => {
      a.pause();
      a.srcObject = null;
    });
    this.audio.clear();
    this.out.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    this.out.clear();
    this.mic?.getTracks().forEach((t) => t.stop());
    this.mic = null;
    this.conns.forEach((c) => c.close());
    this.conns.clear();
    this.info.clear();
    this.sentDir.clear();
    this.peer?.destroy();
    this.peer = null;
    this.patch({ running: false, starting: false, peers: [], talk: "off", error: null });
  }

  // ------------------------------------------------------------------ peers

  private upsert(id: string, meta: { cam?: number; name?: string } | undefined) {
    const cam = typeof meta?.cam === "number" ? meta.cam : (this.info.get(id)?.cam ?? 0);
    const name = (meta?.name || this.info.get(id)?.name || "Operator").slice(0, 24);
    const prev = this.info.get(id);
    this.info.set(id, { cam, name, talking: prev?.talking ?? false, seen: Date.now() });
    this.refresh();
  }

  private refresh() {
    const peers: CommsPeer[] = [...this.info.entries()]
      .map(([id, p]) => ({ id, cam: p.cam, name: p.name, talking: p.talking }))
      .sort((a, b) => a.cam - b.cam || a.name.localeCompare(b.name));
    this.patch({ peers });
  }

  private onConnection(conn: DataConnection) {
    conn.on("open", () => {
      this.conns.set(conn.peer, conn);
      this.upsert(conn.peer, conn.metadata as { cam?: number; name?: string });
      this.sendTally(conn);
      this.applyTalk();
    });
    conn.on("data", (d) => this.onData(conn.peer, d as ToDirector));
    conn.on("close", () => this.drop(conn.peer, conn));
    conn.on("error", () => this.drop(conn.peer, conn));
  }

  private onCall(call: MediaConnection) {
    this.upsert(call.peer, call.metadata as { cam?: number; name?: string });
    // Each operator gets their own copy of the director mic so TALK CAM N can reach just that camera.
    this.out.get(call.peer)?.getTracks().forEach((t) => t.stop());
    const mine = this.mic ? this.mic.clone() : undefined;
    if (mine) this.out.set(call.peer, mine);
    else this.out.delete(call.peer);
    this.applyTalk();
    call.answer(mine);
    call.on("stream", (remote) => {
      let a = this.audio.get(call.peer);
      if (!a) {
        a = new Audio();
        a.autoplay = true;
        this.audio.set(call.peer, a);
      }
      a.srcObject = remote;
      void a.play().catch(() => {});
    });
    call.on("close", () => {
      const a = this.audio.get(call.peer);
      if (a) {
        a.pause();
        a.srcObject = null;
        this.audio.delete(call.peer);
      }
    });
  }

  private onData(id: string, d: ToDirector) {
    const p = this.info.get(id);
    if (!p) return;
    p.seen = Date.now();
    if (d && d.t === "talk") {
      p.talking = !!d.on;
      this.refresh();
    }
  }

  private drop(id: string, conn: DataConnection) {
    if (this.conns.get(id) !== conn) return;
    this.conns.delete(id);
    this.info.delete(id);
    this.sentDir.delete(id);
    this.out.get(id)?.getTracks().forEach((t) => t.stop());
    this.out.delete(id);
    const a = this.audio.get(id);
    if (a) {
      a.pause();
      a.srcObject = null;
      this.audio.delete(id);
    }
    this.refresh();
  }

  /** Heartbeat: re-send the tally (operators use it to know the link is alive) and drop silent phones. */
  private beat() {
    const now = Date.now();
    for (const [id, p] of this.info) {
      const conn = this.conns.get(id);
      if (conn && now - p.seen > STALE_MS) this.drop(id, conn);
    }
    this.conns.forEach((c) => this.sendTally(c));
  }

  // ------------------------------------------------------------------ tally + talk

  private send(conn: DataConnection, msg: ToOperator) {
    try {
      if (conn.open) conn.send(msg);
    } catch {
      /* ignore */
    }
  }

  private sendTally(conn: DataConnection) {
    this.send(conn, { t: "tally", ...this.state.tally });
  }

  setTally(pgm: number[], pvw: number[], scenes: (string | null)[]) {
    const prev = this.state.tally;
    const same = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((v, i) => v === b[i]);
    if (same(prev.pgm, pgm) && same(prev.pvw, pvw) && same(prev.scenes, scenes)) return;
    this.patch({ tally: { pgm, pvw, scenes } });
    this.conns.forEach((c) => this.sendTally(c));
  }

  /** Director push-to-talk target: everyone, one camera, or nobody. */
  setTalk(target: TalkTarget) {
    if (this.state.talk === target) return;
    this.patch({ talk: target });
    this.applyTalk();
  }

  private applyTalk() {
    const { talk } = this.state;
    for (const [id, stream] of this.out) {
      const cam = this.info.get(id)?.cam;
      const on = talk === "all" || (typeof talk === "number" && talk === cam);
      stream.getAudioTracks().forEach((t) => {
        t.enabled = on;
      });
      if (this.sentDir.get(id) !== on) {
        this.sentDir.set(id, on);
        const conn = this.conns.get(id);
        if (conn) this.send(conn, { t: "dir", on });
      }
    }
  }
}

export const comms = new CommsHost();
export const useComms = () =>
  useSyncExternalStore(
    comms.subscribe,
    comms.getSnapshot,
    () => comms.getSnapshot(),
  );

// ======================================================================================== operator

export interface OperatorState {
  status: "idle" | "starting" | "connecting" | "online" | "offline";
  error: string | null;
  onAir: boolean;
  next: boolean;
  scene: string | null;
  /** The director is talking to this camera. */
  dirTalking: boolean;
  talking: boolean;
}

export class OperatorLink {
  private state: OperatorState = {
    status: "idle",
    error: null,
    onAir: false,
    next: false,
    scene: null,
    dirTalking: false,
    talking: false,
  };
  private subs = new Set<() => void>();
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private mic: MediaStream | null = null;
  private joined = false;
  private lastMsg = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private beatTimer: ReturnType<typeof setInterval> | null = null;
  private audio: HTMLAudioElement | null = null;
  private wake: { release: () => Promise<void> } | null = null;

  /** `cam` is 0-based. */
  constructor(
    private room: string,
    private cam: number,
    private name: string,
  ) {}

  subscribe = (f: () => void) => {
    this.subs.add(f);
    return () => {
      this.subs.delete(f);
    };
  };
  getSnapshot = () => this.state;

  private patch(p: Partial<OperatorState>) {
    this.state = { ...this.state, ...p };
    this.subs.forEach((f) => f());
  }

  setName(name: string) {
    this.name = name;
  }

  /** Must be called from a tap (phones only allow mic + audio after a user gesture). */
  async join() {
    if (this.joined) return;
    this.patch({ status: "starting", error: null });
    try {
      this.mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      this.patch({ status: "idle", error: "Microphone blocked. Allow the mic for this page, then tap JOIN again." });
      return;
    }
    this.mic.getAudioTracks().forEach((t) => {
      t.enabled = false;
    });
    this.audio = new Audio();
    this.audio.autoplay = true;
    this.joined = true;
    void this.keepAwake();
    this.beatTimer = setInterval(() => this.beat(), HEARTBEAT_MS);
    this.connect();
  }

  leave() {
    this.joined = false;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.beatTimer) clearInterval(this.beatTimer);
    this.retryTimer = this.beatTimer = null;
    this.peer?.destroy();
    this.peer = this.conn = null;
    this.mic?.getTracks().forEach((t) => t.stop());
    this.mic = null;
    if (this.audio) {
      this.audio.pause();
      this.audio.srcObject = null;
    }
    void this.wake?.release().catch(() => {});
    this.wake = null;
    this.patch({ status: "idle", onAir: false, next: false, talking: false, dirTalking: false });
  }

  private async keepAwake() {
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
      this.wake = (await nav.wakeLock?.request("screen")) ?? null;
    } catch {
      /* not supported */
    }
  }

  private connect() {
    if (!this.joined) return;
    this.peer?.destroy();
    this.peer = this.conn = null;
    this.patch({ status: "connecting" });
    void import("peerjs").then(({ Peer }) => {
      if (!this.joined) return;
      const peer = new Peer();
      this.peer = peer;
      const meta = { cam: this.cam, name: this.name };
      peer.on("open", () => {
        const conn = peer.connect(dirPeerId(this.room), { reliable: true, metadata: meta });
        this.conn = conn;
        conn.on("open", () => {
          this.lastMsg = Date.now();
          this.patch({ status: "online" });
          if (this.mic) {
            const call = peer.call(dirPeerId(this.room), this.mic, { metadata: meta });
            call.on("stream", (remote) => {
              if (!this.audio) return;
              this.audio.srcObject = remote;
              void this.audio.play().catch(() => {});
            });
          }
          if (this.state.talking) this.sendTalk(true);
        });
        conn.on("data", (d) => this.onData(d as ToOperator));
        conn.on("close", () => this.retry());
        conn.on("error", () => this.retry());
      });
      peer.on("error", () => this.retry());
      peer.on("disconnected", () => {
        try {
          peer.reconnect();
        } catch {
          /* ignore */
        }
      });
    });
  }

  private retry() {
    if (!this.joined || this.retryTimer) return;
    this.patch({ status: "offline", onAir: false, next: false, dirTalking: false });
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, 2000);
  }

  private onData(d: ToOperator) {
    this.lastMsg = Date.now();
    if (d.t === "tally") {
      const onAir = d.pgm.includes(this.cam);
      const next = !onAir && d.pvw.includes(this.cam);
      if (onAir && !this.state.onAir) navigator.vibrate?.([200, 80, 200]);
      this.patch({ onAir, next, scene: d.scenes[this.cam] ?? null, status: "online" });
    } else if (d.t === "dir") {
      if (d.on && !this.state.dirTalking) navigator.vibrate?.(60);
      this.patch({ dirTalking: d.on });
    }
  }

  private beat() {
    if (!this.joined) return;
    if (this.state.status === "online" && Date.now() - this.lastMsg > STALE_MS) {
      this.retry();
      return;
    }
    this.sendRaw({ t: "hb" });
  }

  private sendRaw(msg: ToDirector) {
    try {
      if (this.conn?.open) this.conn.send(msg);
    } catch {
      /* ignore */
    }
  }

  private sendTalk(on: boolean) {
    this.sendRaw({ t: "talk", on });
  }

  /** Push-to-talk to the director. */
  setTalk(on: boolean) {
    if (!this.joined || this.state.talking === on) return;
    this.mic?.getAudioTracks().forEach((t) => {
      t.enabled = on;
    });
    this.patch({ talking: on });
    this.sendTalk(on);
  }
}

export function useOperator(link: OperatorLink) {
  return useSyncExternalStore(link.subscribe, link.getSnapshot, link.getSnapshot);
}
