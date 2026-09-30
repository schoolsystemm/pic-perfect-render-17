// Transport contract: the only surface the control engine uses to talk to a
// mixer backend. OBS WebSocket 5.x and Demo Mode both implement it, and a
// future hardware bridge can too.
import type { AudioChannel, ConnectionStatus, MonitorType } from "./types";

export type TransportEvent =
  | { type: "status"; status: ConnectionStatus; message?: string }
  | { type: "programScene"; scene: string }
  | { type: "previewScene"; scene: string }
  | { type: "dsk"; index: number; on: boolean }
  | { type: "scenes"; scenes: string[] }
  | { type: "transitions"; transitions: string[] }
  | { type: "studioMode"; enabled: boolean }
  | { type: "transition"; active: boolean }
  | { type: "audio"; channels: AudioChannel[] }
  | { type: "mainAudio"; name: string | null }
  | {
      type: "audioChannel";
      name: string;
      db?: number;
      muted?: boolean;
      monitor?: MonitorType;
      stream?: boolean;
    }
  | { type: "levels"; levels: Record<string, number> }
  | { type: "stream"; active: boolean; paused?: boolean | undefined; durationMs?: number | undefined }
  | { type: "record"; active: boolean; paused?: boolean | undefined; durationMs?: number | undefined };

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
  /** Read the current on/off state of a DSK scene item (null when unknown). */
  readDSK(index: number, scene: string, source: string): Promise<boolean | null>;
  setInputVolume(name: string, db: number): Promise<void>;
  setInputMute(name: string, muted: boolean): Promise<void>;
  setInputMonitor(name: string, monitor: MonitorType): Promise<void>;
  /** Send an input to the stream / record mix (audio track 1). */
  setInputStream(name: string, enabled: boolean): Promise<void>;
  setStreaming(on: boolean): Promise<void>;
  setRecording(on: boolean): Promise<void>;
  setRecordPaused(paused: boolean): Promise<void>;
  /** Names of the sources (scene items) inside a scene, for the DSK pickers. */
  getSceneItems(scene: string): Promise<string[]>;
  /** JPEG data-URI snapshot of a scene, for the real-video monitors. */
  getScreenshot(scene: string, width: number, height: number): Promise<string | null>;
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
