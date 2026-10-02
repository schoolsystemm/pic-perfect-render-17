import { useRef, useState } from "react";

import type { PlacePos } from "@/lib/mk/fx";
import { cn } from "@/lib/utils";

interface PlacePickerProps {
  /** Current spot (0..1 across the free space). null = not placed by hand yet. */
  pos: PlacePos | null;
  /** Share of the picture width the item takes (0.05 .. 1). */
  size: number;
  /** Share of the picture HEIGHT the item takes. Defaults to `size` (same shape as the screen, which is right for PiP / DSK). */
  height?: number;
  /** Called when the finger / mouse is released, or a snap button is pressed. */
  onChange: (pos: PlacePos) => void;
  label?: string;
  disabled?: boolean;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const SNAPS: PlacePos[] = [
  { x: 0, y: 0 },
  { x: 0.5, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 0.5 },
  { x: 0.5, y: 0.5 },
  { x: 1, y: 0.5 },
  { x: 0, y: 1 },
  { x: 0.5, y: 1 },
  { x: 1, y: 1 },
];

/**
 * A small 16:9 screen: press / drag where the item should sit. What you see is what OBS gets
 * (the same 0..1 spot the engine turns into pixels).
 */
export function PlacePicker({ pos, size, height, onChange, label, disabled }: PlacePickerProps) {
  const box = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<PlacePos | null>(null);
  const shown = drag ?? pos;
  const w = Math.min(1, Math.max(0.05, size));
  const h = Math.min(1, Math.max(0.03, height ?? size));

  const read = (e: React.PointerEvent): PlacePos => {
    const r = box.current!.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    // The pointer is the CENTRE of the item; the free space is what is left after its size.
    return {
      x: w >= 1 ? 0 : clamp01((px - w / 2) / (1 - w)),
      y: h >= 1 ? 0 : clamp01((py - h / 2) / (1 - h)),
    };
  };

  return (
    <div className="grid gap-1">
      {label && <span className="mk-label text-[9px]">{label}</span>}
      <div
        ref={box}
        role="application"
        aria-label={label ?? "Pick the position"}
        onPointerDown={(e) => {
          if (disabled) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag(read(e));
        }}
        onPointerMove={(e) => {
          if (drag) setDrag(read(e));
        }}
        onPointerUp={(e) => {
          if (!drag) return;
          const next = read(e);
          setDrag(null);
          onChange(next);
        }}
        onPointerCancel={() => setDrag(null)}
        className={cn(
          "relative aspect-video w-full touch-none overflow-hidden rounded-[3px] border border-white/15 bg-black/60 select-none",
          disabled ? "opacity-50" : "cursor-crosshair",
        )}
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.08) 1px, transparent 1px)",
          backgroundSize: "33.333% 33.333%",
        }}
      >
        {shown && (
          <div
            className="absolute rounded-[2px] border-2 border-amber bg-amber/30"
            style={{
              width: `${w * 100}%`,
              height: `${h * 100}%`,
              left: `${shown.x * (1 - w) * 100}%`,
              top: `${shown.y * (1 - h) * 100}%`,
            }}
          />
        )}
        {!shown && (
          <span className="absolute inset-0 grid place-items-center font-mono text-[9px] opacity-60">
            tap where it should sit
          </span>
        )}
      </div>
      <div className="grid grid-cols-9 gap-0.5" role="group" aria-label="Snap to a spot">
        {SNAPS.map((p, i) => (
          <button
            key={i}
            type="button"
            disabled={disabled}
            title="Snap here"
            onClick={() => onChange(p)}
            className={cn(
              "mk-button h-5 min-w-0 rounded-[2px] px-0 font-mono text-[8px]",
              shown &&
                Math.abs(shown.x - p.x) < 0.02 &&
                Math.abs(shown.y - p.y) < 0.02 &&
                "mk-lit-amber",
            )}
          >
            {["◤", "▲", "◥", "◀", "●", "▶", "◣", "▼", "◢"][i]}
          </button>
        ))}
      </div>
    </div>
  );
}
