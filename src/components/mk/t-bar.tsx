import { useRef } from "react";

interface TBarProps {
  value: number; // 0 = Program (bottom), 1 = Preview (top)
  onChange: (value: number) => void;
  onRelease: (value: number) => void;
}

/** Handle half-height in px: the handle centre travels between PAD and (height - PAD). */
const PAD = 16;

/** Broadcast-style vertical T-bar. Mouse, touch, trackpad and stylus. */
export function TBar({ value, onChange, onRelease }: TBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const last = useRef(value);

  const positionFrom = (clientY: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.height <= PAD * 2) return last.current;
    const travel = rect.height - PAD * 2;
    const p = 1 - (clientY - rect.top - PAD) / travel;
    return Math.min(1, Math.max(0, p));
  };

  const update = (clientY: number) => {
    const p = positionFrom(clientY);
    last.current = p;
    onChange(p);
  };

  const end = () => {
    if (!dragging.current) return;
    dragging.current = false;
    const p = last.current;
    onRelease(p >= 0.95 ? 1 : p <= 0.05 ? 0 : p);
  };

  const percent = Math.round(value * 100);

  return (
    <div className="flex min-h-0 flex-1 items-stretch gap-2">
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="T-Bar transition"
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          dragging.current = true;
          update(event.clientY);
        }}
        onPointerMove={(event) => {
          if (!dragging.current) return;
          event.preventDefault();
          update(event.clientY);
        }}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp") onChange(Math.min(1, value + 0.05));
          else if (event.key === "ArrowDown") onChange(Math.max(0, value - 0.05));
          else if (event.key === "Enter") onRelease(1);
          else if (event.key === "Escape") onRelease(0);
        }}
        className="relative min-h-[6rem] flex-1 cursor-ns-resize touch-none rounded-md border border-white/10 bg-black/30 shadow-[inset_0_2px_8px_oklch(0_0_0/60%)] outline-none focus-visible:border-ring"
      >
        {/* slot */}
        <div
          className="absolute left-1/2 w-1.5 -translate-x-1/2 rounded-full bg-bezel"
          style={{ top: PAD, bottom: PAD }}
        />
        {/* travel fill (rises from the bottom) */}
        <div
          className="absolute left-1/2 w-1.5 -translate-x-1/2 rounded-full bg-amber"
          style={{ bottom: PAD, height: `calc((100% - ${PAD * 2}px) * ${value})` }}
        />
        {/* tick marks */}
        {[0, 25, 50, 75, 100].map((tick) => (
          <div
            key={tick}
            className="absolute right-1 h-px w-2 bg-engrave/50"
            style={{ bottom: `calc(${PAD}px + (100% - ${PAD * 2}px) * ${tick / 100})` }}
          />
        ))}
        {/* handle */}
        <div
          className="mk-cap absolute inset-x-1.5 flex h-8 -translate-y-1/2 items-center justify-center rounded-[3px]"
          style={{ top: `calc(${PAD}px + (100% - ${PAD * 2}px) * ${1 - value})` }}
        >
          <div className="flex flex-col gap-[3px]">
            <span className="block h-px w-8 bg-black/60 shadow-[0_1px_0_oklch(1_0_0/35%)]" />
            <span className="block h-px w-8 bg-black/60 shadow-[0_1px_0_oklch(1_0_0/35%)]" />
            <span className="block h-px w-8 bg-black/60 shadow-[0_1px_0_oklch(1_0_0/35%)]" />
          </div>
        </div>
      </div>
      <div className="flex w-8 shrink-0 flex-col justify-between py-0.5">
        <span className="mk-label text-[8px] leading-tight">PVW</span>
        <span className="font-mono text-[10px] text-amber">{percent}%</span>
        <span className="mk-label text-[8px] leading-tight">PGM</span>
      </div>
    </div>
  );
}
