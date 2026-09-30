// OBS WebSocket 5.x transport. Browser-only: loaded lazily by the engine.
import OBSWebSocket, { EventSubscription } from "obs-websocket-js";

import { EventBus, type Transport } from "./transport";
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

interface DskItem {
  scene: string;
  source: string;
  id: number;
}

export class ObsTransport implements Transport {
  private obs = new OBSWebSocket();
  private bus = new EventBus();
  private manualClose = false;
  private lastMeter = 0;
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

  /** MAIN audio = OBS "Desktop Audio" (global audio device), falling back to Mic/Aux. */
  private async findMainAudio(): Promise<string | null> {
    try {
      const s = (await this.obs.call("GetSpecialInputs")) as Record<string, string | null>;
      return s["desktop1"] ?? s["desktop2"] ?? s["mic1"] ?? null;
    } catch {
      return null;
    }
  }

  private async refreshAudio() {
    try {
      const main = await this.findMainAudio();
      this.bus.emit({ type: "mainAudio", name: main });
      const { inputs } = await this.obs.call("GetInputList");
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
          try {
            const m = await this.obs.call("GetInputAudioMonitorType", { inputName: name });
            monitor = monitorFromObs(m.monitorType);
          } catch {
            /* ignore */
          }
          try {
            const t = await this.obs.call("GetInputAudioTracks", { inputName: name });
            stream = Boolean((t.inputAudioTracks as Record<string, boolean>)["1"]);
          } catch {
            /* ignore */
          }
          channels.push({
            name,
            db: Math.max(-60, inputVolumeDb),
            muted: inputMuted,
            monitor,
            stream,
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
    try {
      await this.obs.call("SetCurrentSceneTransition", { transitionName: "Cut" });
    } catch {
      /* no Cut transition available — trigger with current one */
    }
    await this.obs.call("TriggerStudioModeTransition");
    if (previous && previous !== "Cut") {
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
    try {
      await this.obs.call("SetCurrentSceneTransitionDuration", { transitionDuration: ms });
    } catch {
      /* fixed-duration transitions reject duration changes */
    }
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
