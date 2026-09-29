// Transport contract: the only surface the control engine uses to talk to a
// mixer backend. OBS WebSocket 5.x and Demo Mode both implement it, and a
// future hardware bridge can too.
import type { ConnectionStatus } from "./types";

export type TransportEvent =
  | { type: "status"; status: ConnectionStatus; message?: string }
  | { type: "programScene"; scene: string }
  | { type: "previewScene"; scene: string }
  | { type: "dsk"; on: boolean }
  | { type: "scenes"; scenes: string[] }
  | { type: "transitions"; transitions: string[] }
  | { type: "studioMode"; enabled: boolean };

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
  toggleDSK(on: boolean, scene: string, source: string): Promise<void>;
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
