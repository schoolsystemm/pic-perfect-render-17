import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";

import { fileToLogo, GFX_LAYERS } from "@/lib/mk/graphics";
import type { Corner, GfxId, GraphicsConfig } from "@/lib/mk/types";
import { engine } from "@/lib/mk/use-switcher";
import { cn } from "@/lib/utils";

const field =
  "h-8 w-full min-w-0 rounded-sm border border-border bg-input px-2 font-mono text-xs text-foreground outline-none focus:border-ring";

function CornerSelect({ value, onChange }: { value: Corner; onChange: (c: Corner) => void }) {
  return (
    <select className={field} value={value} onChange={(e) => onChange(e.target.value as Corner)} aria-label="Position">
      <option value="tl">Top left</option>
      <option value="tr">Top right</option>
      <option value="bl">Bottom left</option>
      <option value="br">Bottom right</option>
    </select>
  );
}

function Card({
  id,
  active,
  children,
}: {
  id: GfxId;
  active: boolean;
  children: React.ReactNode;
}) {
  const label = GFX_LAYERS.find((l) => l.id === id)!.label;
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-sm bg-bezel/40 p-2">
      <button
        type="button"
        onPointerDown={(event) => {
          event.preventDefault();
          void engine.toggleGraphic(id);
        }}
        aria-pressed={active}
        className={cn(
          "mk-button flex h-11 w-full items-center justify-between rounded-sm px-3 text-sm",
          active && "mk-lit-program",
        )}
      >
        <span>{label}</span>
        <span className="font-mono text-[10px]">{active ? "ON AIR" : "OFF"}</span>
      </button>
      {children}
    </div>
  );
}

interface GraphicsPanelProps {
  graphics: GraphicsConfig;
  active: Record<GfxId, boolean>;
}

/** Built-in graphics — controlled separately from the DSKs. */
export function GraphicsPanel({ graphics: g, active }: GraphicsPanelProps) {
  return (
    <section className="mk-panel shrink-0 rounded-md p-2">
      <header className="mb-2 flex items-center gap-2">
        <span className="mk-label text-foreground">Graphics</span>
        <Link to="/graphics" className="mk-button ml-auto flex h-7 items-center rounded-sm px-2 text-[10px]">Graphics studio</Link>
      </header>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <Card id="logo" active={active.logo}>
          <div className="flex gap-1.5">
            <label className="mk-button flex h-8 flex-1 cursor-pointer items-center justify-center rounded-sm px-2 text-[10px]">
              {g.logo.image ? "Change logo" : "Upload logo"}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  try {
                    engine.setGraphic("logo", { image: await fileToLogo(file) });
                  } catch {
                    /* invalid image */
                  }
                }}
              />
            </label>
            {g.logo.image && (
              <img src={g.logo.image} alt="Logo" className="h-8 w-10 rounded-sm bg-bezel object-contain p-0.5" />
            )}
          </div>
          <CornerSelect value={g.logo.pos} onChange={(pos) => engine.setGraphic("logo", { pos })} />
        </Card>

        <Card id="lower" active={active.lower}>
          <input className={field} value={g.lower.name} placeholder="Name" onChange={(e) => engine.setGraphic("lower", { name: e.target.value })} />
          <input className={field} value={g.lower.title} placeholder="Title / role" onChange={(e) => engine.setGraphic("lower", { title: e.target.value })} />
          <div className="flex flex-wrap items-center gap-1">
            {g.lower.presets.map((p, i) => (
              <span key={i} className="mk-button flex h-7 max-w-full items-center rounded-sm text-[10px]">
                <button type="button" className="max-w-[7rem] truncate px-2" onClick={() => engine.applyLowerPreset(i)} title={`${p.name} — ${p.title}`}>
                  {p.name}
                </button>
                <button type="button" aria-label={`Remove ${p.name}`} className="px-1 opacity-60 hover:opacity-100" onClick={() => engine.removeLowerPreset(i)}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <button type="button" className="mk-button h-7 rounded-sm px-2 text-[10px]" onClick={() => engine.addLowerPreset()}>
              + Save
            </button>
          </div>
        </Card>

        <Card id="ticker" active={active.ticker}>
          <input className={field} value={g.ticker.text} placeholder="Ticker text" onChange={(e) => engine.setGraphic("ticker", { text: e.target.value })} />
          <input className={field} value={g.ticker.label} placeholder="Label (e.g. LIVE, NEWS)" onChange={(e) => engine.setGraphic("ticker", { label: e.target.value })} />
        </Card>

        <Card id="clock" active={active.clock}>
          <CornerSelect value={g.clock.pos} onChange={(pos) => engine.setGraphic("clock", { pos })} />
        </Card>

        <Card id="badge" active={active.badge}>
          <input className={field} value={g.badge.text} placeholder="Badge text" onChange={(e) => engine.setGraphic("badge", { text: e.target.value })} />
          <CornerSelect value={g.badge.pos} onChange={(pos) => engine.setGraphic("badge", { pos })} />
        </Card>
      </div>
    </section>
  );
}
