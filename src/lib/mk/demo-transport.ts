// Demo Mode: full switcher behaviour with no OBS present.
import { EventBus, type Transport } from "./transport";
import type { AudioChannel } from "./types";

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

export class DemoTransport implements Transport {
  private bus = new EventBus();
  private program: string = DEMO_SCENES[0]!;
  private preview: string = DEMO_SCENES[1]!;
  private dsk = false;
  private meterTimer: ReturnType<typeof setInterval> | null = null;
  private channels: AudioChannel[] = [
    { name: "CAM 1 Mic", db: -6, muted: false },
    { name: "CAM 2 Mic", db: -8, muted: false },
    { name: "Presenter Lav", db: -4, muted: false },
    { name: "Music Bed", db: -18, muted: true },
    { name: "Desktop Audio", db: -12, muted: false },
  ];
  private record = false;
  private recordPaused = false;

  subscribe = this.bus.subscribe;

  async connect() {
    this.bus.emit({ type: "status", status: "connecting" });
    this.bus.emit({ type: "scenes", scenes: DEMO_SCENES });
    this.bus.emit({ type: "transitions", transitions: DEMO_TRANSITIONS });
    this.bus.emit({ type: "studioMode", enabled: true });
    this.bus.emit({ type: "status", status: "connected", message: "DEMO MODE" });
    this.bus.emit({ type: "programScene", scene: this.program });
    this.bus.emit({ type: "previewScene", scene: this.preview });
    this.bus.emit({ type: "audio", channels: this.channels.map((c) => ({ ...c })) });
    this.bus.emit({ type: "stream", active: false });
    this.bus.emit({ type: "record", active: false });
    this.meterTimer = setInterval(() => {
      const levels: Record<string, number> = {};
      for (const c of this.channels) {
        if (c.muted) { levels[c.name] = -100; continue; }
        const base = -20 + c.db * 0.6;
        levels[c.name] = Math.min(2, base + (Math.random() - 0.3) * 16);
      }
      this.bus.emit({ type: "levels", levels });
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

  async setStreaming(on: boolean) {
    this.bus.emit({ type: "stream", active: on, durationMs: 0 });
  }

  async setRecording(on: boolean) {
    this.record = on;
    this.recordPaused = false;
    this.bus.emit({ type: "record", active: on, durationMs: on ? 0 : undefined });
  }

  async setRecordPaused(paused: boolean) {
    if (!this.record) return;
    this.recordPaused = paused;
    this.bus.emit({ type: "record", active: true, paused });
  }

  async disconnect() {
    if (this.meterTimer) clearInterval(this.meterTimer);
    this.meterTimer = null;
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
    this.swap();
  }

  async setTransition() {}
  async setTransitionDuration() {}

  async setTBarPosition(position: number, release: boolean) {
    if (release && position >= 1) this.swap();
  }

  async toggleDSK(on: boolean) {
    this.dsk = on;
    this.bus.emit({ type: "dsk", on: this.dsk });
  }
}
