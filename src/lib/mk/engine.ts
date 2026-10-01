// MK VISION CONTROL ENGINE
// All switching logic lives here — never inside buttons. The UI only calls
// engine actions and renders engine state, so a hardware panel can drive the
// exact same functions later.
import { loadConfig, saveConfig } from "./config";
import { DemoTransport } from "./demo-transport";
import { FX_SCENE, ease, mergeFrame, pipFrame, squeezeFrame, type FxConfig, type FxLayoutKind, type FxPair, type FxRect } from "./fx";
import type { SavedGraphic } from "./gfx-library";
import { GFX_LAYERS, GFX_SCENE, gfxIdByName, gfxName, layerUrl } from "./graphics";
import type { Transport, TransportEvent } from "./transport";
import {
  CAM_COUNT,
  DEFAULT_CONFIG,
  DSK_COUNT,
  FADER_MAX,
  FADER_MIN,
  IDLE_GFX,
  IDLE_OUTPUT,
  type CamIndex,
  type DskTarget,
  type GfxId,
  type GraphicsConfig,
  type LimiterConfig,
  type MkConfig,
  type MonitorType,
  type OutputState,
  type RundownItem,
  type ScrollPreset,
  type SwitcherState,
} from "./types";

const RECONNECT_DELAY = 2500;
const TBAR_SEND_INTERVAL = 25;
const MONITOR_W = 640;
const MONITOR_H = 360;

function initialState(config: MkConfig): SwitcherState {
  return {
    status: "disconnected",
    statusMessage: "",
    demo: config.demoMode,
    program: null,
    preview: null,
    programScene: null,
    previewScene: null,
    dskActive: Array.from({ length: DSK_COUNT }, () => false),
    gfxActive: IDLE_GFX,
    tBar: 0,
    transitioning: false,
    fx: { running: false, layout: null },
    scenes: [],
    transitions: [],
    studioMode: false,
    config,
    audio: [],
    mainAudio: null,
    levels: {},
    stream: IDLE_OUTPUT,
    record: IDLE_OUTPUT,
    notice: null,
    gr: null,
    masterMuted: false,
  };
}

function toOutput(active: boolean, paused = false, durationMs = 0): OutputState {
  if (!active) return IDLE_OUTPUT;
  return paused
    ? { active, paused, since: null, baseMs: durationMs }
    : { active, paused, since: Date.now() - durationMs, baseMs: 0 };
}


export class SwitcherEngine {
  private state: SwitcherState = initialState(DEFAULT_CONFIG);
  private listeners = new Set<() => void>();
  private transport: Transport | null = null;
  private unsubscribeTransport: (() => void) | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  private animTimer: ReturnType<typeof setInterval> | null = null;
  private tbarTimer: ReturnType<typeof setTimeout> | null = null;
  private tbarPending: number | null = null;
  private tbarHeld = false;
  private booted = false;
  /** While PiP / Merge is held on air: the two scenes involved and the canvas size. */
  private fxHold: { a: string; b: string; w: number; h: number } | null = null;

  /** Hydrate stored config on the client. Safe to call repeatedly. */
  boot() {
    if (this.booted) return;
    this.booted = true;
    const config = loadConfig();
    this.state = initialState(config);
    this.notify();
    if (config.demoMode) {
      void this.connect();
    } else if (config.autoConnect && config.host) {
      void this.connect();
    }
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.state;

  private notify() {
    this.listeners.forEach((listener) => listener());
  }

  private set(patch: Partial<SwitcherState>) {
    this.state = { ...this.state, ...patch };
    this.notify();
  }

  private updateConfig(patch: Partial<MkConfig>) {
    const config = { ...this.state.config, ...patch };
    this.set({ config });
    saveConfig(config);
    return config;
  }

  /**
   * Send one command to OBS and tell the operator if it did not land. Returns true only when OBS
   * accepted it. A missing / dead connection is reported instead of being silently ignored.
   */
  private async send(label: string, run: (t: Transport) => Promise<void>): Promise<boolean> {
    const t = this.transport;
    if (!t || this.state.status !== "connected") {
      this.notice(`${label}: not sent — OBS is not connected`);
      return false;
    }
    try {
      await run(t);
      return true;
    } catch (error) {
      const why = error instanceof Error && error.message ? ` (${error.message})` : "";
      this.notice(`${label}: OBS did not apply it${why}`);
      // Put the controller back to what OBS really shows.
      void t.resync().catch(() => {});
      return false;
    }
  }

  private notice(message: string) {
    this.set({ notice: message });
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => this.set({ notice: null }), 3500);
  }

  // ---------------------------------------------------------------- mapping

  private camForScene(scene: string | null): CamIndex | null {
    if (!scene) return null;
    const index = this.state.config.camScenes.indexOf(scene);
    return index === -1 ? null : index;
  }

  sceneForCam(cam: CamIndex): string | null {
    return this.state.config.camScenes[cam] ?? null;
  }

  mapCam(cam: CamIndex, scene: string | null) {
    const camScenes = [...this.state.config.camScenes];
    camScenes[cam] = scene;
    this.updateConfig({ camScenes });
    this.set({
      program: this.camForScene(this.state.programScene),
      preview: this.camForScene(this.state.previewScene),
    });
  }

  autoMapScenes() {
    const scenes = this.state.scenes.filter((n) => n !== GFX_SCENE && n !== FX_SCENE).slice(0, CAM_COUNT);
    const camScenes = Array.from({ length: CAM_COUNT }, (_, i) => scenes[i] ?? null);
    this.updateConfig({ camScenes });
    this.set({
      program: this.camForScene(this.state.programScene),
      preview: this.camForScene(this.state.previewScene),
    });
  }

  // ------------------------------------------------------------- connection

  setConnectionSettings(patch: Pick<MkConfig, "host" | "port" | "password">) {
    this.updateConfig(patch);
  }

  async setDemoMode(demo: boolean) {
    this.updateConfig({ demoMode: demo });
    await this.teardown();
    this.set({ demo, program: null, preview: null, programScene: null, previewScene: null });
    if (demo) await this.connect();
  }

  async connect() {
    await this.teardown();
    this.fxHold = null;
    this.set({ fx: { running: false, layout: null } });
    const { demoMode, host, port, password } = this.state.config;
    if (!demoMode && !host) {
      this.set({ status: "error", statusMessage: "NO HOST CONFIGURED" });
      return;
    }
    let transport: Transport;
    if (demoMode) {
      transport = new DemoTransport();
    } else {
      const { ObsTransport } = await import("./obs-transport");
      transport = new ObsTransport({ host, port, password });
    }
    this.transport = transport;
    this.unsubscribeTransport = transport.subscribe(this.onTransportEvent);
    try {
      await transport.connect();
      // Demo has no OBS to read from; with real OBS the transport already mirrored its transition + time.
      if (demoMode) {
        await transport.setTransition(this.state.config.transition).catch(() => {});
        await transport.setTransitionDuration(this.state.config.transitionDuration).catch(() => {});
      }
      await this.syncDsks();
      await this.syncGfx();
    } catch {
      this.scheduleReconnect();
    }
  }

  /** Read the real on/off state of both DSK items from OBS. */
  private async syncDsks() {
    if (!this.transport || this.state.demo) return;
    const active = [...this.state.dskActive];
    for (let i = 0; i < DSK_COUNT; i++) {
      const target = this.state.config.dsks[i];
      if (!target?.source) continue;
      const scene = target.scene || this.state.programScene || "";
      const on = await this.transport.readDSK(i, scene, target.source);
      if (on !== null) active[i] = on;
    }
    this.set({ dskActive: active });
  }

  async disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    await this.teardown();
    this.set({
      status: "disconnected",
      statusMessage: "",
      audio: [],
      mainAudio: null,
      levels: {},
      stream: IDLE_OUTPUT,
      record: IDLE_OUTPUT,
    });
  }

  private async teardown() {
    this.stopAnim();
    this.unsubscribeTransport?.();
    this.unsubscribeTransport = null;
    if (this.transport) {
      await this.transport.disconnect().catch(() => {});
      this.transport = null;
    }
  }

  private scheduleReconnect() {
    if (this.state.config.demoMode) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, RECONNECT_DELAY);
  }

  private onTransportEvent = (event: TransportEvent) => {
    switch (event.type) {
      case "status": {
        this.set({ status: event.status, statusMessage: event.message ?? "" });
        if (event.status === "error") this.scheduleReconnect();
        break;
      }
      case "scenes":
        this.set({ scenes: event.scenes });
        break;
      case "transitions":
        this.set({ transitions: event.transitions });
        break;
      case "studioMode":
        this.set({ studioMode: event.enabled });
        break;
      case "programScene":
        // During an effect the real program is the helper "MK FX" scene; the engine keeps showing the cam.
        if (this.fxBusy()) break;
        this.set({
          programScene: event.scene,
          program: this.camForScene(event.scene),
        });
        this.applyAfv();
        // DSK set to "current program" reads a different item in every scene.
        if (this.state.config.dsks.some((d) => d.source && !d.scene)) void this.syncDsks();
        break;
      case "previewScene":
        this.set({
          previewScene: event.scene,
          preview: this.camForScene(event.scene),
        });
        break;
      case "transitionSettings": {
        // OBS is the source of truth for the selected transition + its time.
        const patch: Partial<MkConfig> = {};
        if (event.name && event.name !== this.state.config.transition) patch.transition = event.name;
        if (event.duration && event.duration !== this.state.config.transitionDuration) patch.transitionDuration = event.duration;
        if (Object.keys(patch).length) this.updateConfig(patch);
        break;
      }
      case "transition":
        // The transport reports when a transition ends (auto take, OBS itself).
        if (this.fxBusy()) break;
        if (!event.active && !this.tbarHeld) this.finishTransition();
        break;
      case "dsk": {
        const dskActive = [...this.state.dskActive];
        dskActive[event.index] = event.on;
        this.set({ dskActive });
        break;
      }
      case "gfx": {
        const id = gfxIdByName(event.name);
        if (id) this.set({ gfxActive: { ...this.state.gfxActive, [id]: event.on } });
        break;
      }
      case "audio":
        this.set({ audio: event.channels });
        if (this.state.config.limiter.on) void this.applyLimiter();
        break;
      case "limiter":
        this.set({ gr: event.gr });
        break;
      case "mainAudio":
        this.set({ mainAudio: event.name });
        break;
      case "audioChannel":
        this.set({
          audio: this.state.audio.map((c) =>
            c.name === event.name
              ? {
                  ...c,
                  db: event.db ?? c.db,
                  muted: event.muted ?? c.muted,
                  monitor: event.monitor ?? c.monitor,
                  stream: event.stream ?? c.stream,
                  pre: event.pre ?? c.pre,
                }
              : c,
          ),
        });
        break;
      case "levels":
        this.set({ levels: { ...this.state.levels, ...event.levels } });
        break;
      case "stream":
        this.set({ stream: this.mergeOutput(this.state.stream, event) });
        break;
      case "record":
        this.set({ record: this.mergeOutput(this.state.record, event) });
        break;
    }
  };

  // --------------------------------------------------------------- switching

  async selectPreview(cam: CamIndex) {
    if (this.state.fx.running) return;
    const scene = this.sceneForCam(cam);
    this.set({ preview: cam, previewScene: scene });
    if (!scene) return;
    const ok = await this.send("Preview", (t) => t.setPreviewScene(scene));
    if (!ok) return;
    // PiP / Merge held: the inset (right half) follows the preview bus live.
    if (this.state.fx.layout && this.fxHold && scene !== this.fxHold.a && scene !== this.fxHold.b) await this.fxRetarget(scene);
  }

  /** Direct-to-air override (program bus). */
  async selectProgram(cam: CamIndex) {
    if (this.fxGuard()) return;
    const scene = this.sceneForCam(cam);
    this.set({ program: cam, programScene: scene });
    this.applyAfv();
    if (!scene) return;
    await this.send("Program", (t) => t.setProgramScene(scene));
  }

  private mergeOutput(
    prev: OutputState,
    e: { active: boolean; paused?: boolean | undefined; durationMs?: number | undefined },
  ): OutputState {
    if (!e.active) return IDLE_OUTPUT;
    if (e.durationMs !== undefined) return toOutput(true, e.paused ?? false, e.durationMs);
    const elapsed = prev.baseMs + (prev.since ? Date.now() - prev.since : 0);
    return toOutput(true, e.paused ?? false, prev.active ? elapsed : 0);
  }

  // ------------------------------------------------------------------- audio

  async setAudioVolume(name: string, db: number) {
    const clamped = Math.min(FADER_MAX, Math.max(FADER_MIN, db));
    this.onTransportEvent({ type: "audioChannel", name, db: clamped });
    await this.transport?.setInputVolume(name, clamped).catch(() => {});
  }

  async toggleAudioMute(name: string) {
    const channel = this.state.audio.find((c) => c.name === name);
    if (!channel) return;
    this.onTransportEvent({ type: "audioChannel", name, muted: !channel.muted });
    await this.transport?.setInputMute(name, !channel.muted).catch(() => {});
  }

  /** Hear this input on the OBS PC's own headphones / monitoring device (on or off). */
  async cycleAudioMonitor(name: string) {
    const channel = this.state.audio.find((c) => c.name === name);
    if (!channel) return;
    const monitor: MonitorType = channel.monitor === "none" ? "monitorAndOutput" : "none";
    this.onTransportEvent({ type: "audioChannel", name, monitor });
    await this.transport?.setInputMonitor(name, monitor).catch(() => {});
  }

  /** Send / remove an input to the FINAL mix — YouTube + recording (audio track 1). */
  async toggleAudioStream(name: string) {
    const channel = this.state.audio.find((c) => c.name === name);
    if (!channel) return;
    this.onTransportEvent({ type: "audioChannel", name, stream: !channel.stream });
    await this.transport?.setInputStream(name, !channel.stream).catch(() => {});
    const { limiter } = this.state.config;
    if (limiter.on) await this.transport?.setLimiter([name], !channel.stream, limiter.threshold).catch(() => {});
  }

  // ---------------------------------------------------------------- limiter

  private limiterTimer: ReturnType<typeof setTimeout> | null = null;

  /** Push the limiter to every input that is on the final mix (and off the rest). */
  private async applyLimiter() {
    if (!this.transport) return;
    const { on, threshold } = this.state.config.limiter;
    const onMain = this.state.audio.filter((c) => c.stream).map((c) => c.name);
    const rest = this.state.audio.filter((c) => !c.stream).map((c) => c.name);
    await this.transport.setLimiter(onMain, on, threshold).catch(() => {});
    if (rest.length) await this.transport.setLimiter(rest, false, threshold).catch(() => {});
  }

  /** Master limiter on/off and ceiling. Ceiling changes are debounced while dragging. */
  setLimiter(patch: Partial<LimiterConfig>) {
    const prev = this.state.config.limiter;
    const limiter = { ...prev, ...patch };
    this.updateConfig({ limiter });
    if (!limiter.on) this.set({ gr: 0 });
    if (this.limiterTimer) clearTimeout(this.limiterTimer);
    this.limiterTimer = setTimeout(() => void this.applyLimiter(), prev.on === limiter.on ? 250 : 0);
  }

  /** MUTE OUT: silence the whole final mix, and bring back exactly what was live. */
  private masterHeld: string[] = [];

  async toggleMasterMute() {
    if (this.state.masterMuted) {
      const names = this.masterHeld;
      this.masterHeld = [];
      this.set({ masterMuted: false });
      for (const name of names) {
        this.onTransportEvent({ type: "audioChannel", name, muted: false });
        await this.transport?.setInputMute(name, false).catch(() => {});
      }
      return;
    }
    const live = this.state.audio.filter((c) => c.stream && !c.muted).map((c) => c.name);
    if (!live.length) return;
    this.masterHeld = live;
    this.set({ masterMuted: true });
    for (const name of live) {
      this.onTransportEvent({ type: "audioChannel", name, muted: true });
      await this.transport?.setInputMute(name, true).catch(() => {});
    }
  }

  /** Send / remove an input to the PRE-LISTEN mix (audio track 2, played by Listen). */
  async toggleAudioPre(name: string) {
    const channel = this.state.audio.find((c) => c.name === name);
    if (!channel) return;
    this.onTransportEvent({ type: "audioChannel", name, pre: !channel.pre });
    await this.transport?.setInputPre(name, !channel.pre).catch(() => {});
  }

  /** Hear the whole final mix in pre-listen: PRE on for every input that is on MAIN. */
  async hearFinalInPre(on: boolean) {
    for (const c of this.state.audio) {
      if (!c.stream || c.pre === on) continue;
      this.onTransportEvent({ type: "audioChannel", name: c.name, pre: on });
      await this.transport?.setInputPre(c.name, on).catch(() => {});
    }
  }

  setAudioFollowVideo(on: boolean) {
    this.updateConfig({ audioFollowVideo: on });
    this.applyAfv();
  }

  /** Cam index an audio input belongs to: matches a mapped scene name or "CAM n". */
  /** Replace the run-of-show checklist (add, tick, remove, clear). */
  setRundown(rundown: RundownItem[]) {
    this.updateConfig({ rundown: rundown.slice(0, 40) });
  }

  /** Take a strip off the mixer screen. The input keeps running in OBS and stays on the mix. */
  hideAudio(name: string) {
    if (this.state.config.hiddenAudio.includes(name)) return;
    this.updateConfig({ hiddenAudio: [...this.state.config.hiddenAudio, name] });
  }

  showAudio(name: string) {
    this.updateConfig({ hiddenAudio: this.state.config.hiddenAudio.filter((n) => n !== name) });
  }

  showAllAudio() {
    this.updateConfig({ hiddenAudio: [] });
  }

  audioCam(name: string): CamIndex | null {
    if (name === this.state.mainAudio) return null;
    const lower = name.toLowerCase();
    for (let i = 0; i < CAM_COUNT; i++) {
      const scene = this.state.config.camScenes[i];
      if (scene && lower === scene.toLowerCase()) return i;
      if (new RegExp(`^(cam|camera)\\s*${i + 1}\\b`).test(lower)) return i;
    }
    return null;
  }

  private applyAfv() {
    if (!this.state.config.audioFollowVideo) return;
    const program = this.state.program;
    for (const channel of this.state.audio) {
      const cam = this.audioCam(channel.name);
      if (cam === null) continue;
      const shouldMute = cam !== program;
      if (channel.muted !== shouldMute) {
        this.onTransportEvent({ type: "audioChannel", name: channel.name, muted: shouldMute });
        void this.transport?.setInputMute(channel.name, shouldMute).catch(() => {});
      }
    }
  }

  // ----------------------------------------------------------------- outputs

  async toggleStream() {
    const next = !this.state.stream.active;
    await this.transport?.setStreaming(next).catch(() => {});
  }

  async toggleRecord() {
    const next = !this.state.record.active;
    await this.transport?.setRecording(next).catch(() => {});
  }

  async toggleRecordPause() {
    if (!this.state.record.active) return;
    await this.transport?.setRecordPaused(!this.state.record.paused).catch(() => {});
  }

  // ------------------------------------------------------------- transitions

  private swapLocal() {
    const { program, preview, programScene, previewScene } = this.state;
    this.set({
      program: preview,
      preview: program,
      programScene: previewScene,
      previewScene: programScene,
    });
    this.applyAfv();
  }

  private stopAnim() {
    if (this.animTimer) clearInterval(this.animTimer);
    this.animTimer = null;
    if (this.tbarTimer) clearTimeout(this.tbarTimer);
    this.tbarTimer = null;
    this.tbarPending = null;
  }

  /** Transition finished: reset the T-bar and re-read authoritative scenes. */
  private finishTransition() {
    this.stopAnim();
    this.tbarHeld = false;
    this.set({ tBar: 0, transitioning: false });
    void this.transport?.resync().catch(() => {});
  }

  async cut() {
    if (this.fxGuard()) return;
    if (this.state.preview === null && !this.state.previewScene) return;
    this.stopAnim();
    this.tbarHeld = false;
    this.set({ tBar: 0, transitioning: false });
    this.swapLocal();
    await this.send("Cut", (t) => t.performCut());
    setTimeout(() => void this.transport?.resync().catch(() => {}), 200);
  }

  async autoTake() {
    if (this.fxGuard()) return;
    if (this.state.preview === null && !this.state.previewScene) return;
    if (this.state.transitioning) return;
    const isCut = this.state.config.transition === "Cut";
    const ms = isCut ? 0 : this.state.config.transitionDuration;
    this.set({ transitioning: true, tBar: 0 });
    if (ms > 0) {
      // Animate the T-bar over the transition so the UI mirrors what OBS does.
      const start = performance.now();
      this.animTimer = setInterval(() => {
        const t = Math.min(1, (performance.now() - start) / ms);
        this.set({ tBar: t });
        if (t >= 1 && this.animTimer) {
          clearInterval(this.animTimer);
          this.animTimer = null;
          // Fallback in case the transport never reports the end of the transition.
          setTimeout(() => {
            if (this.state.transitioning) this.finishTransition();
          }, 400);
        }
      }, 33);
    }
    const sent = await this.send("Auto take", (t) => t.performAutoTake());
    if (!sent) this.finishTransition();
    if (ms === 0) this.finishTransition();
  }

  private flushTBar = () => {
    this.tbarTimer = null;
    if (this.tbarPending === null) return;
    const position = this.tbarPending;
    this.tbarPending = null;
    void this.transport?.setTBarPosition(position, false).catch(() => {});
  };

  /** Manual T-bar. `release` is true on pointer-up. */
  setTBar(position: number, release = false) {
    if (this.fxGuard()) return;
    const p = Math.min(1, Math.max(0, position));
    if (!release) {
      this.tbarHeld = true;
      this.set({ tBar: p, transitioning: p > 0 && p < 1 });
      this.tbarPending = p;
      if (!this.tbarTimer) this.tbarTimer = setTimeout(this.flushTBar, TBAR_SEND_INTERVAL);
      return;
    }
    // Release: flush anything pending, then snap to an end stop when close.
    if (this.tbarTimer) clearTimeout(this.tbarTimer);
    this.tbarTimer = null;
    this.tbarPending = null;
    if (p >= 1) {
      const oldProgram = this.state.programScene;
      const oldPreview = this.state.previewScene;
      this.set({ tBar: 1, transitioning: true });
      void (async () => {
        const t = this.transport;
        await t?.setTBarPosition(1, true).catch(() => {});
        if (t && !this.state.demo) {
          await new Promise((r) => setTimeout(r, 500));
          const now = await t.getCurrentProgramScene().catch(() => null);
          // OBS ignored the T-bar completion → perform the take ourselves.
          if (now && oldProgram && oldPreview && now === oldProgram && oldPreview !== oldProgram) {
            await t.setTBarPosition(0, true).catch(() => {});
            await t.setProgramScene(oldPreview).catch(() => {});
            await t.setPreviewScene(oldProgram).catch(() => {});
          }
        }
        this.tbarHeld = false;
        this.finishTransition();
      })();
    } else if (p <= 0) {
      void this.transport?.setTBarPosition(0, true).catch(() => {});
      this.tbarHeld = false;
      this.set({ tBar: 0, transitioning: false });
    } else {
      // Left mid-way (like a hardware lever): keep the position, keep holding.
      this.set({ tBar: p, transitioning: true });
      void this.transport?.setTBarPosition(p, false).catch(() => {});
    }
  }

  // ------------------------------------------------------- picture effects
  // Squeeze / PiP / Merge run in OBS's helper scene "MK FX" (see fx.ts): program is cut to it, the
  // nested camera scenes are animated, then program is cut to the real cam scene (identical picture).

  private fxBusy() {
    return this.state.fx.running || this.state.fx.layout !== null;
  }

  /** True when the console must ignore a switching action (and says why when it is a held layout). */
  private fxGuard() {
    if (this.state.fx.running) return true;
    if (this.state.fx.layout) {
      this.notice(`Close ${this.state.fx.layout.toUpperCase()} first`);
      return true;
    }
    return false;
  }

  /** Effects need two different mapped cams: PGM and PVW. */
  private fxScenes(): { a: string; b: string } | null {
    if (!this.transport) {
      this.notice("Not connected");
      return null;
    }
    const a = this.state.programScene;
    const b = this.state.previewScene;
    if (!a || !b || a === b || this.camForScene(a) === null || this.camForScene(b) === null) {
      this.notice("Effects need two different mapped cams: one on PGM, one on PVW");
      return null;
    }
    return { a, b };
  }

  private fxCams() {
    return this.state.config.camScenes.filter((s): s is string => !!s);
  }

  private fxLayoutFrame(kind: FxLayoutKind, t: number, w: number, h: number): FxPair {
    const { pipCorner, pipSize } = this.state.config.fx;
    return kind === "pip" ? pipFrame(pipCorner, pipSize, t, w, h) : mergeFrame(t, w, h);
  }

  private async fxDraw(pair: { a: string; b: string }, frame: FxPair) {
    const all: Record<string, FxRect | null> = {};
    for (const cam of this.fxCams()) all[cam] = null;
    all[pair.a] = frame.a;
    all[pair.b] = frame.b;
    await this.transport?.fxFrame(all);
  }

  /** Runs `draw` from 0 to 1 over `ms`. Each frame waits for OBS to confirm the last one, so it never piles up. */
  private async fxAnimate(ms: number, draw: (eased: number) => Promise<void>, onRaw?: (raw: number) => void) {
    const start = performance.now();
    for (;;) {
      const raw = Math.min(1, (performance.now() - start) / Math.max(1, ms));
      onRaw?.(raw);
      await draw(ease(raw));
      if (raw >= 1) return;
      await new Promise((r) => setTimeout(r, 12));
    }
  }

  private fxLeave() {
    setTimeout(() => void this.transport?.resync().catch(() => {}), 200);
  }

  /** Squeeze: the PGM picture is squeezed away, the PVW picture squeezes in. Ends with PVW on air (like a take). */
  async squeeze() {
    if (this.fxGuard()) return;
    const pair = this.fxScenes();
    const t = this.transport;
    if (!pair || !t) return;
    const dir = this.state.config.fx.squeezeDir;
    const ms = Math.max(250, this.state.config.transitionDuration);
    this.set({ fx: { running: true, layout: null }, transitioning: true, tBar: 0 });
    let onAir = false;
    try {
      const { width: W, height: H } = await t.fxStage(this.fxCams(), pair.a, pair.b);
      await this.fxDraw(pair, squeezeFrame(dir, 0, W, H));
      await t.fxCutTo(FX_SCENE);
      onAir = true;
      await this.fxAnimate(
        ms,
        (e) => this.fxDraw(pair, squeezeFrame(dir, e, W, H)),
        (raw) => this.set({ tBar: raw }),
      );
      await this.fxDraw(pair, squeezeFrame(dir, 1, W, H));
      await t.fxCutTo(pair.b);
      onAir = false;
      await t.setPreviewScene(pair.a).catch(() => {});
      this.swapLocal();
    } catch {
      this.notice("Squeeze failed — check OBS");
      if (onAir) await t.fxCutTo(pair.a).catch(() => {});
    } finally {
      this.set({ fx: { running: false, layout: null }, tBar: 0, transitioning: false });
      this.fxLeave();
    }
  }

  /** PiP / Merge: tap to bring it on (PVW cam as inset / right half over PGM), tap again to take it off. */
  async toggleLayout(kind: FxLayoutKind) {
    const { running, layout } = this.state.fx;
    if (running) return;
    if (layout === kind) return this.closeLayout();
    if (layout) {
      this.notice(`Close ${layout.toUpperCase()} first`);
      return;
    }
    const pair = this.fxScenes();
    const t = this.transport;
    if (!pair || !t) return;
    const ms = Math.max(250, this.state.config.transitionDuration);
    this.set({ fx: { running: true, layout: null } });
    let onAir = false;
    try {
      const { width: w, height: h } = await t.fxStage(this.fxCams(), pair.a, pair.b);
      await this.fxDraw(pair, this.fxLayoutFrame(kind, 0, w, h));
      await t.fxCutTo(FX_SCENE);
      onAir = true;
      await this.fxAnimate(ms, (e) => this.fxDraw(pair, this.fxLayoutFrame(kind, e, w, h)));
      this.fxHold = { ...pair, w, h };
      this.set({ fx: { running: false, layout: kind } });
    } catch {
      this.notice(`${kind.toUpperCase()} failed — check OBS`);
      if (onAir) await t.fxCutTo(pair.a).catch(() => {});
      this.fxHold = null;
      this.set({ fx: { running: false, layout: null } });
      this.fxLeave();
    }
  }

  private async closeLayout() {
    const kind = this.state.fx.layout;
    const hold = this.fxHold;
    const t = this.transport;
    if (!kind || !hold || !t) {
      this.fxHold = null;
      this.set({ fx: { running: false, layout: null } });
      return;
    }
    const ms = Math.max(250, this.state.config.transitionDuration);
    this.set({ fx: { running: true, layout: kind } });
    try {
      await this.fxAnimate(ms, (e) => this.fxDraw(hold, this.fxLayoutFrame(kind, 1 - e, hold.w, hold.h)));
      await this.fxDraw(hold, this.fxLayoutFrame(kind, 0, hold.w, hold.h));
      await t.fxCutTo(hold.a);
    } catch {
      this.notice("Could not close the effect cleanly — pick a cam on PGM");
      await t.fxCutTo(hold.a).catch(() => {});
    } finally {
      this.fxHold = null;
      this.set({ fx: { running: false, layout: null } });
      this.fxLeave();
    }
  }

  /** Swap which cam is the inset / right half while PiP / Merge is held. */
  private async fxRetarget(scene: string) {
    const hold = this.fxHold;
    const kind = this.state.fx.layout;
    const t = this.transport;
    if (!hold || !kind || !t) return;
    this.fxHold = { ...hold, b: scene };
    try {
      await t.fxStage(this.fxCams(), hold.a, scene);
      await this.fxDraw({ a: hold.a, b: scene }, this.fxLayoutFrame(kind, 1, hold.w, hold.h));
    } catch {
      this.notice("Could not change the inset cam");
    }
  }

  setFx(patch: Partial<FxConfig>) {
    this.updateConfig({ fx: { ...this.state.config.fx, ...patch } });
  }

  // --------------------------------------------------------------------- DSK

  async toggleDSK(index: number) {
    const target = this.state.config.dsks[index];
    if (!target || (!target.source && !this.state.demo)) {
      this.notice(`DSK ${index + 1}: set a source in Settings → DSK`);
      return;
    }
    if (!this.transport) {
      this.notice("Not connected");
      return;
    }
    const scene = target.scene || this.state.programScene || "";
    if (!scene) {
      this.notice(`DSK ${index + 1}: no scene on air yet`);
      return;
    }
    const next = !this.state.dskActive[index];
    const previous = this.state.dskActive[index];
    const dskActive = [...this.state.dskActive];
    dskActive[index] = next;
    this.set({ dskActive });
    try {
      await this.transport.toggleDSK(index, !!next, scene, target.source || `DSK ${index + 1}`);
    } catch {
      // Roll back the light if OBS rejected it (wrong scene / source name).
      const rollback = [...this.state.dskActive];
      rollback[index] = !!previous;
      this.set({ dskActive: rollback });
      this.notice(`DSK ${index + 1}: "${target.source}" not found in "${scene}"`);
    }
  }

  // ---------------------------------------------------------------- settings

  async setTransition(name: string) {
    this.updateConfig({ transition: name });
    await this.send("Transition", (t) => t.setTransition(name));
  }

  async setTransitionDuration(ms: number) {
    this.updateConfig({ transitionDuration: ms });
    await this.send("Transition time", (t) => t.setTransitionDuration(ms));
  }

  setDskTarget(index: number, patch: Partial<DskTarget>) {
    const dsks = this.state.config.dsks.map((d, i) => (i === index ? { ...d, ...patch } : d));
    this.updateConfig({ dsks });
  }

  setShortcuts(shortcuts: MkConfig["shortcuts"]) {
    this.updateConfig({ shortcuts });
  }

  setAutoConnect(autoConnect: boolean) {
    this.updateConfig({ autoConnect });
  }

  // ---------------------------------------------------------------- graphics
  // Built-in graphics are separate from the DSKs: each layer has its own
  // on/off, its own content, and its own OBS browser source.

  private gfxTimers: Partial<Record<GfxId, ReturnType<typeof setTimeout>>> = {};

  private async syncGfx() {
    if (!this.transport || this.state.demo) return;
    const found = await this.transport.readGraphics(GFX_LAYERS.map((l) => l.name)).catch(() => ({}));
    const next = { ...this.state.gfxActive };
    for (const layer of GFX_LAYERS) {
      const on = (found as Record<string, boolean>)[layer.name];
      if (on !== undefined) next[layer.id] = on;
    }
    this.set({ gfxActive: next });
  }

  /** Edit one layer's content / style. Live-updates OBS when the layer exists. */
  setGraphic<K extends GfxId>(id: K, patch: Partial<GraphicsConfig[K]>) {
    const g = this.state.config.graphics;
    this.updateConfig({ graphics: { ...g, [id]: { ...g[id], ...patch } } as GraphicsConfig });
    if (!this.transport || this.state.demo) return;
    const pending = this.gfxTimers[id];
    if (pending) clearTimeout(pending);
    this.gfxTimers[id] = setTimeout(() => {
      const url = layerUrl(id, this.state.config.graphics);
      void this.transport?.updateGraphic(gfxName(id), url).catch(() => {});
    }, 400);
  }

  /** Take a graphics layer to air / off air. */
  async toggleGraphic(id: GfxId) {
    if (!this.transport) {
      this.notice("Not connected");
      return;
    }
    if (id === "ticker") this.cancelScrollTimer();
    const next = !this.state.gfxActive[id];
    this.set({ gfxActive: { ...this.state.gfxActive, [id]: next } });
    try {
      await this.transport.setGraphicVisible(gfxName(id), next);
    } catch {
      this.set({ gfxActive: { ...this.state.gfxActive, [id]: !next } });
      this.notice("Graphics not set up in OBS yet — Settings → Graphics → Set up");
    }
  }

  private scrollRun = 0;
  private scrollTimer: ReturnType<typeof setTimeout> | null = null;

  /** A manual ticker toggle cancels any pending "run once, then off" timer. */
  private cancelScrollTimer() {
    this.scrollRun++;
    if (this.scrollTimer) clearTimeout(this.scrollTimer);
    this.scrollTimer = null;
  }

  /**
   * Fire a ready-made scroll: load it into the ticker and take it to air.
   * If the ticker is already up it is taken down and brought back so the message restarts.
   * A "once" scroll takes itself off air when it has crossed the screen.
   */
  async playScroll(index: number) {
    const preset = this.state.config.graphics.ticker.scrolls[index];
    if (preset) await this.runScroll(preset);
  }

  /** Send a typed message on air using the ticker's current label, pace and direction. */
  async playText(text: string) {
    const { ticker } = this.state.config.graphics;
    const clean = text.trim().slice(0, 400);
    if (!clean) return;
    await this.runScroll({ name: clean.slice(0, 24), text: clean, label: ticker.label, speed: ticker.speed, direction: ticker.direction, loop: ticker.loop });
  }

  private async runScroll(preset: ScrollPreset) {
    if (!this.transport) {
      this.notice("Not connected");
      return;
    }
    this.cancelScrollTimer();
    const run = this.scrollRun;
    const g = this.state.config.graphics;
    this.updateConfig({
      graphics: {
        ...g,
        ticker: { ...g.ticker, text: preset.text, label: preset.label, speed: preset.speed, direction: preset.direction, loop: preset.loop },
      },
    });
    const pending = this.gfxTimers.ticker;
    if (pending) clearTimeout(pending);
    const name = gfxName("ticker");
    try {
      if (this.state.gfxActive.ticker) {
        this.set({ gfxActive: { ...this.state.gfxActive, ticker: false } });
        await this.transport.setGraphicVisible(name, false).catch(() => {});
        await new Promise((r) => setTimeout(r, 200));
      }
      if (!this.state.demo) await this.transport.updateGraphic(name, layerUrl("ticker", this.state.config.graphics));
      if (run !== this.scrollRun) return;
      await this.transport.setGraphicVisible(name, true);
      this.set({ gfxActive: { ...this.state.gfxActive, ticker: true } });
    } catch {
      this.notice("Graphics not set up in OBS yet — Settings → Graphics → Set up");
      return;
    }
    if (!preset.loop) {
      this.scrollTimer = setTimeout(() => {
        if (run === this.scrollRun && this.state.gfxActive.ticker) void this.toggleGraphic("ticker");
      }, (preset.speed + 1.4) * 1000);
    }
  }

  /** Save what the ticker is set to right now as a ready-made scroll. */
  addScroll(name?: string) {
    const { ticker } = this.state.config.graphics;
    if (!ticker.text.trim() || ticker.scrolls.length >= 12) return;
    const label = (name ?? ticker.text).trim().slice(0, 24);
    this.updateConfig({
      graphics: {
        ...this.state.config.graphics,
        ticker: {
          ...ticker,
          scrolls: [
            ...ticker.scrolls,
            { name: label, text: ticker.text, label: ticker.label, speed: ticker.speed, direction: ticker.direction, loop: ticker.loop },
          ],
        },
      },
    });
  }

  removeScroll(index: number) {
    const { ticker } = this.state.config.graphics;
    this.updateConfig({
      graphics: { ...this.state.config.graphics, ticker: { ...ticker, scrolls: ticker.scrolls.filter((_, i) => i !== index) } },
    });
  }

  /** Load a saved design from the library into its layer (it stays off air until you take it). */
  loadSavedGraphic(item: SavedGraphic) {
    if (item.layer === "ticker") {
      // A saved look must not wipe the operator's own scroll list.
      const keep = this.state.config.graphics.ticker.scrolls;
      this.setGraphic("ticker", { ...(item.data as GraphicsConfig["ticker"]), scrolls: keep });
      this.notice(`Loaded "${item.name}"`);
      return;
    }
    this.setGraphic(item.layer, item.data as never);
    this.notice(`Loaded "${item.name}"`);
  }

  applyLowerPreset(index: number) {
    const preset = this.state.config.graphics.lower.presets[index];
    if (preset) this.setGraphic("lower", { name: preset.name, title: preset.title });
  }

  addLowerPreset() {
    const { lower } = this.state.config.graphics;
    if (!lower.name.trim() || lower.presets.length >= 12) return;
    this.setGraphic("lower", { presets: [...lower.presets, { name: lower.name, title: lower.title }] });
  }

  removeLowerPreset(index: number) {
    const { lower } = this.state.config.graphics;
    this.setGraphic("lower", { presets: lower.presets.filter((_, i) => i !== index) });
  }

  /**
   * Save the graphics page: store the design, then push every layer to OBS.
   * The MK Graphics scene is nested into `scene` ONLY — never into other scenes.
   * DSK 1 / DSK 2 are left exactly as configured.
   */
  async saveGraphics(graphics: GraphicsConfig, scene: string, cleanOthers = false) {
    this.updateConfig({ graphics, graphicsScene: scene });
    if (this.state.demo) {
      this.notice("Graphics saved");
      return;
    }
    if (!this.transport) {
      this.notice("Saved — connect to OBS to apply");
      return;
    }
    this.notice("Saving graphics to OBS…");
    try {
      const others = cleanOthers ? this.state.scenes : [];
      await this.transport.syncGraphics(
        scene ? [scene] : [],
        GFX_LAYERS.map((l) => ({ name: l.name, url: layerUrl(l.id, graphics) })),
        others,
      );
      await this.syncGfx();
      this.notice(scene ? `Graphics saved — added to "${scene}" only` : "Graphics saved");
    } catch (error) {
      this.notice(`Graphics save failed: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  // ------------------------------------------------------------------ sounds

  /** Send a clip to OBS on the scene that is on air now. Returns true if it started. */
  async airSound(dataUrl: string): Promise<boolean> {
    if (this.state.demo) {
      this.notice("Demo: the sound would play on air");
      return true;
    }
    if (!this.transport) {
      this.notice("Not connected to OBS — CUE still works");
      return false;
    }
    const scene = this.state.programScene;
    if (!scene) {
      this.notice("No scene on air yet");
      return false;
    }
    try {
      await this.transport.playSound(scene, dataUrl);
      return true;
    } catch (error) {
      this.notice(`Sound failed: ${error instanceof Error ? error.message : "unknown error"}`);
      return false;
    }
  }

  async stopAirSound() {
    await this.transport?.stopSound().catch(() => {});
  }

  setListen(patch: Partial<Pick<MkConfig, "listenUrl" | "listenVolume">>) {
    this.updateConfig(patch);
  }

  setLiveVideo(liveVideo: boolean) {
    this.updateConfig({ liveVideo });
  }

  setMonitorFps(monitorFps: number) {
    this.updateConfig({ monitorFps });
  }

  // ---------------------------------------------------------- monitor video

  getSceneItems = async (scene: string): Promise<string[]> => {
    if (!this.transport) return [];
    return this.transport.getSceneItems(scene).catch(() => []);
  };

  /** Real video frame (JPEG data-URI) for a scene. Stable reference for hooks. */
  /** Small snapshot for the camera wall thumbnails. */
  getThumb = async (scene: string): Promise<string | null> => {
    if (!this.transport) return null;
    return this.transport.getScreenshot(scene, 320, 180).catch(() => null);
  };

  getScreenshot = async (scene: string): Promise<string | null> => {
    if (!this.transport) return null;
    return this.transport.getScreenshot(scene, MONITOR_W, MONITOR_H).catch(() => null);
  };
}

export const engine = new SwitcherEngine();
