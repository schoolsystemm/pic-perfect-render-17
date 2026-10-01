import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Copy, Download, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

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
import { engine, useSwitcher } from "@/lib/mk/use-switcher";
import {
  BADGE_STYLES,
  DEFAULT_GRAPHICS,
  GFX_FONTS,
  LOWER_STYLES,
  TICKER_STYLES,
  type Corner,
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
        <span className="mk-label ml-auto text-[8px]">By Konchella</span>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-1.5 fit:flex-row fit:overflow-hidden">
        {/* ------------------------------------------------ left: build + preview */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5">
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
                  <Row label="Position">
                    <Corners value={c.logo.pos} onChange={(pos) => edit("logo", { pos })} />
                  </Row>
                  <Range label="Size" value={c.logo.size} min={3} max={60} onChange={(size) => edit("logo", { size })} />
                  <Range label="Opacity" value={c.logo.opacity} min={5} max={100} onChange={(opacity) => edit("logo", { opacity })} />
                </>
              )}

              {active === "lower" && (
                <>
                  <Row label="Name">
                    <input className={field} value={c.lower.name} onChange={(e) => edit("lower", { name: e.target.value })} />
                  </Row>
                  <Row label="Title / role">
                    <input className={field} value={c.lower.title} onChange={(e) => edit("lower", { title: e.target.value })} />
                  </Row>
                  <Row label="Style">
                    <Pick value={c.lower.style} list={LOWER_STYLES} onChange={(style) => edit("lower", { style })} />
                  </Row>
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
                  <Row label="Bar position">
                    <select className={field} value={c.ticker.pos} onChange={(e) => edit("ticker", { pos: e.target.value as "top" | "bottom" })}>
                      <option value="bottom">Bottom</option>
                      <option value="top">Top</option>
                    </select>
                  </Row>
                </>
              )}

              {active === "clock" && (
                <>
                  <Row label="Position">
                    <Corners value={c.clock.pos} onChange={(pos) => edit("clock", { pos })} />
                  </Row>
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
                  <Row label="Position">
                    <Corners value={c.badge.pos} onChange={(pos) => edit("badge", { pos })} />
                  </Row>
                  <Row label="Style">
                    <Pick value={c.badge.style} list={BADGE_STYLES} onChange={(style) => edit("badge", { style })} />
                  </Row>
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
