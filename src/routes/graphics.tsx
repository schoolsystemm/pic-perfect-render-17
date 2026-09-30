import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";

import { fileToLogo, GFX_LAYERS, GFX_SCENE, layerUrl } from "@/lib/mk/graphics";
import { engine, useSwitcher } from "@/lib/mk/use-switcher";
import { DEFAULT_GRAPHICS, type Corner, type GfxId, type GraphicsConfig } from "@/lib/mk/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/graphics")({
  head: () => ({ meta: [{ title: "Graphics — MK VISION" }] }),
  component: GraphicsPage,
});

const field =
  "h-10 w-full min-w-0 rounded-sm border border-border bg-input px-2 font-mono text-sm text-foreground outline-none focus:border-ring";

function Corners({ value, onChange }: { value: Corner; onChange: (c: Corner) => void }) {
  return (
    <select className={field} value={value} onChange={(e) => onChange(e.target.value as Corner)}>
      <option value="tl">Top left</option>
      <option value="tr">Top right</option>
      <option value="bl">Bottom left</option>
      <option value="br">Bottom right</option>
    </select>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="mk-label">{label}</span>
      {children}
    </label>
  );
}

function Preview({ id, g }: { id: GfxId; g: GraphicsConfig }) {
  const url = useMemo(() => layerUrl(id, g), [id, g]);
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-sm border border-border bg-[repeating-conic-gradient(#222_0%_25%,#2b2b2b_0%_50%)] bg-[length:16px_16px]">
      <iframe title={`${id} preview`} src={url} sandbox="allow-scripts" className="absolute inset-0 h-full w-full border-0" />
    </div>
  );
}

function GraphicsPage() {
  const state = useSwitcher();
  const [draft, setDraft] = useState<GraphicsConfig>(state.config.graphics);
  const [scene, setScene] = useState(state.config.graphicsScene);
  const [active, setActive] = useState<GfxId>("lower");

  const dirty =
    JSON.stringify(draft) !== JSON.stringify(state.config.graphics) || scene !== state.config.graphicsScene;

  const edit = <K extends GfxId>(id: K, patch: Partial<GraphicsConfig[K]>) =>
    setDraft((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  const scenes = state.scenes.filter((s) => s !== GFX_SCENE);
  const sceneOptions = scene && !scenes.includes(scene) ? [...scenes, scene] : scenes;

  return (
    <div className="mk-chassis min-h-[100dvh] pb-24">
      <header className="mk-chassis flex items-center gap-3 border-b border-border px-3 py-2">
        <Link to="/" className="mk-button flex h-9 items-center gap-2 rounded-sm px-3 text-xs" aria-label="Back to switcher">
          <ArrowLeft className="h-4 w-4" /> Switcher
        </Link>
        <h1 className="text-base tracking-[0.2em] text-foreground">GRAPHICS</h1>
        <span className="mk-label ml-auto text-[9px]">By Konchella</span>
      </header>

      <div className="mx-auto grid max-w-3xl gap-3 p-3">
        <section className="mk-panel grid gap-3 rounded-md p-3 sm:p-4">
          <h2 className="mk-label text-foreground">Where do the graphics live?</h2>
          <Row label="Add MK Graphics to this scene only">
            <select className={field} value={scene} onChange={(e) => setScene(e.target.value)}>
              <option value="">— not nested in any scene —</option>
              {sceneOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Row>
          <p className="font-mono text-[10px] text-muted-foreground">
            Saving only touches this one scene. To use them on DSK 1 instead, go to Settings → DSK 1 and pick the scene
            “MK Graphics”, then the layer.
          </p>
        </section>

        <div className="flex flex-wrap gap-1.5">
          {GFX_LAYERS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setActive(l.id)}
              className={cn("mk-button h-10 rounded-sm px-3 text-xs", active === l.id && "mk-lit-preview")}
            >
              {l.label}
              {state.gfxActive[l.id] ? " ●" : ""}
            </button>
          ))}
        </div>

        <section className="mk-panel grid gap-3 rounded-md p-3 sm:p-4">
          <div className="flex items-center gap-2">
            <h2 className="mk-label text-foreground">{GFX_LAYERS.find((l) => l.id === active)!.label}</h2>
            <button
              type="button"
              className={cn("mk-button ml-auto h-9 rounded-sm px-3 text-xs", state.gfxActive[active] && "mk-lit-program")}
              onClick={() => void engine.toggleGraphic(active)}
            >
              {state.gfxActive[active] ? "ON AIR — take off" : "Take to air"}
            </button>
          </div>

          <Preview id={active} g={draft} />

          {active === "logo" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Row label="Logo image">
                <span className="flex items-center gap-2">
                  <span className="mk-button flex h-10 flex-1 cursor-pointer items-center justify-center rounded-sm px-2 text-xs">
                    {draft.logo.image ? "Change logo" : "Upload logo"}
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        try {
                          edit("logo", { image: await fileToLogo(file) });
                        } catch {
                          /* invalid image */
                        }
                      }}
                    />
                  </span>
                  {draft.logo.image && (
                    <button type="button" className="mk-button h-10 rounded-sm px-2 text-xs" onClick={() => edit("logo", { image: null })}>
                      Remove
                    </button>
                  )}
                </span>
              </Row>
              <Row label="Position">
                <Corners value={draft.logo.pos} onChange={(pos) => edit("logo", { pos })} />
              </Row>
              <Row label={`Size ${draft.logo.size}%`}>
                <input type="range" min={4} max={40} value={draft.logo.size} className="h-10" onChange={(e) => edit("logo", { size: Number(e.target.value) })} />
              </Row>
            </div>
          )}

          {active === "lower" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Row label="Name">
                <input className={field} value={draft.lower.name} onChange={(e) => edit("lower", { name: e.target.value })} />
              </Row>
              <Row label="Title / role">
                <input className={field} value={draft.lower.title} onChange={(e) => edit("lower", { title: e.target.value })} />
              </Row>
              <Row label="Accent colour">
                <input type="color" className="h-10 w-full rounded-sm border border-border bg-input" value={draft.lower.accent} onChange={(e) => edit("lower", { accent: e.target.value })} />
              </Row>
              <div className="grid gap-1 sm:col-span-2">
                <span className="mk-label">Saved presets</span>
                <div className="flex flex-wrap gap-1">
                  {draft.lower.presets.map((p, i) => (
                    <span key={i} className="mk-button flex h-8 items-center rounded-sm text-xs">
                      <button type="button" className="max-w-[9rem] truncate px-2" onClick={() => edit("lower", { name: p.name, title: p.title })}>
                        {p.name}
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${p.name}`}
                        className="px-2 opacity-60 hover:opacity-100"
                        onClick={() => edit("lower", { presets: draft.lower.presets.filter((_, n) => n !== i) })}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    className="mk-button h-8 rounded-sm px-2 text-xs"
                    onClick={() =>
                      draft.lower.name.trim() &&
                      draft.lower.presets.length < 12 &&
                      edit("lower", { presets: [...draft.lower.presets, { name: draft.lower.name, title: draft.lower.title }] })
                    }
                  >
                    + Save as preset
                  </button>
                </div>
              </div>
            </div>
          )}

          {active === "ticker" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Row label="Ticker text">
                  <input className={field} value={draft.ticker.text} onChange={(e) => edit("ticker", { text: e.target.value })} />
                </Row>
              </div>
              <Row label="Label (LIVE, NEWS…)">
                <input className={field} value={draft.ticker.label} onChange={(e) => edit("ticker", { label: e.target.value })} />
              </Row>
              <Row label="Colour">
                <input type="color" className="h-10 w-full rounded-sm border border-border bg-input" value={draft.ticker.accent} onChange={(e) => edit("ticker", { accent: e.target.value })} />
              </Row>
              <Row label={`Speed — ${draft.ticker.speed}s per pass`}>
                <input type="range" min={8} max={60} value={draft.ticker.speed} className="h-10" onChange={(e) => edit("ticker", { speed: Number(e.target.value) })} />
              </Row>
            </div>
          )}

          {active === "clock" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Row label="Position">
                <Corners value={draft.clock.pos} onChange={(pos) => edit("clock", { pos })} />
              </Row>
              <div className="flex items-end gap-2">
                <label className="mk-button flex h-10 items-center gap-2 rounded-sm px-3 text-xs">
                  <input type="checkbox" checked={draft.clock.h24} onChange={(e) => edit("clock", { h24: e.target.checked })} /> 24h
                </label>
                <label className="mk-button flex h-10 items-center gap-2 rounded-sm px-3 text-xs">
                  <input type="checkbox" checked={draft.clock.seconds} onChange={(e) => edit("clock", { seconds: e.target.checked })} /> Seconds
                </label>
              </div>
            </div>
          )}

          {active === "badge" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Row label="Badge text">
                <input className={field} value={draft.badge.text} onChange={(e) => edit("badge", { text: e.target.value })} />
              </Row>
              <Row label="Position">
                <Corners value={draft.badge.pos} onChange={(pos) => edit("badge", { pos })} />
              </Row>
              <Row label="Colour">
                <input type="color" className="h-10 w-full rounded-sm border border-border bg-input" value={draft.badge.color} onChange={(e) => edit("badge", { color: e.target.value })} />
              </Row>
            </div>
          )}

          <button
            type="button"
            className="mk-button h-9 w-fit rounded-sm px-3 text-xs"
            onClick={() => setDraft((d) => ({ ...d, [active]: DEFAULT_GRAPHICS[active] }))}
          >
            Reset this graphic to default
          </button>
        </section>

        <section className="mk-panel grid gap-2 rounded-md p-3 sm:p-4">
          <h2 className="mk-label text-foreground">Clean up</h2>
          <button
            type="button"
            className="mk-button h-9 w-fit rounded-sm px-3 text-xs"
            onClick={() => void engine.saveGraphics(draft, scene, true)}
          >
            Save and remove MK Graphics from every other scene
          </button>
          <p className="font-mono text-[10px] text-muted-foreground">
            Use once if an older version added the graphics to all your scenes.
          </p>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <span className="font-mono text-[10px] text-muted-foreground">{dirty ? "Unsaved changes" : "All changes saved"}</span>
          <button
            type="button"
            disabled={!dirty}
            className={cn("mk-button ml-auto h-11 rounded-sm px-6 text-sm text-foreground", dirty && "mk-lit-amber")}
            onClick={() => void engine.saveGraphics(draft, scene)}
          >
            Save
          </button>
        </div>
      </div>
      {state.notice && (
        <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-3">
          <div className="mk-panel rounded-md border-amber px-3 py-2 font-mono text-xs text-amber">{state.notice}</div>
        </div>
      )}
    </div>
  );
}
