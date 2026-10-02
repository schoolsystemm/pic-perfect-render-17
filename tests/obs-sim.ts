// A small in-memory OBS Studio (WebSocket 5.x) used by the end-to-end mock tests.
// It keeps a real scene graph (scenes, nested scene items, visibility, transforms, order) and fires the
// same events OBS does, so the tests can check what OBS would really put on the PROGRAM output.

type Handler = (data: any) => void;

export interface SimItem {
  id: number;
  source: string;
  enabled: boolean;
  transform: Record<string, any>;
}

export interface Placed {
  source: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export class ObsSim {
  W = 1920;
  H = 1080;
  scenes = new Map<string, SimItem[]>();
  inputs = new Map<string, { kind: string; settings: Record<string, any> }>();
  program: string;
  preview: string;
  studio = false;
  transition = "Fade";
  duration = 300;
  log: string[] = [];
  private handlers = new Map<string, Handler[]>();
  private nextId = 1;

  constructor(camScenes: string[], extraInputs: string[] = []) {
    for (const s of camScenes) {
      const src = `${s} source`;
      this.inputs.set(src, { kind: "dshow_input", settings: {} });
      this.scenes.set(s, [this.item(src, true)]);
    }
    for (const i of extraInputs) this.inputs.set(i, { kind: "image_source", settings: {} });
    this.inputs.set("Desktop Audio", { kind: "wasapi_output_capture", settings: {} });
    this.program = camScenes[0]!;
    this.preview = camScenes[1] ?? camScenes[0]!;
  }

  private item(source: string, enabled: boolean): SimItem {
    return { id: this.nextId++, source, enabled, transform: { positionX: 0, positionY: 0, scaleX: 1, scaleY: 1, alignment: 5, boundsType: "OBS_BOUNDS_NONE", cropLeft: 0, cropRight: 0, cropTop: 0, cropBottom: 0 } };
  }

  // ------------------------------------------------------------ obs-websocket-js surface
  on(event: string, fn: Handler) {
    const list = this.handlers.get(event) ?? [];
    list.push(fn);
    this.handlers.set(event, list);
    return this;
  }
  off() {
    return this;
  }
  once() {
    return this;
  }
  async connect() {
    return { obsWebSocketVersion: "5.5.0", negotiatedRpcVersion: 1 };
  }
  async disconnect() {}
  private emit(event: string, data: any) {
    const list = this.handlers.get(event) ?? [];
    queueMicrotask(() => list.forEach((fn) => fn(data)));
  }

  private scene(name: string) {
    const s = this.scenes.get(name);
    if (!s) throw new Error(`No source was found by the name of \`${name}\``);
    return s;
  }
  private find(scene: string, id: number) {
    const it = this.scene(scene).find((i) => i.id === id);
    if (!it) throw new Error(`No scene item found with id ${id} in ${scene}`);
    return it;
  }
  private contains(outer: string, inner: string): boolean {
    if (outer === inner) return true;
    const items = this.scenes.get(outer);
    return !!items?.some((i) => this.scenes.has(i.source) && this.contains(i.source, inner));
  }

  async callBatch(requests: { requestType: string; requestData?: any }[]) {
    const out = [];
    for (const r of requests) {
      try {
        const responseData = await this.call(r.requestType, r.requestData);
        out.push({ requestType: r.requestType, requestStatus: { result: true, code: 100 }, responseData });
      } catch (e) {
        out.push({ requestType: r.requestType, requestStatus: { result: false, code: 600, comment: (e as Error).message } });
      }
    }
    return out;
  }

  async call(type: string, d: any = {}): Promise<any> {
    this.log.push(type);
    switch (type) {
      case "SetStudioModeEnabled":
        this.studio = d.studioModeEnabled;
        this.emit("StudioModeStateChanged", { studioModeEnabled: this.studio });
        return {};
      case "GetSceneList":
        return {
          currentProgramSceneName: this.program,
          currentPreviewSceneName: this.studio ? this.preview : null,
          scenes: [...this.scenes.keys()].reverse().map((sceneName, i) => ({ sceneName, sceneIndex: i })),
        };
      case "GetSceneTransitionList":
        return { currentSceneTransitionName: this.transition, transitions: ["Cut", "Fade", "Swipe"].map((transitionName) => ({ transitionName })) };
      case "GetCurrentSceneTransition":
        return { transitionName: this.transition, transitionDuration: this.duration };
      case "SetCurrentSceneTransition":
        this.transition = d.transitionName;
        this.emit("CurrentSceneTransitionChanged", { transitionName: d.transitionName });
        return {};
      case "SetCurrentSceneTransitionDuration":
        this.duration = d.transitionDuration;
        return {};
      case "GetCurrentProgramScene":
        return { currentProgramSceneName: this.program, sceneName: this.program };
      case "GetCurrentPreviewScene":
        if (!this.studio) throw new Error("Studio mode is not enabled");
        return { currentPreviewSceneName: this.preview, sceneName: this.preview };
      case "SetCurrentProgramScene":
        this.scene(d.sceneName);
        this.program = d.sceneName;
        this.emit("CurrentProgramSceneChanged", { sceneName: d.sceneName });
        return {};
      case "SetCurrentPreviewScene":
        if (!this.studio) throw new Error("Studio mode is not enabled");
        this.scene(d.sceneName);
        this.preview = d.sceneName;
        this.emit("CurrentPreviewSceneChanged", { sceneName: d.sceneName });
        return {};
      case "TriggerStudioModeTransition": {
        if (!this.studio) throw new Error("Studio mode is not enabled");
        const p = this.program;
        this.program = this.preview;
        this.preview = p;
        this.emit("SceneTransitionStarted", { transitionName: this.transition });
        this.emit("CurrentProgramSceneChanged", { sceneName: this.program });
        this.emit("CurrentPreviewSceneChanged", { sceneName: this.preview });
        this.emit("SceneTransitionEnded", { transitionName: this.transition });
        return {};
      }
      case "SetTBarPosition":
        return {};
      case "GetVideoSettings":
        return { baseWidth: this.W, baseHeight: this.H, outputWidth: this.W, outputHeight: this.H, fpsNumerator: 30, fpsDenominator: 1 };
      case "CreateScene":
        if (this.scenes.has(d.sceneName)) throw new Error("A source already exists by that name");
        this.scenes.set(d.sceneName, []);
        this.emit("SceneListChanged", {});
        return {};
      case "GetSceneItemList":
        return {
          sceneItems: this.scene(d.sceneName).map((i, idx) => ({ sourceName: i.source, sceneItemId: i.id, sceneItemEnabled: i.enabled, sceneItemIndex: idx })),
        };
      case "GetSceneItemId": {
        const it = this.scene(d.sceneName).find((i) => i.source === d.sourceName);
        if (!it) throw new Error("No scene items were found");
        return { sceneItemId: it.id };
      }
      case "CreateSceneItem": {
        const items = this.scene(d.sceneName);
        if (!this.scenes.has(d.sourceName) && !this.inputs.has(d.sourceName)) throw new Error(`No source ${d.sourceName}`);
        if (this.scenes.has(d.sourceName) && this.contains(d.sourceName, d.sceneName)) throw new Error("Cannot nest a scene in itself");
        const it = this.item(d.sourceName, d.sceneItemEnabled ?? true);
        items.push(it);
        return { sceneItemId: it.id };
      }
      case "RemoveSceneItem": {
        const items = this.scene(d.sceneName);
        const i = items.findIndex((x) => x.id === d.sceneItemId);
        if (i < 0) throw new Error("No such item");
        items.splice(i, 1);
        return {};
      }
      case "SetSceneItemIndex": {
        const items = this.scene(d.sceneName);
        const it = this.find(d.sceneName, d.sceneItemId);
        items.splice(items.indexOf(it), 1);
        items.splice(Math.min(d.sceneItemIndex, items.length), 0, it);
        return {};
      }
      case "SetSceneItemEnabled": {
        const it = this.find(d.sceneName, d.sceneItemId);
        it.enabled = d.sceneItemEnabled;
        this.emit("SceneItemEnableStateChanged", { sceneName: d.sceneName, sceneItemId: d.sceneItemId, sceneItemEnabled: it.enabled });
        return {};
      }
      case "GetSceneItemEnabled":
        return { sceneItemEnabled: this.find(d.sceneName, d.sceneItemId).enabled };
      case "SetSceneItemTransform": {
        const it = this.find(d.sceneName, d.sceneItemId);
        it.transform = { ...it.transform, ...d.sceneItemTransform };
        return {};
      }
      case "GetInputList":
        return { inputs: [...this.inputs].map(([inputName, v]) => ({ inputName, inputKind: v.kind, unversionedInputKind: v.kind })) };
      case "GetSpecialInputs":
        return { desktop1: "Desktop Audio" };
      case "CreateInput":
        this.inputs.set(d.inputName, { kind: d.inputKind, settings: d.inputSettings ?? {} });
        if (d.sceneName) this.scene(d.sceneName).push(this.item(d.inputName, d.sceneItemEnabled ?? true));
        return {};
      case "GetInputSettings": {
        const i = this.inputs.get(d.inputName);
        if (!i) throw new Error("No input");
        return { inputSettings: i.settings, inputKind: i.kind };
      }
      case "SetInputSettings":
        return {};
      case "GetInputVolume":
        return { inputVolumeDb: 0, inputVolumeMul: 1 };
      case "GetInputMute":
        return { inputMuted: false };
      case "GetInputAudioMonitorType":
        return { monitorType: "OBS_MONITORING_TYPE_NONE" };
      case "GetInputAudioTracks":
        return { inputAudioTracks: { "1": true, "2": true } };
      case "GetStreamStatus":
      case "GetRecordStatus":
        return { outputActive: false, outputPaused: false, outputDuration: 0 };
      case "GetSourceFilterList":
        return { filters: [] };
      case "GetSourceScreenshot":
        return { imageData: "data:image/jpg;base64,AA==" };
      default:
        return {};
    }
  }

  // ------------------------------------------------------------ what is really on air
  /** Flattens a scene into visible leaf sources with their canvas rectangles (top of the list = bottom layer). */
  render(scene: string = this.program, ox = 0, oy = 0, sx = 1, sy = 1, depth = 0): Placed[] {
    if (depth > 6) return [];
    const out: Placed[] = [];
    for (const it of this.scene(scene)) {
      if (!it.enabled) continue;
      const t = it.transform;
      let x: number, y: number, w: number, h: number;
      if (t.boundsType && t.boundsType !== "OBS_BOUNDS_NONE") {
        w = t.boundsWidth;
        h = t.boundsHeight;
        x = t.alignment === 0 ? t.positionX - w / 2 : t.positionX;
        y = t.alignment === 0 ? t.positionY - h / 2 : t.positionY;
      } else {
        const cw = this.W - (t.cropLeft ?? 0) - (t.cropRight ?? 0);
        const ch = this.H - (t.cropTop ?? 0) - (t.cropBottom ?? 0);
        w = cw * t.scaleX;
        h = ch * t.scaleY;
        x = t.positionX;
        y = t.positionY;
      }
      const X = ox + x * sx;
      const Y = oy + y * sy;
      const Wd = w * sx;
      const Hd = h * sy;
      if (this.scenes.has(it.source)) {
        const fullW = (t.boundsType && t.boundsType !== "OBS_BOUNDS_NONE") ? w / this.W : t.scaleX;
        const fullH = (t.boundsType && t.boundsType !== "OBS_BOUNDS_NONE") ? h / this.H : t.scaleY;
        const inner = this.render(it.source, X - (t.cropLeft ?? 0) * t.scaleX * sx, Y - (t.cropTop ?? 0) * t.scaleY * sy, fullW * sx, fullH * sy, depth + 1);
        // keep nested-scene rectangles too, and clip leaves to the visible (cropped) area
        out.push({ source: it.source, x: X, y: Y, w: Wd, h: Hd });
        for (const p of inner) {
          const x0 = Math.max(p.x, X);
          const y0 = Math.max(p.y, Y);
          const x1 = Math.min(p.x + p.w, X + Wd);
          const y1 = Math.min(p.y + p.h, Y + Hd);
          if (x1 - x0 > 1 && y1 - y0 > 1) out.push({ ...p, x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        }
      } else {
        out.push({ source: it.source, x: X, y: Y, w: Wd, h: Hd });
      }
    }
    return out;
  }

  /** Leaf sources visible on PROGRAM (only on-canvas ones). */
  visible(scene: string = this.program) {
    return this.render(scene).filter((p) => !this.scenes.has(p.source) && p.x < this.W - 1 && p.y < this.H - 1 && p.x + p.w > 1 && p.y + p.h > 1);
  }
}
