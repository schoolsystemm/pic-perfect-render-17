// MK VISION CONTROL ENGINE
// All switching logic lives here — never inside buttons. The UI only calls
// engine actions and renders engine state, so a hardware panel can drive the
// exact same functions later.
import { loadConfig, saveConfig } from "./config";
import { DemoTransport } from "./demo-transport";
import type { Transport, TransportEvent } from "./transport";
import { CAM_COUNT, DEFAULT_CONFIG, IDLE_OUTPUT, type OutputState, type CamIndex, type MkConfig, type SwitcherState } from "./types";

const RECONNECT_DELAY = 2500;

function initialState(config: MkConfig): SwitcherState {
  return {
    status: "disconnected",
    statusMessage: "",
    demo: config.demoMode,
    program: null,
    preview: null,
    programScene: null,
    previewScene: null,
    dskActive: false,
    tBar: 0,
    transitioning: false,
    scenes: [],
    transitions: [],
    studioMode: false,
    config,
    audio: [],
    levels: {},
    stream: IDLE_OUTPUT,
    record: IDLE_OUTPUT,
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
  private booted = false;

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
    const scenes = this.state.scenes.slice(0, CAM_COUNT);
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
      if (!demoMode) {
        await transport.setTransition(this.state.config.transition).catch(() => {});
        await transport
          .setTransitionDuration(this.state.config.transitionDuration)
          .catch(() => {});
      }
    } catch {
      this.scheduleReconnect();
    }
  }

  async disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    await this.teardown();
    this.set({ status: "disconnected", statusMessage: "", audio: [], levels: {}, stream: IDLE_OUTPUT, record: IDLE_OUTPUT });
  }

  private async teardown() {
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
        this.set({
          programScene: event.scene,
          program: this.camForScene(event.scene),
        });
        this.applyAfv();
        break;
      case "previewScene":
        this.set({
          previewScene: event.scene,
          preview: this.camForScene(event.scene),
        });
        break;
      case "dsk":
        this.set({ dskActive: event.on });
        break;
      case "audio":
        this.set({ audio: event.channels });
        break;
      case "audioChannel":
        this.set({
          audio: this.state.audio.map((c) =>
            c.name === event.name
              ? { ...c, db: event.db ?? c.db, muted: event.muted ?? c.muted }
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
    const scene = this.sceneForCam(cam);
    this.set({ preview: cam, previewScene: scene });
    if (!scene || !this.transport) return;
    await this.transport.setPreviewScene(scene).catch(() => {});
  }

  /** Direct-to-air override (long press / shift-click). */
  async selectProgram(cam: CamIndex) {
    const scene = this.sceneForCam(cam);
    this.set({ program: cam, programScene: scene });
    this.applyAfv();
    if (!scene || !this.transport) return;
    await this.transport.setProgramScene(scene).catch(() => {});
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
    const clamped = Math.min(0, Math.max(-60, db));
    this.onTransportEvent({ type: "audioChannel", name, db: clamped });
    await this.transport?.setInputVolume(name, clamped).catch(() => {});
  }

  async toggleAudioMute(name: string) {
    const channel = this.state.audio.find((c) => c.name === name);
    if (!channel) return;
    this.onTransportEvent({ type: "audioChannel", name, muted: !channel.muted });
    await this.transport?.setInputMute(name, !channel.muted).catch(() => {});
  }

  setAudioFollowVideo(on: boolean) {
    this.updateConfig({ audioFollowVideo: on });
    this.applyAfv();
  }

  /** Cam index an audio input belongs to: matches a mapped scene name or "CAM n". */
  audioCam(name: string): CamIndex | null {
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

  private swapLocal() {
    const { program, preview, programScene, previewScene } = this.state;
    this.set({
      program: preview,
      preview: program,
      programScene: previewScene,
      previewScene: programScene,
      tBar: 0,
      transitioning: false,
    });
    this.applyAfv();
  }

  async cut() {
    if (this.state.preview === null && !this.state.previewScene) return;
    this.swapLocal();
    await this.transport?.performCut().catch(() => {});
  }

  async autoTake() {
    if (this.state.preview === null && !this.state.previewScene) return;
    this.set({ transitioning: true });
    await this.transport?.performAutoTake().catch(() => {});
    this.swapLocal();
  }

  setTBar(position: number, release = false) {
    const clamped = Math.min(1, Math.max(0, position));
    this.set({ tBar: clamped, transitioning: clamped > 0 && clamped < 1 });
    void this.transport?.setTBarPosition(clamped, release).catch(() => {});
    if (release && clamped >= 1) {
      this.swapLocal();
    } else if (release && clamped <= 0) {
      this.set({ tBar: 0, transitioning: false });
    }
  }

  async toggleDSK() {
    const next = !this.state.dskActive;
    this.set({ dskActive: next });
    const { dskScene, dskSource } = this.state.config;
    await this.transport
      ?.toggleDSK(next, dskScene || this.state.programScene || "", dskSource)
      .catch(() => {});
  }

  // ------------------------------------------------------------- transitions

  async setTransition(name: string) {
    this.updateConfig({ transition: name });
    await this.transport?.setTransition(name).catch(() => {});
  }

  async setTransitionDuration(ms: number) {
    this.updateConfig({ transitionDuration: ms });
    await this.transport?.setTransitionDuration(ms).catch(() => {});
  }

  setDskTarget(patch: Partial<Pick<MkConfig, "dskScene" | "dskSource">>) {
    this.updateConfig(patch);
  }

  setShortcuts(shortcuts: MkConfig["shortcuts"]) {
    this.updateConfig({ shortcuts });
  }

  setAutoConnect(autoConnect: boolean) {
    this.updateConfig({ autoConnect });
  }
}

export const engine = new SwitcherEngine();
