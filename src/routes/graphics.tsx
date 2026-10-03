import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Copy, Download, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { GfxRundown } from "@/components/mk/gfx-rundown";
import { PlacePicker } from "@/components/mk/place-picker";
import { fileToLogo, GFX_LAYERS, GFX_SCENE, layerUrl } from "@/lib/mk/graphics";
import {
  exportJson,
  gfxLibrary,
  MAX_LINK_CHARS,
  parsePack,
  parseShare,
  sanitizeLayer,
  shareLink,
  useGfxLibrary,
  type SavedGraphic,
} from "@/lib/mk/gfx-library";
import { applyTheme, GFX_THEMES } from "@/lib/mk/gfx-themes";
import { engine, useSwitcher } from "@/lib/mk/use-switcher";
import {
  BADGE_STYLES,
  CLOCK_STYLES,
  DEFAULT_GRAPHICS,
  FULL_KINDS,
  GFX_ANIMS,
  GFX_FONTS,
  GFX_IDS,
  LOWER_STYLES,
  TICKER_STYLES,
  type Corner,
  type FullKind,
  type GfxAnim,
  type GfxId,
  type GraphicsConfig,
} from "@/lib/mk/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/graphics")({
  head: () => ({ meta: [{ title: "Graphics Studio — MK VISION" }] }),
  validateSearch: (search: Record<string, unknown>): { share?: string } =>
    typeof search["share"] === "string" ? { share: search["share"] } : {},
  component: GraphicsPage,
});

const field = "mk-field h-8 w-full min-w-0 rounded-[3px] px-2 text-xs";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="mk-label text-[9px]">{label}</span>
      {children}
    </label>
  );
}

/**
 * Pick where a graphic sits: tap or drag on a mini screen (same picker as PIP / DSK in Settings),
 * or use the corner list. Choosing a corner clears the hand-placed spot.
 */
function Place({
  at,
  corner,
  onAt,
  onCorner,
  w,
  h,
  label = "Position — tap or drag",
}: {
  at: { x: number; y: number } | null;
  corner?: Corner;
  onAt: (at: { x: number; y: number } | null) => void;
  onCorner?: (c: Corner) => void;
  /** Rough width / height of the item as a share of the picture (for the little preview box). */
  w: number;
  h: number;
  label?: string;
}) {
  return (
    <div className="col-span-2 grid gap-1.5">
      <PlacePicker label={label} pos={at} size={w} height={h} onChange={(p) => onAt(p)} />
      <div className="flex items-center gap-1.5">
        {corner && onCorner && (
          <select
            className={field}
            value={at ? "" : corner}
            onChange={(e) => {
              onCorner(e.target.value as Corner);
              onAt(null);
            }}
            aria-label="Or pick a corner"
          >
            {at && <option value="">Custom spot</option>}
            <option value="tl">Top left</option>
            <option value="tr">Top right</option>
            <option value="bl">Bottom left</option>
            <option value="br">Bottom right</option>
          </select>
        )}
        {at && (
          <button type="button" className="mk-button h-8 shrink-0 rounded-[3px] px-2 text-[10px]" onClick={() => onAt(null)}>
            RESET
          </button>
        )}
      </div>
    </div>
  );
}

function Pick<T extends string>({
  value,
  list,
  onChange,
}: {
  value: T;
  list: readonly { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <select className={field} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {list.map((l) => (
        <option key={l.id} value={l.id}>
          {l.label}
        </option>
      ))}
    </select>
  );
}

function Colour({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="color"
      className="h-8 w-full cursor-pointer rounded-[3px] border border-white/15 bg-black/30 p-0.5"
      value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function Range({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "%",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <Row label={`${label} ${value}${unit}`}>
      <input type="range" className="mk-range h-8" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </Row>
  );
}

function Anim({ value, onChange }: { value: GfxAnim; onChange: (v: GfxAnim) => void }) {
  return (
    <Row label="Comes on with">
      <Pick value={value} list={GFX_ANIMS} onChange={onChange} />
    </Row>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" aria-pressed={checked} onClick={() => onChange(!checked)} className={cn("mk-button h-8 rounded-[3px] px-3 text-[10px]", checked && "mk-lit-amber")}>
      {label}
    </button>
  );
}

type Backdrop = "video" | "checker" | "black";
const BACKDROP: Record<Backdrop, string> = {
  video: "bg-[linear-gradient(135deg,oklch(0.38_0.1_250),oklch(0.2_0.06_300)_55%,oklch(0.3_0.08_20))]",
  checker: "bg-[repeating-conic-gradient(#222_0%_25%,#2e2e2e_0%_50%)] bg-[length:16px_16px]",
  black: "bg-black",
};

function Preview({ id, g, backdrop }: { id: GfxId; g: GraphicsConfig; backdrop: Backdrop }) {
  const part = JSON.stringify(g[id]);
  const url = useMemo(() => layerUrl(id, g), [id, part]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={cn("relative aspect-video w-full overflow-hidden rounded-[3px] border border-white/10", BACKDROP[backdrop])}>
      <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-black/40 to-transparent" />
      <iframe title={`${id} preview`} src={url} sandbox="allow-scripts" className="absolute inset-0 h-full w-full border-0 bg-transparent" />
    </div>
  );
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[^\w-]+/g, "_") || "graphic"}.mkgfx.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function GraphicsPage() {
  const state = useSwitcher();
  const { share } = Route.useSearch();
  const library = useGfxLibrary();
  const [draft, setDraft] = useState<GraphicsConfig>(state.config.graphics);
  const [scene, setScene] = useState(state.config.graphicsScene);
  const [mode, setMode] = useState<"design" | "rundown">("design");
  const [active, setActive] = useState<GfxId>("lower");
  const [backdrop, setBackdrop] = useState<Backdrop>("video");
  const [saveName, setSaveName] = useState("");
  const [paste, setPaste] = useState("");
  const [incoming, setIncoming] = useState<ReturnType<typeof parsePack> | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  };

  // A share link opened on this page waits for a click before anything is added.
  useEffect(() => {
    if (!share) return;
    try {
      setIncoming(parseShare(share));
    } catch (e) {
      say(e instanceof Error ? e.message : "Could not read that share link");
    }
  }, [share]);

  // When a layer changes outside this editor (Graphics Rundown take, switcher panel), mirror it into the
  // draft so a later Save can never put an older copy back on air.
  const prevCfg = useRef(state.config.graphics);
  useEffect(() => {
    const was = prevCfg.current;
    const now = state.config.graphics;
    prevCfg.current = now;
    const changed = GFX_IDS.filter((id) => JSON.stringify(was[id]) !== JSON.stringify(now[id]));
    if (changed.length === 0) return;
    setDraft((d) => {
      const n = { ...d } as Record<GfxId, unknown>;
      for (const id of changed) n[id] = now[id];
      return n as unknown as GraphicsConfig;
    });
  }, [state.config.graphics]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(state.config.graphics) || scene !== state.config.graphicsScene;

  const edit = <K extends GfxId>(id: K, patch: Partial<GraphicsConfig[K]>) =>
    setDraft((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  const scenes = state.scenes.filter((s) => s !== GFX_SCENE);
  const sceneOptions = scene && !scenes.includes(scene) ? [...scenes, scene] : scenes;
  const mine = library.filter((i) => i.layer === active);
  const label = GFX_LAYERS.find((l) => l.id === active)!.label;

  const load = (item: SavedGraphic) => {
    setDraft((d) => ({ ...d, [item.layer]: sanitizeLayer(item.layer, item.data) }));
    setActive(item.layer);
    say(`Loaded "${item.name}" — Save to put it in OBS`);
  };

  const copyLink = async (item: SavedGraphic) => {
    const link = shareLink(item);
    if (!link) {
      say(`Too big for a link (over ${MAX_LINK_CHARS} characters) — use the file instead`);
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      say("Share link copied");
    } catch {
      window.prompt("Copy this share link", link);
    }
  };

  const importPack = (items: ReturnType<typeof parsePack>) => {
    const n = gfxLibrary.addMany(items);
    say(`Added ${n} graphic${n === 1 ? "" : "s"} to your library`);
    setIncoming(null);
    setPaste("");
  };

  const c = draft;

  return (
    <div className="mk-chassis flex h-[100dvh] flex-col overflow-hidden">
      <header className="mk-chassis flex h-10 shrink-0 items-center gap-2 border-b border-white/10 px-2">
        <Link to="/" className="mk-button flex h-7 items-center gap-1.5 rounded-[3px] px-2 text-[10px]" aria-label="Back to switcher">
          <ArrowLeft className="h-3.5 w-3.5" /> Switcher
        </Link>
        <h1 className="text-base leading-none tracking-[0.2em] text-foreground">GRAPHICS STUDIO</h1>
        <div className="ml-2 flex gap-1" role="tablist" aria-label="Graphics Studio view">
          {(
            [
              ["design", "Design"],
              ["rundown", "Rundown"],
            ] as const
          ).map(([id, text]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              onClick={() => setMode(id)}
              className={cn("mk-button h-7 rounded-[3px] px-3 text-[10px]", mode === id && "mk-lit-preview")}
            >
              {text}
            </button>
          ))}
        </div>
        <span className="mk-label ml-auto text-[8px]">By Konchella</span>
      </header>

      {mode === "rundown" && (
        <main className="flex min-h-0 flex-1 flex-col p-1.5">
          <GfxRundown say={say} />
        </main>
      )}

      <main
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-1.5 fit:flex-row fit:overflow-hidden",
          mode === "rundown" && "hidden",
        )}
      >
        {/* ------------------------------------------------ left: build + preview */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5">
          <div className="mk-panel flex shrink-0 flex-wrap items-center gap-1 rounded-md p-1.5">
            <span className="mk-label mr-1 text-[9px]" title="Re-colours and re-styles every graphic at once. Save to put it in OBS.">
              Theme
            </span>
            {GFX_THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setDraft((d) => applyTheme(d, t));
                  say(`${t.name} theme applied — Save to put it in OBS`);
                }}
                className="mk-button flex h-7 items-center gap-1.5 rounded-[3px] px-2 text-[10px]"
              >
                <span className="flex h-3 w-5 overflow-hidden rounded-[2px] border border-white/20">
                  <span className="h-full flex-1" style={{ background: t.primary }} />
                  <span className="h-full flex-1" style={{ background: t.secondary }} />
                  <span className="h-full flex-1" style={{ background: t.accent }} />
                </span>
                {t.name}
              </button>
            ))}
          </div>

          <div className="flex shrink-0 flex-wrap gap-1">
            {GFX_LAYERS.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setActive(l.id)}
                className={cn("mk-button h-8 rounded-[3px] px-3 text-[11px]", active === l.id && "mk-lit-preview")}
              >
                {l.label}
                {state.gfxActive[l.id] ? " ●" : ""}
              </button>
            ))}
          </div>

          <section className="mk-panel flex min-h-0 flex-1 flex-col gap-1.5 rounded-md p-1.5">
            <div className="flex shrink-0 items-center gap-1">
              <h2 className="mk-label mr-auto text-foreground">{label} preview</h2>
              {(["video", "checker", "black"] as Backdrop[]).map((b) => (
                <button key={b} type="button" onClick={() => setBackdrop(b)} className={cn("mk-button h-6 rounded-[3px] px-2 text-[9px]", backdrop === b && "mk-lit-amber")}>
                  {b}
                </button>
              ))}
              <button
                type="button"
                className={cn("mk-button h-6 rounded-[3px] px-2 text-[9px]", state.gfxActive[active] && "mk-lit-program")}
                onClick={() => void engine.toggleGraphic(active)}
              >
                {state.gfxActive[active] ? "On air — take off" : "Take to air"}
              </button>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center" style={{ containerType: "size" }}>
              <div style={{ width: "min(100cqw, calc(100cqh * 16 / 9))" }}>
                <Preview id={active} g={draft} backdrop={backdrop} />
              </div>
            </div>
          </section>

          <section className="mk-panel grid shrink-0 gap-1.5 rounded-md p-1.5 md:grid-cols-[1fr_auto]">
            <Row label="Add MK Graphics to this OBS scene only">
              <select className={field} value={scene} onChange={(e) => setScene(e.target.value)}>
                <option value="">— not nested in any scene —</option>
                {sceneOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Row>
            <div className="flex items-end gap-1.5">
              <span className="pb-2 font-mono text-[10px] text-muted-foreground">{dirty ? "Unsaved changes" : "All saved"}</span>
              <button
                type="button"
                className="mk-button h-8 rounded-[3px] px-2 text-[10px]"
                title="Use once if an older version added the graphics to every scene"
                onClick={() => void engine.saveGraphics(draft, scene, true)}
              >
                Save + clean other scenes
              </button>
              <button
                type="button"
                disabled={!dirty}
                className={cn("mk-button h-8 rounded-[3px] px-5 text-xs text-foreground", dirty && "mk-lit-amber")}
                onClick={() => void engine.saveGraphics(draft, scene)}
              >
                Save
              </button>
            </div>
          </section>
        </div>

        {/* ------------------------------------------------ right: controls + library */}
        <div className="flex min-h-0 w-full shrink-0 flex-col gap-1.5 fit:w-[23rem]">
          <section className="mk-panel min-h-0 flex-1 overflow-y-auto rounded-md p-2">
            <h2 className="mk-label mb-2 text-foreground">Design — {label}</h2>
            <div className="grid grid-cols-2 gap-2">
              {active === "logo" && (
                <>
                  <div className="col-span-2">
                    <Row label="Logo image">
                      <span className="flex items-center gap-1.5">
                        <span className="mk-button flex h-8 flex-1 cursor-pointer items-center justify-center gap-1 rounded-[3px] px-2 text-[10px]">
                          <Upload className="h-3 w-3" />
                          {c.logo.image ? "Change logo" : "Upload logo"}
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
                                say("That file is not a valid image");
                              }
                            }}
                          />
                        </span>
                        {c.logo.image && (
                          <button type="button" className="mk-button h-8 rounded-[3px] px-2 text-[10px]" onClick={() => edit("logo", { image: null })}>
                            Remove
                          </button>
                        )}
                      </span>
                    </Row>
                  </div>
                  <Place
                    at={c.logo.at}
                    corner={c.logo.pos}
                    onCorner={(pos) => edit("logo", { pos })}
                    onAt={(at) => edit("logo", { at })}
                    w={c.logo.size / 100}
                    h={(c.logo.size / 100) * (16 / 9) * 0.6}
                  />
                  <Row label="Text mark (used when there is no image)">
                    <input className={field} value={c.logo.text} maxLength={24} placeholder="e.g. UTV" onChange={(e) => edit("logo", { text: e.target.value })} />
                  </Row>
                  <Row label="Mark colour">
                    <Colour value={c.logo.textColor} onChange={(textColor) => edit("logo", { textColor })} />
                  </Row>
                  <Anim value={c.logo.anim} onChange={(anim) => edit("logo", { anim })} />
                  <Range label="Size" value={c.logo.size} min={3} max={60} onChange={(size) => edit("logo", { size })} />
                  <Range label="Opacity" value={c.logo.opacity} min={5} max={100} onChange={(opacity) => edit("logo", { opacity })} />
                </>
              )}

              {active === "lower" && (
                <>
                  <Place
                    at={c.lower.at}
                    onAt={(at) => edit("lower", { at })}
                    w={Math.min(1, 0.42 * (c.lower.size / 100))}
                    h={Math.min(1, 0.17 * (c.lower.size / 100))}
                    label={c.lower.at ? "Position — tap or drag" : "Default spot (bottom left). Tap to place it yourself."}
                  />
                  <Row label="Name">
                    <input className={field} value={c.lower.name} onChange={(e) => edit("lower", { name: e.target.value })} />
                  </Row>
                  <Row label="Title / role">
                    <input className={field} value={c.lower.title} onChange={(e) => edit("lower", { title: e.target.value })} />
                  </Row>
                  <Row label="Style">
                    <Pick value={c.lower.style} list={LOWER_STYLES} onChange={(style) => edit("lower", { style })} />
                  </Row>
                  <Anim value={c.lower.anim} onChange={(anim) => edit("lower", { anim })} />
                  {c.lower.style === "sport" && (
                    <Row label="Shirt number">
                      <input className={field} value={c.lower.number} maxLength={4} onChange={(e) => edit("lower", { number: e.target.value })} />
                    </Row>
                  )}
                  {(c.lower.style === "presenter" || c.lower.style === "sport") && (
                    <Row label="Name block colour">
                      <Colour value={c.lower.primary} onChange={(primary) => edit("lower", { primary })} />
                    </Row>
                  )}
                  <Row label="Font">
                    <Pick value={c.lower.font} list={GFX_FONTS} onChange={(font) => edit("lower", { font })} />
                  </Row>
                  <Row label="Accent">
                    <Colour value={c.lower.accent} onChange={(accent) => edit("lower", { accent })} />
                  </Row>
                  <Row label="Text colour">
                    <Colour value={c.lower.text} onChange={(text) => edit("lower", { text })} />
                  </Row>
                  <Row label="Background">
                    <Colour value={c.lower.bg} onChange={(bg) => edit("lower", { bg })} />
                  </Row>
                  <Range label="Bg opacity" value={c.lower.bgOpacity} min={0} max={100} onChange={(bgOpacity) => edit("lower", { bgOpacity })} />
                  <div className="col-span-2">
                    <Range label="Size" value={c.lower.size} min={30} max={300} step={5} onChange={(size) => edit("lower", { size })} />
                  </div>
                </>
              )}

              {active === "ticker" && (
                <>
                  <div className="col-span-2">
                    <Row label="Ticker text">
                      <input className={field} value={c.ticker.text} onChange={(e) => edit("ticker", { text: e.target.value })} />
                    </Row>
                  </div>
                  <Row label="Label (LIVE, NEWS…)">
                    <input className={field} value={c.ticker.label} onChange={(e) => edit("ticker", { label: e.target.value })} />
                  </Row>
                  <Row label="Style">
                    <Pick value={c.ticker.style} list={TICKER_STYLES} onChange={(style) => edit("ticker", { style })} />
                  </Row>
                  <Row label="Label colour">
                    <Colour value={c.ticker.accent} onChange={(accent) => edit("ticker", { accent })} />
                  </Row>
                  <Row label="Text colour">
                    <Colour value={c.ticker.textColor} onChange={(textColor) => edit("ticker", { textColor })} />
                  </Row>
                  <Row label="Background">
                    <Colour value={c.ticker.bg} onChange={(bg) => edit("ticker", { bg })} />
                  </Row>
                  <Range label="Bg opacity" value={c.ticker.bgOpacity} min={0} max={100} onChange={(bgOpacity) => edit("ticker", { bgOpacity })} />
                  <Row label="Font">
                    <Pick value={c.ticker.font} list={GFX_FONTS} onChange={(font) => edit("ticker", { font })} />
                  </Row>
                  <Range label="Speed" unit="s" value={c.ticker.speed} min={8} max={60} onChange={(speed) => edit("ticker", { speed })} />
                  <Range label="Size" value={c.ticker.size} min={30} max={300} step={5} onChange={(size) => edit("ticker", { size })} />
                  <Row label="Scroll">
                    <select className={field} value={c.ticker.direction} onChange={(e) => edit("ticker", { direction: e.target.value as "left" | "right" })}>
                      <option value="left">Right → Left</option>
                      <option value="right">Left → Right</option>
                    </select>
                  </Row>
                  <Row label="Run">
                    <select className={field} value={c.ticker.loop ? "loop" : "once"} onChange={(e) => edit("ticker", { loop: e.target.value === "loop" })}>
                      <option value="loop">Repeat forever</option>
                      <option value="once">One pass, then leave</option>
                    </select>
                  </Row>
                  <Row label="Bar position">
                    <select
                      className={field}
                      value={c.ticker.at ? "" : c.ticker.pos}
                      onChange={(e) => edit("ticker", { pos: e.target.value as "top" | "bottom", at: null })}
                    >
                      {c.ticker.at && <option value="">Custom height</option>}
                      <option value="bottom">Bottom</option>
                      <option value="top">Top</option>
                    </select>
                  </Row>
                  <Place
                    at={c.ticker.at}
                    onAt={(at) => edit("ticker", { at })}
                    w={1}
                    h={0.07 * (c.ticker.size / 100)}
                    label="Height on screen — tap or drag up / down"
                  />
                </>
              )}

              {active === "clock" && (
                <>
                  <Place
                    at={c.clock.at}
                    corner={c.clock.pos}
                    onCorner={(pos) => edit("clock", { pos })}
                    onAt={(at) => edit("clock", { at })}
                    w={0.17 * (c.clock.size / 100)}
                    h={0.08 * (c.clock.size / 100)}
                  />
                  <Row label="Style">
                    <Pick value={c.clock.style} list={CLOCK_STYLES} onChange={(style) => edit("clock", { style })} />
                  </Row>
                  <Anim value={c.clock.anim} onChange={(anim) => edit("clock", { anim })} />
                  {c.clock.style === "split" && (
                    <>
                      <Row label="Tag (EAT, GMT, LOCAL…)">
                        <input className={field} value={c.clock.label} maxLength={12} onChange={(e) => edit("clock", { label: e.target.value })} />
                      </Row>
                      <Row label="Tag colour">
                        <Colour value={c.clock.accent} onChange={(accent) => edit("clock", { accent })} />
                      </Row>
                    </>
                  )}
                  <Row label="Font">
                    <Pick value={c.clock.font} list={GFX_FONTS} onChange={(font) => edit("clock", { font })} />
                  </Row>
                  <Row label="Text colour">
                    <Colour value={c.clock.textColor} onChange={(textColor) => edit("clock", { textColor })} />
                  </Row>
                  <Row label="Background">
                    <Colour value={c.clock.bg} onChange={(bg) => edit("clock", { bg })} />
                  </Row>
                  <Range label="Bg opacity" value={c.clock.bgOpacity} min={0} max={100} onChange={(bgOpacity) => edit("clock", { bgOpacity })} />
                  <Range label="Size" value={c.clock.size} min={30} max={300} step={5} onChange={(size) => edit("clock", { size })} />
                  <div className="col-span-2 flex gap-1.5">
                    <Toggle label="24 hour" checked={c.clock.h24} onChange={(h24) => edit("clock", { h24 })} />
                    <Toggle label="Seconds" checked={c.clock.seconds} onChange={(seconds) => edit("clock", { seconds })} />
                  </div>
                </>
              )}

              {active === "badge" && (
                <>
                  <Row label="Badge text">
                    <input className={field} value={c.badge.text} onChange={(e) => edit("badge", { text: e.target.value })} />
                  </Row>
                  <Place
                    at={c.badge.at}
                    corner={c.badge.pos}
                    onCorner={(pos) => edit("badge", { pos })}
                    onAt={(at) => edit("badge", { at })}
                    w={0.14 * (c.badge.size / 100)}
                    h={0.09 * (c.badge.size / 100)}
                  />
                  <Row label="Style">
                    <Pick value={c.badge.style} list={BADGE_STYLES} onChange={(style) => edit("badge", { style })} />
                  </Row>
                  <Anim value={c.badge.anim} onChange={(anim) => edit("badge", { anim })} />
                  {c.badge.style === "location" && (
                    <>
                      <Row label="Location (NAIROBI, STUDIO 2…)">
                        <input className={field} value={c.badge.location} maxLength={32} onChange={(e) => edit("badge", { location: e.target.value })} />
                      </Row>
                      <Row label="Location block colour">
                        <Colour value={c.badge.locBg} onChange={(locBg) => edit("badge", { locBg })} />
                      </Row>
                    </>
                  )}
                  <Row label="Font">
                    <Pick value={c.badge.font} list={GFX_FONTS} onChange={(font) => edit("badge", { font })} />
                  </Row>
                  <Row label="Colour">
                    <Colour value={c.badge.color} onChange={(color) => edit("badge", { color })} />
                  </Row>
                  <Row label="Text colour">
                    <Colour value={c.badge.textColor} onChange={(textColor) => edit("badge", { textColor })} />
                  </Row>
                  <div className="col-span-2">
                    <Range label="Size" value={c.badge.size} min={30} max={300} step={5} onChange={(size) => edit("badge", { size })} />
                  </div>
                </>
              )}

              {active === "breaking" && (
                <>
                  <Row label="Label">
                    <input className={field} value={c.breaking.label} maxLength={24} onChange={(e) => edit("breaking", { label: e.target.value })} />
                  </Row>
                  <div className="col-span-2">
                    <Row label="Headline">
                      <textarea
                        className="mk-field min-h-[4.5rem] w-full min-w-0 rounded-[3px] px-2 py-1.5 text-xs"
                        value={c.breaking.headline}
                        maxLength={200}
                        onChange={(e) => edit("breaking", { headline: e.target.value })}
                      />
                    </Row>
                  </div>
                  <Anim value={c.breaking.anim} onChange={(anim) => edit("breaking", { anim })} />
                  <Row label="Font">
                    <Pick value={c.breaking.font} list={GFX_FONTS} onChange={(font) => edit("breaking", { font })} />
                  </Row>
                  <Row label="Label colour">
                    <Colour value={c.breaking.accent} onChange={(accent) => edit("breaking", { accent })} />
                  </Row>
                  <Row label="Headline strip">
                    <Colour value={c.breaking.bg} onChange={(bg) => edit("breaking", { bg })} />
                  </Row>
                  <Row label="Headline text">
                    <Colour value={c.breaking.textColor} onChange={(textColor) => edit("breaking", { textColor })} />
                  </Row>
                  <div className="col-span-2">
                    <Range label="Size" value={c.breaking.size} min={30} max={300} step={5} onChange={(size) => edit("breaking", { size })} />
                  </div>
                </>
              )}

              {active === "score" && (
                <>
                  <Row label="Home team">
                    <input className={field} value={c.score.home} maxLength={8} onChange={(e) => edit("score", { home: e.target.value })} />
                  </Row>
                  <Row label="Away team">
                    <input className={field} value={c.score.away} maxLength={8} onChange={(e) => edit("score", { away: e.target.value })} />
                  </Row>
                  <Row label="Home score">
                    <span className="flex gap-1">
                      <button type="button" className="mk-button h-8 w-8 shrink-0 rounded-[3px]" onClick={() => edit("score", { homeScore: String(Math.max(0, (Number(c.score.homeScore) || 0) - 1)) })}>
                        −
                      </button>
                      <input className={cn(field, "text-center")} value={c.score.homeScore} maxLength={3} onChange={(e) => edit("score", { homeScore: e.target.value })} />
                      <button type="button" className="mk-button h-8 w-8 shrink-0 rounded-[3px]" onClick={() => edit("score", { homeScore: String((Number(c.score.homeScore) || 0) + 1) })}>
                        +
                      </button>
                    </span>
                  </Row>
                  <Row label="Away score">
                    <span className="flex gap-1">
                      <button type="button" className="mk-button h-8 w-8 shrink-0 rounded-[3px]" onClick={() => edit("score", { awayScore: String(Math.max(0, (Number(c.score.awayScore) || 0) - 1)) })}>
                        −
                      </button>
                      <input className={cn(field, "text-center")} value={c.score.awayScore} maxLength={3} onChange={(e) => edit("score", { awayScore: e.target.value })} />
                      <button type="button" className="mk-button h-8 w-8 shrink-0 rounded-[3px]" onClick={() => edit("score", { awayScore: String((Number(c.score.awayScore) || 0) + 1) })}>
                        +
                      </button>
                    </span>
                  </Row>
                  <Row label="Match clock (blank = hide)">
                    <input className={field} value={c.score.clock} maxLength={10} onChange={(e) => edit("score", { clock: e.target.value })} />
                  </Row>
                  <Anim value={c.score.anim} onChange={(anim) => edit("score", { anim })} />
                  <Place
                    at={c.score.at}
                    corner={c.score.pos}
                    onCorner={(pos) => edit("score", { pos })}
                    onAt={(at) => edit("score", { at })}
                    w={0.34 * (c.score.size / 100)}
                    h={0.06 * (c.score.size / 100)}
                  />
                  <Row label="Font">
                    <Pick value={c.score.font} list={GFX_FONTS} onChange={(font) => edit("score", { font })} />
                  </Row>
                  <Row label="Team colour">
                    <Colour value={c.score.primary} onChange={(primary) => edit("score", { primary })} />
                  </Row>
                  <Row label="Clock block">
                    <Colour value={c.score.accent} onChange={(accent) => edit("score", { accent })} />
                  </Row>
                  <Row label="Text colour">
                    <Colour value={c.score.textColor} onChange={(textColor) => edit("score", { textColor })} />
                  </Row>
                  <div className="col-span-2">
                    <Range label="Size" value={c.score.size} min={30} max={300} step={5} onChange={(size) => edit("score", { size })} />
                  </div>
                </>
              )}

              {active === "social" && (
                <>
                  <Row label="Platform text">
                    <input
                      className={field}
                      value={c.social.platform}
                      maxLength={32}
                      onChange={(e) => edit("social", { platform: e.target.value })}
                    />
                  </Row>
                  <Row label="Handle">
                    <input
                      className={field}
                      value={c.social.handle}
                      maxLength={40}
                      onChange={(e) => edit("social", { handle: e.target.value })}
                    />
                  </Row>
                  <Anim value={c.social.anim} onChange={(anim) => edit("social", { anim })} />
                  <Row label="Font">
                    <Pick
                      value={c.social.font}
                      list={GFX_FONTS}
                      onChange={(font) => edit("social", { font })}
                    />
                  </Row>
                  <Row label="Platform block">
                    <Colour
                      value={c.social.accent}
                      onChange={(accent) => edit("social", { accent })}
                    />
                  </Row>
                  <Row label="Handle block">
                    <Colour value={c.social.bg} onChange={(bg) => edit("social", { bg })} />
                  </Row>
                  <Row label="Text colour">
                    <Colour
                      value={c.social.textColor}
                      onChange={(textColor) => edit("social", { textColor })}
                    />
                  </Row>
                  <Range
                    label="Size"
                    value={c.social.size}
                    min={30}
                    max={300}
                    step={5}
                    onChange={(size) => edit("social", { size })}
                  />
                </>
              )}

              {active === "full" && (
                <>
                  <div className="col-span-2">
                    <Row label="Card">
                      <Pick
                        value={c.full.kind}
                        list={FULL_KINDS}
                        onChange={(kind: FullKind) => edit("full", { kind })}
                      />
                    </Row>
                  </div>
                  {c.full.kind === "headline" && (
                    <>
                      <Row label="Kicker">
                        <input
                          className={field}
                          value={c.full.kicker}
                          maxLength={60}
                          onChange={(e) => edit("full", { kicker: e.target.value })}
                        />
                      </Row>
                      <div className="col-span-2">
                        <Row label="Headline">
                          <textarea
                            className="mk-field min-h-[3.5rem] w-full min-w-0 rounded-[3px] px-2 py-1.5 text-xs"
                            value={c.full.headline}
                            maxLength={200}
                            onChange={(e) => edit("full", { headline: e.target.value })}
                          />
                        </Row>
                      </div>
                      <div className="col-span-2">
                        <Row label="Body">
                          <textarea
                            className="mk-field min-h-[3.5rem] w-full min-w-0 rounded-[3px] px-2 py-1.5 text-xs"
                            value={c.full.body}
                            maxLength={400}
                            onChange={(e) => edit("full", { body: e.target.value })}
                          />
                        </Row>
                      </div>
                    </>
                  )}
                  {c.full.kind === "quote" && (
                    <>
                      <div className="col-span-2">
                        <Row label="Quote">
                          <textarea
                            className="mk-field min-h-[3.5rem] w-full min-w-0 rounded-[3px] px-2 py-1.5 text-xs"
                            value={c.full.quote}
                            maxLength={300}
                            onChange={(e) => edit("full", { quote: e.target.value })}
                          />
                        </Row>
                      </div>
                      <Row label="Author">
                        <input
                          className={field}
                          value={c.full.author}
                          maxLength={80}
                          onChange={(e) => edit("full", { author: e.target.value })}
                        />
                      </Row>
                    </>
                  )}
                  {(c.full.kind === "standings" ||
                    c.full.kind === "countdown" ||
                    c.full.kind === "announcement" ||
                    c.full.kind === "credits") && (
                    <Row label="Title">
                      <input
                        className={field}
                        value={c.full.title}
                        maxLength={80}
                        onChange={(e) => edit("full", { title: e.target.value })}
                      />
                    </Row>
                  )}
                  {(c.full.kind === "countdown" || c.full.kind === "announcement") && (
                    <Row label="Subtitle">
                      <input
                        className={field}
                        value={c.full.subtitle}
                        maxLength={120}
                        onChange={(e) => edit("full", { subtitle: e.target.value })}
                      />
                    </Row>
                  )}
                  {c.full.kind === "countdown" && (
                    <Row label="Start from (seconds)">
                      <input
                        type="number"
                        min={0}
                        className={field}
                        value={c.full.seconds}
                        onChange={(e) =>
                          edit("full", { seconds: Math.max(0, Number(e.target.value) || 0) })
                        }
                      />
                    </Row>
                  )}
                  {c.full.kind === "standings" && (
                    <div className="col-span-2">
                      <Row label="Rows: Team, P, Pts (one per line)">
                        <textarea
                          className="mk-field min-h-[5rem] w-full min-w-0 rounded-[3px] px-2 py-1.5 text-xs"
                          value={c.full.rows}
                          maxLength={800}
                          onChange={(e) => edit("full", { rows: e.target.value })}
                        />
                      </Row>
                    </div>
                  )}
                  {c.full.kind === "credits" && (
                    <>
                      <div className="col-span-2">
                        <Row label="Role — Name (one per line)">
                          <textarea
                            className="mk-field min-h-[5rem] w-full min-w-0 rounded-[3px] px-2 py-1.5 text-xs"
                            value={c.full.lines}
                            maxLength={1200}
                            onChange={(e) => edit("full", { lines: e.target.value })}
                          />
                        </Row>
                      </div>
                      <Range
                        label="Roll time"
                        unit="s"
                        value={c.full.speed}
                        min={5}
                        max={120}
                        onChange={(speed) => edit("full", { speed })}
                      />
                    </>
                  )}
                  <Anim value={c.full.anim} onChange={(anim) => edit("full", { anim })} />
                  <Row label="Font">
                    <Pick
                      value={c.full.font}
                      list={GFX_FONTS}
                      onChange={(font) => edit("full", { font })}
                    />
                  </Row>
                  <Row label="Primary">
                    <Colour
                      value={c.full.primary}
                      onChange={(primary) => edit("full", { primary })}
                    />
                  </Row>
                  <Row label="Background">
                    <Colour
                      value={c.full.secondary}
                      onChange={(secondary) => edit("full", { secondary })}
                    />
                  </Row>
                  <Row label="Accent">
                    <Colour
                      value={c.full.accent}
                      onChange={(accent) => edit("full", { accent })}
                    />
                  </Row>
                  <Row label="Text colour">
                    <Colour
                      value={c.full.textColor}
                      onChange={(textColor) => edit("full", { textColor })}
                    />
                  </Row>
                </>
              )}

              {active === "lower" && (
                <div className="col-span-2 grid gap-1">
                  <span className="mk-label text-[9px]">Saved names (one tap on the switcher)</span>
                  <div className="flex flex-wrap gap-1">
                    {c.lower.presets.map((p, i) => (
                      <span key={i} className="mk-button flex h-6 items-center rounded-[3px] text-[10px] normal-case">
                        <button type="button" className="max-w-[8rem] truncate px-2" onClick={() => edit("lower", { name: p.name, title: p.title })}>
                          {p.name}
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${p.name}`}
                          className="px-1.5 opacity-60 hover:opacity-100"
                          onClick={() => edit("lower", { presets: c.lower.presets.filter((_, n) => n !== i) })}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <button
                      type="button"
                      className="mk-button h-6 rounded-[3px] px-2 text-[10px]"
                      onClick={() =>
                        c.lower.name.trim() &&
                        c.lower.presets.length < 12 &&
                        edit("lower", { presets: [...c.lower.presets, { name: c.lower.name, title: c.lower.title }] })
                      }
                    >
                      + Save name
                    </button>
                  </div>
                </div>
              )}

              <div className="col-span-2">
                <button type="button" className="mk-button h-7 rounded-[3px] px-3 text-[10px]" onClick={() => setDraft((d) => ({ ...d, [active]: DEFAULT_GRAPHICS[active] }))}>
                  Reset {label.toLowerCase()} to default
                </button>
              </div>
            </div>
          </section>

          {/* ---------------------------------------------------------- library */}
          <section className="mk-panel flex max-h-[46%] min-h-0 shrink-0 flex-col gap-1.5 rounded-md p-2">
            <h2 className="mk-label text-foreground">My {label.toLowerCase()} designs</h2>
            <div className="flex gap-1">
              <input
                className={cn(field, "flex-1")}
                value={saveName}
                placeholder={`Name this ${label.toLowerCase()} design`}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && saveName.trim()) {
                    gfxLibrary.save(saveName, active, draft[active]);
                    say(`Saved "${saveName.trim()}"`);
                    setSaveName("");
                  }
                }}
              />
              <button
                type="button"
                disabled={!saveName.trim()}
                className="mk-button h-8 rounded-[3px] px-3 text-[10px] disabled:opacity-40"
                onClick={() => {
                  gfxLibrary.save(saveName, active, draft[active]);
                  say(`Saved "${saveName.trim()}"`);
                  setSaveName("");
                }}
              >
                Save design
              </button>
            </div>

            <ul className="grid min-h-0 gap-1 overflow-y-auto">
              {mine.length === 0 && <li className="font-mono text-[10px] text-muted-foreground">Nothing saved for {label.toLowerCase()} yet.</li>}
              {mine.map((item) => (
                <li key={item.id} className="flex items-center gap-1 rounded-[3px] bg-black/25 p-0.5">
                  <button type="button" className="mk-button h-7 min-w-0 flex-1 truncate rounded-[3px] px-2 text-left text-[11px] normal-case" onClick={() => load(item)} title="Load into the editor">
                    {item.name}
                  </button>
                  <button type="button" aria-label={`Copy share link for ${item.name}`} title="Copy share link" className="mk-button flex h-7 w-7 items-center justify-center rounded-[3px]" onClick={() => void copyLink(item)}>
                    <Copy className="h-3 w-3" />
                  </button>
                  <button type="button" aria-label={`Download ${item.name}`} title="Download file to send" className="mk-button flex h-7 w-7 items-center justify-center rounded-[3px]" onClick={() => download(item.name, exportJson([item]))}>
                    <Download className="h-3 w-3" />
                  </button>
                  <button type="button" aria-label={`Delete ${item.name}`} title="Delete" className="mk-button flex h-7 w-7 items-center justify-center rounded-[3px]" onClick={() => gfxLibrary.remove(item.id)}>
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>

            <div className="grid gap-1 border-t border-white/10 pt-1.5">
              <div className="flex items-center gap-1">
                <span className="mk-label mr-auto text-[9px]">Share · Import</span>
                <button
                  type="button"
                  disabled={library.length === 0}
                  className="mk-button h-6 rounded-[3px] px-2 text-[9px]"
                  onClick={() => download("mk-vision-graphics", exportJson(library))}
                >
                  Export all
                </button>
                <label className="mk-button flex h-6 cursor-pointer items-center rounded-[3px] px-2 text-[9px]">
                  Import file
                  <input
                    type="file"
                    accept=".json,application/json"
                    className="sr-only"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      try {
                        setIncoming(parsePack(await file.text()));
                      } catch (err) {
                        say(err instanceof Error ? err.message : "Could not read that file");
                      }
                    }}
                  />
                </label>
              </div>
              <div className="flex gap-1">
                <input className={cn(field, "flex-1")} value={paste} placeholder="Paste a share link or code" onChange={(e) => setPaste(e.target.value)} />
                <button
                  type="button"
                  disabled={!paste.trim()}
                  className="mk-button h-8 rounded-[3px] px-3 text-[10px] disabled:opacity-40"
                  onClick={() => {
                    try {
                      setIncoming(parseShare(paste));
                    } catch (err) {
                      say(err instanceof Error ? err.message : "Could not read that code");
                    }
                  }}
                >
                  Open
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>

      {incoming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="mk-panel w-full max-w-sm rounded-md p-3">
            <h2 className="mk-label mb-2 text-foreground">Add to your library?</h2>
            <ul className="mb-3 grid gap-1">
              {incoming.map((i, n) => (
                <li key={n} className="flex items-center justify-between rounded-[3px] bg-black/25 px-2 py-1 text-xs">
                  <span className="truncate">{i.name}</span>
                  <span className="mk-label text-[9px]">{GFX_LAYERS.find((l) => l.id === i.layer)!.label}</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-1.5">
              <button type="button" className="mk-button h-8 rounded-[3px] px-3 text-xs" onClick={() => setIncoming(null)}>
                Cancel
              </button>
              <button type="button" className="mk-button mk-lit-amber h-8 rounded-[3px] px-4 text-xs" onClick={() => importPack(incoming)}>
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {(toast || state.notice) && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-3">
          <div className="mk-panel rounded-md border-amber px-3 py-2 font-mono text-xs text-amber">{toast ?? state.notice}</div>
        </div>
      )}
    </div>
  );
}
