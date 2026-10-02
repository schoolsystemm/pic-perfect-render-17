import { LayoutGrid } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AD_STYLES } from "@/lib/mk/fx";
import {
  MERGE_BORDER_CHOICES,
  MERGE_LAYOUTS,
  MERGE_MAX_PANES,
  MERGE_MIN_PANES,
  mergeLayoutById,
  type MergeConfig,
  type MergeLayoutDef,
  type MergePreset,
} from "@/lib/mk/merge";
import { camLabel, type CamIndex } from "@/lib/mk/types";
import { engine, useSwitcher } from "@/lib/mk/use-switcher";
import { cn } from "@/lib/utils";

const fieldClass =
  "h-8 w-full min-w-0 rounded-sm border border-border bg-input px-2 font-mono text-xs text-foreground outline-none focus:border-ring";
const sameMerge = (a: MergeConfig, b: MergeConfig) => JSON.stringify(a) === JSON.stringify(b);

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <span className="mk-label text-[9px]">{label}</span>
      {children}
    </div>
  );
}

/** A tiny picture of a layout: the cells with a gap between them. */
function LayoutThumb({ def, active, onPick }: { def: MergeLayoutDef; active: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      title={`${def.label} — ${def.panes} panes`}
      aria-pressed={active}
      className={cn("mk-button flex w-[3.4rem] flex-col items-center gap-0.5 rounded-[3px] p-1", active && "mk-lit-amber")}
    >
      <svg viewBox="0 0 160 90" className="aspect-video w-full rounded-[1px] bg-black/70">
        {def.cells.map((c, i) => (
          <rect
            key={i}
            x={c.x * 160 + 2}
            y={c.y * 90 + 2}
            width={Math.max(2, c.w * 160 - 4)}
            height={Math.max(2, c.h * 90 - 4)}
            fill="currentColor"
            opacity={0.75}
          />
        ))}
      </svg>
      <span className="font-mono text-[7px] leading-none">{def.label}</span>
    </button>
  );
}

/**
 * Merge editor (split screen, 2 to 6 panes, with borders). Changes are a DRAFT until SAVE is pressed; SAVE keeps
 * the preset across reloads, and if it is the one in use (and showing) OBS follows at once.
 */
export function MergeEditor({ presets, active, merging, busy }: { presets: MergePreset[]; active: number; merging: boolean; busy: boolean }) {
  const state = useSwitcher();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(active);
  const [name, setName] = useState("");
  const [draft, setDraft] = useState<MergeConfig | null>(null);
  const [count, setCount] = useState(2);

  const saved = presets[sel];
  const camOptions = useMemo(
    () =>
      state.config.camScenes
        .map((scene, i) => (scene ? { scene, label: `${camLabel(i as CamIndex)} · ${scene}` } : null))
        .filter((o): o is { scene: string; label: string } => !!o),
    [state.config.camScenes],
  );

  useEffect(() => {
    if (!open) return;
    const p = presets[sel] ?? presets[0];
    if (!p) return;
    setName(p.name);
    setDraft({ ...p.merge, scenes: [...p.merge.scenes] });
    setCount(mergeLayoutById(p.merge.layout).panes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sel]);

  useEffect(() => {
    if (open) setSel(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const dirty = !!draft && !!saved && (!sameMerge(draft, saved.merge) || name.trim() !== saved.name);
  const edit = (patch: Partial<MergeConfig>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const panes = draft ? mergeLayoutById(draft.layout).panes : 2;
  const layouts = MERGE_LAYOUTS.filter((l) => l.panes === count);

  const pickPreset = (i: number) => {
    if (dirty && !window.confirm("You have unsaved changes on this Merge. Switch anyway?")) return;
    setSel(i);
  };

  const pickCount = (n: number) => {
    setCount(n);
    const first = MERGE_LAYOUTS.find((l) => l.panes === n);
    if (first && draft && mergeLayoutById(draft.layout).panes !== n) edit({ layout: first.id });
  };

  const setPane = (i: number, scene: string) =>
    setDraft((d) => (d ? { ...d, scenes: d.scenes.map((s, k) => (k === i ? scene || null : s)) } : d));

  const save = async () => {
    if (draft) await engine.saveMergePreset(sel, name, draft);
  };
  const saveAsNew = async () => {
    if (!draft) return;
    const base = (name.trim() || "Split").replace(/ copy$/i, "");
    setSel(await engine.saveMergePresetAs(`${base} copy`, draft));
  };
  const remove = async () => {
    if (presets.length <= 1) return;
    if (!window.confirm(`Delete "${saved?.name}"?`)) return;
    await engine.removeMergePreset(sel);
    setSel(0);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Set up, save and pick your split-screen Merge looks (2 to 6 panes, borders)"
        aria-label="Merge settings"
        className="mk-button flex h-5 min-w-0 items-center justify-center gap-1 rounded-[3px] px-1 font-mono text-[8px]"
      >
        <LayoutGrid className="h-3 w-3" />
        MERGE SETUP
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="mk-chassis max-h-[92dvh] max-w-md overflow-y-auto p-3 sm:p-4">
          <DialogHeader>
            <DialogTitle className="mk-label text-foreground">Merge · split screen</DialogTitle>
            <DialogDescription className="font-mono text-[10px]">
              Pick how many pictures ({MERGE_MIN_PANES} to {MERGE_MAX_PANES}), the layout, the border and which cam goes in each pane. Press SAVE to keep it.
              PIP, DSK and Squeeze Merge keep working on top.
            </DialogDescription>
          </DialogHeader>

          {draft && saved && (
            <div className="grid gap-2.5">
              <div className="flex items-center gap-1">
                <select value={sel} onChange={(e) => pickPreset(Number(e.target.value))} className={fieldClass} aria-label="Merge preset">
                  {presets.map((p, i) => (
                    <option key={i} value={i}>
                      {p.name}
                      {i === active ? " — IN USE" : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={sel === active || busy}
                  title="Use this one on the MERGE button"
                  onClick={() => void engine.selectMergePreset(sel)}
                  className={cn("mk-button h-8 shrink-0 rounded-[3px] px-2 font-mono text-[9px]", sel === active && "mk-lit-amber")}
                >
                  {sel === active ? "IN USE" : "USE"}
                </button>
              </div>

              <Field label="Name">
                <input value={name} maxLength={32} onChange={(e) => setName(e.target.value)} className={fieldClass} aria-label="Merge name" />
              </Field>

              <Field label="Pictures">
                <div className="flex flex-wrap gap-1" role="group" aria-label="Number of panes">
                  {Array.from({ length: MERGE_MAX_PANES - MERGE_MIN_PANES + 1 }, (_, k) => MERGE_MIN_PANES + k).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => pickCount(n)}
                      className={cn("mk-button h-7 min-w-[2.5rem] rounded-[3px] px-2 font-mono text-[10px]", count === n && "mk-lit-amber")}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Layout">
                <div className="flex flex-wrap gap-1" role="group" aria-label="Layout">
                  {layouts.map((l) => (
                    <LayoutThumb key={l.id} def={l} active={draft.layout === l.id} onPick={() => edit({ layout: l.id })} />
                  ))}
                </div>
              </Field>

              <Field label="Cam in each pane (auto = PGM, PVW, then the next free cams)">
                <div className="grid grid-cols-2 gap-1">
                  {Array.from({ length: panes }, (_, i) => (
                    <label key={i} className="flex items-center gap-1">
                      <span className="mk-label w-4 shrink-0 text-center text-[9px]">{i + 1}</span>
                      <select
                        value={draft.scenes[i] ?? ""}
                        onChange={(e) => setPane(i, e.target.value)}
                        className={fieldClass}
                        aria-label={`Pane ${i + 1} cam`}
                      >
                        <option value="">{i === 0 ? "auto · PGM" : i === 1 ? "auto · PVW" : "auto"}</option>
                        {camOptions.map((o) => (
                          <option key={o.scene} value={o.scene}>
                            {o.label}
                          </option>
                        ))}
                        {draft.scenes[i] && !camOptions.some((o) => o.scene === draft.scenes[i]) && (
                          <option value={draft.scenes[i]!}>{draft.scenes[i]} (not mapped)</option>
                        )}
                      </select>
                    </label>
                  ))}
                </div>
              </Field>

              <Field label="Border">
                <div className="flex flex-wrap gap-1" role="group" aria-label="Border thickness">
                  {MERGE_BORDER_CHOICES.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => edit({ border: b })}
                      className={cn("mk-button h-7 min-w-[2.5rem] rounded-[3px] px-2 font-mono text-[10px]", draft.border === b && "mk-lit-amber")}
                    >
                      {b === 0 ? "NONE" : `${b}px`}
                    </button>
                  ))}
                </div>
              </Field>

              <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                <Field label="Border outside too">
                  <div className="flex gap-1" role="group" aria-label="Outer border">
                    {[
                      { id: false, text: "BETWEEN" },
                      { id: true, text: "ALL ROUND" },
                    ].map((o) => (
                      <button
                        key={String(o.id)}
                        type="button"
                        disabled={draft.border === 0}
                        onClick={() => edit({ outer: o.id })}
                        className={cn("mk-button h-7 rounded-[3px] px-2 font-mono text-[10px]", draft.outer === o.id && "mk-lit-amber")}
                      >
                        {o.text}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Colour">
                  <input
                    type="color"
                    value={draft.color}
                    onChange={(e) => edit({ color: e.target.value })}
                    aria-label="Border colour"
                    className="h-8 w-12 cursor-pointer rounded-sm border border-border bg-input p-0.5"
                  />
                </Field>
              </div>

              <Field label="Motion">
                <div className="flex flex-wrap gap-1" role="group" aria-label="Motion">
                  {AD_STYLES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      title={s.hint}
                      onClick={() => edit({ style: s.id })}
                      className={cn("mk-button h-7 min-w-[2.5rem] rounded-[3px] px-2 font-mono text-[10px]", draft.style === s.id && "mk-lit-amber")}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </Field>

              <div className="flex flex-wrap items-center gap-1.5 border-t border-white/10 pt-2">
                <span className={cn("mr-auto font-mono text-[10px]", dirty ? "text-amber" : "text-muted-foreground")}>
                  {dirty ? "Unsaved changes" : merging && sel === active ? "All saved · on air" : "All saved"}
                </span>
                <button
                  type="button"
                  disabled={presets.length <= 1}
                  onClick={() => void remove()}
                  className="mk-button h-8 rounded-[3px] px-2 font-mono text-[9px]"
                  title="Delete this Merge"
                >
                  DELETE
                </button>
                <button
                  type="button"
                  onClick={() => void saveAsNew()}
                  className="mk-button h-8 rounded-[3px] px-2 font-mono text-[9px]"
                  title="Keep these settings as a new Merge"
                >
                  SAVE AS NEW
                </button>
                <button
                  type="button"
                  disabled={!dirty}
                  onClick={() => void save()}
                  className={cn("mk-button h-8 rounded-[3px] px-5 text-xs text-foreground", dirty && "mk-lit-amber")}
                >
                  SAVE
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
