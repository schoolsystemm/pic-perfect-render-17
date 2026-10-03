import { CopyPlus, Download, Link2, Pencil, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { GFX_LAYERS, layerUrl } from "@/lib/mk/graphics";
import {
  exportJson,
  gfxLibrary,
  MAX_LINK_CHARS,
  parsePack,
  parseShare,
  shareLink,
  type SavedGraphic,
} from "@/lib/mk/gfx-library";
import { DEFAULT_GRAPHICS, type GfxId, type GraphicsConfig } from "@/lib/mk/types";
import { cn } from "@/lib/utils";

const field = "mk-field h-8 w-full min-w-0 rounded-[3px] px-2 text-xs";
const BACK =
  "bg-[linear-gradient(135deg,oklch(0.38_0.1_250),oklch(0.2_0.06_300)_55%,oklch(0.3_0.08_20))]";

const layerName = (id: GfxId) => GFX_LAYERS.find((l) => l.id === id)?.label ?? id;

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[^\w-]+/g, "_") || "graphic"}.mkgfx.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A small picture of a saved design. The preview only loads once the row scrolls into view. */
function Thumb({ item }: { item: SavedGraphic }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver((e) => {
      if (e[0]?.isIntersecting) {
        setSeen(true);
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const url = useMemo(
    () => (seen ? layerUrl(item.layer, { ...DEFAULT_GRAPHICS, [item.layer]: item.data } as GraphicsConfig) : ""),
    [seen, item.layer, item.data],
  );
  return (
    <div ref={ref} className={cn("relative aspect-video w-24 shrink-0 overflow-hidden rounded-[2px] border border-white/10", BACK)}>
      {seen && (
        <iframe
          title={`${item.name} preview`}
          src={url}
          sandbox="allow-scripts"
          tabIndex={-1}
          className="pointer-events-none absolute inset-0 h-full w-full border-0 bg-transparent"
        />
      )}
    </div>
  );
}

/**
 * "My designs": everything you saved from the Design tab. Click a design to load it, change it, then
 * Update it (or Save as new). Rename, duplicate, share, delete, and send several at once as one pack file.
 */
export function DesignLibrary({
  active,
  draft,
  library,
  loadedId,
  onLoad,
  onLoaded,
  onIncoming,
  say,
}: {
  active: GfxId;
  draft: GraphicsConfig;
  library: SavedGraphic[];
  /** The saved design currently open in the editor (so Update knows what to overwrite). */
  loadedId: string | null;
  onLoad: (item: SavedGraphic) => void;
  /** Tell the page which saved design is now open in the editor (null = none). */
  onLoaded: (id: string | null) => void;
  onIncoming: (items: ReturnType<typeof parsePack>) => void;
  say: (msg: string) => void;
}) {
  const [saveName, setSaveName] = useState("");
  const [paste, setPaste] = useState("");
  const [allLayers, setAllLayers] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const label = layerName(active).toLowerCase();
  const shown = allLayers ? library : library.filter((i) => i.layer === active);
  const loaded = loadedId ? library.find((i) => i.id === loadedId && i.layer === active) : undefined;
  const chosen = library.filter((i) => picked.has(i.id));

  const saveNew = () => {
    if (!saveName.trim()) return;
    const item = gfxLibrary.save(saveName, active, draft[active]);
    say(`Saved "${item.name}"`);
    onLoaded(item.id);
    setSaveName("");
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

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const iconBtn = "mk-button flex h-7 w-7 shrink-0 items-center justify-center rounded-[3px]";

  return (
    <section className="mk-panel flex max-h-none min-h-[14rem] shrink-0 flex-col gap-1.5 rounded-md p-2 fit:max-h-[46%]">
      <div className="flex items-center gap-1">
        <h2 className="mk-label mr-auto text-foreground">{allLayers ? "All my designs" : `My ${label} designs`}</h2>
        <button
          type="button"
          onClick={() => setAllLayers((v) => !v)}
          className={cn("mk-button h-6 rounded-[3px] px-2 text-[9px]", allLayers && "mk-lit-amber")}
          title="Show saved designs from every graphic type"
        >
          All types
        </button>
      </div>

      {loaded && (
        <div className="grid gap-1 rounded-[3px] border border-amber/60 bg-amber/10 p-1.5">
          <span className="truncate font-mono text-[10px] text-amber">Editing “{loaded.name}”</span>
          <div className="flex gap-1">
            <button
              type="button"
              className="mk-button mk-lit-amber h-7 flex-1 truncate rounded-[3px] px-2 text-[10px]"
              onClick={() => {
                const item = gfxLibrary.update(loaded.id, draft[loaded.layer]);
                if (item) say(`Updated "${item.name}"`);
              }}
            >
              Update “{loaded.name}”
            </button>
            <button type="button" className="mk-button h-7 rounded-[3px] px-2 text-[10px]" onClick={() => onLoaded(null)} title="Stop editing this one and save under a new name">
              Done
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-1">
        <input
          className={cn(field, "flex-1")}
          value={saveName}
          placeholder={loaded ? "Or save as a new design…" : `Name this ${label} design`}
          onChange={(e) => setSaveName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && saveNew()}
        />
        <button type="button" disabled={!saveName.trim()} className="mk-button h-8 shrink-0 rounded-[3px] px-3 text-[10px] disabled:opacity-40" onClick={saveNew}>
          Save new
        </button>
      </div>

      <ul className="grid min-h-0 flex-1 content-start gap-1 overflow-y-auto">
        {shown.length === 0 && (
          <li className="font-mono text-[10px] text-muted-foreground">
            Nothing saved for {allLayers ? "any graphic type" : label} yet. Design it above, name it, press Save new.
          </li>
        )}
        {shown.map((item) => (
          <li key={item.id} className={cn("grid gap-1 rounded-[3px] bg-black/25 p-1", item.id === loadedId && "ring-1 ring-amber")}>
            <div className="flex items-center gap-1.5">
              <input
                type="checkbox"
                aria-label={`Select ${item.name} for a pack`}
                checked={picked.has(item.id)}
                onChange={() => toggle(item.id)}
                className="h-4 w-4 shrink-0 accent-[oklch(0.8_0.16_85)]"
              />
              <button type="button" onClick={() => onLoad(item)} className="shrink-0" title="Load into the editor" aria-label={`Load ${item.name}`}>
                <Thumb item={item} />
              </button>
              <button type="button" onClick={() => onLoad(item)} className="min-w-0 flex-1 text-left" title="Load into the editor">
                <div className="truncate text-[11px] normal-case">{item.name}</div>
                <div className="font-mono text-[9px] uppercase text-muted-foreground">
                  {layerName(item.layer)}
                  {item.id === loadedId ? " · editing" : ""}
                </div>
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                aria-label={`Save the editor over ${item.name}`}
                title="Overwrite this design with what is in the editor now"
                className={iconBtn}
                onClick={() => {
                  gfxLibrary.update(item.id, draft[item.layer]);
                  say(`Updated "${item.name}" with the editor's current ${layerName(item.layer).toLowerCase()}`);
                }}
              >
                <Save className="h-3 w-3" />
              </button>
              <button
                type="button"
                aria-label={`Rename ${item.name}`}
                title="Rename"
                className={iconBtn}
                onClick={() => {
                  const n = window.prompt("Rename design", item.name);
                  if (n?.trim()) gfxLibrary.rename(item.id, n);
                }}
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                type="button"
                aria-label={`Duplicate ${item.name}`}
                title="Duplicate"
                className={iconBtn}
                onClick={() => {
                  const c = gfxLibrary.duplicate(item.id);
                  if (c) say(`Made "${c.name}"`);
                }}
              >
                <CopyPlus className="h-3 w-3" />
              </button>
              <button type="button" aria-label={`Copy share link for ${item.name}`} title="Copy share link" className={iconBtn} onClick={() => void copyLink(item)}>
                <Link2 className="h-3 w-3" />
              </button>
              <button type="button" aria-label={`Download ${item.name}`} title="Download file to send" className={iconBtn} onClick={() => download(item.name, exportJson([item]))}>
                <Download className="h-3 w-3" />
              </button>
              <button
                type="button"
                aria-label={`Delete ${item.name}`}
                title="Delete"
                className={cn(iconBtn, "ml-auto")}
                onClick={() => {
                  if (window.confirm(`Delete "${item.name}"?`)) {
                    gfxLibrary.remove(item.id);
                    setPicked((p) => {
                      const n = new Set(p);
                      n.delete(item.id);
                      return n;
                    });
                  }
                }}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="grid gap-1 border-t border-white/10 pt-1.5">
        <div className="flex flex-wrap items-center gap-1">
          <span className="mk-label mr-auto text-[9px]">Packs · Share · Import</span>
          <button
            type="button"
            disabled={chosen.length === 0}
            className="mk-button h-6 rounded-[3px] px-2 text-[9px] disabled:opacity-40"
            onClick={() => download("mk-vision-pack", exportJson(chosen))}
            title="Tick designs above, then send them together as one file"
          >
            Export {chosen.length || ""} ticked
          </button>
          <button
            type="button"
            disabled={library.length === 0}
            className="mk-button h-6 rounded-[3px] px-2 text-[9px] disabled:opacity-40"
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
                  onIncoming(parsePack(await file.text()));
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
            className="mk-button h-8 shrink-0 rounded-[3px] px-3 text-[10px] disabled:opacity-40"
            onClick={() => {
              try {
                onIncoming(parseShare(paste));
                setPaste("");
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
  );
}
