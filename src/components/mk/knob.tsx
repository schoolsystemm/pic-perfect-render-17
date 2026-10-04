import { useRef } from "react";

import { cn } from "@/lib/utils";

interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  /** A change that is not on air yet: the knob and its number turn amber. */
  staged?: boolean;
  disabled?: boolean;
  onChange: (value: number) => void;
}

const SWEEP = 270; // degrees of travel
const DRAG_PX = 140; // pixels of drag for the whole range

/** Rotary knob. Drag up/down, double-click = 0 dB, arrow keys = ±0.5 dB (shift = ±2). */
export function Knob({ label, value, min, max, staged, disabled, onChange }: KnobProps) {
  const start = useRef<{ y: number; v: number } | null>(null);

  const clamp = (v: number) => {
    const r = Math.round(Math.max(min, Math.min(max, v)) * 2) / 2;
    return Math.abs(r) < 0.6 ? 0 : r; // detent at 0
  };
  const angle = -SWEEP / 2 + ((value - min) / (max - min)) * SWEEP;
  const text = `${value > 0 ? "+" : ""}${value.toFixed(value % 1 === 0 ? 0 : 1)}`;

  return (
    <div className={cn("flex flex-col items-center gap-0.5 select-none", disabled && "pointer-events-none opacity-40")}>
      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={`${label} ${text} dB`}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        title={`${label}: drag up/down. Double-click = 0 dB`}
        className={cn("cursor-ns-resize touch-none rounded-full outline-none focus-visible:ring-1 focus-visible:ring-amber", staged ? "text-amber" : "text-foreground")}
        onPointerDown={(e) => {
          start.current = { y: e.clientY, v: value };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!start.current) return;
          onChange(clamp(start.current.v + ((start.current.y - e.clientY) * (max - min)) / DRAG_PX));
        }}
        onPointerUp={() => (start.current = null)}
        onPointerCancel={() => (start.current = null)}
        onDoubleClick={() => onChange(0)}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 2 : 0.5;
          if (e.key === "ArrowUp" || e.key === "ArrowRight") onChange(clamp(value + step));
          else if (e.key === "ArrowDown" || e.key === "ArrowLeft") onChange(clamp(value - step));
          else return;
          e.preventDefault();
        }}
      >
        <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
          <circle cx="15" cy="15" r="12.5" className="fill-black/45 stroke-white/20" strokeWidth="1" />
          <circle cx="15" cy="15" r="9" className="fill-white/5" />
          <line x1="15" y1="15" x2="15" y2="5.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" transform={`rotate(${angle} 15 15)`} />
        </svg>
      </div>
      <span className="mk-label text-[8px] leading-none">{label}</span>
      <span className={cn("font-mono text-[8px] leading-none", staged ? "text-amber" : "text-engrave")}>{text}</span>
    </div>
  );
}
