// Console audio maths: fader law, meter scale and ballistics. Pure functions, no UI.
import { useEffect, useRef, useState } from "react";

import { FADER_MAX, FADER_MIN } from "./types";

/** Fader travel -> dB. Piecewise like a real console: fine control around 0 dB, long throw to -inf. */
const LAW: [number, number][] = [
  [0, FADER_MIN],
  [0.12, -40],
  [0.28, -24],
  [0.45, -12],
  [0.6, -6],
  [0.78, 0],
  [1, FADER_MAX],
];

export function posToDb(pos: number): number {
  const p = Math.max(0, Math.min(1, pos));
  for (let i = 1; i < LAW.length; i++) {
    const [p1, d1] = LAW[i]!;
    const [p0, d0] = LAW[i - 1]!;
    if (p <= p1) return d0 + ((p - p0) / (p1 - p0)) * (d1 - d0);
  }
  return FADER_MAX;
}

export function dbToPos(db: number): number {
  const d = Math.max(FADER_MIN, Math.min(FADER_MAX, db));
  for (let i = 1; i < LAW.length; i++) {
    const [p1, d1] = LAW[i]!;
    const [p0, d0] = LAW[i - 1]!;
    if (d <= d1) return p0 + ((d - d0) / (d1 - d0)) * (p1 - p0);
  }
  return 1;
}

/** Printed on the fader scale. */
export const FADER_TICKS = [6, 0, -12, -24, -40];

export const METER_MIN = -60;
/** Meter position 0..1 for a level in dBFS (0 dBFS = top). */
export const meterPos = (db: number) => Math.max(0, Math.min(1, (db - METER_MIN) / -METER_MIN));
export const METER_TICKS = [0, -6, -12, -24, -40];

export const fmtDb = (db: number) => (db <= FADER_MIN ? "-∞" : `${db > 0 ? "+" : ""}${db.toFixed(1)}`);

/** Power-sum of the peaks of several inputs = rough level of the mix they make. */
export function powerSum(levels: number[]): number {
  let sum = 0;
  for (const db of levels) if (db > -99) sum += 10 ** (db / 10);
  return sum > 0 ? 10 * Math.log10(sum) : -100;
}

export interface Ballistics {
  level: number;
  peak: number;
}

/**
 * PPM-style ballistics: instant attack, steady release (dB/s), and a peak-hold marker
 * that waits, then falls slower. Runs on its own rAF clock so the meter stays smooth
 * between the (slow) level messages from OBS.
 */
export function useBallistics(db: number, opts: { fall?: number; hold?: number; peakFall?: number } = {}): Ballistics {
  const { fall = 24, hold = 1500, peakFall = 12 } = opts;
  const target = useRef(db);
  target.current = db;
  const [v, setV] = useState<Ballistics>({ level: -100, peak: -100 });

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let level = -100;
    let peak = -100;
    let peakAt = 0;
    let rendered = 0;
    const tick = (t: number) => {
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      const tg = target.current;
      level = tg > level ? tg : Math.max(tg, level - fall * dt);
      if (level >= peak) {
        peak = level;
        peakAt = t;
      } else if (t - peakAt > hold) {
        peak = Math.max(level, peak - peakFall * dt);
      }
      if (t - rendered >= 33) {
        rendered = t;
        setV((o) => (Math.abs(o.level - level) < 0.15 && Math.abs(o.peak - peak) < 0.15 ? o : { level, peak }));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fall, hold, peakFall]);

  return v;
}
