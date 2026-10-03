import { useRef } from "react";

import { dbToPos, fmtDb, posToDb } from "@/lib/mk/audio-math";
import { FADER_MAX, FADER_MIN } from "@/lib/mk/types";

const CAP = 16; // fader cap height, px

interface FaderProps {
  db: number;
  onChange: (db: number) => void;
  label: string;
}

/** Vertical channel fader with a metal cap. Drag, double-click = 0 dB, arrows = ±0.5 dB. */
export function Fader({ db, onChange, label }: FaderProps) {
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const fromY = (clientY: number) => {
    const r = track.current?.getBoundingClientRect();
    if (!r || r.height <= CAP) return db;
    const pos = 1 - (clientY - r.top - CAP / 2) / (r.height - CAP);
    let next = Math.round(posToDb(pos) * 2) / 2;
    if (Math.abs(next) < 0.8) next = 0; // detent at unity
    if (next <= FADER_MIN + 0.5) next = FADER_MIN;
    return next;
  };

  const pos = dbToPos(db);

  return (
    <div
      ref={track}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={FADER_MIN}
      aria-valuemax={FADER_MAX}
      aria-valuenow={db}
      aria-valuetext={`${fmtDb(db)} dB`}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        dragging.current = true;
        onChange(fromY(e.clientY));
      }}
      onPointerMove={(e) => {
        if (dragging.current) onChange(fromY(e.clientY));
      }}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
      onDoubleClick={() => onChange(0)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 3 : 0.5;
        if (e.key === "ArrowUp") onChange(Math.min(FADER_MAX, db + step));
        else if (e.key === "ArrowDown") onChange(Math.max(FADER_MIN, db - step));
        else if (e.key === "Home") onChange(0);
      }}
      className="relative h-full w-5 cursor-ns-resize touch-none outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      {/* slot */}
      <div
        className="absolute left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-black/70 shadow-[inset_0_1px_2px_black,0_1px_0_oklch(1_0_0/10%)]"
        style={{ top: CAP / 2, bottom: CAP / 2 }}
      />
      {/* unity mark */}
      <div
        className="absolute inset-x-0 h-px bg-engrave/70"
        style={{ top: `calc(${CAP / 2}px + (100% - ${CAP}px) * ${1 - dbToPos(0)})` }}
      />
      {/* cap */}
      <div
        className="mk-cap absolute inset-x-[1px] flex items-center justify-center rounded-[3px]"
        style={{ height: CAP, top: `calc((100% - ${CAP}px) * ${1 - pos})` }}
      >
        <div className="h-px w-full bg-black/70 shadow-[0_1px_0_oklch(1_0_0/35%)]" />
      </div>
    </div>
  );
}
