import { ArrowDown, ArrowUp, Copy, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { layerUrl } from "@/lib/mk/graphics";
import {
  TEMPLATES,
  TRANSITIONS,
  getTemplate,
  makeItem,
  previewConfig,
  uid,
  type GraphicPackage,
  type PackageItemSpec,
  type Transition,
} from "@/lib/mk/gfx-rundown";
import { GFX_THEMES } from "@/lib/mk/gfx-themes";
import { useSwitcher } from "@/lib/mk/use-switcher";
import { cn } from "@/lib/utils";

const field = "mk-field h-8 w-full min-w-0 rounded-[3px] px-2 text-xs";
const CHECKER = "bg-[repeating-conic-gradient(#222_0%_25%,#2e2e2e_0%_50%)] bg-[length:16px_16px]";

function Lbl({ t, children }: { t: string; children: ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="mk-label text-[9px]">{t}</span>
      {children}
    </label>
  );
}

interface Row {
  key: string;
  spec: PackageItemSpec;
}

const toRows = (items: PackageItemSpec[]): Row[] =>
  items.map((spec) => ({ key: uid(), spec: structuredClone(spec) }));

/**
 * Edit a package: name, description, theme and every graphic inside it (add, remove, reorder, change the
 * words, the way it comes on and how long it stays). Works on a copy; nothing changes until SAVE.
 */
export function PackageEditor({
  pack,
  title,
  onSave,
  onClose,
}: {
  pack: GraphicPackage;
  title: string;
  onSave: (next: GraphicPackage) => void;
  onClose: () => void;
}) {
  const state = useSwitcher();
  const [name, setName] = useState(pack.name);
  const [description, setDescription] = useState(pack.description);
  const [themeId, setThemeId] = useState(pack.themeId);
  const [rows, setRows] = useState<Row[]>(() => toRows(pack.items));
  const [selKey, setSelKey] = useState<string>(() => rows[0]?.key ?? "");
  const [adding, setAdding] = useState(TEMPLATES[0]!.id);

  // Esc closes (not while typing).
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (e.key === "Escape" && tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const sel = rows.find((r) => r.key === selKey) ?? rows[0];
  const selTpl = sel ? getTemplate(sel.spec.templateId) : undefined;
  const theme = GFX_THEMES.find((t) => t.id === themeId) ?? GFX_THEMES[0]!;

  const patch = (key: string, p: Partial<PackageItemSpec>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, spec: { ...r.spec, ...p } } : r)));

  const move = (key: string, d: number) =>
    setRows((rs) => {
      const i = rs.findIndex((r) => r.key === key);
      const j = i + d;
      if (i < 0 || j < 0 || j >= rs.length) return rs;
      const next = [...rs];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  const add = () => {
    const t = getTemplate(adding);
    if (!t) return;
    const row: Row = {
      key: uid(),
      spec: { templateId: t.id, name: t.name, data: { ...t.defaults }, durationSec: t.durationSec },
    };
    setRows((rs) => [...rs, row]);
    setSelKey(row.key);
  };

  const dup = (key: string) => {
    const i = rows.findIndex((r) => r.key === key);
    if (i < 0) return;
    const copy: Row = {
      key: uid(),
      spec: { ...structuredClone(rows[i]!.spec), name: `${rows[i]!.spec.name} copy` },
    };
    const next = [...rows];
    next.splice(i + 1, 0, copy);
    setRows(next);
    setSelKey(copy.key);
  };

  const remove = (key: string) => {
    const next = rows.filter((r) => r.key !== key);
    setRows(next);
    if (key === selKey) setSelKey(next[0]?.key ?? "");
  };

  // Live preview of the selected graphic on its OBS layer, in this package's theme.
  const pv = useMemo(() => {
    if (!sel) return null;
    const it = {
      ...makeItem(sel.spec.templateId, "pv", sel.spec.data, sel.spec.name),
      ...(sel.spec.transition ? { transition: sel.spec.transition } : {}),
    };
    const p = previewConfig(it, theme, state.config.graphics);
    return p ? { layer: p.layer, url: layerUrl(p.layer, p.g) } : null;
  }, [sel, theme, state.config.graphics]);

  const save = () => {
    onSave({
      ...pack,
      name: name.trim() || "Untitled package",
      shortName: (name.trim() || "PACKAGE").slice(0, 12).toUpperCase(),
      description: description.trim(),
      themeId,
      items: rows.map((r) => r.spec),
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/65 p-1.5 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="mk-panel flex max-h-full min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded-md">
        <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2">
          <h2 className="mk-label mr-auto truncate text-foreground">{title}</h2>
          <button type="button" className="mk-button h-8 rounded-[3px] px-3 text-xs" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="mk-button mk-lit-amber h-8 rounded-[3px] px-4 text-xs" onClick={save}>
            Save package
          </button>
          <button type="button" aria-label="Close" className="mk-button flex h-8 w-8 items-center justify-center rounded-[3px]" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-2 overflow-y-auto p-2 md:grid-cols-[minmax(13rem,17rem)_minmax(0,1fr)] md:overflow-hidden">
          {/* -------------------------------- left: package details + graphics in it */}
          <div className="grid min-h-0 min-w-0 content-start gap-2 md:overflow-y-auto md:pr-1">
            <Lbl t="Package name">
              <input className={field} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            </Lbl>
            <Lbl t="What it is for">
              <textarea
                rows={2}
                className="mk-field w-full min-w-0 rounded-[3px] px-2 py-1.5 text-xs"
                value={description}
                maxLength={240}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Lbl>
            <Lbl t="Theme (colours + font)">
              <select className={field} value={themeId} onChange={(e) => setThemeId(e.target.value)}>
                {GFX_THEMES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Lbl>

            <div className="grid gap-1">
              <span className="mk-label text-[9px]">Graphics in this package ({rows.length})</span>
              {rows.length === 0 && (
                <p className="font-mono text-[10px] text-muted-foreground">Empty. Add a graphic below.</p>
              )}
              <ul className="grid gap-1">
                {rows.map((r, i) => (
                  <li
                    key={r.key}
                    className={cn(
                      "flex items-center gap-0.5 rounded-[3px] border border-white/10 bg-black/25 p-0.5",
                      r.key === sel?.key && "border-amber bg-white/10",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setSelKey(r.key)}
                      className="min-w-0 flex-1 px-1.5 py-1 text-left"
                      title="Edit this graphic"
                    >
                      <div className="truncate text-[11px] normal-case">
                        {i + 1}. {r.spec.name}
                      </div>
                      <div className="font-mono text-[9px] uppercase text-muted-foreground">
                        {getTemplate(r.spec.templateId)?.layer}
                      </div>
                    </button>
                    {(
                      [
                        ["Move up", <ArrowUp key="u" className="h-3 w-3" />, () => move(r.key, -1), i === 0],
                        ["Move down", <ArrowDown key="d" className="h-3 w-3" />, () => move(r.key, 1), i === rows.length - 1],
                        ["Duplicate", <Copy key="c" className="h-3 w-3" />, () => dup(r.key), false],
                        ["Remove", <Trash2 key="t" className="h-3 w-3" />, () => remove(r.key), false],
                      ] as [string, ReactNode, () => void, boolean][]
                    ).map(([label, icon, fn, off]) => (
                      <button
                        key={label}
                        type="button"
                        aria-label={`${label}: ${r.spec.name}`}
                        title={label}
                        disabled={off}
                        onClick={fn}
                        className="mk-button flex h-7 w-7 shrink-0 items-center justify-center rounded-[3px] disabled:opacity-30"
                      >
                        {icon}
                      </button>
                    ))}
                  </li>
                ))}
              </ul>
              <div className="flex gap-1">
                <select className={field} value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="Graphic to add">
                  {TEMPLATES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <button type="button" className="mk-button flex h-8 shrink-0 items-center gap-1 rounded-[3px] px-2 text-[10px]" onClick={add}>
                  <Plus className="h-3 w-3" /> Add
                </button>
              </div>
            </div>
          </div>

          {/* -------------------------------- right: edit the selected graphic */}
          <div className="grid min-h-0 min-w-0 content-start gap-2 md:overflow-y-auto md:pr-1">
            {sel && selTpl ? (
              <>
                <div className={cn("relative aspect-video w-full overflow-hidden rounded-[3px] border border-white/10", CHECKER)}>
                  {pv && (
                    <iframe
                      title="Graphic preview"
                      src={pv.url}
                      sandbox="allow-scripts"
                      className="pointer-events-none absolute inset-0 h-full w-full border-0 bg-transparent"
                    />
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Lbl t="Name in the rundown">
                      <input
                        className={field}
                        value={sel.spec.name}
                        maxLength={80}
                        onChange={(e) => patch(sel.key, { name: e.target.value })}
                      />
                    </Lbl>
                  </div>
                  {selTpl.fields.map((f) => {
                    const val = sel.spec.data?.[f.key] ?? selTpl.defaults[f.key] ?? "";
                    const set = (v: string) => patch(sel.key, { data: { ...sel.spec.data, [f.key]: v } });
                    return (
                      <div key={f.key} className={f.type === "textarea" ? "sm:col-span-2" : undefined}>
                        <Lbl t={f.label}>
                          {f.type === "textarea" ? (
                            <textarea
                              rows={4}
                              className="mk-field w-full min-w-0 rounded-[3px] px-2 py-1.5 text-xs"
                              value={val}
                              onChange={(e) => set(e.target.value)}
                            />
                          ) : (
                            <input
                              type={f.type === "number" ? "number" : "text"}
                              className={field}
                              value={val}
                              onChange={(e) => set(e.target.value)}
                            />
                          )}
                        </Lbl>
                      </div>
                    );
                  })}
                  <Lbl t="Comes on with">
                    <select
                      className={field}
                      value={sel.spec.transition ?? "slide"}
                      onChange={(e) => patch(sel.key, { transition: e.target.value as Transition })}
                    >
                      {TRANSITIONS.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </Lbl>
                  <Lbl t="Seconds on air (0 = hold)">
                    <input
                      type="number"
                      min={0}
                      className={field}
                      value={sel.spec.durationSec ?? selTpl.durationSec}
                      onChange={(e) => patch(sel.key, { durationSec: Math.max(0, Number(e.target.value) || 0) })}
                    />
                  </Lbl>
                </div>
              </>
            ) : (
              <p className="p-4 text-center text-xs text-muted-foreground">
                Pick a graphic on the left to edit its words and timing, or add a new one.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
