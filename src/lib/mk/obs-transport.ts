// OBS WebSocket 5.x transport. Browser-only: loaded lazily by the engine.
import OBSWebSocket, { EventSubscription } from "obs-websocket-js";

import { EventBus, type Transport } from "./transport";
import { FX_SCENE, type FxRect } from "./fx";
import { GFX_SCENE } from "./graphics";
import { DSK_COUNT, type AudioChannel, type MonitorType } from "./types";

export interface ObsTransportOptions {
  host: string;
  port: number;
  password: string;
}

const MONITOR_TO_OBS: Record<MonitorType, string> = {
  none: "OBS_MONITORING_TYPE_NONE",
  monitorOnly: "OBS_MONITORING_TYPE_MONITOR_ONLY",
  monitorAndOutput: "OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT",
};

function monitorFromObs(value: string | undefined): MonitorType {
  if (value === MONITOR_TO_OBS.monitorOnly) return "monitorOnly";
  if (value === MONITOR_TO_OBS.monitorAndOutput) return "monitorAndOutput";
  return "none";
}

const LIMITER_FILTER = "MK Limiter";

const MAIN_KINDS = [
  "wasapi_output_capture",
  "pulse_output_capture",
  "coreaudio_output_capture",
  "sck_audio_capture",
  "jack_output_capture",
];

interface DskItem {
  scene: string;
  source: string;
  id: number;
}

export class ObsTransport implements Transport {
  private obs = new OBSWebSocket();
  private bus = new EventBus();
  private manualClose = false;
  /** Our own temporary "Cut" swaps must not be reported back as the operator changing transition. */
  private quietUntil = 0;
  private quiet() {
    this.quietUntil = performance.now() + 600;
  }
  private lastMeter = 0;
  private gfxIds = new Map<string, number>();
  private dskItems: (DskItem | null)[] = Array.from({ length: DSK_COUNT }, () => null);

  constructor(private options: ObsTransportOptions) {
    this.obs.on("ConnectionClosed", () => {
      this.bus.emit({
        type: "status",
        status: this.manualClose ? "disconnected" : "error",
        message: this.manualClose ? "" : "CONNECTION LOST",
      });
    });
    this.obs.on("CurrentProgramSceneChanged", ({ sceneName }) =>
      this.bus.emit({ type: "programScene", scene: sceneName }),
    );
    this.obs.on("CurrentPreviewSceneChanged", ({ sceneName }) =>
      this.bus.emit({ type: "previewScene", scene: sceneName }),
    );
    this.obs.on("StudioModeStateChanged", ({ studioModeEnabled }) =>
      this.bus.emit({ type: "studioMode", enabled: studioModeEnabled }),
    );
    this.obs.on("SceneListChanged", () => {
      void this.getScenes().then((scenes) => this.bus.emit({ type: "scenes", scenes }));
    });
    this.obs.on("CurrentSceneTransitionChanged", ({ transitionName }) => {
      if (performance.now() < this.quietUntil) return;
      this.bus.emit({ type: "transitionSettings", name: transitionName });
    });
    this.obs.on("CurrentSceneTransitionDurationChanged", ({ transitionDuration }) => {
      if (performance.now() < this.quietUntil) return;
      this.bus.emit({ type: "transitionSettings", duration: transitionDuration });
    });
    this.obs.on("SceneTransitionStarted", () => this.bus.emit({ type: "transition", active: true }));
    this.obs.on("SceneTransitionEnded", () => this.bus.emit({ type: "transition", active: false }));
    this.obs.on("InputVolumeChanged", ({ inputName, inputVolumeDb }) =>
      this.bus.emit({ type: "audioChannel", name: inputName, db: Math.max(-60, inputVolumeDb) }),
    );
    this.obs.on("InputMuteStateChanged", ({ inputName, inputMuted }) =>
      this.bus.emit({ type: "audioChannel", name: inputName, muted: inputMuted }),
    );
    this.obs.on("InputAudioMonitorTypeChanged", ({ inputName, monitorType }) =>
      this.bus.emit({ type: "audioChannel", name: inputName, monitor: monitorFromObs(monitorType) }),
    );
    this.obs.on("InputAudioTracksChanged", ({ inputName, inputAudioTracks }) =>
      this.bus.emit({
        type: "audioChannel",
        name: inputName,
        stream: Boolean((inputAudioTracks as Record<string, boolean>)["1"]),
        pre: Boolean((inputAudioTracks as Record<string, boolean>)["2"]),
      }),
    );
    this.obs.on("InputCreated", () => void this.refreshAudio());
    this.obs.on("InputRemoved", () => void this.refreshAudio());
    this.obs.on("InputNameChanged", () => void this.refreshAudio());
    this.obs.on("InputVolumeMeters", ({ inputs }) => {
      const now = performance.now();
      if (now - this.lastMeter < 60) return;
      this.lastMeter = now;
      const levels: Record<string, number> = {};
      for (const input of inputs as Array<{ inputName?: string; inputLevelsMul?: number[][] }>) {
        if (!input.inputName) continue;
        let peak = 0;
        for (const ch of input.inputLevelsMul ?? []) peak = Math.max(peak, ch[1] ?? 0);
        levels[input.inputName] = peak > 0 ? 20 * Math.log10(peak) : -100;
      }
      this.bus.emit({ type: "levels", levels });
    });
    this.obs.on("StreamStateChanged", ({ outputActive }) =>
      this.bus.emit({ type: "stream", active: outputActive, durationMs: outputActive ? 0 : undefined }),
    );
    this.obs.on("RecordStateChanged", ({ outputActive, outputState }) => {
      if (outputState === "OBS_WEBSOCKET_OUTPUT_PAUSED")
        this.bus.emit({ type: "record", active: true, paused: true });
      else if (outputState === "OBS_WEBSOCKET_OUTPUT_RESUMED")
        this.bus.emit({ type: "record", active: true, paused: false });
      else if (outputState === "OBS_WEBSOCKET_OUTPUT_STARTED")
        this.bus.emit({ type: "record", active: true, durationMs: 0 });
      else if (outputState === "OBS_WEBSOCKET_OUTPUT_STOPPED")
        this.bus.emit({ type: "record", active: false });
      else if (!outputActive) this.bus.emit({ type: "record", active: false });
    });
    this.obs.on("SceneItemEnableStateChanged", (data) => {
      if (data.sceneName === GFX_SCENE) {
        for (const [name, id] of this.gfxIds) {
          if (id === data.sceneItemId) this.bus.emit({ type: "gfx", name, on: data.sceneItemEnabled });
        }
      }
      // Only mirror the configured DSK items, not every source in every scene.
      this.dskItems.forEach((item, index) => {
        if (item && data.sceneName === item.scene && data.sceneItemId === item.id) {
          this.bus.emit({ type: "dsk", index, on: data.sceneItemEnabled });
        }
      });
    });
  }

  subscribe = this.bus.subscribe;

  async connect() {
    this.manualClose = false;
    this.bus.emit({ type: "status", status: "connecting" });
    const url = `ws://${this.options.host}:${this.options.port}`;
    try {
      await this.obs.connect(url, this.options.password || undefined, {
        eventSubscriptions: EventSubscription.All | EventSubscription.InputVolumeMeters,
        rpcVersion: 1,
      });
      try {
        await this.obs.call("SetStudioModeEnabled", { studioModeEnabled: true });
        this.bus.emit({ type: "studioMode", enabled: true });
      } catch {
        this.bus.emit({ type: "studioMode", enabled: false });
      }
      const [scenes, transitions] = await Promise.all([this.getScenes(), this.getTransitions()]);
      this.bus.emit({ type: "scenes", scenes });
      this.bus.emit({ type: "transitions", transitions });
      this.bus.emit({ type: "status", status: "connected" });
      await this.resync();
      try {
        const cur = await this.obs.call("GetCurrentSceneTransition");
        this.bus.emit({ type: "transitionSettings", name: cur.transitionName, duration: cur.transitionDuration ?? undefined });
      } catch {
        /* ignore */
      }
      await this.refreshAudio();
      await this.refreshOutputs();
    } catch (error) {
      this.bus.emit({
        type: "status",
        status: "error",
        message: error instanceof Error ? error.message.toUpperCase() : "CONNECTION ERROR",
      });
      throw error;
    }
  }

  async resync() {
    const program = await this.getCurrentProgramScene();
    if (program) this.bus.emit({ type: "programScene", scene: program });
    const preview = await this.getCurrentPreviewScene();
    if (preview) this.bus.emit({ type: "previewScene", scene: preview });
  }

  /** MAIN audio = OBS "Desktop Audio" (global device), with fallbacks by kind / name. */
  private async findMainAudio(inputs: Array<Record<string, unknown>>): Promise<string | null> {
    let special: Record<string, string | null> = {};
    try {
      special = (await this.obs.call("GetSpecialInputs")) as Record<string, string | null>;
    } catch {
      /* ignore */
    }
    if (special["desktop1"]) return special["desktop1"];
    if (special["desktop2"]) return special["desktop2"];
    const byKind = inputs.find((i) => MAIN_KINDS.includes(String(i["inputKind"])));
    if (byKind) return String(byKind["inputName"]);
    const byName = inputs.find((i) => /desktop|master|main|program/i.test(String(i["inputName"])));
    if (byName) return String(byName["inputName"]);
    return special["mic1"] ?? null;
  }

  private async refreshAudio() {
    try {
      const { inputs } = await this.obs.call("GetInputList");
      const main = await this.findMainAudio(inputs as Array<Record<string, unknown>>);
      this.bus.emit({ type: "mainAudio", name: main });
      const names = inputs.map((input) => String(input["inputName"]));
      // Global audio devices are not always listed — make sure MAIN is present.
      if (main && !names.includes(main)) names.unshift(main);
      const channels: AudioChannel[] = [];
      for (const name of names) {
        try {
          const [{ inputVolumeDb }, { inputMuted }] = await Promise.all([
            this.obs.call("GetInputVolume", { inputName: name }),
            this.obs.call("GetInputMute", { inputName: name }),
          ]);
          let monitor: MonitorType = "none";
          let stream = true;
          let pre = true;
          try {
            const m = await this.obs.call("GetInputAudioMonitorType", { inputName: name });
            monitor = monitorFromObs(m.monitorType);
          } catch {
            /* ignore */
          }
          try {
            const t = await this.obs.call("GetInputAudioTracks", { inputName: name });
            stream = Boolean((t.inputAudioTracks as Record<string, boolean>)["1"]);
            pre = Boolean((t.inputAudioTracks as Record<string, boolean>)["2"]);
          } catch {
            /* ignore */
          }
          channels.push({
            name,
            db: Math.max(-60, inputVolumeDb),
            muted: inputMuted,
            monitor,
            stream,
            pre,
          });
        } catch {
          /* not an audio input */
        }
      }
      this.bus.emit({ type: "audio", channels });
    } catch {
      /* ignore */
    }
  }

  private async refreshOutputs() {
    try {
      const s = await this.obs.call("GetStreamStatus");
      this.bus.emit({ type: "stream", active: s.outputActive, durationMs: s.outputDuration });
    } catch {
      /* ignore */
    }
    try {
      const r = await this.obs.call("GetRecordStatus");
      this.bus.emit({
        type: "record",
        active: r.outputActive,
        paused: r.outputPaused,
        durationMs: r.outputDuration,
      });
    } catch {
      /* ignore */
    }
  }

  async setInputVolume(name: string, db: number) {
    await this.obs.call("SetInputVolume", { inputName: name, inputVolumeDb: db <= -60 ? -100 : db });
  }

  async setInputMute(name: string, muted: boolean) {
    await this.obs.call("SetInputMute", { inputName: name, inputMuted: muted });
  }

  async setInputMonitor(name: string, monitor: MonitorType) {
    await this.obs.call("SetInputAudioMonitorType", {
      inputName: name,
      monitorType: MONITOR_TO_OBS[monitor] as never,
    });
  }

  async setInputStream(name: string, enabled: boolean) {
    await this.obs.call("SetInputAudioTracks", {
      inputName: name,
      inputAudioTracks: { "1": enabled },
    });
  }

  async setInputPre(name: string, enabled: boolean) {
    await this.obs.call("SetInputAudioTracks", {
      inputName: name,
      inputAudioTracks: { "2": enabled },
    });
  }

  /** The limiter lives on each input as an OBS "Limiter" filter named MK Limiter. */
  async setLimiter(inputs: string[], on: boolean, threshold: number) {
    const settings = { threshold, release_time: 60 };
    for (const sourceName of inputs) {
      try {
        const { filters } = await this.obs.call("GetSourceFilterList", { sourceName });
        const has = (filters as Array<Record<string, unknown>>).some((f) => f["filterName"] === LIMITER_FILTER);
        if (!has) {
          if (!on) continue;
          await this.obs.call("CreateSourceFilter", {
            sourceName,
            filterName: LIMITER_FILTER,
            filterKind: "limiter_filter",
            filterSettings: settings,
          });
        } else {
          await this.obs.call("SetSourceFilterSettings", {
            sourceName,
            filterName: LIMITER_FILTER,
            filterSettings: settings,
            overlay: true,
          });
          await this.obs.call("SetSourceFilterEnabled", {
            sourceName,
            filterName: LIMITER_FILTER,
            filterEnabled: on,
          });
        }
      } catch {
        /* input without filter support (e.g. media-less) — skip */
      }
    }
  }

  async setStreaming(on: boolean) {
    await this.obs.call(on ? "StartStream" : "StopStream");
  }

  async setRecording(on: boolean) {
    await this.obs.call(on ? "StartRecord" : "StopRecord");
  }

  async setRecordPaused(paused: boolean) {
    await this.obs.call(paused ? "PauseRecord" : "ResumeRecord");
  }

  async disconnect() {
    this.manualClose = true;
    try {
      await this.obs.disconnect();
    } catch {
      /* already closed */
    }
    this.bus.emit({ type: "status", status: "disconnected" });
  }

  async getScenes() {
    const { scenes } = await this.obs.call("GetSceneList");
    return scenes.map((scene) => String(scene["sceneName"])).reverse();
  }

  async getTransitions() {
    const { transitions } = await this.obs.call("GetSceneTransitionList");
    return transitions.map((t) => String(t["transitionName"]));
  }

  async getCurrentProgramScene() {
    try {
      const res = await this.obs.call("GetCurrentProgramScene");
      return (res["currentProgramSceneName"] ?? null) as string | null;
    } catch {
      return null;
    }
  }

  async getCurrentPreviewScene() {
    try {
      const res = await this.obs.call("GetCurrentPreviewScene");
      return (res["currentPreviewSceneName"] ?? null) as string | null;
    } catch {
      return null;
    }
  }

  async setPreviewScene(scene: string) {
    await this.obs.call("SetCurrentPreviewScene", { sceneName: scene });
  }

  async setProgramScene(scene: string) {
    await this.obs.call("SetCurrentProgramScene", { sceneName: scene });
  }

  async performCut() {
    const previous = await this.currentTransition();
    this.quiet();
    try {
      await this.obs.call("SetCurrentSceneTransition", { transitionName: "Cut" });
    } catch {
      /* no Cut transition available — trigger with current one */
    }
    await this.obs.call("TriggerStudioModeTransition");
    if (previous && previous !== "Cut") {
      this.quiet();
      try {
        await this.obs.call("SetCurrentSceneTransition", { transitionName: previous });
      } catch {
        /* ignore */
      }
    }
  }

  private async currentTransition(): Promise<string | null> {
    try {
      const res = await this.obs.call("GetCurrentSceneTransition");
      return (res["transitionName"] ?? null) as string | null;
    } catch {
      return null;
    }
  }

  async performAutoTake() {
    await this.obs.call("TriggerStudioModeTransition");
  }

  async setTransition(name: string) {
    await this.obs.call("SetCurrentSceneTransition", { transitionName: name });
  }

  async setTransitionDuration(ms: number) {
    await this.obs.call("SetCurrentSceneTransitionDuration", { transitionDuration: ms });
  }

  async setTBarPosition(position: number, release: boolean) {
    try {
      await this.obs.call("SetTBarPosition", { position, release });
    } catch {
      /* T-bar unsupported for the current transition */
    }
  }

  private async resolveDsk(index: number, scene: string, source: string): Promise<DskItem> {
    const { sceneItemId } = await this.obs.call("GetSceneItemId", {
      sceneName: scene,
      sourceName: source,
    });
    const item = { scene, source, id: sceneItemId };
    this.dskItems[index] = item;
    return item;
  }

  async toggleDSK(index: number, on: boolean, scene: string, source: string) {
    if (!scene || !source) return;
    const item = await this.resolveDsk(index, scene, source);
    await this.obs.call("SetSceneItemEnabled", {
      sceneName: item.scene,
      sceneItemId: item.id,
      sceneItemEnabled: on,
    });
  }

  async readDSK(index: number, scene: string, source: string): Promise<boolean | null> {
    if (!scene || !source) return null;
    try {
      const { id: sceneItemId } = await this.resolveDsk(index, scene, source);
      const { sceneItemEnabled } = await this.obs.call("GetSceneItemEnabled", {
        sceneName: scene,
        sceneItemId,
      });
      return sceneItemEnabled;
    } catch {
      return null;
    }
  }

  private async ensureBrowser(scene: string, name: string, url: string, w: number, h: number) {
    const settings = {
      url,
      width: w,
      height: h,
      css: "body { background-color: rgba(0,0,0,0); margin: 0px auto; overflow: hidden; }",
      // Reload when shown so the entrance animation replays on every DSK take.
      shutdown: true,
      restart_when_active: true,
    };
    let exists = true;
    try {
      await this.obs.call("GetInputSettings", { inputName: name });
    } catch {
      exists = false;
    }
    if (exists) {
      await this.obs.call("SetInputSettings", { inputName: name, inputSettings: settings, overlay: true });
      try {
        await this.obs.call("GetSceneItemId", { sceneName: scene, sourceName: name });
      } catch {
        await this.obs.call("CreateSceneItem", { sceneName: scene, sourceName: name, sceneItemEnabled: false });
      }
    } else {
      await this.obs.call("CreateInput", {
        sceneName: scene,
        inputName: name,
        inputKind: "browser_source",
        inputSettings: settings,
        sceneItemEnabled: false,
      });
    }
  }

  async syncGraphics(targetScenes: string[], layers: { name: string; url: string }[], removeFrom: string[] = []) {
    let w = 1920;
    let h = 1080;
    try {
      const v = await this.obs.call("GetVideoSettings");
      w = v.baseWidth;
      h = v.baseHeight;
    } catch {
      /* keep defaults */
    }
    const scenes = await this.getScenes();
    if (!scenes.includes(GFX_SCENE)) await this.obs.call("CreateScene", { sceneName: GFX_SCENE });
    for (const layer of layers) await this.ensureBrowser(GFX_SCENE, layer.name, layer.url, w, h);
    this.gfxIds.clear();
    // Nest the graphics scene into the chosen scene(s) only (once each).
    for (const scene of targetScenes) {
      if (scene === GFX_SCENE) continue;
      try {
        await this.obs.call("GetSceneItemId", { sceneName: scene, sourceName: GFX_SCENE });
      } catch {
        await this.obs.call("CreateSceneItem", {
          sceneName: scene,
          sourceName: GFX_SCENE,
          sceneItemEnabled: true,
        });
      }
    }
    // Optional clean-up of copies left in other scenes by older versions.
    for (const scene of removeFrom) {
      if (scene === GFX_SCENE || targetScenes.includes(scene)) continue;
      try {
        const { sceneItemId } = await this.obs.call("GetSceneItemId", { sceneName: scene, sourceName: GFX_SCENE });
        await this.obs.call("RemoveSceneItem", { sceneName: scene, sceneItemId });
      } catch {
        /* not nested there */
      }
    }
  }

  private soundScene: string | null = null;

  async playSound(scene: string, dataUrl: string) {
    const name = "MK Audio";
    const html = `<!doctype html><html><body style="margin:0;background:transparent"><audio id="a" autoplay src="${dataUrl}"></audio><script>var a=document.getElementById('a');a.play().catch(function(){})</script><!-- ${Date.now()} --></body></html>`;
    const settings = {
      url: `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
      width: 16,
      height: 16,
      reroute_audio: true, // sound goes through OBS's own mixer
      shutdown: false,
    };
    let exists = true;
    try {
      await this.obs.call("GetInputSettings", { inputName: name });
    } catch {
      exists = false;
    }
    // Only ever sits in ONE scene, and only while playing.
    if (this.soundScene && this.soundScene !== scene) await this.stopSound();
    if (exists) {
      await this.obs.call("SetInputSettings", { inputName: name, inputSettings: settings, overlay: true });
      try {
        await this.obs.call("GetSceneItemId", { sceneName: scene, sourceName: name });
      } catch {
        await this.obs.call("CreateSceneItem", { sceneName: scene, sourceName: name, sceneItemEnabled: true });
      }
    } else {
      await this.obs.call("CreateInput", {
        sceneName: scene,
        inputName: name,
        inputKind: "browser_source",
        inputSettings: settings,
        sceneItemEnabled: true,
      });
    }
    this.soundScene = scene;
  }

  async stopSound() {
    const name = "MK Audio";
    try {
      await this.obs.call("SetInputSettings", {
        inputName: name,
        inputSettings: { url: "about:blank" },
        overlay: true,
      });
    } catch {
      /* source not created yet */
    }
    if (this.soundScene) {
      try {
        const { sceneItemId } = await this.obs.call("GetSceneItemId", {
          sceneName: this.soundScene,
          sourceName: name,
        });
        await this.obs.call("RemoveSceneItem", { sceneName: this.soundScene, sceneItemId });
      } catch {
        /* already gone */
      }
      this.soundScene = null;
    }
  }

  private async gfxItemId(name: string): Promise<number> {
    const cached = this.gfxIds.get(name);
    if (cached !== undefined) return cached;
    const { sceneItemId } = await this.obs.call("GetSceneItemId", {
      sceneName: GFX_SCENE,
      sourceName: name,
    });
    this.gfxIds.set(name, sceneItemId);
    return sceneItemId;
  }

  async setGraphicVisible(name: string, on: boolean) {
    const sceneItemId = await this.gfxItemId(name);
    await this.obs.call("SetSceneItemEnabled", {
      sceneName: GFX_SCENE,
      sceneItemId,
      sceneItemEnabled: on,
    });
  }

  async readGraphics(names: string[]) {
    const out: Record<string, boolean> = {};
    for (const name of names) {
      try {
        const sceneItemId = await this.gfxItemId(name);
        const { sceneItemEnabled } = await this.obs.call("GetSceneItemEnabled", {
          sceneName: GFX_SCENE,
          sceneItemId,
        });
        out[name] = sceneItemEnabled;
      } catch {
        /* layer not created yet */
      }
    }
    return out;
  }

  async updateGraphic(name: string, url: string) {
    await this.obs.call("SetInputSettings", {
      inputName: name,
      inputSettings: { url },
      overlay: true,
    });
  }

  async getSceneItems(scene: string) {
    if (!scene) return [];
    try {
      const { sceneItems } = await this.obs.call("GetSceneItemList", { sceneName: scene });
      return sceneItems.map((i) => String(i["sourceName"]));
    } catch {
      return [];
    }
  }

  // ------------------------------------------------------------ picture effects ("MK FX" scene)

  private fxIds = new Map<string, number>();
  private fxOn = new Map<string, boolean>();

  async fxStage(cams: string[], bottom: string, top: string) {
    const scenes = await this.getScenes();
    if (!scenes.includes(FX_SCENE)) await this.obs.call("CreateScene", { sceneName: FX_SCENE });
    const video = await this.obs.call("GetVideoSettings");
    const list = await this.obs.call("GetSceneItemList", { sceneName: FX_SCENE });
    this.fxIds.clear();
    this.fxOn.clear();
    for (const it of list.sceneItems) {
      const name = String(it["sourceName"]);
      this.fxIds.set(name, Number(it["sceneItemId"]));
      this.fxOn.set(name, it["sceneItemEnabled"] === true);
    }
    for (const cam of cams) {
      if (this.fxIds.has(cam)) continue;
      const res = await this.obs.call("CreateSceneItem", { sceneName: FX_SCENE, sourceName: cam, sceneItemEnabled: false });
      this.fxIds.set(cam, res.sceneItemId);
      this.fxOn.set(cam, false);
    }
    const b = this.fxIds.get(bottom);
    const t = this.fxIds.get(top);
    if (b === undefined || t === undefined) throw new Error("MK FX: camera scene missing");
    await this.obs.call("SetSceneItemIndex", { sceneName: FX_SCENE, sceneItemId: b, sceneItemIndex: 0 });
    await this.obs.call("SetSceneItemIndex", { sceneName: FX_SCENE, sceneItemId: t, sceneItemIndex: Math.max(1, this.fxIds.size - 1) });
    return { width: video.baseWidth, height: video.baseHeight };
  }

  async fxFrame(frame: Record<string, FxRect | null>) {
    const requests: { requestType: string; requestData: Record<string, unknown> }[] = [];
    for (const [scene, r] of Object.entries(frame)) {
      const id = this.fxIds.get(scene);
      if (id === undefined) continue;
      if (r) {
        // Place it first, then show it, so an item never appears for a frame in its old spot.
        requests.push({
          requestType: "SetSceneItemTransform",
          requestData: {
            sceneName: FX_SCENE,
            sceneItemId: id,
            sceneItemTransform: {
              positionX: r.x,
              positionY: r.y,
              scaleX: Math.max(r.sx, 0.001),
              scaleY: Math.max(r.sy, 0.001),
              rotation: 0,
              alignment: 5, // top-left
              boundsType: "OBS_BOUNDS_NONE",
              cropLeft: Math.round(r.cl),
              cropRight: Math.round(r.cr),
              cropTop: Math.round(r.ct),
              cropBottom: Math.round(r.cb),
            },
          },
        });
      }
      if (this.fxOn.get(scene) !== !!r) {
        this.fxOn.set(scene, !!r);
        requests.push({ requestType: "SetSceneItemEnabled", requestData: { sceneName: FX_SCENE, sceneItemId: id, sceneItemEnabled: !!r } });
      }
    }
    if (requests.length) await this.obs.callBatch(requests as unknown as Parameters<typeof this.obs.callBatch>[0]);
  }

  async fxCutTo(scene: string) {
    const previous = await this.currentTransition();
    this.quiet();
    try {
      await this.obs.call("SetCurrentSceneTransition", { transitionName: "Cut" });
    } catch {
      /* no Cut transition: the program still switches, just with the selected transition */
    }
    await this.obs.call("SetCurrentProgramScene", { sceneName: scene });
    if (previous && previous !== "Cut") {
      this.quiet();
      try {
        await this.obs.call("SetCurrentSceneTransition", { transitionName: previous });
      } catch {
        /* ignore */
      }
    }
  }

  async getScreenshot(scene: string, width: number, height: number) {
    try {
      const res = await this.obs.call("GetSourceScreenshot", {
        sourceName: scene,
        imageFormat: "jpg",
        imageWidth: width,
        imageHeight: height,
        imageCompressionQuality: 55,
      });
      return res.imageData;
    } catch {
      return null;
    }
  }
}
