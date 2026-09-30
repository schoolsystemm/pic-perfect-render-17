// MK VISION — shared domain types.
// Kept free of UI and transport concerns so the same contracts can later back a
// physical MK VISION PANEL hardware interface.

export const CAM_COUNT = 8;
export const DSK_COUNT = 2;

export type CamIndex = number; // 0..7 -> CAM 1..CAM 8

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

/** OBS audio monitoring modes. */
export type MonitorType = "none" | "monitorOnly" | "monitorAndOutput";

export interface DskTarget {
  /** Scene that contains the graphics source ("" = current program scene). */
  scene: string;
  /** Scene item toggled by the DSK button. */
  source: string;
}

export interface MkConfig {
  host: string;
  port: number;
  password: string;
  /** Scene name mapped to each CAM button, index 0 = CAM 1. */
  camScenes: (string | null)[];
  /** DSK 1 and DSK 2 targets. */
  dsks: DskTarget[];
  transition: string;
  transitionDuration: number;
  demoMode: boolean;
  autoConnect: boolean;
  shortcuts: Shortcuts;
  /** Audio follows video: cam-named audio inputs unmute when their CAM is on air. */
  audioFollowVideo: boolean;
  /** Show real OBS video in the Preview / Program monitors. */
  liveVideo: boolean;
  /** Monitor refresh rate (frames per second, OBS screenshots). */
  monitorFps: number;
}

export interface Shortcuts {
  cut: string;
  autoTake: string;
  dsk: string;
  dsk2: string;
  /** Keys for CAM 1..8 preview selection. */
  cams: string[];
}

export const TRANSITION_DURATIONS = [300, 500, 750, 1000, 1500, 2000];
export const MONITOR_FPS_OPTIONS = [5, 8, 10, 15, 20];

export const DEFAULT_SHORTCUTS: Shortcuts = {
  cut: "x",
  autoTake: " ",
  dsk: "d",
  dsk2: "f",
  cams: ["1", "2", "3", "4", "5", "6", "7", "8"],
};

export const DEFAULT_DSKS: DskTarget[] = Array.from({ length: DSK_COUNT }, () => ({
  scene: "",
  source: "",
}));

export const DEFAULT_CONFIG: MkConfig = {
  host: "",
  port: 4455,
  password: "",
  camScenes: Array.from({ length: CAM_COUNT }, () => null),
  dsks: DEFAULT_DSKS,
  transition: "Fade",
  transitionDuration: 500,
  demoMode: true,
  autoConnect: false,
  shortcuts: DEFAULT_SHORTCUTS,
  audioFollowVideo: false,
  liveVideo: true,
  monitorFps: 10,
};

export interface SwitcherState {
  status: ConnectionStatus;
  statusMessage: string;
  demo: boolean;
  /** CAM index currently on air, or null when program scene is unmapped. */
  program: CamIndex | null;
  preview: CamIndex | null;
  programScene: string | null;
  previewScene: string | null;
  /** DSK 1 / DSK 2 on-air flags. */
  dskActive: boolean[];
  tBar: number; // 0..1
  transitioning: boolean;
  scenes: string[];
  transitions: string[];
  studioMode: boolean;
  config: MkConfig;
  audio: AudioChannel[];
  /** Name of the MAIN (desktop / master) audio input, if OBS has one. */
  mainAudio: string | null;
  /** Peak level in dB per input name (fast-changing telemetry). */
  levels: Record<string, number>;
  stream: OutputState;
  record: OutputState;
  /** Short-lived operator message (e.g. "DSK 1 has no source set"). */
  notice: string | null;
}

export interface AudioChannel {
  name: string;
  /** Fader in dB, -60..+6 (-60 = -inf). */
  db: number;
  muted: boolean;
  /** OBS monitoring mode (what the operator hears locally). */
  monitor: MonitorType;
  /** Sent to the stream / record mix (OBS audio track 1). */
  stream: boolean;
}

export interface OutputState {
  active: boolean;
  paused: boolean;
  /** Epoch ms when the running clock started (null when stopped/paused). */
  since: number | null;
  /** Elapsed ms accumulated before `since`. */
  baseMs: number;
}

export const IDLE_OUTPUT: OutputState = { active: false, paused: false, since: null, baseMs: 0 };

export const FADER_MIN = -60;
export const FADER_MAX = 6;

export const camLabel = (index: CamIndex) => `CAM ${index + 1}`;
