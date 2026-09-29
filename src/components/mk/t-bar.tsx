import { useCallback, useRef } from "react";

import { cn } from "@/lib/utils";

interface TBarProps {
  value: number; // 0 = Program, 1 = Preview
  onChange: (value: number) => void;
  onRelease: (value: number) => void;
}

/** Broadcast-style vertical T-bar. Mouse, touch, trackpad and stylus. */
export function TBar({ value, onChange, onRelease }: TBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const positionFrom = useCallback((clientY: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.height === 0) return 0;
    return Math.min(1, Math.max(0, 1 - (clientY - rect.top) / rect.height));
  }, []);

  const percent = Math.round(value * 100);

  return (
    <div className="flex flex-1 items-stretch gap-2">
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="T-Bar transition"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          dragging.current = true;
          onChange(positionFrom(event.clientY));
        }}
        onPointerMove={(event) => {
          if (!dragging.current) return;
          event.preventDefault();
          onChange(positionFrom(event.clientY));
        }}
        onPointerUp={(event) => {
          if (!dragging.current) return;
          dragging.current = false;
          const next = positionFrom(event.clientY);
          onRelease(next >= 0.95 ? 1 : next <= 0.05 ? 0 : next);
        }}
        onPointerCancel={() => {
          dragging.current = false;
          onRelease(value);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp") onChange(Math.min(1, value + 0.05));
          if (event.key === "ArrowDown") onChange(Math.max(0, value - 0.05));
          if (event.key === "Enter") onRelease(1);
        }}
        className="mk-panel relative flex-1 cursor-ns-resize touch-none rounded-md"
      >
        {/* travel gradient: preview fill rises from the bottom */}
        <div
          className="absolute inset-x-0 bottom-0 rounded-b-md bg-preview/25"
          style={{ height: `${percent}%` }}
        />
        <div className="absolute inset-y-3 left-1/2 w-px -translate-x-1/2 bg-bezel" />
        {[0, 25, 50, 75, 100].map((tick) => (
          <div
            key={tick}
            className="absolute right-1.5 h-px w-2 bg-engrave/40"
            style={{ bottom: `calc(${tick}% - 0.5px)` }}
          />
        ))}
        <div
          className={cn(
            "absolute inset-x-1 h-11 -translate-y-1/2 rounded-sm border border-border",
            "flex items-center justify-center",
          )}
          style={{
            bottom: `calc(${percent}% - 1.375rem)`,
            background: "var(--brushed-panel)",
            boxShadow: "var(--inset-bezel)",
          }}
        >
          <div className="flex flex-col gap-[3px]">
            <span className="block h-px w-8 bg-engrave/60" />
            <span className="block h-px w-8 bg-engrave/60" />
            <span className="block h-px w-8 bg-engrave/60" />
          </div>
        </div>
      </div>
      <div className="flex w-8 flex-col justify-between py-1">
        <span className="mk-label rotate-0 text-[9px] leading-tight">PVW</span>
        <span className="font-mono text-[10px] text-engrave">{percent}%</span>
        <span className="mk-label text-[9px] leading-tight">PGM</span>
      </div>
    </div>
  );
}
