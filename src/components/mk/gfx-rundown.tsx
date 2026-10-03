import { Boxes, Copy, Download, Layers3, PackagePlus, Pencil, Plus, Save, Search, Sparkles, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { PackageEditor } from "@/components/mk/package-editor";
import { GFX_LAYERS, layerUrl } from "@/lib/mk/graphics";
import { isBuiltIn, packageStore, useMyPackages } from "@/lib/mk/gfx-packages";
import {
  GRAPHIC_PACKAGES,
  TEMPLATES,
  TRANSITIONS,
  getTemplate,
  itemToSpec,
  makeItem,
  packageSource,
  packageTheme,
  previewConfig,
  rundown,
  useRundown,
  type GraphicPackage,
  type RundownItem,
  type Transition,
} from "@/lib/mk/gfx-rundown";
import { GFX_THEMES, type GfxTheme } from "@/lib/mk/gfx-themes";
import { useSwitcher } from "@/lib/mk/use-switcher";
import { GFX_FONTS, type GfxFont, type GfxId, type GraphicsConfig } from "@/lib/mk/types";
import { cn } from "@/lib/utils";

const field = "mk-field h-8 w-full min-w-0 rounded-[3px] px-2 text-xs";
const VIDEO =
  "bg-[linear-gradient(135deg,oklch(0.38_0.1_250),oklch(0.2_0.06_300)_55%,oklch(0.3_0.08_20))]";
const CHECKER = "bg-[repeating-conic-gradient(#222_0%_25%,#2e2e2e_0%_50%)] bg-[length:16px_16px]";

function Lbl({ t, children }: { t: string; children: ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="mk-label text-[9px]">{t}</span>
      {children}
    </label>
  );
}

function Frame({ id, g }: { id: GfxId; g: GraphicsConfig }) {
  const part = JSON.stringify(g[id]);
  const url = useMemo(() => layerUrl(id, g), [id, part]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <iframe
      title={`${id} layer`}
      src={url}
      sandbox="allow-scripts"
      className="pointer-events-none absolute inset-0 h-full w-full border-0 bg-transparent"
    />
  );
}

/** One broadcast monitor. The pictures inside are the exact HTML OBS renders. */
function Monitor({
  label,
  tone,
  guides,
  backdrop = VIDEO,
  children,
}: {
  label: string;
  tone: "cue" | "tally" | "muted";
  guides: boolean;
  backdrop?: string;
  children: ReactNode;
}) {
  const tag =
    tone === "tally"
      ? "bg-[oklch(0.6_0.23_27)] text-white"
      : tone === "cue"
        ? "bg-[oklch(0.68_0.13_235)] text-black"
        : "bg-white/10 text-muted-foreground";
  const ring =
    tone === "tally"
      ? "border-[oklch(0.6_0.23_27)]"
      : tone === "cue"
        ? "border-[oklch(0.68_0.13_235)]"
        : "border-white/15";
  return (
    <div className={cn("overflow-hidden rounded-[3px] border-2", ring)}>
      <div className={cn("px-2 py-0.5 font-mono text-[10px] font-bold tracking-[0.25em]", tag)}>
        {label}
      </div>
      <div className={cn("relative aspect-video w-full overflow-hidden", backdrop)}>
        {children}
        {guides && (
          <>
            <div className="pointer-events-none absolute inset-[5%] border-2 border-dashed border-white/25" />
            <div className="pointer-events-none absolute inset-[10%] border-2 border-dashed border-yellow-300/30" />
          </>
        )}
      </div>
    </div>
  );
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn("mk-button h-9 rounded-[3px] px-3 text-[10px]", on && "mk-lit-amber")}
    >
      {label}
    </button>
  );
}

function Ctl({
  tone,
  onClick,
  label,
  hint,
}: {
  tone: "program" | "preview" | "plain" | "amber";
  onClick: () => void;
  label: string;
  hint: string;
}) {
  const lit =
    tone === "program"
      ? "mk-lit-program"
      : tone === "preview"
        ? "mk-lit-preview"
        : tone === "amber"
          ? "mk-lit-amber"
          : "";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "mk-button flex h-12 min-w-[5.5rem] flex-col items-center justify-center rounded-[3px] px-3 text-sm tracking-wider active:scale-95",
        lit,
      )}
    >
      {label}
      <span className="font-mono text-[9px] font-normal opacity-70">{hint}</span>
    </button>
  );
}

/**
 * The graphics operator's view: a rundown of graphics, PREVIEW and PROGRAM monitors, and
 * TAKE / UPDATE / CLEAR that drive MK VISION's real OBS graphics layers.
 */
export function GfxRundown({ say }: { say: (msg: string) => void }) {
  const state = useSwitcher();
  const rd = useRundown();
  const [guides, setGuides] = useState(true);
  const [libraryView, setLibraryView] = useState<"packages" | "templates">("packages");
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("All");
  const [dragId, setDragId] = useState<string | null>(null);
  const mine = useMyPackages();
  const [editing, setEditing] = useState<{ pack: GraphicPackage; title: string } | null>(null);

  const show = rd.shows.find((s) => s.id === rd.showId) ?? rd.shows[0]!;
  const sel = show.items.find((i) => i.id === rd.selId);
  const selTpl = sel ? getTemplate(sel.templateId) : undefined;
  const graphics = state.config.graphics;
  const active = state.gfxActive;
  const onAir = Object.values(active).some(Boolean);

  // PREVIEW = the picture as it will look once the selected item is taken.
  const pv = useMemo(
    () => (sel ? previewConfig(sel, show.theme, graphics) : null),
    [sel, show.theme, graphics],
  );

  // ---- keyboard (not while typing in a field)
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
      if (e.key === "Escape") (e.target as HTMLElement).blur();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) rundown.redo();
      else rundown.undo();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (k === " " || k === "F1") {
      e.preventDefault();
      rundown.take();
    } else if (k === "u" || k === "F2") rundown.update();
    else if (k === "Escape" || k === "F3") rundown.clear();
    else if (k === "n" || k === "F4") rundown.takeNext();
    else if (k === "ArrowDown") {
      e.preventDefault();
      rundown.move(1);
    } else if (k === "ArrowUp") {
      e.preventDefault();
      rundown.move(-1);
    } else if (k === "t") rundown.toggleLayer("ticker");
    else if (k === "l") rundown.toggleLayer("logo");
    else if (k === "x") rundown.clearAll();
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const tplList = TEMPLATES.filter(
    (t) =>
      (cat === "All" || t.category === cat) && t.name.toLowerCase().includes(query.toLowerCase()),
  );
  const isLive = (it: RundownItem) => {
    const t = getTemplate(it.templateId);
    return !!t && active[t.layer] && rd.live[t.layer] === it.id;
  };
  const isSelLive = !!sel && isLive(sel);

  const downloadText = (name: string, ext: string, body: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([body], { type: "application/json" }));
    a.download = `${name.replace(/[^\w-]+/g, "_") || "package"}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  /** Save rundown rows as a package: updates the one they came from (if it is yours), otherwise makes a new one. */
  const saveRowsAsPackage = (rows: RundownItem[], fallbackName: string, sourceId?: string) => {
    if (rows.length === 0) {
      say("Nothing to save — the rundown is empty");
      return;
    }
    const src = sourceId ? packageStore.get(sourceId) : undefined;
    if (src) {
      packageStore.save({ ...src, items: rows.map(itemToSpec), themeId: GFX_THEMES.some((t) => t.id === show.theme.id) ? show.theme.id : src.themeId });
      say(`Updated "${src.name}" in My packages`);
      return;
    }
    const name = window.prompt("Name this package", fallbackName)?.trim();
    if (!name) return;
    packageStore.save({
      id: `my-${Date.now().toString(36)}`,
      name,
      shortName: name.slice(0, 12).toUpperCase(),
      description: "",
      themeId: GFX_THEMES.some((t) => t.id === show.theme.id) ? show.theme.id : GFX_THEMES[0]!.id,
      items: rows.map(itemToSpec),
    });
    say(`Saved "${name}" to My packages`);
  };

  const newPackage = (): GraphicPackage => ({
    id: `my-${Date.now().toString(36)}`,
    name: "My package",
    shortName: "MY PACKAGE",
    description: "",
    themeId: show.theme.id,
    items: [],
  });

  const thumb = (it: RundownItem, th: GfxTheme) => {
    const p = previewConfig(it, th, graphics);
    return p ? <Frame id={p.layer} g={p.g} /> : null;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overscroll-contain fit:flex-row fit:overflow-hidden">
      {/* ------------------------------------------------ library */}
      <aside className="mk-panel flex max-h-[50dvh] min-h-0 w-full shrink-0 flex-col gap-1.5 rounded-md p-1.5 fit:max-h-none fit:w-52 lg:fit:w-64">
        <div className="mk-label flex items-center gap-1.5 text-foreground">
          <Layers3 className="h-3.5 w-3.5" /> Graphics library
        </div>
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() => setLibraryView("packages")}
            className={cn(
              "mk-button flex h-8 items-center justify-center gap-1 rounded-[3px] text-[10px]",
              libraryView === "packages" && "mk-lit-preview",
            )}
          >
            <Boxes className="h-3 w-3" /> Packages
          </button>
          <button
            type="button"
            onClick={() => setLibraryView("templates")}
            className={cn(
              "mk-button flex h-8 items-center justify-center gap-1 rounded-[3px] text-[10px]",
              libraryView === "templates" && "mk-lit-preview",
            )}
          >
            <Layers3 className="h-3 w-3" /> Singles
          </button>
        </div>
        {libraryView === "templates" && (
          <>
            <label className="mk-field flex h-8 items-center gap-1.5 rounded-[3px] px-2">
              <Search className="h-3 w-3 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search templates"
                className="min-w-0 flex-1 bg-transparent text-xs outline-none"
              />
            </label>
            <div className="flex gap-1">
              {["All", "News", "Sports", "General"].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCat(c)}
                  className={cn(
                    "mk-button h-6 rounded-[3px] px-2 text-[9px]",
                    cat === c && "mk-lit-amber",
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="grid min-h-0 flex-1 content-start gap-1.5 overflow-y-auto">
          {libraryView === "packages" ? (
            <>
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => setEditing({ pack: newPackage(), title: "New package" })}
                  className="mk-button flex h-8 items-center justify-center gap-1 rounded-[3px] text-[10px]"
                >
                  <Plus className="h-3 w-3" /> New package
                </button>
                <label className="mk-button flex h-8 cursor-pointer items-center justify-center gap-1 rounded-[3px] text-[10px]">
                  <Upload className="h-3 w-3" /> Import
                  <input
                    type="file"
                    accept=".json,application/json"
                    className="sr-only"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      try {
                        const made = packageStore.importJson(await file.text());
                        say(`Imported ${made.length} package${made.length === 1 ? "" : "s"}`);
                      } catch (err) {
                        say(err instanceof Error ? err.message : "Could not read that file");
                      }
                    }}
                  />
                </label>
              </div>
              {[
                { head: `My packages (${mine.length})`, list: mine as GraphicPackage[] },
                { head: "Built-in (fixed — Customise makes your own copy)", list: GRAPHIC_PACKAGES },
              ].map((group) => (
                <div key={group.head} className="grid gap-1.5">
                  <div className="mk-label text-[9px]">{group.head}</div>
                  {group.list.length === 0 && (
                    <p className="font-mono text-[10px] leading-snug text-muted-foreground">
                      None yet. Press New package, or build a rundown and use Save as package.
                    </p>
                  )}
                  {group.list.map((pack) => {
                    const mineOne = !isBuiltIn(pack.id);
                    const sample = pack.items.find((i) => i.templateId === "headline") ?? pack.items[0];
                    const th = packageTheme(pack);
                    return (
                      <article key={pack.id} className="overflow-hidden rounded-[3px] border border-white/10 bg-black/25">
                        {sample && (
                          <div className={cn("relative aspect-video w-full", CHECKER)}>
                            {thumb(makeItem(sample.templateId, `p-${pack.id}`, sample.data, sample.name), th)}
                          </div>
                        )}
                        <div className="grid gap-1.5 p-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="break-words text-sm font-bold uppercase tracking-wider">{pack.name}</div>
                              <div className="font-mono text-[9px] text-amber">
                                {pack.items.length} GRAPHIC{pack.items.length === 1 ? "" : "S"}
                              </div>
                            </div>
                            <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber" />
                          </div>
                          {pack.description && (
                            <p className="text-[11px] leading-snug text-muted-foreground">{pack.description}</p>
                          )}
                          <details className="text-[11px]">
                            <summary className="cursor-pointer font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                              What is inside
                            </summary>
                            <ol className="mt-1 grid gap-0.5 pl-4 normal-case">
                              {pack.items.map((i, n) => (
                                <li key={n} className="list-decimal break-words">
                                  {i.name}
                                </li>
                              ))}
                            </ol>
                          </details>
                          <button
                            type="button"
                            disabled={pack.items.length === 0}
                            onClick={() => {
                              rundown.addPackage(pack);
                              say(`${pack.name} added to the rundown`);
                            }}
                            className="mk-button mk-lit-amber flex h-8 items-center justify-center gap-1.5 rounded-[3px] text-[11px] disabled:opacity-40"
                          >
                            <PackagePlus className="h-3.5 w-3.5" /> Add full package
                          </button>
                          <div className="flex gap-1">
                            {mineOne ? (
                              <button
                                type="button"
                                onClick={() => setEditing({ pack, title: `Edit — ${pack.name}` })}
                                className="mk-button flex h-7 flex-1 items-center justify-center gap-1 rounded-[3px] text-[10px]"
                              >
                                <Pencil className="h-3 w-3" /> Edit
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  const copy = packageStore.duplicate(pack);
                                  setEditing({ pack: copy, title: `Edit — ${copy.name}` });
                                  say("Your own copy was made — the built-in one stays as it is");
                                }}
                                className="mk-button flex h-7 flex-1 items-center justify-center gap-1 rounded-[3px] text-[10px]"
                              >
                                <Pencil className="h-3 w-3" /> Customise
                              </button>
                            )}
                            <button
                              type="button"
                              aria-label={`Duplicate ${pack.name}`}
                              title="Duplicate"
                              onClick={() => {
                                packageStore.duplicate(pack);
                                say(`Copied ${pack.name} to My packages`);
                              }}
                              className="mk-button flex h-7 w-7 items-center justify-center rounded-[3px]"
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Download ${pack.name}`}
                              title="Download to share"
                              onClick={() => downloadText(pack.name, "mkpack.json", packageStore.exportJson([pack]))}
                              className="mk-button flex h-7 w-7 items-center justify-center rounded-[3px]"
                            >
                              <Download className="h-3 w-3" />
                            </button>
                            {mineOne && (
                              <button
                                type="button"
                                aria-label={`Delete ${pack.name}`}
                                title="Delete"
                                onClick={() => {
                                  if (window.confirm(`Delete package "${pack.name}"? Rundowns already using it keep their items.`)) {
                                    packageStore.remove(pack.id);
                                  }
                                }}
                                className="mk-button flex h-7 w-7 items-center justify-center rounded-[3px]"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ))}
            </>
          ) : (
            tplList.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => rundown.addTemplate(t.id)}
                  title="Add to rundown"
                  className="group block w-full overflow-hidden rounded-[3px] border border-white/10 bg-black/25 text-left hover:border-amber"
                >
                  <div className={cn("relative aspect-video w-full", CHECKER)}>
                    {thumb(makeItem(t.id, "thumb"), show.theme)}
                  </div>
                  <div className="flex items-center justify-between px-2 py-1">
                    <span className="truncate text-[11px] normal-case">{t.name}</span>
                    <span className="font-mono text-[9px] uppercase text-muted-foreground group-hover:text-amber">
                      + add
                    </span>
                  </div>
                </button>
              ))
          )}
        </div>
      </aside>

      {/* ------------------------------------------------ monitors + rundown */}
      <section className="@container flex min-w-0 shrink-0 flex-col gap-1.5 fit:min-h-0 fit:flex-1 fit:shrink fit:overflow-y-auto">
        <div className="mk-panel flex shrink-0 flex-wrap items-center gap-1 rounded-md p-1.5">
          <select
            className={cn(field, "w-auto max-w-[min(14rem,100%)]")}
            value={show.id}
            onChange={(e) => rundown.setShow(e.target.value)}
            aria-label="Rundown"
          >
            {rd.shows.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {(
            [
              [
                "New",
                () => {
                  const n = window.prompt("Rundown name", "New Rundown");
                  if (n?.trim()) rundown.newShow(n.trim());
                },
              ],
              [
                "Rename",
                () => {
                  const n = window.prompt("Rename rundown", show.name);
                  if (n?.trim()) rundown.renameShow(n.trim());
                },
              ],
              ["Duplicate", () => rundown.duplicateShow()],
              ["Save as package", () => saveRowsAsPackage(show.items, `${show.name} package`)],
              [
                "Export",
                () => {
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(
                    new Blob([rundown.exportJson()], { type: "application/json" }),
                  );
                  a.download = `${show.name.replace(/[^\w-]+/g, "_") || "rundown"}.mkrundown.json`;
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
                },
              ],
              [
                "Delete",
                () => {
                  if (!rundown.deleteShow()) say("Keep at least one rundown");
                  else say("Rundown deleted");
                },
              ],
            ] as [string, () => void][]
          ).map(([l, f]) => (
            <button
              key={l}
              type="button"
              onClick={f}
              className="mk-button h-7 rounded-[3px] px-2 text-[10px]"
            >
              {l}
            </button>
          ))}
          <label className="mk-button flex h-7 cursor-pointer items-center rounded-[3px] px-2 text-[10px]">
            Import
            <input
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                try {
                  say(`Imported ${rundown.importJson(await file.text())}`);
                } catch (err) {
                  say(err instanceof Error ? err.message : "Could not read that file");
                }
              }}
            />
          </label>
          <span
            className={cn(
              "ml-auto rounded-[3px] px-3 py-1 font-mono text-[11px] font-bold tracking-[0.2em]",
              onAir ? "bg-[oklch(0.6_0.23_27)] text-white" : "bg-white/10 text-muted-foreground",
            )}
          >
            ON AIR
          </span>
        </div>

        <div className="grid shrink-0 grid-cols-1 gap-1.5 @sm:grid-cols-2">
          <Monitor label="PREVIEW" tone="cue" guides={guides}>
            {pv && <Frame id={pv.layer} g={pv.g} />}
          </Monitor>
          <Monitor label="PROGRAM" tone={onAir ? "tally" : "muted"} guides={guides}>
            {GFX_LAYERS.map((l) =>
              active[l.id] ? <Frame key={l.id} id={l.id} g={graphics} /> : null,
            )}
          </Monitor>
        </div>

        <div className="mk-panel flex shrink-0 flex-wrap items-center gap-1.5 rounded-md p-1.5">
          <Ctl tone="program" onClick={() => rundown.take()} label="TAKE" hint="Space" />
          <Ctl tone="preview" onClick={() => rundown.update()} label="UPDATE" hint="U" />
          <Ctl tone="plain" onClick={() => rundown.clear()} label="CLEAR" hint="Esc" />
          <Ctl tone="amber" onClick={() => rundown.takeNext()} label="TAKE NEXT" hint="N" />
          <div className="mx-1 hidden h-10 w-px bg-white/10 sm:block" />
          <Toggle
            on={!!active.ticker}
            onClick={() => rundown.toggleLayer("ticker")}
            label="Ticker (T)"
          />
          <Toggle on={!!active.logo} onClick={() => rundown.toggleLayer("logo")} label="Logo (L)" />
          <Toggle
            on={rd.autoPlay}
            onClick={() => rundown.setAutoPlay(!rd.autoPlay)}
            label="Auto play"
          />
          <Toggle on={guides} onClick={() => setGuides((g) => !g)} label="Safe guides" />
          <button
            type="button"
            onClick={() => rundown.clearAll()}
            className="mk-button ml-auto h-9 rounded-[3px] px-3 text-[11px] text-red-400"
          >
            CLEAR ALL (X)
          </button>
        </div>

        <div className="mk-panel flex h-[22rem] shrink-0 flex-col overflow-hidden rounded-md fit:h-auto fit:min-h-[12rem] fit:flex-1">
          <div className="mk-label flex shrink-0 items-center justify-between border-b border-white/10 px-2 py-1.5 text-foreground">
            <span>Rundown — {show.items.length} items</span>
            <span className="font-mono text-[9px] normal-case tracking-normal text-muted-foreground">
              drag or ▲▼ to reorder · ↑↓ select · double-click = take
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {show.items.length === 0 && (
              <div className="grid gap-1 p-6 text-center text-xs text-muted-foreground">
                <b className="text-foreground">How this works</b>
                <span>1. Add a package or a single graphic from the library on the left.</span>
                <span>2. Click a row, then change its words and timing under Properties.</span>
                <span>3. Press TAKE (Space) to put it on air. UPDATE (U) pushes edits while it is live. CLEAR (Esc) takes it off.</span>
              </div>
            )}
            {show.items.map((it, idx) => {
              const tpl = getTemplate(it.templateId);
              const live = isLive(it);
              const begins = !!it.packageId && show.items[idx - 1]?.packageId !== it.packageId;
              return (
                <div key={it.id}>
                  {begins && (
                    <div className="flex items-center gap-2 border-b border-white/10 bg-amber/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber">
                      <Boxes className="h-3 w-3 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{it.packageName}</span>
                      <button
                        type="button"
                        title="Save this group back to My packages"
                        onClick={() =>
                          saveRowsAsPackage(
                            show.items.filter((x) => x.packageId === it.packageId),
                            it.packageName ?? "My package",
                            packageSource(it.packageId),
                          )
                        }
                        className="mk-button flex h-6 shrink-0 items-center gap-1 rounded-[3px] px-2 text-[9px] normal-case tracking-normal text-foreground"
                      >
                        <Save className="h-3 w-3" /> Save to library
                      </button>
                    </div>
                  )}
                  <div
                    draggable
                    onDragStart={() => setDragId(it.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragId && dragId !== it.id) rundown.reorder(dragId, it.id);
                      setDragId(null);
                    }}
                    onClick={() => rundown.select(it.id)}
                    onDoubleClick={() => void rundown.takeItem(it)}
                    className={cn(
                      "group flex cursor-pointer items-center gap-2 border-b border-l-4 border-white/5 px-2 py-1.5 text-xs",
                      it.id === rd.selId ? "bg-white/10" : "hover:bg-white/5",
                      live ? "border-l-[oklch(0.6_0.23_27)]" : "border-l-transparent",
                    )}
                  >
                    <span className="w-6 font-mono text-[10px] text-muted-foreground">
                      {idx + 1}
                    </span>
                    <span className="flex-1 truncate normal-case">{it.name}</span>
                    <span className="hidden w-16 font-mono text-[10px] uppercase text-muted-foreground @sm:inline">
                      {tpl?.layer}
                    </span>
                    <span className="w-12 font-mono text-[10px] text-muted-foreground">
                      {it.durationSec > 0 ? `${it.durationSec}s` : "HOLD"}
                    </span>
                    {live && (
                      <span className="rounded-[2px] bg-[oklch(0.6_0.23_27)] px-1.5 py-0.5 font-mono text-[9px] text-white">
                        LIVE
                      </span>
                    )}
                    {(
                      [
                        ["Move up", "▲", -1, idx === 0],
                        ["Move down", "▼", 1, idx === show.items.length - 1],
                      ] as [string, string, number, boolean][]
                    ).map(([label, glyph, d, off]) => (
                      <button
                        key={label}
                        type="button"
                        aria-label={`${label}: ${it.name}`}
                        title={label}
                        disabled={off}
                        onClick={(e) => {
                          e.stopPropagation();
                          const other = show.items[idx + d];
                          if (other) rundown.reorder(it.id, other.id);
                        }}
                        className="px-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-20"
                      >
                        {glyph}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        rundown.duplicate(it.id);
                      }}
                      className="px-1 text-[10px] text-muted-foreground hover:text-foreground focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`Delete "${it.name}"?`)) rundown.remove(it.id);
                      }}
                      className="px-1 text-[10px] text-red-400 focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ properties */}
      <aside className="mk-panel flex min-h-0 w-full shrink-0 flex-col gap-3 overflow-y-auto rounded-md p-2 fit:max-h-none fit:w-60 lg:fit:w-72">
        <div className="grid gap-2">
          <h2 className="mk-label text-foreground">Properties</h2>
          {sel && selTpl ? (
            <>
              <Lbl t="Item name">
                <input
                  className={field}
                  value={sel.name}
                  onChange={(e) => rundown.patchItem(sel.id, { name: e.target.value })}
                />
              </Lbl>
              {selTpl.fields.map((f) => (
                <Lbl key={f.key} t={f.label}>
                  {f.type === "textarea" ? (
                    <textarea
                      rows={4}
                      className="mk-field w-full min-w-0 rounded-[3px] px-2 py-1.5 text-xs"
                      value={sel.data[f.key] ?? ""}
                      onChange={(e) =>
                        rundown.patchItem(sel.id, {
                          data: { ...sel.data, [f.key]: e.target.value },
                        })
                      }
                    />
                  ) : (
                    <input
                      type={f.type === "number" ? "number" : "text"}
                      className={field}
                      value={sel.data[f.key] ?? ""}
                      onChange={(e) =>
                        rundown.patchItem(sel.id, {
                          data: { ...sel.data, [f.key]: e.target.value },
                        })
                      }
                    />
                  )}
                </Lbl>
              ))}
              <div className="grid grid-cols-2 gap-2">
                <Lbl t="Comes on with">
                  <select
                    className={field}
                    value={sel.transition}
                    onChange={(e) =>
                      rundown.patchItem(sel.id, { transition: e.target.value as Transition })
                    }
                  >
                    {TRANSITIONS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </Lbl>
                <Lbl t="Anim ms">
                  <input
                    type="number"
                    min={100}
                    max={3000}
                    className={field}
                    value={sel.animMs}
                    onChange={(e) =>
                      rundown.patchItem(sel.id, {
                        animMs: Math.max(100, Math.min(3000, Number(e.target.value) || 600)),
                      })
                    }
                  />
                </Lbl>
              </div>
              <Lbl t="Duration (seconds, 0 = hold)">
                <input
                  type="number"
                  min={0}
                  className={field}
                  value={sel.durationSec}
                  onChange={(e) =>
                    rundown.patchItem(sel.id, {
                      durationSec: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                />
              </Lbl>
              {isSelLive && (
                <p className="font-mono text-[10px] text-[oklch(0.7_0.2_27)]">
                  This item is on air — press UPDATE to push edits.
                </p>
              )}
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => rundown.undo()}
                  className="mk-button h-7 rounded-[3px] px-2 text-[10px]"
                >
                  Undo ⌘Z
                </button>
                <button
                  type="button"
                  onClick={() => rundown.redo()}
                  className="mk-button h-7 rounded-[3px] px-2 text-[10px]"
                >
                  Redo ⇧⌘Z
                </button>
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Select a rundown item.</p>
          )}
        </div>

        <div className="grid gap-2 border-t border-white/10 pt-2">
          <h2 className="mk-label text-foreground">Show theme</h2>
          <div className="flex flex-wrap gap-1">
            {GFX_THEMES.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => rundown.patchShow({ theme: p })}
                className={cn(
                  "mk-button flex h-7 items-center gap-1 rounded-[3px] px-2 text-[10px]",
                  show.theme.id === p.id && "mk-lit-amber",
                )}
              >
                <span className="h-3 w-3 rounded-full" style={{ background: p.primary }} />
                {p.name}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(["primary", "secondary", "accent", "text"] as const).map((k) => (
              <Lbl key={k} t={k}>
                <input
                  type="color"
                  className="h-8 w-full cursor-pointer rounded-[3px] border border-white/15 bg-black/30 p-0.5"
                  value={show.theme[k]}
                  onChange={(e) =>
                    rundown.patchShow({ theme: { ...show.theme, [k]: e.target.value } })
                  }
                />
              </Lbl>
            ))}
          </div>
          <Lbl t="Font">
            <select
              className={field}
              value={show.theme.font}
              onChange={(e) =>
                rundown.patchShow({ theme: { ...show.theme, font: e.target.value as GfxFont } })
              }
            >
              {GFX_FONTS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </Lbl>
        </div>

        <div className="grid gap-1 border-t border-white/10 pt-2">
          <h2 className="mk-label text-foreground">Output</h2>
          <p className="text-[11px] leading-snug text-muted-foreground">
            TAKE sends the graphic to OBS through the MK Graphics layers — no extra browser source.
            Run Settings → Graphics → Set up once, then Save in the Design tab so OBS has all
            layers.
          </p>
        </div>

        <div className="grid gap-1 border-t border-white/10 pt-2">
          <h2 className="mk-label text-foreground">Log</h2>
          <div className="max-h-40 overflow-y-auto font-mono text-[10px] text-muted-foreground">
            {rd.log.length === 0
              ? "No commands yet."
              : rd.log.map((l, i) => (
                  <div key={i}>
                    <span className="opacity-50">{l.t}</span> {l.msg}
                  </div>
                ))}
          </div>
        </div>
      </aside>

      {editing && (
        <PackageEditor
          pack={editing.pack}
          title={editing.title}
          onClose={() => setEditing(null)}
          onSave={(next) => {
            const saved = packageStore.save(next);
            setEditing(null);
            say(`Saved "${saved.name}" — ${saved.items.length} graphic${saved.items.length === 1 ? "" : "s"}`);
          }}
        />
      )}
    </div>
  );
}
