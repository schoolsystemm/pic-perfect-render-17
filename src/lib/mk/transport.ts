// Transport contract: the only surface the control engine uses to talk to a
// mixer backend. OBS WebSocket 5.x and Demo Mode both implement it, and a
// future hardware bridge can too.
import type { FxRect } from "./fx";
import type { AudioChannel, ConnectionStatus, EqValues, MonitorType, OutputCheckRow } from "./types";

export type TransportEvent =
  | { type: "status"; status: ConnectionStatus; message?: string }
  | { type: "programScene"; scene: string }
  | { type: "previewScene"; scene: string }
  | { type: "dsk"; index: number; on: boolean }
  | { type: "gfx"; name: string; on: boolean }
  | { type: "scenes"; scenes: string[] }
  | { type: "transitions"; transitions: string[] }
  | { type: "studioMode"; enabled: boolean }
  | { type: "transition"; active: boolean }
  | { type: "transitionSettings"; name?: string; duration?: number }
  /** A live-bus item was switched on/off from outside the controller (OBS itself). */
  | { type: "liveItem"; scene: string; source: string; on: boolean }
  | { type: "audio"; channels: AudioChannel[] }
  | { type: "mainAudio"; name: string | null }
  | {
      type: "audioChannel";
      name: string;
      db?: number;
      muted?: boolean;
      monitor?: MonitorType;
      stream?: boolean;
      pre?: boolean;
      eq?: EqValues;
    }
  | { type: "levels"; levels: Record<string, number> }
  | { type: "limiter"; gr: number | null }
  | { type: "stream"; active: boolean; paused?: boolean | undefined; durationMs?: number | undefined }
  | { type: "record"; active: boolean; paused?: boolean | undefined; durationMs?: number | undefined };

/** Video playout: one scene holding one media source, reused for every file. */
export const PLAYOUT_SCENE = "MK Playout";
export const PLAYOUT_INPUT = "MK Playout Media";
export interface PlayoutStatus {
  state: "playing" | "paused" | "ended" | "stopped" | "other";
  posMs: number;
  durMs: number;
}

export interface Transport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getScenes(): Promise<string[]>;
  getTransitions(): Promise<string[]>;
  getCurrentProgramScene(): Promise<string | null>;
  getCurrentPreviewScene(): Promise<string | null>;
  setPreviewScene(scene: string): Promise<void>;
  setProgramScene(scene: string): Promise<void>;
  performCut(): Promise<void>;
  performAutoTake(): Promise<void>;
  setTransition(name: string): Promise<void>;
  setTransitionDuration(ms: number): Promise<void>;
  setTBarPosition(position: number, release: boolean): Promise<void>;
  toggleDSK(index: number, on: boolean, scene: string, source: string): Promise<void>;
  /** OBS canvas size (base resolution). */
  getCanvas(): Promise<{ width: number; height: number }>;
  /** Move / size a DSK scene item to a hand-picked box (fitted inside it). Needs the canvas size. */
  placeDSK(scene: string, source: string, rect: FxRect): Promise<void>;
  /** The item's current OBS transform (null when unknown). Lets the live bus copy it so a DSK keeps its look while squeezed. */
  readItemTransform(scene: string, source: string): Promise<Record<string, unknown> | null>;
  /** Read the current on/off state of a DSK scene item (null when unknown). */
  readDSK(index: number, scene: string, source: string): Promise<boolean | null>;
  setInputVolume(name: string, db: number): Promise<void>;
  setInputMute(name: string, muted: boolean): Promise<void>;
  setInputMonitor(name: string, monitor: MonitorType): Promise<void>;
  /** Send an input to the FINAL mix — stream + record (audio track 1). */
  setInputStream(name: string, enabled: boolean): Promise<void>;
  /** Send an input to the pre-listen mix (audio track 2). */
  setInputPre(name: string, enabled: boolean): Promise<void>;
  /** Make an off-air input audible to the pre-listen track (OBS ignores inactive sources); `false` undoes it. */
  setInputActive?(name: string, on: boolean): Promise<void>;
  /** Remove parked items left by an earlier session. */
  clearParkedInputs?(): Promise<void>;
  /** Playout: make sure the "MK Playout" scene + media source exist and point the source at `path` (a path on the OBS PC). Does not start it. */
  playoutLoad?(path: string): Promise<void>;
  playoutControl?(action: "restart" | "pause" | "play" | "stop"): Promise<void>;
  playoutStatus?(): Promise<PlayoutStatus | null>;
  /** Set an input's gain + 3-band EQ (the MK Gain / MK EQ filters). */
  setInputEq(name: string, eq: EqValues): Promise<void>;
  /**
   * Master limiter: put / take an audio limiter on every named input (the ones on the
   * final mix). `threshold` is the ceiling in dBFS.
   */
  setLimiter(inputs: string[], on: boolean, threshold: number): Promise<void>;
  /**
   * Check (and with `fix`, repair) the OBS Recording output that feeds pre-listen: Custom FFmpeg -> rtsp://127.0.0.1:8554/mk,
   * audio Track 2 only. The first fix saves the old values so restorePrelistenOutput can put them back.
   */
  checkPrelistenOutput(fix: boolean): Promise<OutputCheckRow[]>;
  restorePrelistenOutput(): Promise<OutputCheckRow[]>;
  setStreaming(on: boolean): Promise<void>;
  setRecording(on: boolean): Promise<void>;
  setRecordPaused(paused: boolean): Promise<void>;
  /**
   * Create / update the MK Graphics scene (one browser source per layer) and nest it
   * ONLY into `targetScenes`. Scenes in `removeFrom` get the nested copy removed.
   */
  syncGraphics(
    targetScenes: string[],
    layers: { name: string; url: string }[],
    removeFrom?: string[],
  ): Promise<void>;
  /** Show / hide one graphics layer (independent of the DSKs). */
  setGraphicVisible(name: string, on: boolean): Promise<void>;
  /** Current on/off state of each named layer that exists in OBS. */
  readGraphics(names: string[]): Promise<Record<string, boolean>>;
  /** Push new HTML into a layer without touching its visibility. */
  updateGraphic(name: string, url: string): Promise<void>;
  /** Play a short audio clip on air (browser source in the given scene). */
  playSound(scene: string, dataUrl: string): Promise<void>;
  /** Stop the clip and take the sound source out of its scene. */
  stopSound(): Promise<void>;
  /** Names of the sources (scene items) inside a scene, for the DSK pickers. */
  getSceneItems(scene: string): Promise<string[]>;
  /** JPEG data-URI snapshot of a scene, for the real-video monitors. */
  getScreenshot(scene: string, width: number, height: number): Promise<string | null>;
  /**
   * Picture effects. Make sure the "MK FX" scene exists with a nested item per camera scene, and put
   * `top` above `bottom`. Returns the canvas size. Does NOT change what is on air.
   */
  fxStage(cams: string[], bottom: string, top: string, scene?: string): Promise<{ width: number; height: number }>;
  /** Place nested scenes / sources in `scene` (default "MK FX"; null = hidden). Keyed by source name. Rejects if OBS refuses. */
  fxFrame(frame: Record<string, FxRect | null>, scene?: string): Promise<void>;
  /** Every scene and input in OBS, for the advertisement / PIP pickers. */
  getSources(): Promise<{ name: string; kind: "scene" | "input" }[]>;
  /** Persistent PIP assignment: put `source` into the "MK PIP n" scene (null = empty). Takes effect on air at once. */
  pipAssign(slot: number, source: string | null): Promise<void>;
  /** Merge panes: put `source` into the "MK PANE n" scene (null = empty). Takes effect on air at once. */
  paneAssign(slot: number, source: string | null): Promise<void>;
  /** Location tags: make sure "MK TAG n" holds its browser source and point it at `url`, sized w x h (null url = clear it). */
  tagSet(slot: number, url: string | null, w: number, h: number): Promise<void>;
  /** Make sure the merge helper scenes exist (6 pane scenes + the border colour scene) and the border colour is set. */
  mergePrepare(color: string, panes?: number): Promise<void>;
  /**
   * Make sure `scene` has an (initially hidden) item for each source and stack them on top, first = lowest.
   * Names in `under` are sent to the very BOTTOM instead (the full-screen advertisement of the frame look).
   */
  liveEnsure(scene: string, sources: string[], under?: string[]): Promise<void>;
  /** The real on/off state of every item in `scene`, read from OBS (keyed by source name). */
  liveRead(scene: string): Promise<Record<string, boolean>>;
  /** Switch program to `scene` as a hard cut, whatever transition is selected. Keeps the selected transition. */
  fxCutTo(scene: string): Promise<void>;
  /** Re-emit authoritative program / preview scenes. */
  resync(): Promise<void>;
  subscribe(listener: (event: TransportEvent) => void): () => void;
}

export class EventBus {
  private listeners = new Set<(event: TransportEvent) => void>();

  subscribe = (listener: (event: TransportEvent) => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  emit = (event: TransportEvent) => {
    this.listeners.forEach((listener) => listener(event));
  };
}
