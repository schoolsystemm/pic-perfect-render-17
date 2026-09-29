// OBS WebSocket 5.x transport. Browser-only: loaded lazily by the engine.
import OBSWebSocket, { EventSubscription } from "obs-websocket-js";

import { EventBus, type Transport } from "./transport";

export interface ObsTransportOptions {
  host: string;
  port: number;
  password: string;
}

export class ObsTransport implements Transport {
  private obs = new OBSWebSocket();
  private bus = new EventBus();
  private manualClose = false;
  private dskTarget: { scene: string; source: string; id: number } | null = null;

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
    this.obs.on("SceneTransitionEnded", () => {
      void this.refreshScenes();
    });
    this.obs.on("SceneItemEnableStateChanged", (data) => {
      // Only mirror the configured DSK item, not every source in every scene.
      if (
        this.dskTarget &&
        data.sceneName === this.dskTarget.scene &&
        data.sceneItemId === this.dskTarget.id
      ) {
        this.bus.emit({ type: "dsk", on: data.sceneItemEnabled });
      }
    });
  }

  subscribe = this.bus.subscribe;

  async connect() {
    this.manualClose = false;
    this.bus.emit({ type: "status", status: "connecting" });
    const url = `ws://${this.options.host}:${this.options.port}`;
    try {
      await this.obs.connect(url, this.options.password || undefined, {
        eventSubscriptions:
          EventSubscription.All | EventSubscription.SceneItemTransformChanged,
        rpcVersion: 1,
      });
      try {
        await this.obs.call("SetStudioModeEnabled", { studioModeEnabled: true });
        this.bus.emit({ type: "studioMode", enabled: true });
      } catch {
        this.bus.emit({ type: "studioMode", enabled: false });
      }
      const [scenes, transitions] = await Promise.all([
        this.getScenes(),
        this.getTransitions(),
      ]);
      this.bus.emit({ type: "scenes", scenes });
      this.bus.emit({ type: "transitions", transitions });
      this.bus.emit({ type: "status", status: "connected" });
      await this.refreshScenes();
    } catch (error) {
      this.bus.emit({
        type: "status",
        status: "error",
        message: error instanceof Error ? error.message.toUpperCase() : "CONNECTION ERROR",
      });
      throw error;
    }
  }

  private async refreshScenes() {
    const program = await this.getCurrentProgramScene();
    if (program) this.bus.emit({ type: "programScene", scene: program });
    const preview = await this.getCurrentPreviewScene();
    if (preview) this.bus.emit({ type: "previewScene", scene: preview });
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
    return scenes.map((scene) => String(scene.sceneName)).reverse();
  }

  async getTransitions() {
    const { transitions } = await this.obs.call("GetSceneTransitionList");
    return transitions.map((t) => String(t.transitionName));
  }

  async getCurrentProgramScene() {
    try {
      const res = await this.obs.call("GetCurrentProgramScene");
      return (res.currentProgramSceneName ?? null) as string | null;
    } catch {
      return null;
    }
  }

  async getCurrentPreviewScene() {
    try {
      const res = await this.obs.call("GetCurrentPreviewScene");
      return (res.currentPreviewSceneName ?? null) as string | null;
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
      return (res.transitionName ?? null) as string | null;
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

  async toggleDSK(on: boolean, scene: string, source: string) {
    if (!scene || !source) return;
    const { sceneItemId } = await this.obs.call("GetSceneItemId", {
      sceneName: scene,
      sourceName: source,
    });
    this.dskTarget = { scene, source, id: sceneItemId };
    await this.obs.call("SetSceneItemEnabled", {
      sceneName: scene,
      sceneItemId,
      sceneItemEnabled: on,
    });
  }
}
