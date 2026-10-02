// MK VISION — shared domain types.
// Kept free of UI and transport concerns so the same contracts can later back a
// physical MK VISION PANEL hardware interface.

import { DEFAULT_MERGE, type MergePreset } from "./merge";
import { DEFAULT_AD, DEFAULT_FX, DEFAULT_PIPS, type AdConfig, type AdPreset, type DskPlace, type FxConfig, type FxLayoutKind, type PipSlot, type PlacePos } from "./fx";

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
  /** Spot + size picked by hand in Settings (null / missing = leave the item where OBS has it). */
  place?: DskPlace | null;
}

export type Corner = "tl" | "tr" | "bl" | "br";
export type GfxId = "logo" | "lower" | "ticker" | "clock" | "badge";
export const GFX_IDS: GfxId[] = ["logo", "lower", "ticker", "clock", "badge"];

export interface LowerPreset {
  name: string;
  title: string;
}

export type GfxFont = "sans" | "condensed" | "serif" | "mono";
export const GFX_FONTS: { id: GfxFont; label: string }[] = [
  { id: "sans", label: "Sans" },
  { id: "condensed", label: "Condensed" },
  { id: "serif", label: "Serif" },
  { id: "mono", label: "Mono" },
];

export type LowerStyle = "bar" | "glass" | "underline" | "box";
export const LOWER_STYLES: { id: LowerStyle; label: string }[] = [
  { id: "bar", label: "Classic bar" },
  { id: "glass", label: "Glass" },
  { id: "underline", label: "Underline" },
  { id: "box", label: "Boxed" },
];

export type TickerStyle = "solid" | "glass" | "outline";
export const TICKER_STYLES: { id: TickerStyle; label: string }[] = [
  { id: "solid", label: "Solid" },
  { id: "glass", label: "Glass" },
  { id: "outline", label: "Outline" },
];

export type BadgeStyle = "solid" | "outline" | "glass";
export const BADGE_STYLES: { id: BadgeStyle; label: string }[] = [
  { id: "solid", label: "Solid" },
  { id: "outline", label: "Outline" },
  { id: "glass", label: "Glass" },
];

/** A ready-made scrolling message: one tap loads it into the ticker and sends it on air. */
export interface ScrollPreset {
  name: string;
  text: string;
  label: string;
  /** Seconds for one pass across the screen. */
  speed: number;
  direction: "left" | "right";
  /** true = keeps repeating, false = runs once, then the bar leaves by itself. */
  loop: boolean;
}

export const DEFAULT_SCROLLS: ScrollPreset[] = [
  { name: "Welcome", label: "LIVE", text: "Welcome to the broadcast — stay tuned for more", speed: 24, direction: "left", loop: true },
  { name: "Breaking", label: "BREAKING", text: "Breaking news: more details coming up shortly", speed: 20, direction: "left", loop: false },
  { name: "Subscribe", label: "FOLLOW", text: "Like, share and subscribe so you never miss a live show", speed: 22, direction: "left", loop: false },
  { name: "Sponsors", label: "THANKS", text: "This broadcast is brought to you by our sponsors and partners", speed: 26, direction: "left", loop: true },
];

export interface GraphicsConfig {
  logo: { image: string | null; pos: Corner; /** Hand-placed spot (0..1 across the free space). Wins over `pos` when set. */ at: PlacePos | null; size: number; opacity: number };
  lower: {
    /** Hand-placed spot (0..1 across the free space). null = the default lower-third spot. */
    at: PlacePos | null;
    name: string;
    title: string;
    accent: string;
    presets: LowerPreset[];
    size: number;
    style: LowerStyle;
    bg: string;
    bgOpacity: number;
    text: string;
    font: GfxFont;
  };
  ticker: {
    /** Hand-placed spot; only the vertical (y) part is used — the bar always spans the width. null = use `pos`. */
    at: PlacePos | null;
    text: string;
    label: string;
    speed: number;
    accent: string;
    /** Bar height + text size, percent (100 = default). */
    size: number;
    /** Which way the text scrolls. */
    direction: "left" | "right";
    /** Bar sits on the bottom or the top of the picture. */
    pos: "bottom" | "top";
    style: TickerStyle;
    bg: string;
    bgOpacity: number;
    textColor: string;
    font: GfxFont;
    /** true = scroll repeats forever, false = one pass, then the bar leaves. */
    loop: boolean;
    /** Ready-made scrolling messages (tap one to go on air). */
    scrolls: ScrollPreset[];
  };
  clock: {
    pos: Corner;
    /** Hand-placed spot (0..1 across the free space). Wins over `pos` when set. */
    at: PlacePos | null;
    seconds: boolean;
    h24: boolean;
    size: number;
    bg: string;
    bgOpacity: number;
    textColor: string;
    font: GfxFont;
  };
  badge: { text: string; pos: Corner; at: PlacePos | null; color: string; size: number; style: BadgeStyle; textColor: string; font: GfxFont };
}

export const DEFAULT_GRAPHICS: GraphicsConfig = {
  logo: { image: null, pos: "tr", at: null, size: 12, opacity: 100 },
  lower: {
    at: null,
    name: "Guest Name",
    title: "Title / Role",
    accent: "#f5a623",
    presets: [],
    size: 100,
    style: "bar",
    bg: "#0a0c10",
    bgOpacity: 90,
    text: "#ffffff",
    font: "sans",
  },
  ticker: {
    at: null,
    text: "Welcome to the broadcast — stay tuned for more",
    label: "LIVE",
    speed: 22,
    accent: "#e5322d",
    size: 100,
    direction: "left",
    pos: "bottom",
    style: "solid",
    bg: "#0a0c10",
    bgOpacity: 94,
    textColor: "#ffffff",
    font: "sans",
    loop: true,
    scrolls: DEFAULT_SCROLLS,
  },
  clock: { pos: "br", at: null, seconds: true, h24: true, size: 100, bg: "#0a0c10", bgOpacity: 88, textColor: "#ffffff", font: "mono" },
  badge: { text: "LIVE", pos: "tl", at: null, color: "#e5322d", size: 100, style: "solid", textColor: "#ffffff", font: "sans" },
};

export const IDLE_GFX: Record<GfxId, boolean> = {
  logo: false,
  lower: false,
  ticker: false,
  clock: false,
  badge: false,
};

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
  graphics: GraphicsConfig;
  /** The ONE scene the MK Graphics scene is nested into ("" = not nested anywhere). */
  graphicsScene: string;
  /** WHEP address of the audio feed from the OBS PC ("" = derive from the OBS host). */
  listenUrl: string;
  /** Volume of the audio feed on this device, 0..1. */
  listenVolume: number;
  /** Master limiter: an OBS Limiter filter on every input that goes to the final mix. */
  limiter: LimiterConfig;
  /** Audio inputs the operator hid from the mixer (they stay in OBS and on the mix). */
  hiddenAudio: string[];
  /** Pre-planned run of show (titles + planned lengths) shown in the Tools panel. */
  rundown: RundownItem[];
  /** Squeeze / PiP / Merge settings. */
  fx: FxConfig;
  /** PIP 1 / PIP 2: persistent scene assignment + position + size. */
  pips: PipSlot[];
  /** The Squeeze Merge that is selected right now (a copy of adPresets[adActive]; the engine works with this one). */
  ad: AdConfig;
  /** Every Squeeze Merge made in Settings; the live screen just picks one from a drop-down. Always at least one. */
  adPresets: AdPreset[];
  adActive: number;
  /** Split-screen Merge looks (2..6 panes + borders), picked on the live screen, set up and saved in the Merge editor. Always at least one. */
  mergePresets: MergePreset[];
  mergeActive: number;
}

/** What the live compositor is doing in OBS right now (confirmed from OBS, not assumed). */
export interface LiveState {
  /** OBS program is one of the MK LIVE buses. */
  on: boolean;
  /** PIP 1 / PIP 2 are showing in OBS. */
  pip: boolean[];
  /** Squeeze Merge is in (advertisement showing). */
  sqm: boolean;
  /** Split-screen Merge is showing (panes + borders in the live buses; PIPs / DSKs / the ad ride on top). */
  merge: boolean;
  /** The scene shown in each pane right now (only while `merge`). */
  mergeScenes: string[];
  /** OBS scene names of the program / preview bus (for the monitors). */
  progBus: string | null;
  previewBus: string | null;
}

export const IDLE_LIVE: LiveState = { on: false, pip: [false, false], sqm: false, merge: false, mergeScenes: [], progBus: null, previewBus: null };

export interface RundownItem {
  text: string;
  /** Planned length in seconds. 0 = untimed (counts up). */
  secs: number;
}

export interface LimiterConfig {
  on: boolean;
  /** Ceiling in dBFS. */
  threshold: number;
}

export const DEFAULT_LIMITER: LimiterConfig = { on: false, threshold: -6 };
export const LIMITER_MIN = -30;
export const LIMITER_MAX = 0;

export interface Shortcuts {
  cut: string;
  autoTake: string;
  dsk: string;
  dsk2: string;
  /** Keys for CAM 1..8 preview selection. */
  cams: string[];
}

export const TRANSITION_DURATIONS = [300, 500, 750, 1000, 1500, 2000];
/** Quick rate buttons on the transition panel. */
export const RATE_BUTTONS = [300, 500, 1000, 1500, 2000];
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
  graphics: DEFAULT_GRAPHICS,
  graphicsScene: "",
  listenUrl: "",
  listenVolume: 1,
  limiter: DEFAULT_LIMITER,
  hiddenAudio: [],
  rundown: [],
  fx: DEFAULT_FX,
  pips: DEFAULT_PIPS,
  ad: DEFAULT_AD,
  adPresets: [{ name: "Squeeze Merge 1", ad: DEFAULT_AD }],
  adActive: 0,
  mergePresets: [{ name: "Split 2", merge: DEFAULT_MERGE }],
  mergeActive: 0,
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
  /** Built-in graphics on/off (independent of the DSKs). */
  gfxActive: Record<GfxId, boolean>;
  tBar: number; // 0..1
  transitioning: boolean;
  /** Picture effects: `running` while one animates, `layout` while PiP / Merge is held on air. */
  fx: { running: boolean; layout: FxLayoutKind | null };
  live: LiveState;
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
  /** Limiter gain reduction in dB (>= 0) when the backend reports it, else null (estimated). */
  gr: number | null;
  /** MUTE OUT is holding every final-mix input muted. */
  masterMuted: boolean;
}

export interface AudioChannel {
  name: string;
  /** Fader in dB, -60..+6 (-60 = -inf). */
  db: number;
  muted: boolean;
  /** OBS monitoring mode (what the operator hears locally). */
  monitor: MonitorType;
  /** Goes to the FINAL mix: what YouTube / the recording get (OBS audio track 1). */
  stream: boolean;
  /** Goes to the PRE-LISTEN mix (OBS audio track 2) — what the Listen button plays. */
  pre: boolean;
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
