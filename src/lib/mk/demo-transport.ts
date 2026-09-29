// Demo Mode: full switcher behaviour with no OBS present.
import { EventBus, type Transport } from "./transport";

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
  private program = DEMO_SCENES[0];
  private preview = DEMO_SCENES[1];
  private dsk = false;

  subscribe = this.bus.subscribe;

  async connect() {
    this.bus.emit({ type: "status", status: "connecting" });
    this.bus.emit({ type: "scenes", scenes: DEMO_SCENES });
    this.bus.emit({ type: "transitions", transitions: DEMO_TRANSITIONS });
    this.bus.emit({ type: "studioMode", enabled: true });
    this.bus.emit({ type: "status", status: "connected", message: "DEMO MODE" });
    this.bus.emit({ type: "programScene", scene: this.program });
    this.bus.emit({ type: "previewScene", scene: this.preview });
  }

  async disconnect() {
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
