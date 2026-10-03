import { MapPin } from "lucide-react";
import { useMemo, useState } from "react";

import { PlacePicker } from "@/components/mk/place-picker";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TAG_STYLES, tagSpot, tagUrl, type TagAnchor } from "@/lib/mk/tags";
import { camLabel, type CamIndex, type GfxFont } from "@/lib/mk/types";
import { engine, useSwitcher } from "@/lib/mk/use-switcher";
import { cn } from "@/lib/utils";

const fieldClass =
  "h-8 w-full min-w-0 rounded-sm border border-border bg-input px-2 font-mono text-xs text-foreground outline-none focus:border-ring";
const FONT_CHOICES: { id: GfxFont; label: string }[] = [
  { id: "sans", label: "Sans" },
  { id: "condensed", label: "Condensed" },
  { id: "serif", label: "Serif" },
  { id: "mono", label: "Mono" },
];
const ANCHORS: { id: TagAnchor; label: string }[] = [
  { id: "tl", label: "TOP LEFT" },
  { id: "tc", label: "TOP CENTRE" },
  { id: "tr", label: "TOP RIGHT" },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <span className="mk-label text-[9px]">{label}</span>
      {children}
    </div>
  );
}

/** Opens the location-tag setup. Everything saves as you change it; what is on air follows a moment later. */
export function TagsEditor() {
  const state = useSwitcher();
  const cfg = state.config.tags;
  const [open, setOpen] = useState(false);
  /** "" = the default spot for every pane, otherwise one cam's scene. */
  const [target, setTarget] = useState("");

  const cams = useMemo(
    () =>
      state.config.camScenes
        .map((scene, i) => (scene ? { scene, name: camLabel(i as CamIndex) } : null))
        .filter((c): c is { scene: string; name: string } => !!c),
    [state.config.camScenes],
  );

  const spot = target ? (cfg.spots[target] ?? null) : cfg.at;
  const previewScene = target || cams.find((c) => cfg.labels[c.scene])?.scene || "";
  const previewText = (previewScene && cfg.labels[previewScene]) || "Kisumu · Live";
  const previewAt = previewScene ? tagSpot(cfg, previewScene) : cfg.at;

  const place = (pos: { x: number; y: number }) => (target ? engine.setTagSpot(target, pos) : engine.setTags({ at: pos }));
  const reset = () => (target ? engine.setTagSpot(target, null) : engine.setTags({ at: null }));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Location tags: text for each cam, where it sits, how it looks"
        className="mk-button flex h-8 min-w-0 items-center justify-center gap-1 truncate rounded-[3px] px-1 text-[10px]"
      >
        <MapPin className="h-3 w-3 shrink-0" />
        TAGS SETUP
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="mk-chassis max-h-[92dvh] max-w-md overflow-y-auto p-3 sm:p-4">
          <DialogHeader>
            <DialogTitle className="mk-label text-foreground">Location tags</DialogTitle>
            <DialogDescription className="font-mono text-[10px]">
              Type where each cam is. With MERGE on, every pane shows its own tag at the top of that pane; place it by hand if you want it
              somewhere else. Saves as you type.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2.5">
            <button
              type="button"
              disabled={state.fx.running}
              onClick={() => void engine.toggleTags()}
              className={cn("mk-button h-8 rounded-[3px] px-3 text-[11px]", state.live.tags && "mk-lit-program")}
              aria-pressed={state.live.tags}
            >
              {state.live.tags ? "TAGS ON AIR — tap to take off" : "TAKE TAGS TO AIR"}
            </button>

            <Field label="Location of each cam (empty = no tag)">
              <div className="grid gap-1">
                {cams.length === 0 && <span className="font-mono text-[10px] opacity-70">Map your cams to OBS scenes in Settings first.</span>}
                {cams.map((c) => (
                  <label key={c.scene} className="flex items-center gap-1">
                    <span className="mk-label w-10 shrink-0 text-center text-[9px]" title={c.scene}>
                      {c.name}
                    </span>
                    <input
                      value={cfg.labels[c.scene] ?? ""}
                      maxLength={60}
                      placeholder="e.g. Kisumu · Lakeside"
                      onChange={(e) => engine.setTagLabel(c.scene, e.target.value)}
                      className={fieldClass}
                      aria-label={`${c.name} location`}
                    />
                    {cfg.spots[c.scene] && (
                      <span className="mk-label shrink-0 text-[8px] text-amber" title="This cam's tag has its own spot">
                        PLACED
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </Field>

            <Field label="Place it for">
              <select value={target} onChange={(e) => setTarget(e.target.value)} className={fieldClass} aria-label="Place the tag for">
                <option value="">All panes (default spot)</option>
                {cams.map((c) => (
                  <option key={c.scene} value={c.scene}>
                    {c.name} only{cfg.spots[c.scene] ? " — has its own spot" : ""}
                  </option>
                ))}
              </select>
            </Field>

            {!target && !cfg.at && (
              <div className="flex gap-1" role="group" aria-label="Top edge position">
                {ANCHORS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => engine.setTags({ anchor: a.id })}
                    className={cn("mk-button h-7 flex-1 rounded-[3px] px-1 font-mono text-[9px]", cfg.anchor === a.id && "mk-lit-amber")}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}

            <PlacePicker
              pos={spot}
              size={0.3}
              height={0.09}
              onChange={place}
              label={
                target
                  ? "Tap where this cam's tag sits inside its pane"
                  : cfg.at
                    ? "Tap where the tag sits inside every pane"
                    : "Auto: top edge. Tap to place it by hand instead"
              }
            />
            <button
              type="button"
              disabled={!spot}
              onClick={reset}
              className="mk-button h-7 rounded-[3px] px-2 font-mono text-[9px]"
              title={target ? "Use the default spot for this cam" : "Back to the top edge"}
            >
              {target ? "USE DEFAULT SPOT" : "BACK TO AUTO (TOP EDGE)"}
            </button>

            <Field label="Look">
              <div className="flex flex-wrap gap-1" role="group" aria-label="Tag style">
                {TAG_STYLES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => engine.setTags({ style: s.id })}
                    className={cn("mk-button h-7 min-w-[3rem] rounded-[3px] px-2 font-mono text-[10px]", cfg.style === s.id && "mk-lit-amber")}
                  >
                    {s.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => engine.setTags({ pin: !cfg.pin })}
                  aria-pressed={cfg.pin}
                  className={cn("mk-button h-7 min-w-[3rem] rounded-[3px] px-2 font-mono text-[10px]", cfg.pin && "mk-lit-amber")}
                >
                  DOT
                </button>
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label={`Size ${cfg.size}%`}>
                <input
                  type="range"
                  min={50}
                  max={220}
                  step={5}
                  value={cfg.size}
                  onChange={(e) => engine.setTags({ size: Number(e.target.value) })}
                  aria-label="Tag size"
                />
              </Field>
              <Field label={`Background ${cfg.bgOpacity}%`}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={cfg.bgOpacity}
                  onChange={(e) => engine.setTags({ bgOpacity: Number(e.target.value) })}
                  aria-label="Tag background opacity"
                />
              </Field>
            </div>

            <div className="grid grid-cols-4 items-end gap-2">
              {[
                { key: "accent" as const, label: "Accent" },
                { key: "bg" as const, label: "Back" },
                { key: "textColor" as const, label: "Text" },
              ].map((c) => (
                <Field key={c.key} label={c.label}>
                  <input
                    type="color"
                    value={cfg[c.key]}
                    onChange={(e) => engine.setTags({ [c.key]: e.target.value })}
                    aria-label={`${c.label} colour`}
                    className="h-8 w-full cursor-pointer rounded-sm border border-border bg-input p-0.5"
                  />
                </Field>
              ))}
              <Field label="Font">
                <select value={cfg.font} onChange={(e) => engine.setTags({ font: e.target.value as GfxFont })} className={fieldClass} aria-label="Tag font">
                  {FONT_CHOICES.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Preview (one pane)">
              <div className="relative aspect-video w-full overflow-hidden rounded-[3px] border border-white/15 bg-gradient-to-br from-slate-600 to-slate-900">
                <iframe title="Tag preview" sandbox="" src={tagUrl(previewText, cfg, previewAt)} className="absolute inset-0 h-full w-full border-0" />
              </div>
            </Field>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
