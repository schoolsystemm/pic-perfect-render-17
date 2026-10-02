// MK VISION CONTROL ENGINE
// All switching logic lives here — never inside buttons. The UI only calls
// engine actions and renders engine state, so a hardware panel can drive the
// exact same functions later.
import { loadConfig, saveConfig } from "./config";
import { DemoTransport } from "./demo-transport";
import {
  FULL_RECT,
  FX_SCENE,
  LIVE_BUSES,
  PIP_SCENES,
  adEase,
  ease,
  isLiveBus,
  isStage,
  frameRest,
  frameTargets,
  lerpRect,
  mergeFrame,
  moveFrame,
  pipAt,
  pipFrame,
  pipRect,
  placeIn,
  sqmRest,
  sqmTargets,
  squeezeFrame,
  type AdConfig,
  type AdStyle,
  type FxConfig,
  type FxLayoutKind,
  type FxPair,
  type FxRect,
  type PipSlot,
  type SqueezeDir,
} from "./fx";
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
  IDLE_LIVE,
  IDLE_OUTPUT,
  type CamIndex,
  type DskTarget,
  type GfxId,
  type GraphicsConfig,
  type LimiterConfig,
  type LiveState,
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
    live: IDLE_LIVE,
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
  /** While OBS program is an MK LIVE bus: which cam scene each bus shows, and the canvas size. */
  private live: { mains: Record<string, string>; w: number; h: number } | null = null;
  private recovering = false;

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
    this.live = null;
    this.recovering = false;
    this.set({ fx: { running: false, layout: null }, live: IDLE_LIVE });
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
        this.set({ scenes: event.scenes.filter((n) => !isLiveBus(n) && !isStage(n) && !(PIP_SCENES as string[]).includes(n)) });
        break;
      case "transitions":
        this.set({ transitions: event.transitions });
        break;
      case "studioMode":
        this.set({ studioMode: event.enabled });
        break;
      case "programScene":
        // During an effect the real program is the helper "MK FX" scene; the engine keeps showing the cam.
        // OBS left a held Merge on its own (operator switched scene in OBS): drop the lamp.
        if (this.state.fx.layout && !this.state.fx.running && event.scene !== FX_SCENE) {
          this.fxHold = null;
          this.set({ fx: { running: false, layout: null } });
        }
        if (this.fxBusy()) break;
        if (this.live) {
          const main = this.live.mains[event.scene];
          if (main) {
            this.setLive({ progBus: event.scene, previewBus: this.otherBus(event.scene) });
            this.set({ programScene: main, program: this.camForScene(main) });
            this.applyAfv();
            if (this.state.config.dsks.some((d) => d.source && !d.scene)) void this.syncDsks();
            break;
          }
          // OBS itself left the live buses (operator picked a plain scene in OBS): follow it.
          this.live = null;
          this.setLive(IDLE_LIVE);
        } else if (isLiveBus(event.scene)) {
          // OBS is already on a live bus (controller reconnected / reloaded): rebuild the live state from OBS.
          void this.recoverLive(event.scene);
          break;
        }
        this.set({
          programScene: event.scene,
          program: this.camForScene(event.scene),
        });
        this.applyAfv();
        // DSK set to "current program" reads a different item in every scene.
        if (this.state.config.dsks.some((d) => d.source && !d.scene)) void this.syncDsks();
        break;
      case "previewScene":
        if (this.live) {
          const main = this.live.mains[event.scene];
          if (main) {
            this.setLive({ previewBus: event.scene });
            this.set({ previewScene: main, preview: this.camForScene(main) });
          } else if (!this.state.fx.running && this.camForScene(event.scene) !== null) {
            // A plain scene was picked as preview inside OBS: route it into the free live bus so PIPs stay on.
            void this.liveRetarget(event.scene);
          }
          break;
        }
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
      case "liveItem": {
        if (!this.live || this.state.fx.running || event.scene !== this.progBus()) break;
        const slot = (PIP_SCENES as string[]).indexOf(event.source);
        if (slot >= 0) {
          const pip = [...this.state.live.pip];
          pip[slot] = event.on;
          this.setLive({ pip });
        } else if (event.source === this.state.config.ad.scene) {
          this.setLive({ sqm: event.on });
        }
        break;
      }
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
    if (this.live) {
      await this.liveRetarget(scene);
      return;
    }
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
    if (this.live) {
      // PIPs / ad stay up: swap the main picture inside the program bus (hard cut).
      const live = this.live;
      const bus = this.progBus();
      await this.send("Program", async (t) => {
        live.mains[bus] = scene;
        await t.fxStage(this.fxCams(), scene, scene, bus);
        await this.liveDrawMain(bus, scene);
      });
      return;
    }
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

  private async fxDraw(pair: { a: string; b: string }, frame: FxPair, bus?: string, place?: FxRect) {
    const all: Record<string, FxRect | null> = {};
    for (const cam of this.fxCams()) all[cam] = null;
    const put = (r: FxRect | null) => (r && place ? placeIn(r, place) : r);
    all[pair.a] = put(frame.a);
    all[pair.b] = put(frame.b);
    await this.transport?.fxFrame(all, bus);
  }

  /** Runs `draw` from 0 to 1 over `ms`. Each frame waits for OBS to confirm the last one, so it never piles up. */
  private async fxAnimate(ms: number, draw: (eased: number) => Promise<void>, onRaw?: (raw: number) => void, easing: (t: number) => number = ease) {
    const start = performance.now();
    for (;;) {
      const raw = Math.min(1, (performance.now() - start) / Math.max(1, ms));
      onRaw?.(raw);
      await draw(easing(raw));
      if (raw >= 1) return;
      await new Promise((r) => setTimeout(r, 12));
    }
  }

  private fxLeave() {
    setTimeout(() => void this.transport?.resync().catch(() => {}), 200);
  }

  /** Squeeze: the PGM picture is squeezed away, the PVW picture squeezes in. Ends with PVW on air (like a take). */
  async squeeze() {
    const dir = this.state.config.fx.squeezeDir;
    await this.pairEffect("Squeeze", (e, W, H) => squeezeFrame(dir, e, W, H));
  }

  /** Move: the PGM picture is pushed off the screen and the PVW picture slides in. Ends with PVW on air. */
  async moveTake(dir: SqueezeDir) {
    await this.pairEffect("Move", (e, W, H) => moveFrame(dir, e, W, H));
  }

  /**
   * One PGM -> PVW picture effect, driven frame by frame on real OBS scene items. With PIP / Squeeze Merge
   * up it runs INSIDE the live bus, so PIPs and the advertisement never blink; otherwise in "MK FX".
   */
  private async pairEffect(label: string, at: (t: number, W: number, H: number) => FxPair) {
    if (this.fxGuard()) return;
    const pair = this.fxScenes();
    const t = this.transport;
    if (!pair || !t) return;
    const ms = Math.max(250, this.state.config.transitionDuration);
    this.set({ fx: { running: true, layout: null }, transitioning: true, tBar: 0 });
    const live = this.live;
    const bus = live ? this.progBus() : undefined;
    let onAir = false;
    try {
      if (live && bus) {
        const { width: W, height: H } = await t.fxStage(this.fxCams(), pair.a, pair.b, bus);
        const region = this.mainRegion();
        const draw = (e: number) => this.fxDraw(pair, at(e, W, H), bus, region);
        await draw(0);
        await this.fxAnimate(ms, draw, (raw) => this.set({ tBar: raw }));
        await draw(1);
        live.mains[bus] = pair.b;
        const free = this.otherBus(bus);
        live.mains[free] = pair.a;
        await t.fxStage(this.fxCams(), pair.a, pair.a, free);
        await this.liveDrawMain(free, pair.a);
        this.swapLocal();
      } else {
        const { width: W, height: H } = await t.fxStage(this.fxCams(), pair.a, pair.b);
        await this.fxDraw(pair, at(0, W, H));
        await t.fxCutTo(FX_SCENE);
        onAir = true;
        await this.fxAnimate(
          ms,
          (e) => this.fxDraw(pair, at(e, W, H)),
          (raw) => this.set({ tBar: raw }),
        );
        await this.fxDraw(pair, at(1, W, H));
        await t.fxCutTo(pair.b);
        onAir = false;
        await t.setPreviewScene(pair.a).catch(() => {});
        this.swapLocal();
      }
    } catch (error) {
      const why = error instanceof Error && error.message ? ` (${error.message})` : "";
      this.notice(`${label} failed — check OBS${why}`);
      if (live && bus) await this.liveDrawMain(bus, live.mains[bus] ?? pair.a).catch(() => {});
      else if (onAir) await t.fxCutTo(pair.a).catch(() => {});
    } finally {
      this.set({ fx: { running: false, layout: null }, tBar: 0, transitioning: false });
      this.fxLeave();
    }
  }

  /** PiP / Merge: tap to bring it on (PVW cam as inset / right half over PGM), tap again to take it off. */
  async toggleLayout(kind: FxLayoutKind) {
    const { running, layout } = this.state.fx;
    if (running) return;
    if (this.live) {
      this.notice("Turn off PIP 1 / PIP 2 / SQZ MERGE first, then use MERGE");
      return;
    }
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
      // The lamp only lights when OBS really is on the merge scene (read back, not assumed).
      const real = await t.getCurrentProgramScene().catch(() => null);
      if (real !== FX_SCENE) throw new Error("OBS is not on the merge scene");
      this.fxHold = { ...pair, w, h };
      this.set({ fx: { running: false, layout: kind } });
    } catch {
      this.notice(`${kind.toUpperCase()} did not reach OBS — check the OBS connection`);
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

  // ------------------------------------------------------------ live compositor
  // Persistent PIP 1 / PIP 2, Squeeze Merge and the advertisement. Everything is real OBS scene items in the
  // MK LIVE A / MK LIVE B buses (see fx.ts); each action is read back from OBS before the lamp stays lit.

  private setLive(patch: Partial<LiveState>) {
    this.set({ live: { ...this.state.live, ...patch } });
  }

  private progBus(): string {
    return this.state.live.progBus ?? LIVE_BUSES[0];
  }

  private otherBus(bus: string): string {
    return bus === LIVE_BUSES[0] ? LIVE_BUSES[1] : LIVE_BUSES[0];
  }

  private adTargets(cfg: AdConfig = this.state.config.ad) {
    const { w, h } = this.live ?? { w: 1920, h: 1080 };
    const fill = cfg.fit === "fill";
    const end = cfg.look === "frame" ? frameTargets(cfg.anchor, cfg.size, w, h) : sqmTargets(cfg.layout, cfg.size, w, h);
    const rest = cfg.look === "frame" ? frameRest(w, h) : sqmRest(cfg.layout, cfg.size, w, h);
    return { end: { main: end.main, ad: { ...end.ad, fill } }, rest: { main: rest.main, ad: { ...rest.ad, fill } } };
  }

  /** Items that must sit UNDER the cams: the full-screen advertisement of the frame look. */
  private adUnder(): string[] {
    const ad = this.state.config.ad;
    return ad.scene && ad.look === "frame" ? [ad.scene] : [];
  }

  /** Runs an advertisement move in the chosen style ("cut" = no animation, straight to the end). */
  private async adAnimate(ms: number, style: AdStyle, draw: (e: number) => Promise<void>, onRaw?: (raw: number) => void) {
    if (style === "cut") {
      onRaw?.(1);
      await draw(1);
      return;
    }
    await this.fxAnimate(ms, draw, onRaw, adEase(style));
  }

  /** Where the program picture sits right now: full screen, or squeezed while the advertisement is in. */
  private mainRegion(): FxRect {
    return this.state.live.sqm && this.live ? this.adTargets().end.main : FULL_RECT;
  }

  /** Item names that live above the cams in every bus: advertisement first (lowest), then PIP 1, PIP 2. */
  private overlaySources(): string[] {
    const ad = this.state.config.ad.scene;
    return [...(ad ? [ad] : []), ...PIP_SCENES];
  }

  private async liveDrawMain(bus: string, cam: string, region: FxRect = this.mainRegion()) {
    const frame: Record<string, FxRect | null> = {};
    for (const c of this.fxCams()) frame[c] = c === cam ? region : null;
    await this.transport?.fxFrame(frame, bus);
  }

  /** Final (resting) PIP / ad placement in one bus. */
  private async liveDrawOverlays(bus: string) {
    const live = this.live;
    if (!live) return;
    const { pips, ad } = this.state.config;
    const frame: Record<string, FxRect | null> = {};
    pips.forEach((p, i) => {
      frame[PIP_SCENES[i]!] = this.state.live.pip[i] ? pipRect(p.corner, p.size, live.w, live.h) : null;
    });
    if (ad.scene) frame[ad.scene] = this.state.live.sqm ? this.adTargets().end.ad : null;
    await this.transport?.fxFrame(frame, bus);
  }

  /** The bus that is NOT on air must look exactly like the one that is (same overlays, same layout). */
  private async liveSyncFree() {
    const live = this.live;
    if (!live) return;
    const free = this.otherBus(this.progBus());
    const main = live.mains[free];
    if (main) await this.liveDrawMain(free, main);
    await this.liveDrawOverlays(free);
  }

  /** Put a plain cam scene on the preview bus (PIPs / ad stay up through the next take). */
  private async liveRetarget(scene: string) {
    const live = this.live;
    const t = this.transport;
    if (!live || !t) return;
    const free = this.otherBus(this.progBus());
    this.set({ preview: this.camForScene(scene), previewScene: scene });
    try {
      live.mains[free] = scene;
      await t.fxStage(this.fxCams(), scene, scene, free);
      await this.liveDrawMain(free, scene);
      await t.setPreviewScene(free);
    } catch (error) {
      const why = error instanceof Error && error.message ? ` (${error.message})` : "";
      this.notice(`Preview: OBS did not apply it${why}`);
      void t.resync().catch(() => {});
    }
  }

  /** Switch OBS program to the live bus showing the current PGM cam (identical picture), preview to the other bus. */
  private async enterLive(): Promise<boolean> {
    const t = this.transport;
    if (!t || this.state.status !== "connected") {
      this.notice("Not sent — OBS is not connected");
      return false;
    }
    const prog = this.state.programScene;
    if (!prog || this.camForScene(prog) === null) {
      this.notice("PIP / Squeeze Merge need a mapped cam on PGM");
      return false;
    }
    const pv = this.state.previewScene;
    const prev = pv && this.camForScene(pv) !== null ? pv : prog;
    const [A, B] = LIVE_BUSES;
    this.set({ fx: { running: true, layout: null } });
    try {
      const cams = this.fxCams();
      for (let i = 0; i < PIP_SCENES.length; i++) await t.pipAssign(i, this.state.config.pips[i]?.scene ?? null);
      const { width, height } = await t.fxStage(cams, prog, prog, A);
      await t.fxStage(cams, prev, prev, B);
      const overlays = this.overlaySources();
      await t.liveEnsure(A, overlays, this.adUnder());
      await t.liveEnsure(B, overlays, this.adUnder());
      this.live = { mains: { [A]: prog, [B]: prev }, w: width, h: height };
      await this.liveDrawMain(A, prog, FULL_RECT);
      await this.liveDrawMain(B, prev, FULL_RECT);
      await t.fxCutTo(A);
      await t.setPreviewScene(B);
      this.setLive({ on: true, pip: [false, false], sqm: false, progBus: A, previewBus: B });
      return true;
    } catch (error) {
      this.live = null;
      this.setLive(IDLE_LIVE);
      const why = error instanceof Error && error.message ? ` (${error.message})` : "";
      this.notice(`Live mode: OBS refused${why}`);
      void t.resync().catch(() => {});
      return false;
    } finally {
      this.set({ fx: { running: false, layout: null } });
      this.fxLeave();
    }
  }

  /** Nothing live is on any more: hand OBS program back to the plain cam scene (same picture). */
  private async exitLive() {
    const live = this.live;
    const t = this.transport;
    if (!live || !t) return;
    const cam = live.mains[this.progBus()];
    const pv = this.state.previewScene;
    this.set({ fx: { running: true, layout: null } });
    this.live = null;
    try {
      if (cam) await t.fxCutTo(cam);
      await t.setPreviewScene(pv ?? cam ?? "");
    } catch {
      this.notice("Could not leave live mode cleanly — pick a cam on PGM");
    } finally {
      this.setLive(IDLE_LIVE);
      this.set({ fx: { running: false, layout: null } });
      this.fxLeave();
    }
  }

  private async maybeExitLive() {
    const { live, fx, transitioning } = this.state;
    if (this.live && !fx.running && !transitioning && !live.sqm && !live.pip.some(Boolean)) await this.exitLive();
  }

  /** OBS was already on a live bus when we connected: rebuild the controller's live state from OBS. */
  private async recoverLive(bus: string) {
    const t = this.transport;
    if (!t || this.recovering) return;
    this.recovering = true;
    try {
      const cams = this.fxCams();
      if (!cams.length) throw new Error("no cams mapped");
      const [A, B] = LIVE_BUSES;
      const [ra, rb] = await Promise.all([t.liveRead(A), t.liveRead(B)]);
      const pick = (r: Record<string, boolean>) => cams.find((c) => r[c]) ?? cams[0]!;
      const mainA = pick(ra);
      const mainB = pick(rb);
      const { width, height } = await t.fxStage(cams, mainA, mainA, A);
      await t.fxStage(cams, mainB, mainB, B);
      const overlays = this.overlaySources();
      await t.liveEnsure(A, overlays, this.adUnder());
      await t.liveEnsure(B, overlays, this.adUnder());
      this.live = { mains: { [A]: mainA, [B]: mainB }, w: width, h: height };
      const cur = bus === A ? ra : rb;
      const ad = this.state.config.ad.scene;
      const main = bus === A ? mainA : mainB;
      this.set({
        programScene: main,
        program: this.camForScene(main),
        live: { on: true, pip: PIP_SCENES.map((n) => !!cur[n]), sqm: !!(ad && cur[ad]), progBus: bus, previewBus: this.otherBus(bus) },
      });
      void t.resync().catch(() => {});
    } catch {
      // Cannot rebuild it: put OBS back on a plain scene so the controller and OBS agree.
      this.notice("OBS was on a live layout the controller could not read — pick a cam on PGM");
    } finally {
      this.recovering = false;
    }
  }

  /** PIP n on / off. The scene stays assigned; only visibility changes. Lamp follows OBS, not the click. */
  async togglePip(slot: number) {
    if (this.state.fx.running) return;
    if (this.state.fx.layout) {
      this.notice(`Close ${this.state.fx.layout.toUpperCase()} first`);
      return;
    }
    const cfg = this.state.config.pips[slot];
    const name = PIP_SCENES[slot];
    if (!cfg || !name) return;
    const turningOn = !this.state.live.pip[slot];
    if (turningOn && !cfg.scene) {
      this.notice(`PIP ${slot + 1}: assign a scene first (Live FX panel)`);
      return;
    }
    if (turningOn && !this.live && !(await this.enterLive())) return;
    const t = this.transport;
    const live = this.live;
    if (!t || !live) return;
    const bus = this.progBus();
    const ms = Math.min(800, Math.max(250, this.state.config.transitionDuration));
    this.set({ fx: { running: true, layout: null } });
    try {
      if (turningOn) {
        await t.pipAssign(slot, cfg.scene);
        const overlays = this.overlaySources();
        await t.liveEnsure(bus, overlays, this.adUnder());
        await t.liveEnsure(this.otherBus(bus), overlays, this.adUnder());
      }
      await this.fxAnimate(ms, (e) => t.fxFrame({ [name]: pipAt(cfg.corner, cfg.size, turningOn ? e : 1 - e, live.w, live.h) }, bus));
      const rest = turningOn ? pipRect(cfg.corner, cfg.size, live.w, live.h) : null;
      await t.fxFrame({ [name]: rest }, bus);
      await t.fxFrame({ [name]: rest }, this.otherBus(bus));
      const real = await t.liveRead(bus);
      const pip = [...this.state.live.pip];
      pip[slot] = !!real[name];
      this.setLive({ pip });
      if (pip[slot] !== turningOn) this.notice(`PIP ${slot + 1}: OBS did not apply it`);
    } catch (error) {
      const why = error instanceof Error && error.message ? ` (${error.message})` : "";
      this.notice(`PIP ${slot + 1}: OBS did not apply it${why}`);
      const real = await t.liveRead(bus).catch(() => null);
      if (real) this.setLive({ pip: PIP_SCENES.map((n) => !!real[n]) });
    } finally {
      this.set({ fx: { running: false, layout: null } });
    }
    await this.maybeExitLive();
  }

  /** Assign a scene to PIP n. It stays there until changed; if the PIP is on air OBS swaps it live. */
  async assignPip(slot: number, scene: string | null) {
    if (!scene && this.state.live.pip[slot]) await this.togglePip(slot);
    this.updateConfig({ pips: this.state.config.pips.map((p, i) => (i === slot ? { ...p, scene } : p)) });
    await this.send(`PIP ${slot + 1} scene`, (t) => t.pipAssign(slot, scene));
  }

  assignPipFromPreview(slot: number) {
    const scene = this.state.previewScene;
    if (!scene || this.camForScene(scene) === null) {
      this.notice("Put a mapped cam on PVW first");
      return Promise.resolve();
    }
    return this.assignPip(slot, scene);
  }

  /** PIP corner / size. Glides to the new spot in OBS if the PIP is on air. */
  async setPip(slot: number, patch: Partial<PipSlot>) {
    const before = this.state.config.pips[slot];
    if (!before) return;
    const next = { ...before, ...patch };
    this.updateConfig({ pips: this.state.config.pips.map((p, i) => (i === slot ? next : p)) });
    const t = this.transport;
    const live = this.live;
    const name = PIP_SCENES[slot];
    if (!t || !live || !name || !this.state.live.pip[slot] || this.state.fx.running) return;
    const from = pipRect(before.corner, before.size, live.w, live.h);
    const to = pipRect(next.corner, next.size, live.w, live.h);
    const bus = this.progBus();
    this.set({ fx: { running: true, layout: null } });
    try {
      await this.fxAnimate(400, (e) => t.fxFrame({ [name]: lerpRect(from, to, e) }, bus));
      await t.fxFrame({ [name]: to }, bus);
      await t.fxFrame({ [name]: to }, this.otherBus(bus));
    } catch {
      this.notice(`PIP ${slot + 1}: OBS did not apply the move`);
    } finally {
      this.set({ fx: { running: false, layout: null } });
    }
  }

  /**
   * Squeeze Merge: a real transition. The program picture eases down into its area while the advertisement
   * slides into the space; tap again and the program eases back to full screen as the ad slides out.
   */
  async squeezeMerge() {
    if (this.state.fx.running) return;
    if (this.state.fx.layout) {
      this.notice(`Close ${this.state.fx.layout.toUpperCase()} first`);
      return;
    }
    const ad = this.state.config.ad;
    const turningOn = !this.state.live.sqm;
    if (turningOn && !ad.scene) {
      this.notice("Squeeze Merge: pick an advertisement first (Live FX panel)");
      return;
    }
    if (turningOn && ad.scene && this.fxCams().includes(ad.scene)) {
      this.notice("The advertisement cannot be one of the cam scenes");
      return;
    }
    if (turningOn && !this.live && !(await this.enterLive())) return;
    const t = this.transport;
    const live = this.live;
    if (!t || !live || !ad.scene) return;
    const bus = this.progBus();
    const cam = live.mains[bus];
    if (!cam) return;
    const ms = Math.max(400, this.state.config.transitionDuration);
    const { end, rest } = this.adTargets();
    const from = turningOn ? rest : end;
    const to = turningOn ? end : rest;
    this.set({ fx: { running: true, layout: null }, transitioning: true, tBar: 0 });
    try {
      const overlays = this.overlaySources();
      await t.liveEnsure(bus, overlays, this.adUnder());
      await t.liveEnsure(this.otherBus(bus), overlays, this.adUnder());
      await t.fxFrame({ [ad.scene]: from.ad }, bus);
      await this.adAnimate(
        ms,
        ad.style,
        (e) => t.fxFrame({ [cam]: lerpRect(from.main, to.main, e), [ad.scene as string]: lerpRect(from.ad, to.ad, e) }, bus),
        (raw) => this.set({ tBar: raw }),
      );
      this.setLive({ sqm: turningOn });
      await t.fxFrame({ [cam]: this.mainRegion(), [ad.scene]: turningOn ? end.ad : null }, bus);
      await this.liveSyncFree();
      const real = await t.liveRead(bus);
      const on = !!real[ad.scene];
      this.setLive({ sqm: on });
      if (on !== turningOn) this.notice("Squeeze Merge: OBS did not apply it");
    } catch (error) {
      const why = error instanceof Error && error.message ? ` (${error.message})` : "";
      this.notice(`Squeeze Merge: OBS did not apply it${why}`);
      const real = await t.liveRead(bus).catch(() => null);
      if (real) this.setLive({ sqm: !!real[ad.scene] });
    } finally {
      this.set({ fx: { running: false, layout: null }, tBar: 0, transitioning: false });
    }
    await this.maybeExitLive();
  }

  /** Advertisement content / layout / size. Content goes to OBS at once; layout changes glide when it is in. */
  async setAd(patch: Partial<AdConfig>) {
    const prev = this.state.config.ad;
    const next = { ...prev, ...patch };
    if (patch.scene && this.fxCams().includes(patch.scene)) {
      this.notice("The advertisement cannot be one of the cam scenes");
      return;
    }
    this.updateConfig({ ad: next });
    const t = this.transport;
    if (!t || this.state.status !== "connected") return;
    if (patch.scene !== undefined && patch.scene !== prev.scene) {
      if (patch.scene) {
        try {
          const all = await t.getSources();
          if (!all.some((s) => s.name === patch.scene)) this.notice(`"${patch.scene}" was not found in OBS`);
        } catch {
          /* listing is only a check */
        }
      }
      const live = this.live;
      if (live && !this.state.fx.running) {
        const wasIn = this.state.live.sqm;
        try {
          if (prev.scene) {
            await t.fxFrame({ [prev.scene]: null }, LIVE_BUSES[0]);
            await t.fxFrame({ [prev.scene]: null }, LIVE_BUSES[1]);
          }
          const overlays = this.overlaySources();
          await t.liveEnsure(LIVE_BUSES[0], overlays, this.adUnder());
          await t.liveEnsure(LIVE_BUSES[1], overlays, this.adUnder());
          if (wasIn && patch.scene) {
            const rect = this.adTargets(next).end.ad;
            await t.fxFrame({ [patch.scene]: rect }, LIVE_BUSES[0]);
            await t.fxFrame({ [patch.scene]: rect }, LIVE_BUSES[1]);
          } else if (wasIn) {
            this.setLive({ sqm: false });
          }
        } catch {
          this.notice("Advertisement: OBS did not apply the change");
        }
      }
      return;
    }
    const live = this.live;
    // Frame <-> strip changes which layer is on top: re-stack both buses before anything moves.
    if (live && patch.look !== undefined && patch.look !== prev.look && !this.state.fx.running) {
      try {
        const overlays = this.overlaySources();
        await t.liveEnsure(LIVE_BUSES[0], overlays, this.adUnder());
        await t.liveEnsure(LIVE_BUSES[1], overlays, this.adUnder());
      } catch {
        this.notice("Advertisement: OBS did not apply the look");
      }
    }
    if (live && this.state.live.sqm && prev.scene && !this.state.fx.running && (patch.layout || patch.size || patch.fit || patch.look || patch.anchor)) {
      const bus = this.progBus();
      const cam = live.mains[bus];
      const a = this.adTargets(prev).end;
      const b = this.adTargets(next).end;
      const adName = prev.scene;
      if (!cam) return;
      this.set({ fx: { running: true, layout: null } });
      try {
        await this.adAnimate(500, next.style, (e) => t.fxFrame({ [cam]: lerpRect(a.main, b.main, e), [adName]: lerpRect(a.ad, b.ad, e) }, bus));
        await t.fxFrame({ [cam]: b.main, [adName]: b.ad }, bus);
        await this.liveSyncFree();
      } catch {
        this.notice("Advertisement: OBS did not apply the layout");
      } finally {
        this.set({ fx: { running: false, layout: null } });
      }
    }
  }

  async listSources() {
    if (!this.transport || this.state.status !== "connected") return [];
    return this.transport.getSources().catch(() => []);
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
