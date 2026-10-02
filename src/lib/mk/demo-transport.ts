// Demo Mode: full switcher behaviour with no OBS present.
import { EventBus, type Transport } from "./transport";
import type { AudioChannel, MonitorType } from "./types";

const DEMO_SCENES = [
  "Camera 1 Wide",
  "Camera 2 Close",
  "Camera 3 Guest",
  "Camera 4 Presenter",
  "Camera 5 Audience",
  "Camera 6 Stage",
  "Camera 7 Crowd",
  "Camera 8 Remote",
];

const DEMO_TRANSITIONS = ["Cut", "Fade", "Fade to Color", "Swipe", "Slide", "Stinger"];
const MAIN = "Desktop Audio";

/** Animated fake camera frame so the monitors show "video" in Demo Mode. */
function demoFrame(scene: string): string {
  const i = Math.max(0, DEMO_SCENES.indexOf(scene));
  const hue = (i * 43 + 200) % 360;
  const t = (Date.now() % 4000) / 4000;
  const x = Math.round(t * 640);
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'>` +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
    `<stop offset='0' stop-color='hsl(${hue},55%,28%)'/><stop offset='1' stop-color='hsl(${(hue + 60) % 360},60%,12%)'/>` +
    `</linearGradient></defs>` +
    `<rect width='640' height='360' fill='url(#g)'/>` +
    `<circle cx='${x}' cy='${180 + Math.round(Math.sin(t * 6.28) * 60)}' r='38' fill='hsl(${hue},80%,62%)' opacity='.85'/>` +
    `<rect x='0' y='300' width='640' height='60' fill='black' opacity='.45'/>` +
    `<text x='24' y='340' font-family='monospace' font-size='28' fill='white'>${scene}</text>` +
    `<text x='616' y='40' font-family='monospace' font-size='16' fill='white' text-anchor='end' opacity='.7'>DEMO VIDEO</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export class DemoTransport implements Transport {
  private bus = new EventBus();
  private program: string = DEMO_SCENES[0]!;
  private preview: string = DEMO_SCENES[1]!;
  private dsk = [false, false];
  private duration = 500;
  private autoTimer: ReturnType<typeof setTimeout> | null = null;
  private meterTimer: ReturnType<typeof setInterval> | null = null;
  private channels: AudioChannel[] = [
    { name: MAIN, db: -6, muted: false, monitor: "monitorOnly", stream: true, pre: true },
    { name: "CAM 1 Mic", db: -6, muted: false, monitor: "none", stream: true, pre: true },
    { name: "CAM 2 Mic", db: -8, muted: false, monitor: "none", stream: true, pre: true },
    { name: "Presenter Lav", db: -4, muted: false, monitor: "monitorOnly", stream: true, pre: true },
    { name: "Music Bed", db: -18, muted: true, monitor: "none", stream: true, pre: true },
  ];
  private record = false;
  private limiter = { on: false, threshold: -6 };

  subscribe = this.bus.subscribe;

  async connect() {
    this.bus.emit({ type: "status", status: "connecting" });
    this.bus.emit({ type: "scenes", scenes: DEMO_SCENES });
    this.bus.emit({ type: "transitions", transitions: DEMO_TRANSITIONS });
    this.bus.emit({ type: "studioMode", enabled: true });
    this.bus.emit({ type: "status", status: "connected", message: "DEMO MODE" });
    this.bus.emit({ type: "programScene", scene: this.program });
    this.bus.emit({ type: "previewScene", scene: this.preview });
    this.bus.emit({ type: "mainAudio", name: MAIN });
    this.bus.emit({ type: "audio", channels: this.channels.map((c) => ({ ...c })) });
    this.bus.emit({ type: "stream", active: false });
    this.bus.emit({ type: "record", active: false });
    this.meterTimer = setInterval(() => {
      const levels: Record<string, number> = {};
      let gr = 0;
      for (const c of this.channels) {
        if (c.muted) {
          levels[c.name] = -100;
          continue;
        }
        // Raw program-level peaks, hot enough to hit the limiter now and then.
        const base = -18 + c.db * 0.8;
        let peak = Math.min(3, base + (Math.random() - 0.3) * 16);
        if (this.limiter.on && c.stream && peak > this.limiter.threshold) {
          // Brick-wall: the ceiling holds, a hair of overshoot like a real look-ahead limiter.
          gr = Math.max(gr, peak - this.limiter.threshold);
          peak = this.limiter.threshold + Math.random() * 0.15;
        }
        levels[c.name] = peak;
      }
      this.bus.emit({ type: "levels", levels });
      this.bus.emit({ type: "limiter", gr: this.limiter.on ? gr : 0 });
    }, 80);
  }

  async setInputVolume(name: string, db: number) {
    const c = this.channels.find((x) => x.name === name);
    if (c) c.db = db;
  }

  async setInputMute(name: string, muted: boolean) {
    const c = this.channels.find((x) => x.name === name);
    if (c) c.muted = muted;
    this.bus.emit({ type: "audioChannel", name, muted });
  }

  async setInputMonitor(name: string, monitor: MonitorType) {
    const c = this.channels.find((x) => x.name === name);
    if (c) c.monitor = monitor;
    this.bus.emit({ type: "audioChannel", name, monitor });
  }

  async setInputStream(name: string, enabled: boolean) {
    const c = this.channels.find((x) => x.name === name);
    if (c) c.stream = enabled;
    this.bus.emit({ type: "audioChannel", name, stream: enabled });
  }

  async setInputPre(name: string, enabled: boolean) {
    const c = this.channels.find((x) => x.name === name);
    if (c) c.pre = enabled;
    this.bus.emit({ type: "audioChannel", name, pre: enabled });
  }

  async setLimiter(_inputs: string[], on: boolean, threshold: number) {
    this.limiter = { on, threshold };
  }

  async setStreaming(on: boolean) {
    this.bus.emit({ type: "stream", active: on, durationMs: 0 });
  }

  async setRecording(on: boolean) {
    this.record = on;
    this.bus.emit({ type: "record", active: on, durationMs: on ? 0 : undefined });
  }

  async setRecordPaused(paused: boolean) {
    if (!this.record) return;
    this.bus.emit({ type: "record", active: true, paused });
  }

  async disconnect() {
    if (this.meterTimer) clearInterval(this.meterTimer);
    if (this.autoTimer) clearTimeout(this.autoTimer);
    this.meterTimer = null;
    this.autoTimer = null;
    this.bus.emit({ type: "status", status: "disconnected" });
  }

  async getScenes() {
    return DEMO_SCENES;
  }

  async getTransitions() {
    return DEMO_TRANSITIONS;
  }

  async getCurrentProgramScene() {
    return this.program;
  }

  async getCurrentPreviewScene() {
    return this.preview;
  }

  async setPreviewScene(scene: string) {
    this.preview = scene;
    this.bus.emit({ type: "previewScene", scene });
  }

  async setProgramScene(scene: string) {
    this.program = scene;
    this.bus.emit({ type: "programScene", scene });
  }

  private swap() {
    const next = this.preview;
    this.preview = this.program;
    this.program = next;
    this.bus.emit({ type: "programScene", scene: this.program });
    this.bus.emit({ type: "previewScene", scene: this.preview });
  }

  async performCut() {
    this.swap();
  }

  async performAutoTake() {
    if (this.autoTimer) clearTimeout(this.autoTimer);
    this.bus.emit({ type: "transition", active: true });
    this.autoTimer = setTimeout(() => {
      this.autoTimer = null;
      this.swap();
      this.bus.emit({ type: "transition", active: false });
    }, this.duration);
  }

  async setTransition() {}

  async setTransitionDuration(ms: number) {
    this.duration = ms;
  }

  async setTBarPosition(position: number, release: boolean) {
    if (release && position >= 1) {
      this.swap();
      this.bus.emit({ type: "transition", active: false });
    }
  }

  // Picture effects have nothing to draw on in Demo Mode; the engine still runs the whole sequence.
  async fxStage() {
    return { width: 1920, height: 1080 };
  }

  async fxFrame(frame: Record<string, unknown>, scene?: string) {
    const bus = scene ?? "";
    const store = (this.liveItems[bus] ??= {});
    for (const [name, r] of Object.entries(frame)) store[name] = !!r;
  }

  private liveItems: Record<string, Record<string, boolean>> = {};

  async getSources() {
    return [...DEMO_SCENES.map((name) => ({ name, kind: "scene" as const })), { name: "Ad Video", kind: "input" as const }, { name: "Ad Image", kind: "input" as const }];
  }

  async pipAssign() {}
  async liveEnsure() {}
  async liveRead(scene: string): Promise<Record<string, boolean>> {
    return { ...(this.liveItems[scene] ?? {}) };
  }

  async fxCutTo(scene: string) {
    this.program = scene;
    this.bus.emit({ type: "programScene", scene });
  }

  async toggleDSK(index: number, on: boolean) {
    this.dsk[index] = on;
    this.bus.emit({ type: "dsk", index, on });
  }

  async getCanvas() {
    return { width: 1920, height: 1080 };
  }

  async placeDSK() {}

  async readItemTransform(): Promise<Record<string, unknown> | null> {
    return { positionX: 0, positionY: 0, scaleX: 1, scaleY: 1, rotation: 0, alignment: 5, boundsType: "OBS_BOUNDS_NONE", boundsWidth: 0, boundsHeight: 0 };
  }

  async readDSK(): Promise<boolean | null> {
    return null;
  }

  async playSound() {}
  async stopSound() {}
  async syncGraphics() {}
  async setGraphicVisible() {}
  async updateGraphic() {}
  async readGraphics(): Promise<Record<string, boolean>> {
    return {};
  }

  async getSceneItems(scene?: string) {
    if (scene === "MK Graphics") return ["MK Logo", "MK Lower Third", "MK Ticker", "MK Clock", "MK Badge"];
    return ["Lower Third", "Logo Bug", "Clock", "Score Bug"];
  }

  async getScreenshot(scene: string) {
    return demoFrame(scene);
  }

  async resync() {
    this.bus.emit({ type: "programScene", scene: this.program });
    this.bus.emit({ type: "previewScene", scene: this.preview });
  }
}
