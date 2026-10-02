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

/** Director push-to-talk target: nobody, everyone, or a list of operators (peer ids). */
export type TalkTarget = "off" | "all" | string[];

/** Where an operator's voice goes: the director only, everybody, or one other operator (peer id). */
export type Scope = "dir" | "all" | string;

/** One voice an operator is hearing right now. cam -1 = the director. */
export interface HearItem {
  name: string;
  cam: number;
  scope: "all" | "you";
}

export interface RosterEntry {
  id: string;
  cam: number;
  name: string;
}

export interface Tally {
  /** Cam indexes (0-based) that are on air. */
  pgm: number[];
  /** Cam indexes that are next (preview). */
  pvw: number[];
  scenes: (string | null)[];
}

type ToOperator =
  | ({ t: "tally" } & Tally)
  | { t: "roster"; peers: RosterEntry[] }
  | { t: "cfg"; muted: boolean; crew: boolean }
  | { t: "hear"; from: HearItem[] }
  | { t: "call"; on: boolean };
type ToDirector = { t: "talk"; on: boolean; to: Scope } | { t: "hb" } | { t: "call"; on: boolean } | { t: "ack" };

export interface CommsPeer {
  id: string;
  cam: number;
  name: string;
  talking: boolean;
  /** Who this operator is talking to while their mic is open. */
  to: Scope;
  /** Director silenced this operator. */
  muted: boolean;
  /** This operator may talk to other operators (not just the director). */
  crew: boolean;
  /** The operator pressed CALL DIRECTOR. */
  calling: boolean;
  /** The director is ringing this operator. */
  ringing: boolean;
  /** Mic level 0..1 (what the director hears from this operator). */
  level: number;
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
  /** Operators may talk to each other (director master switch). */
  crew: boolean;
  /** Director's headphone volume for the crew (0..1). */
  monitor: number;
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
  live: { pip: boolean[]; merge?: boolean; mergeScenes?: string[] };
  config: { camScenes: (string | null)[]; pips: { scene: string | null }[] };
}): { pgm: number[]; pvw: number[] } {
  const pgm = new Set<number>();
  const pvw = new Set<number>();
  if (s.program !== null && !s.live.merge) pgm.add(s.program);
  // A showing Merge puts every pane's cam on air.
  if (s.live.merge) {
    for (const scene of s.live.mergeScenes ?? []) {
      const cam = s.config.camScenes.indexOf(scene);
      if (cam >= 0) pgm.add(cam);
    }
  }
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

interface PeerInfo {
  cam: number;
  name: string;
  talking: boolean;
  to: Scope;
  muted: boolean;
  crew: boolean;
  calling: boolean;
  ringing: boolean;
  level: number;
  seen: number;
}

/** Audio side of one operator: the mix they hear (dest) and what they say (src). */
interface PeerAudio {
  dest: MediaStreamAudioDestinationNode;
  src: MediaStreamAudioSourceNode | null;
  el: HTMLAudioElement | null;
  mon: GainNode | null;
  an: AnalyserNode | null;
  /** operator -> other operator gains, keyed by the listener's id */
  links: Map<string, GainNode>;
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);

/**
 * The director is a small intercom matrix (like a hardware Clear-Com / RTS panel):
 *   every operator has their own "return mix" = director mic (when talking to them) + the other operators
 *   who are talking to them or to ALL — never their own voice (mix-minus, so there is no echo).
 */
class CommsHost {
  private state: CommsState = {
    running: false,
    starting: false,
    room: "",
    baseUrl: "",
    error: null,
    peers: [],
    talk: "off",
    crew: true,
    monitor: 1,
    tally: IDLE_TALLY,
  };
  private subs = new Set<() => void>();
  private peer: Peer | null = null;
  private mic: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private micSrc: MediaStreamAudioSourceNode | null = null;
  private monMaster: GainNode | null = null;
  private micLinks = new Map<string, GainNode>();
  private audio = new Map<string, PeerAudio>();
  private conns = new Map<string, DataConnection>();
  private info = new Map<string, PeerInfo>();
  private lastHear = new Map<string, string>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private meter: ReturnType<typeof setInterval> | null = null;
  private keyHeld = false;
  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code !== "KeyT" || e.repeat || isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (this.state.talk !== "off") return;
    this.keyHeld = true;
    this.setTalk("all");
  };
  private onKeyUp = (e: KeyboardEvent) => {
    if (e.code !== "KeyT" || !this.keyHeld) return;
    this.keyHeld = false;
    this.setTalk("off");
  };

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
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx({ latencyHint: "interactive" });
      await this.ctx.resume();
      this.monMaster = this.ctx.createGain();
      this.monMaster.gain.value = this.state.monitor;
      this.monMaster.connect(this.ctx.destination);
    } catch {
      this.fail("This browser cannot do live audio routing.");
      return;
    }
    try {
      this.mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      this.micSrc = this.ctx.createMediaStreamSource(this.mic);
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
      this.meter = setInterval(() => this.measure(), 120);
      window.addEventListener("keydown", this.onKeyDown);
      window.addEventListener("keyup", this.onKeyUp);
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
    if (this.meter) clearInterval(this.meter);
    this.timer = this.meter = null;
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.keyHeld = false;
    this.audio.forEach((a) => {
      if (a.el) {
        a.el.pause();
        a.el.srcObject = null;
      }
    });
    this.audio.clear();
    this.micLinks.clear();
    this.mic?.getTracks().forEach((t) => t.stop());
    this.mic = null;
    this.micSrc = null;
    this.monMaster = null;
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    const open = [...this.conns.values()];
    this.conns.clear();
    this.info.clear();
    this.lastHear.clear();
    open.forEach((c) => c.close());
    this.peer?.destroy();
    this.peer = null;
    this.patch({ running: false, starting: false, peers: [], talk: "off", error: null });
  }

  // ------------------------------------------------------------------ audio graph

  private nodeFor(id: string): PeerAudio | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    let n = this.audio.get(id);
    if (!n) {
      n = { dest: ctx.createMediaStreamDestination(), src: null, el: null, mon: null, an: null, links: new Map() };
      this.audio.set(id, n);
    }
    return n;
  }

  private attachRemote(id: string, stream: MediaStream) {
    const ctx = this.ctx;
    const n = this.nodeFor(id);
    if (!ctx || !n || !this.monMaster) return;
    n.src?.disconnect();
    // Chrome only delivers a remote WebRTC stream to WebAudio when it is also attached to a (muted) element.
    if (!n.el) {
      n.el = new Audio();
      n.el.muted = true;
    }
    n.el.srcObject = stream;
    void n.el.play().catch(() => {});
    n.src = ctx.createMediaStreamSource(stream);
    n.an = ctx.createAnalyser();
    n.an.fftSize = 512;
    n.src.connect(n.an);
    n.mon = ctx.createGain();
    n.mon.gain.value = 0;
    n.src.connect(n.mon);
    n.mon.connect(this.monMaster);
    n.links.forEach((g) => g.disconnect());
    n.links.clear();
    this.wire();
    this.route();
  }

  /** Make sure every gain that could ever be needed exists (all start closed). */
  private wire() {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const [qid, q] of this.audio) {
      if (this.micSrc && !this.micLinks.has(qid)) {
        const g = ctx.createGain();
        g.gain.value = 0;
        this.micSrc.connect(g);
        g.connect(q.dest);
        this.micLinks.set(qid, g);
      }
      for (const [pid, p] of this.audio) {
        if (pid === qid || !p.src || p.links.has(qid)) continue;
        const g = ctx.createGain();
        g.gain.value = 0;
        p.src.connect(g);
        g.connect(q.dest);
        p.links.set(qid, g);
      }
    }
  }

  private crewOk(p: PeerInfo) {
    return this.state.crew && p.crew;
  }

  /** Apply the whole routing matrix: director mic -> operators, operators -> operators, operators -> director. */
  private route() {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const set = (g: GainNode | null | undefined, on: boolean) => g?.gain.setTargetAtTime(on ? 1 : 0, now, 0.015);
    const { talk } = this.state;
    const hear = new Map<string, HearItem[]>();
    const add = (q: string, item: HearItem) => hear.set(q, [...(hear.get(q) ?? []), item]);

    for (const qid of this.audio.keys()) {
      const on = !!this.micSrc && (talk === "all" || (Array.isArray(talk) && talk.includes(qid)));
      set(this.micLinks.get(qid), on);
      if (on) add(qid, { name: "DIRECTOR", cam: -1, scope: talk === "all" ? "all" : "you" });
    }
    for (const [pid, p] of this.audio) {
      const pi = this.info.get(pid);
      if (!pi) continue;
      const speaking = pi.talking && !pi.muted;
      set(p.mon, speaking);
      for (const qid of this.audio.keys()) {
        if (qid === pid) continue;
        const on = speaking && this.crewOk(pi) && (pi.to === "all" || pi.to === qid);
        set(p.links.get(qid), on);
        if (on) add(qid, { name: pi.name, cam: pi.cam, scope: pi.to === "all" ? "all" : "you" });
      }
    }
    // Tell each operator who they are hearing right now.
    for (const qid of this.audio.keys()) {
      const list = hear.get(qid) ?? [];
      const key = JSON.stringify(list);
      if (this.lastHear.get(qid) === key) continue;
      this.lastHear.set(qid, key);
      const conn = this.conns.get(qid);
      if (conn) this.send(conn, { t: "hear", from: list });
    }
  }

  /** Mic level of every operator (what the director hears), ~8 times a second. */
  private measure() {
    let changed = false;
    const buf = new Uint8Array(512);
    for (const [id, n] of this.audio) {
      const pi = this.info.get(id);
      if (!pi || !n.an) continue;
      n.an.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i]! - 128) / 128;
        sum += v * v;
      }
      const level = pi.talking && !pi.muted ? Math.min(1, Math.sqrt(sum / buf.length) * 4) : 0;
      if (Math.abs(level - pi.level) > 0.06 || (level === 0) !== (pi.level === 0)) {
        pi.level = level;
        changed = true;
      }
    }
    if (changed) this.refresh();
  }

  setMonitor(v: number) {
    const monitor = Math.min(1, Math.max(0, v));
    this.patch({ monitor });
    if (this.monMaster) this.monMaster.gain.value = monitor;
  }

  /** A short two-tone beep (a crew member is calling). */
  private beep() {
    const ctx = this.ctx;
    if (!ctx || !this.monMaster) return;
    [880, 1175].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.16);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.16 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.16 + 0.14);
      o.connect(g);
      g.connect(this.monMaster!);
      o.start(ctx.currentTime + i * 0.16);
      o.stop(ctx.currentTime + i * 0.16 + 0.15);
    });
  }

  // ------------------------------------------------------------------ peers

  private upsert(id: string, meta: { cam?: number; name?: string } | undefined) {
    const prev = this.info.get(id);
    this.info.set(id, {
      cam: typeof meta?.cam === "number" ? meta.cam : (prev?.cam ?? 0),
      name: (meta?.name || prev?.name || "Operator").slice(0, 24),
      talking: prev?.talking ?? false,
      to: prev?.to ?? "dir",
      muted: prev?.muted ?? false,
      crew: prev?.crew ?? true,
      calling: prev?.calling ?? false,
      ringing: prev?.ringing ?? false,
      level: prev?.level ?? 0,
      seen: Date.now(),
    });
    this.refresh();
  }

  private refresh() {
    const peers: CommsPeer[] = [...this.info.entries()]
      .map(([id, p]) => ({
        id,
        cam: p.cam,
        name: p.name,
        talking: p.talking,
        to: p.to,
        muted: p.muted,
        crew: p.crew,
        calling: p.calling,
        ringing: p.ringing,
        level: p.level,
      }))
      .sort((a, b) => a.cam - b.cam || a.name.localeCompare(b.name));
    this.patch({ peers });
  }

  private onConnection(conn: DataConnection) {
    conn.on("open", () => {
      this.conns.set(conn.peer, conn);
      this.upsert(conn.peer, conn.metadata as { cam?: number; name?: string });
      this.nodeFor(conn.peer);
      this.wire();
      this.sendTally(conn);
      this.sendCfg(conn.peer);
      this.sendRoster();
      this.lastHear.delete(conn.peer);
      this.route();
    });
    conn.on("data", (d) => this.onData(conn.peer, d as ToDirector));
    conn.on("close", () => this.dropIf(conn.peer, conn));
    conn.on("error", () => this.dropIf(conn.peer, conn));
  }

  private onCall(call: MediaConnection) {
    this.upsert(call.peer, call.metadata as { cam?: number; name?: string });
    const n = this.nodeFor(call.peer);
    // The operator hears their own personal return mix (never their own voice).
    call.answer(n?.dest.stream);
    call.on("stream", (remote) => this.attachRemote(call.peer, remote));
  }

  private onData(id: string, d: ToDirector) {
    const p = this.info.get(id);
    if (!p || !d) return;
    p.seen = Date.now();
    if (d.t === "talk") {
      p.talking = !!d.on && !p.muted;
      p.to = d.to ?? "dir";
      if (p.talking) p.calling = false;
      this.refresh();
      this.route();
    } else if (d.t === "call") {
      if (d.on && !p.calling) this.beep();
      p.calling = !!d.on;
      this.refresh();
    } else if (d.t === "ack") {
      p.ringing = false;
      this.refresh();
    }
  }

  private dropIf(id: string, conn: DataConnection) {
    if (this.conns.get(id) === conn) this.dropId(id);
  }

  private dropId(id: string) {
    const conn = this.conns.get(id);
    this.conns.delete(id);
    conn?.close();
    this.info.delete(id);
    this.lastHear.delete(id);
    const n = this.audio.get(id);
    if (n) {
      n.src?.disconnect();
      n.mon?.disconnect();
      n.links.forEach((g) => g.disconnect());
      if (n.el) {
        n.el.pause();
        n.el.srcObject = null;
      }
      this.audio.delete(id);
    }
    this.micLinks.get(id)?.disconnect();
    this.micLinks.delete(id);
    // Nobody can keep a link pointing at someone who left.
    this.audio.forEach((p) => {
      p.links.get(id)?.disconnect();
      p.links.delete(id);
    });
    if (Array.isArray(this.state.talk) && this.state.talk.includes(id)) {
      const rest = this.state.talk.filter((x) => x !== id);
      this.patch({ talk: rest.length ? rest : "off" });
    }
    this.refresh();
    this.sendRoster();
    this.route();
  }

  /** Heartbeat: re-send the tally (operators use it to know the link is alive) and drop silent phones. */
  private beat() {
    const now = Date.now();
    for (const [id, p] of [...this.info]) if (now - p.seen > STALE_MS) this.dropId(id);
    this.conns.forEach((c) => this.sendTally(c));
  }

  // ------------------------------------------------------------------ messages

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

  private sendRoster() {
    const peers: RosterEntry[] = [...this.info.entries()].map(([id, p]) => ({ id, cam: p.cam, name: p.name }));
    this.conns.forEach((c) => this.send(c, { t: "roster", peers }));
  }

  private sendCfg(id: string) {
    const p = this.info.get(id);
    const conn = this.conns.get(id);
    if (p && conn) this.send(conn, { t: "cfg", muted: p.muted, crew: this.crewOk(p) });
  }

  setTally(pgm: number[], pvw: number[], scenes: (string | null)[]) {
    const prev = this.state.tally;
    const same = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((v, i) => v === b[i]);
    if (same(prev.pgm, pgm) && same(prev.pvw, pvw) && same(prev.scenes, scenes)) return;
    this.patch({ tally: { pgm, pvw, scenes } });
    this.conns.forEach((c) => this.sendTally(c));
  }

  // ------------------------------------------------------------------ director controls

  /** Director push-to-talk: everyone, a chosen set of operators, one operator, or nobody. */
  setTalk(target: TalkTarget) {
    const cur = this.state.talk;
    const same = cur === target || (Array.isArray(cur) && Array.isArray(target) && cur.join() === target.join());
    if (same) return;
    this.patch({ talk: target });
    // Talking to someone answers their call light.
    const ids = target === "all" ? [...this.info.keys()] : Array.isArray(target) ? target : [];
    ids.forEach((id) => {
      const p = this.info.get(id);
      if (p?.calling) p.calling = false;
    });
    this.refresh();
    this.route();
  }

  /** Ring an operator (their phone flashes, beeps and vibrates until they tap ANSWER). */
  ring(id: string, on: boolean) {
    const p = this.info.get(id);
    const conn = this.conns.get(id);
    if (!p || !conn) return;
    p.ringing = on;
    this.send(conn, { t: "call", on });
    this.refresh();
  }

  /** Clear an operator's CALL light without talking. */
  clearCall(id: string) {
    const p = this.info.get(id);
    if (!p) return;
    p.calling = false;
    this.refresh();
  }

  /** Silence one operator for everyone (and tell their phone). */
  setMuted(id: string, muted: boolean) {
    const p = this.info.get(id);
    if (!p) return;
    p.muted = muted;
    if (muted) p.talking = false;
    this.sendCfg(id);
    this.refresh();
    this.route();
  }

  /** Allow / forbid one operator from talking to the other operators. */
  setPeerCrew(id: string, crew: boolean) {
    const p = this.info.get(id);
    if (!p) return;
    p.crew = crew;
    this.sendCfg(id);
    this.refresh();
    this.route();
  }

  /** Master switch: can operators talk to each other at all? */
  setCrew(crew: boolean) {
    this.patch({ crew });
    this.info.forEach((_, id) => this.sendCfg(id));
    this.route();
  }
}

export const comms = new CommsHost();
export const useComms = () => useSyncExternalStore(comms.subscribe, comms.getSnapshot, () => comms.getSnapshot());

// ======================================================================================== operator

export interface OperatorState {
  status: "idle" | "starting" | "connecting" | "online" | "offline";
  error: string | null;
  onAir: boolean;
  next: boolean;
  scene: string | null;
  /** Everyone whose voice is reaching this operator right now. */
  hearing: HearItem[];
  talking: boolean;
  /** Where this operator's voice goes while the mic is open. */
  target: Scope;
  /** The other operators this one can pick as a private target. */
  roster: RosterEntry[];
  myId: string;
  muted: boolean;
  crew: boolean;
  /** The director is ringing this operator. */
  ringing: boolean;
  /** This operator pressed CALL DIRECTOR. */
  callingDir: boolean;
  volume: number;
}

export class OperatorLink {
  private state: OperatorState = {
    status: "idle",
    error: null,
    onAir: false,
    next: false,
    scene: null,
    hearing: [],
    talking: false,
    target: "dir",
    roster: [],
    myId: "",
    muted: false,
    crew: true,
    ringing: false,
    callingDir: false,
    volume: 1,
  };
  private subs = new Set<() => void>();
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private mic: MediaStream | null = null;
  private joined = false;
  private lastMsg = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private beatTimer: ReturnType<typeof setInterval> | null = null;
  private ringTimer: ReturnType<typeof setInterval> | null = null;
  private audio: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
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
    this.audio.volume = this.state.volume;
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
    this.joined = true;
    void this.keepAwake();
    this.beatTimer = setInterval(() => this.beat(), HEARTBEAT_MS);
    this.connect();
  }

  leave() {
    this.joined = false;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.beatTimer) clearInterval(this.beatTimer);
    this.stopRing();
    this.retryTimer = this.beatTimer = null;
    this.peer?.destroy();
    this.peer = this.conn = null;
    this.mic?.getTracks().forEach((t) => t.stop());
    this.mic = null;
    if (this.audio) {
      this.audio.pause();
      this.audio.srcObject = null;
    }
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    void this.wake?.release().catch(() => {});
    this.wake = null;
    this.patch({ status: "idle", onAir: false, next: false, talking: false, hearing: [], ringing: false, callingDir: false });
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
      peer.on("open", (id) => {
        this.patch({ myId: id });
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
          if (this.state.callingDir) this.sendRaw({ t: "call", on: true });
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
    this.patch({ status: "offline", onAir: false, next: false, hearing: [], roster: [], ringing: false });
    this.stopRing();
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
    } else if (d.t === "hear") {
      if (d.from.length && !this.state.hearing.length) navigator.vibrate?.(40);
      // The director answered the call light by talking to us.
      this.patch({ hearing: d.from, callingDir: d.from.some((h) => h.cam === -1) ? false : this.state.callingDir });
    } else if (d.t === "roster") {
      const roster = d.peers.filter((p) => p.id !== this.state.myId);
      const target = this.state.target !== "dir" && this.state.target !== "all" && !roster.some((p) => p.id === this.state.target) ? "dir" : this.state.target;
      this.patch({ roster, target });
    } else if (d.t === "cfg") {
      const target = !d.crew ? "dir" : this.state.target;
      if (d.muted && this.state.talking) this.setTalk(false);
      this.patch({ muted: d.muted, crew: d.crew, target });
    } else if (d.t === "call") {
      if (d.on) this.startRing();
      else this.stopRing();
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
    this.sendRaw({ t: "talk", on, to: this.state.target });
  }

  /** Push-to-talk. Goes to the chosen target (director / all / one operator). */
  setTalk(on: boolean) {
    if (!this.joined || this.state.talking === on) return;
    if (on && this.state.muted) return;
    this.mic?.getAudioTracks().forEach((t) => {
      t.enabled = on;
    });
    this.patch({ talking: on, callingDir: on && this.state.target === "dir" ? false : this.state.callingDir });
    this.sendTalk(on);
  }

  /** Choose who the mic reaches: "dir", "all" or one operator's id. */
  setTarget(to: Scope) {
    if (to !== "dir" && !this.state.crew) return;
    this.patch({ target: to });
    if (this.state.talking) this.sendTalk(true);
  }

  setVolume(v: number) {
    const volume = Math.min(1, Math.max(0, v));
    if (this.audio) this.audio.volume = volume;
    this.patch({ volume });
  }

  /** CALL DIRECTOR light on / off. */
  callDirector(on: boolean) {
    this.patch({ callingDir: on });
    this.sendRaw({ t: "call", on });
  }

  /** Tap ANSWER while the director is ringing. */
  answer() {
    this.stopRing();
    this.sendRaw({ t: "ack" });
  }

  private startRing() {
    if (this.state.ringing) return;
    this.patch({ ringing: true });
    const ring = () => {
      navigator.vibrate?.([300, 120, 300]);
      const ctx = this.ctx;
      if (!ctx) return;
      [880, 1175].forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
        g.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + i * 0.18 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.16);
        o.connect(g);
        g.connect(ctx.destination);
        o.start(ctx.currentTime + i * 0.18);
        o.stop(ctx.currentTime + i * 0.18 + 0.17);
      });
    };
    ring();
    this.ringTimer = setInterval(ring, 1200);
  }

  private stopRing() {
    if (this.ringTimer) clearInterval(this.ringTimer);
    this.ringTimer = null;
    if (this.state.ringing) this.patch({ ringing: false });
  }
}

export function useOperator(link: OperatorLink) {
  return useSyncExternalStore(link.subscribe, link.getSnapshot, link.getSnapshot);
}
