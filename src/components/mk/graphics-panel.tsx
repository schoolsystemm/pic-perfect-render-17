import { Link } from "@tanstack/react-router";
import { Play, X } from "lucide-react";
import { useState } from "react";

import { GFX_LAYERS } from "@/lib/mk/graphics";
import { useGfxLibrary } from "@/lib/mk/gfx-library";
import type { GfxId, GraphicsConfig } from "@/lib/mk/types";
import { engine, useSwitcher } from "@/lib/mk/use-switcher";
import { cn } from "@/lib/utils";

const SHORT: Record<GfxId, string> = {
  logo: "Logo",
  lower: "Lower Third",
  ticker: "Ticker",
  clock: "Clock",
  badge: "Live Badge",
  news: "News Tags",
  breaking: "Breaking",
  score: "Scoreboard",
  social: "Social",
  full: "Full Screen",
};

interface GraphicsPanelProps {
  graphics: GraphicsConfig;
  active: Record<GfxId, boolean>;
}

/** Take graphics to air, load saved designs, type the next guest. Full design work is in the Studio. */
export function GraphicsPanel({ graphics: g, active }: GraphicsPanelProps) {
  const saved = useGfxLibrary();
  const live = useSwitcher();
  const tagsOn = live.live.tags;
  const [msg, setMsg] = useState("");
  const { scrolls } = g.ticker;

  /** Type a message and send it straight on air as a scroll (applied on press, never while typing). */
  const sendTyped = () => {
    const text = msg.trim();
    if (!text) return;
    void engine.playText(text);
    setMsg("");
  };

  return (
    <section className="mk-panel flex h-full min-h-0 min-w-0 flex-col gap-1 overflow-y-auto rounded-md p-1.5">
      <header className="flex items-center gap-2">
        <span className="mk-label text-foreground">Graphics</span>
        <Link to="/graphics" className="mk-button ml-auto flex h-[18px] items-center rounded-[3px] px-2 text-[9px]">
          Studio
        </Link>
      </header>

      <div className="grid grid-cols-4 gap-1">
        {GFX_LAYERS.map((l) => (
          <button
            key={l.id}
            type="button"
            onPointerDown={(event) => {
              event.preventDefault();
              void engine.toggleGraphic(l.id);
            }}
            aria-pressed={active[l.id]}
            title={active[l.id] ? `${l.label} is ON AIR — tap to take off` : `Take ${l.label} to air`}
            className={cn("mk-button flex h-8 min-w-0 items-center justify-center truncate rounded-[3px] px-0.5 text-[10px] tracking-[0.03em]", active[l.id] && "mk-lit-program")}
          >
            {SHORT[l.id]}
          </button>
        ))}
        <button
          type="button"
          disabled={live.fx.running}
          onPointerDown={(event) => {
            event.preventDefault();
            void engine.toggleTags();
          }}
          aria-pressed={tagsOn}
          title={tagsOn ? "Location tags are ON AIR — tap to take off" : "Take the location tags to air (one per pane with MERGE, otherwise for the cam on air). Set them up in Graphics Studio."}
          className={cn("mk-button flex h-8 min-w-0 items-center justify-center truncate rounded-[3px] px-0.5 text-[10px] tracking-[0.03em]", tagsOn && "mk-lit-program")}
        >
          Location Tags
        </button>
        <select
          aria-label="Saved graphics"
          value=""
          onChange={(e) => {
            const item = saved.find((i) => i.id === e.target.value);
            if (item) engine.loadSavedGraphic(item);
          }}
          className="mk-button h-8 min-w-0 rounded-[3px] px-1 text-[10px] normal-case"
        >
          <option value="">Saved…</option>
          {GFX_LAYERS.map((l) => {
            const items = saved.filter((i) => i.layer === l.id);
            return items.length ? (
              <optgroup key={l.id} label={l.label}>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </optgroup>
            ) : null;
          })}
          {saved.length === 0 && <option disabled>Nothing saved yet — build one in Studio</option>}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-1">
        <input
          className="mk-field h-6 min-w-0 rounded-[3px] px-1.5 text-[11px]"
          value={g.lower.name}
          placeholder="Guest Name"
          onChange={(e) => engine.setGraphic("lower", { name: e.target.value })}
        />
        <input
          className="mk-field h-6 min-w-0 rounded-[3px] px-1.5 text-[11px]"
          value={g.lower.title}
          placeholder="Title / Role"
          onChange={(e) => engine.setGraphic("lower", { title: e.target.value })}
        />
      </div>

      <div className="flex min-h-0 shrink-0 items-center gap-1 overflow-x-auto">
        <button
          type="button"
          className="mk-button h-[22px] shrink-0 rounded-[3px] px-2 text-[9px]"
          onClick={() => engine.addLowerPreset()}
          title="Save this name + title so it is one tap next time"
        >
          + Save name
        </button>
        {g.lower.presets.map((p, i) => (
          <span key={i} className="mk-button flex h-[22px] shrink-0 items-center rounded-[3px] text-[10px] normal-case">
            <button type="button" className="max-w-[6rem] truncate px-1.5" onClick={() => engine.applyLowerPreset(i)} title={`${p.name} — ${p.title}`}>
              {p.name}
            </button>
            <button type="button" aria-label={`Remove ${p.name}`} className="px-1 opacity-60 hover:opacity-100" onClick={() => engine.removeLowerPreset(i)}>
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
      </div>

      {/* SCROLL: ready-made moving messages. One tap = on air. */}
      <div className="flex shrink-0 items-center gap-1 border-t border-white/5 pt-1">
        <span className="mk-label shrink-0 text-[8px]">Scroll</span>
        <input
          className="mk-field h-6 min-w-0 flex-1 rounded-[3px] px-1.5 text-[11px]"
          value={msg}
          placeholder="Type a message, press Enter"
          onChange={(e) => setMsg(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") sendTyped();
          }}
        />
        <button
          type="button"
          disabled={!msg.trim()}
          onClick={sendTyped}
          className="mk-button flex h-6 shrink-0 items-center gap-1 rounded-[3px] px-1.5 text-[9px]"
          title="Send this message on air now. Use + Save current to keep it as a ready-made scroll."
        >
          <Play className="h-3 w-3" />
          GO
        </button>
      </div>
      <div className="flex min-h-0 shrink-0 flex-wrap items-center gap-1">
        {scrolls.map((p, i) => (
          <span key={`${p.name}-${i}`} className={cn("mk-button flex h-[22px] max-w-full items-center rounded-[3px] text-[10px] normal-case", active.ticker && g.ticker.text === p.text && "mk-lit-program")}>
            <button
              type="button"
              className="flex max-w-[7rem] items-center gap-1 truncate px-1.5"
              onClick={() => void engine.playScroll(i)}
              title={`${p.label ? p.label + " — " : ""}${p.text}\n${p.loop ? "Repeats" : "Runs once"} · ${p.speed}s · ${p.direction === "left" ? "right → left" : "left → right"}`}
            >
              <span className="text-[8px] opacity-70">{p.loop ? "∞" : "1×"}</span>
              <span className="truncate">{p.name}</span>
            </button>
            <button type="button" aria-label={`Remove ${p.name}`} className="px-1 opacity-60 hover:opacity-100" onClick={() => engine.removeScroll(i)}>
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        <button
          type="button"
          className="mk-button h-[22px] shrink-0 rounded-[3px] px-2 text-[9px]"
          onClick={() => engine.addScroll()}
          title="Save the ticker's current message, speed and direction as a ready-made scroll"
        >
          + Save current
        </button>
      </div>
    </section>
  );
}
