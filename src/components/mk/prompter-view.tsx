import { useEffect, useRef } from "react";

import { posOf, type PrompterState } from "@/lib/mk/prompter";
import { cn } from "@/lib/utils";

/** Reading line sits this far down the screen. */
const MARK = 35;

/** A line like "[CAM 2]" or "[PAUSE]" is a cue for the presenter, shown in amber. */
const isCue = (ln: string) => /^\s*\[.*\]\s*$/.test(ln);

/**
 * The scrolling script. `full` = the real output (font sized in % of screen height);
 * otherwise a small monitor inside the panel (fixed 12px; line wrapping differs from the output,
 * but speed and position match because both are measured in em).
 */
export function PrompterView({ state, full = false, onEnd }: { state: PrompterState; full?: boolean; onEnd?: (endEm: number) => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  const endRef = useRef(onEnd);
  endRef.current = onEnd;

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let raf = 0;
    const frame = () => {
      const px = parseFloat(getComputedStyle(el).fontSize) || 16;
      const endEm = el.scrollHeight / px;
      const pos = Math.min(posOf(state), endEm);
      el.style.transform = `translateY(${-pos}em)`;
      if (state.playing) {
        if (posOf(state) >= endEm) endRef.current?.(endEm);
        else raf = requestAnimationFrame(frame);
      }
    };
    frame();
    return () => cancelAnimationFrame(raf);
  }, [state]);

  const lines = state.text.split("\n");
  return (
    <div
      className="relative h-full w-full overflow-hidden bg-black"
      style={{ transform: `scale(${state.mirror ? -1 : 1}, ${state.flip ? -1 : 1})` }}
    >
      <div
        ref={scroller}
        className="absolute inset-x-0 text-center font-bold text-white will-change-transform"
        style={{ top: `${MARK}%`, fontSize: full ? `${state.size}vh` : "12px", lineHeight: 1.35, padding: "0 6%", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
      >
        {state.text.trim() === "" ? (
          <div className="text-white/30">Paste your script on the switcher’s Prompter tab.</div>
        ) : (
          lines.map((ln, i) => (
            <div key={i} className={cn(isCue(ln) && "text-amber/80 italic")}>
              {ln || "\u00A0"}
            </div>
          ))
        )}
      </div>
      {/* reading line + soft fade top and bottom */}
      <div className="pointer-events-none absolute inset-x-0 border-t border-amber/40" style={{ top: `${MARK}%` }} />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[12%] bg-gradient-to-b from-black to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[18%] bg-gradient-to-t from-black to-transparent" />
    </div>
  );
}
