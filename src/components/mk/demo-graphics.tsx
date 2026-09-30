import { useClock } from "@/components/mk/use-clock";
import type { Corner, GfxId, GraphicsConfig } from "@/lib/mk/types";
import { cn } from "@/lib/utils";

const corner = (pos: Corner) =>
  cn(
    "pointer-events-none absolute",
    pos === "tl" && "top-6 left-2",
    pos === "tr" && "top-6 right-2",
    pos === "bl" && "bottom-12 left-2",
    pos === "br" && "right-2 bottom-12",
  );

/** Demo Mode has no real OBS output, so the layers are drawn over the fake video. */
export function DemoGraphics({ g, active }: { g: GraphicsConfig; active: Record<GfxId, boolean> }) {
  const now = useClock(500);
  const d = new Date(now || 0);
  const p = (n: number) => String(n).padStart(2, "0");
  let h = d.getHours();
  let suffix = "";
  if (!g.clock.h24) {
    suffix = h >= 12 ? " PM" : " AM";
    h = h % 12 || 12;
  }
  const time = now ? `${p(h)}:${p(d.getMinutes())}${g.clock.seconds ? `:${p(d.getSeconds())}` : ""}${suffix}` : "--:--";

  return (
    <>
      {active.logo && g.logo.image && (
        <img src={g.logo.image} alt="" className={corner(g.logo.pos)} style={{ width: `${g.logo.size}%` }} />
      )}
      {active.badge && (
        <div
          className={cn(corner(g.badge.pos), "flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[9px] font-extrabold tracking-widest text-white sm:text-xs")}
          style={{ background: g.badge.color }}
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
          {g.badge.text}
        </div>
      )}
      {active.clock && (
        <div className={cn(corner(g.clock.pos), "rounded-sm bg-black/80 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white sm:text-xs")}>
          {time}
        </div>
      )}
      {active.lower && (
        <div className="pointer-events-none absolute bottom-14 left-[6%] flex">
          <div className="w-1" style={{ background: g.lower.accent }} />
          <div className="bg-black/90 px-2 py-1 text-white">
            <div className="text-[11px] leading-none font-extrabold tracking-wide uppercase sm:text-sm">{g.lower.name}</div>
            <div className="text-[9px] leading-tight sm:text-[11px]" style={{ color: g.lower.accent }}>
              {g.lower.title}
            </div>
          </div>
        </div>
      )}
      {active.ticker && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[1.3rem] flex h-5 overflow-hidden bg-black/90 text-white sm:h-6">
          {g.ticker.label && (
            <span
              className="z-10 flex items-center px-2 text-[9px] font-extrabold tracking-widest sm:text-[11px]"
              style={{ background: g.ticker.accent }}
            >
              {g.ticker.label}
            </span>
          )}
          <div className="relative flex-1 overflow-hidden">
            <div
              className="absolute inset-y-0 flex items-center text-[10px] whitespace-nowrap sm:text-xs"
              style={{ animation: `mk-marquee ${Math.max(5, g.ticker.speed)}s linear infinite` }}
            >
              {g.ticker.text}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
