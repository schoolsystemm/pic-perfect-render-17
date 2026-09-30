// MK VISION — shared domain types.
// Kept free of UI and transport concerns so the same contracts can later back a
// physical MK VISION PANEL hardware interface.

export const CAM_COUNT = 8;

export type CamIndex = number; // 0..7 -> CAM 1..CAM 8

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface MkConfig {
  host: string;
  port: number;
  password: string;
  /** Scene name mapped to each CAM button, index 0 = CAM 1. */
  camScenes: (string | null)[];
  /** Scene that contains the DSK (graphics) source. */
  dskScene: string;
  /** Source toggled by the DSK button. */
  dskSource: string;
  transition: string;
  transitionDuration: number;
  demoMode: boolean;
  autoConnect: boolean;
  shortcuts: Shortcuts;
  /** Audio follows video: cam-named audio inputs unmute when their CAM is on air. */
  audioFollowVideo: boolean;
}

export interface Shortcuts {
  cut: string;
  autoTake: string;
  dsk: string;
  /** Keys for CAM 1..8 preview selection. */
  cams: string[];
}

export const TRANSITION_DURATIONS = [300, 500, 750, 1000, 1500, 2000];

export const DEFAULT_SHORTCUTS: Shortcuts = {
  cut: "x",
  autoTake: " ",
  dsk: "d",
  cams: ["1", "2", "3", "4", "5", "6", "7", "8"],
};

export const DEFAULT_CONFIG: MkConfig = {
  host: "",
  port: 4455,
  password: "",
  camScenes: Array.from({ length: CAM_COUNT }, () => null),
  dskScene: "",
  dskSource: "",
  transition: "Fade",
  transitionDuration: 500,
  demoMode: true,
  autoConnect: false,
  shortcuts: DEFAULT_SHORTCUTS,
  audioFollowVideo: false,
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
  dskActive: boolean;
  tBar: number; // 0..1
  transitioning: boolean;
  scenes: string[];
  transitions: string[];
  studioMode: boolean;
  config: MkConfig;
  audio: AudioChannel[];
  /** Peak level in dB per input name (fast-changing telemetry). */
  levels: Record<string, number>;
  stream: OutputState;
  record: OutputState;
}

export interface AudioChannel {
  name: string;
  /** Fader in dB, -60..0 (-60 = -inf). */
  db: number;
  muted: boolean;
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

export const camLabel = (index: CamIndex) => `CAM ${index + 1}`;
