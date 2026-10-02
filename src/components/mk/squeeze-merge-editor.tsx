import { Settings2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AD_LAYOUTS,
  AD_STYLES,
  ANCHORS,
  ANCHOR_GLYPH,
  type AdConfig,
  type AdPreset,
} from "@/lib/mk/fx";
import { engine, useSwitcher } from "@/lib/mk/use-switcher";
import { cn } from "@/lib/utils";

const AD_SIZE_CHOICES = [0.15, 0.2, 0.25, 0.3, 0.35, 0.4];
const pct = (v: number) => `${Math.round(v * 100)}%`;
const fieldClass =
  "h-8 w-full min-w-0 rounded-sm border border-border bg-input px-2 font-mono text-xs text-foreground outline-none focus:border-ring";

const sameAd = (a: AdConfig, b: AdConfig) => JSON.stringify(a) === JSON.stringify(b);

function Choices<T extends string | number>({
  items,
  value,
  onPick,
  label,
}: {
  items: { id: T; text: string; hint?: string }[];
  value: T;
  onPick: (id: T) => void;
  label: string;
}) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label={label}>
      {items.map((it) => (
        <button
          key={String(it.id)}
          type="button"
          title={it.hint}
          onClick={() => onPick(it.id)}
          className={cn("mk-button h-7 min-w-[2.5rem] rounded-[3px] px-2 font-mono text-[10px]", value === it.id && "mk-lit-amber")}
        >
          {it.text}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <span className="mk-label text-[9px]">{label}</span>
      {children}
    </div>
  );
}

/**
 * Squeeze Merge editor for the Transitions panel. Changes are a DRAFT until SAVE is pressed, so nothing
 * moves on air by accident. SAVE writes the preset (name + every setting) to the saved config; it is
 * still there after a reload, and the preset in use stays selected.
 */
export function SqueezeMergeEditor({ presets, adActive, sqmOn, busy }: { presets: AdPreset[]; adActive: number; sqmOn: boolean; busy: boolean }) {
  const state = useSwitcher();
  const connected = state.status === "connected";
  const camScenes = state.config.camScenes.filter((s): s is string => !!s);

  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(adActive);
  const [name, setName] = useState("");
  const [draft, setDraft] = useState<AdConfig | null>(null);
  const [sources, setSources] = useState<{ name: string; kind: "scene" | "input" }[]>([]);

  const saved = presets[sel];

  // Load the chosen preset into the draft whenever the dialog opens or another preset is picked.
  useEffect(() => {
    if (!open) return;
    const p = presets[sel] ?? presets[0];
    if (!p) return;
    setName(p.name);
    setDraft({ ...p.ad });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sel]);

  // Opening the editor starts on the preset that is in use.
  useEffect(() => {
    if (open) setSel(adActive);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !connected) return;
    let alive = true;
    void engine.listSources().then((list) => alive && setSources(list));
    return () => {
      alive = false;
    };
  }, [open, connected]);

  const options = useMemo(() => sources.filter((s) => !camScenes.includes(s.name)), [sources, camScenes]);
  const dirty = !!draft && !!saved && (!sameAd(draft, saved.ad) || name.trim() !== saved.name);

  const edit = (patch: Partial<AdConfig>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const pickPreset = (i: number) => {
    if (dirty && !window.confirm("You have unsaved changes on this Squeeze Merge. Switch anyway?")) return;
    setSel(i);
  };

  const save = async () => {
    if (!draft) return;
    await engine.saveAdPreset(sel, name, draft);
  };

  const saveAsNew = async () => {
    if (!draft) return;
    const base = (name.trim() || "Squeeze Merge").replace(/ copy$/i, "");
    const idx = await engine.saveAdPresetAs(`${base} copy`, draft);
    setSel(idx);
  };

  const remove = async () => {
    if (presets.length <= 1) return;
    if (!window.confirm(`Delete "${saved?.name}"?`)) return;
    await engine.removeAdPreset(sel);
    setSel(0);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Set up, save and pick your Squeeze Merge looks"
        aria-label="Squeeze Merge settings"
        className="mk-button flex h-5 min-w-0 items-center justify-center gap-1 rounded-[3px] px-1 font-mono text-[8px]"
      >
        <Settings2 className="h-3 w-3" />
        SQZ MERGE SETUP
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="mk-chassis max-h-[92dvh] max-w-md overflow-y-auto p-3 sm:p-4">
          <DialogHeader>
            <DialogTitle className="mk-label text-foreground">Squeeze Merge</DialogTitle>
            <DialogDescription className="font-mono text-[10px]">
              Set it up here, press SAVE, and it is kept (also after a reload). The one marked IN USE is what the SQZ MERGE button plays.
            </DialogDescription>
          </DialogHeader>

          {draft && saved && (
            <div className="grid gap-2.5">
              <div className="flex items-center gap-1">
                <select
                  value={sel}
                  onChange={(e) => pickPreset(Number(e.target.value))}
                  className={fieldClass}
                  aria-label="Squeeze Merge preset"
                >
                  {presets.map((p, i) => (
                    <option key={i} value={i}>
                      {p.name}
                      {i === adActive ? " — IN USE" : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={sel === adActive || sqmOn || busy}
                  title={sqmOn || busy ? "Take SQZ MERGE out first" : "Use this one on the switcher"}
                  onClick={() => void engine.selectAdPreset(sel)}
                  className={cn("mk-button h-8 shrink-0 rounded-[3px] px-2 font-mono text-[9px]", sel === adActive && "mk-lit-amber")}
                >
                  {sel === adActive ? "IN USE" : "USE"}
                </button>
              </div>

              <Field label="Name">
                <input value={name} maxLength={32} onChange={(e) => setName(e.target.value)} className={fieldClass} aria-label="Preset name" />
              </Field>

              <Field label="Advertisement">
                <select
                  value={draft.scene ?? ""}
                  onChange={(e) => edit({ scene: e.target.value || null })}
                  className={fieldClass}
                  aria-label="Advertisement source"
                >
                  <option value="">— advertisement: none —</option>
                  {options.some((s) => s.kind === "scene") && (
                    <optgroup label="Scenes">
                      {options
                        .filter((s) => s.kind === "scene")
                        .map((s) => (
                          <option key={s.name} value={s.name}>
                            {s.name}
                          </option>
                        ))}
                    </optgroup>
                  )}
                  {options.some((s) => s.kind === "input") && (
                    <optgroup label="Image / video / graphic sources">
                      {options
                        .filter((s) => s.kind === "input")
                        .map((s) => (
                          <option key={s.name} value={s.name}>
                            {s.name}
                          </option>
                        ))}
                    </optgroup>
                  )}
                  {draft.scene && !options.some((s) => s.name === draft.scene) && (
                    <option value={draft.scene}>
                      {draft.scene}
                      {connected ? " (not found)" : ""}
                    </option>
                  )}
                </select>
              </Field>

              <Field label="Look">
                <Choices
                  label="Look"
                  items={[
                    { id: "frame" as const, text: "FRAME", hint: "Ad fills the screen behind; the picture shrinks into a spot" },
                    { id: "strip" as const, text: "STRIP", hint: "Ad is a bar beside the picture" },
                  ]}
                  value={draft.look}
                  onPick={(look) => edit({ look })}
                />
              </Field>

              {draft.look === "frame" ? (
                <Field label="Picture sits">
                  <div className="grid w-fit grid-cols-3 gap-0.5" role="group" aria-label="Where the program picture sits">
                    {ANCHORS.map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => edit({ anchor: a })}
                        className={cn("mk-button h-7 w-9 rounded-[2px] px-0 font-mono text-[10px]", draft.anchor === a && "mk-lit-amber")}
                      >
                        {ANCHOR_GLYPH[a]}
                      </button>
                    ))}
                  </div>
                </Field>
              ) : (
                <Field label="Ad side">
                  <Choices label="Ad side" items={AD_LAYOUTS.map((l) => ({ id: l.id, text: l.label }))} value={draft.layout} onPick={(layout) => edit({ layout })} />
                </Field>
              )}

              <Field label="Ad size">
                <Choices
                  label="Ad size"
                  items={AD_SIZE_CHOICES.map((v) => ({ id: v, text: pct(v) }))}
                  value={AD_SIZE_CHOICES.find((v) => Math.abs(v - draft.size) < 0.01) ?? -1}
                  onPick={(size) => edit({ size })}
                />
              </Field>

              <Field label="Motion">
                <Choices label="Motion" items={AD_STYLES.map((s) => ({ id: s.id, text: s.label, hint: s.hint }))} value={draft.style} onPick={(style) => edit({ style })} />
              </Field>

              <Field label="Fit or fill">
                <Choices
                  label="Fit or fill"
                  items={[
                    { id: "fit" as const, text: "FIT", hint: "Whole ad visible" },
                    { id: "fill" as const, text: "FILL", hint: "Ad covers its area (cropped)" },
                  ]}
                  value={draft.fit}
                  onPick={(fit) => edit({ fit })}
                />
              </Field>

              <div className="flex flex-wrap items-center gap-1.5 border-t border-white/10 pt-2">
                <span className={cn("mr-auto font-mono text-[10px]", dirty ? "text-amber" : "text-muted-foreground")}>
                  {dirty ? "Unsaved changes" : "All saved"}
                </span>
                <button
                  type="button"
                  disabled={presets.length <= 1}
                  onClick={() => void remove()}
                  className="mk-button h-8 rounded-[3px] px-2 font-mono text-[9px]"
                  title="Delete this Squeeze Merge"
                >
                  DELETE
                </button>
                <button
                  type="button"
                  onClick={() => void saveAsNew()}
                  className="mk-button h-8 rounded-[3px] px-2 font-mono text-[9px]"
                  title="Keep these settings as a new Squeeze Merge"
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
