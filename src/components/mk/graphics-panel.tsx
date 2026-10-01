import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";

import { GFX_LAYERS } from "@/lib/mk/graphics";
import { useGfxLibrary } from "@/lib/mk/gfx-library";
import type { GfxId, GraphicsConfig } from "@/lib/mk/types";
import { engine } from "@/lib/mk/use-switcher";
import { cn } from "@/lib/utils";

const SHORT: Record<GfxId, string> = {
  logo: "Logo",
  lower: "Lower Third",
  ticker: "Ticker",
  clock: "Clock",
  badge: "Live Badge",
};

interface GraphicsPanelProps {
  graphics: GraphicsConfig;
  active: Record<GfxId, boolean>;
}

/** Take graphics to air, load saved designs, type the next guest. Full design work is in the Studio. */
export function GraphicsPanel({ graphics: g, active }: GraphicsPanelProps) {
  const saved = useGfxLibrary();
  return (
    <section className="mk-panel flex h-full min-h-0 min-w-0 flex-col gap-1 rounded-md p-1.5">
      <header className="flex items-center gap-2">
        <span className="mk-label text-foreground">Graphics</span>
        <Link to="/graphics" className="mk-button ml-auto flex h-[18px] items-center rounded-[3px] px-2 text-[9px]">
          Studio
        </Link>
      </header>

      <div className="grid grid-cols-3 gap-1">
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

      <div className="flex min-h-0 items-center gap-1 overflow-x-auto">
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
    </section>
  );
}
