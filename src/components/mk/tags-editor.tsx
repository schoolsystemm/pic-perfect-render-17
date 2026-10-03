import { useMemo, useState } from "react";

import { PlacePicker } from "@/components/mk/place-picker";
import { TAG_STYLES, placeText, tagSpot, tagUrl, type TagAnchor } from "@/lib/mk/tags";
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
/** One tap to start a saved location with a symbol (flags show as country letters on some Windows setups). */
const EMOJI_QUICK = ["📍", "🇰🇪", "🇺🇬", "🇹🇿", "🌍", "🏟️", "🏫", "🏠"];
const CUSTOM = "__custom__";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <span className="mk-label text-[9px]">{label}</span>
      {children}
    </div>
  );
}

/**
 * Location tags settings (Graphics Studio → Live FX & Tags). The switcher only has the on / off button; every
 * choice lives here and saves as you change it.
 */
export function TagsSettings() {
  const state = useSwitcher();
  const cfg = state.config.tags;
  /** "" = the default spot for every pane, otherwise one cam's scene. */
  const [target, setTarget] = useState("");
  const [custom, setCustom] = useState<Record<string, boolean>>({});
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("📍");

  const cams = useMemo(
    () =>
      state.config.camScenes
        .map((scene, i) => (scene ? { scene, name: camLabel(i as CamIndex) } : null))
        .filter((c): c is { scene: string; name: string } => !!c),
    [state.config.camScenes],
  );

  const spot = target ? (cfg.spots[target] ?? null) : cfg.at;
  const previewScene = target || cams.find((c) => cfg.labels[c.scene])?.scene || "";
  const previewText = (previewScene && cfg.labels[previewScene]) || "📍 Kisumu";
  const previewAt = previewScene ? tagSpot(cfg, previewScene) : cfg.at;

  const place = (pos: { x: number; y: number }) => (target ? engine.setTagSpot(target, pos) : engine.setTags({ at: pos }));
  const reset = () => (target ? engine.setTagSpot(target, null) : engine.setTags({ at: null }));

  /** Which option of a cam's drop-down is selected: a saved location, "no tag", or typed text. */
  const choice = (scene: string) => {
    const text = cfg.labels[scene] ?? "";
    if (custom[scene]) return CUSTOM;
    if (!text) return "";
    const i = cfg.places.findIndex((p) => placeText(p) === text);
    return i >= 0 ? String(i) : CUSTOM;
  };
  const pick = (scene: string, value: string) => {
    if (value === CUSTOM) {
      setCustom((c) => ({ ...c, [scene]: true }));
      return;
    }
    setCustom((c) => ({ ...c, [scene]: false }));
    const p = cfg.places[Number(value)];
    engine.setTagLabel(scene, value === "" || !p ? "" : placeText(p));
  };
  const addPlace = () => {
    if (!newName.trim()) return;
    engine.addTagPlace(newName, newEmoji);
    setNewName("");
  };

  return (
    <section className="mk-panel rounded-md p-3 sm:p-4" aria-label="Location tags">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="mk-label text-foreground">Location tags</h2>
        <button
          type="button"
          disabled={state.fx.running}
          onClick={() => void engine.toggleTags()}
          aria-pressed={state.live.tags}
          className={cn("mk-button ml-auto h-7 rounded-[3px] px-3 text-[10px]", state.live.tags && "mk-lit-program")}
        >
          {state.live.tags ? "TAGS ON AIR — take off" : "TAKE TAGS TO AIR"}
        </button>
      </div>
      <p className="mb-3 font-mono text-[10px] text-muted-foreground">
        Save your locations once, then pick one for each cam. With MERGE on, every pane shows the tag of the cam inside it, at the
        top of that pane (or where you place it). On the switcher you only press the Location Tags button.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid content-start gap-3">
          <Field label="1 · Saved locations">
            <div className="flex flex-wrap gap-1">
              {cfg.places.length === 0 && <span className="font-mono text-[10px] opacity-70">None yet — add your first below.</span>}
              {cfg.places.map((p, i) => (
                <span key={i} className="mk-button flex h-7 items-center gap-1 rounded-[3px] pl-2 pr-1 font-mono text-[10px]">
                  {placeText(p)}
                  <button
                    type="button"
                    onClick={() => engine.removeTagPlace(i)}
                    aria-label={`Remove ${p.name}`}
                    title="Remove this saved location"
                    className="grid h-5 w-5 place-items-center rounded-[2px] text-[11px] opacity-70 hover:opacity-100"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Symbol">
              {EMOJI_QUICK.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setNewEmoji(e)}
                  aria-pressed={newEmoji === e}
                  className={cn("mk-button h-7 w-8 rounded-[3px] px-0 text-sm", newEmoji === e && "mk-lit-amber")}
                >
                  {e}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <input
                value={newEmoji}
                maxLength={8}
                onChange={(e) => setNewEmoji(e.target.value)}
                aria-label="Flag or emoji"
                title="Any flag or emoji — paste your own"
                className={cn(fieldClass, "w-14 shrink-0 text-center")}
              />
              <input
                value={newName}
                maxLength={50}
                placeholder="Location name, e.g. Kisumu"
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addPlace()}
                aria-label="New location name"
                className={fieldClass}
              />
              <button type="button" disabled={!newName.trim()} onClick={addPlace} className="mk-button h-8 shrink-0 rounded-[3px] px-3 text-[10px]">
                ADD
              </button>
            </div>
          </Field>

          <Field label="2 · Location for each cam">
            <div className="grid gap-1">
              {cams.length === 0 && <span className="font-mono text-[10px] opacity-70">Map your cams to OBS scenes in Settings first.</span>}
              {cams.map((c) => {
                const sel = choice(c.scene);
                return (
                  <div key={c.scene} className="grid gap-1">
                    <label className="flex items-center gap-1">
                      <span className="mk-label w-10 shrink-0 text-center text-[9px]" title={c.scene}>
                        {c.name}
                      </span>
                      <select value={sel} onChange={(e) => pick(c.scene, e.target.value)} className={fieldClass} aria-label={`${c.name} location`}>
                        <option value="">No tag</option>
                        {cfg.places.map((p, i) => (
                          <option key={i} value={i}>
                            {placeText(p)}
                          </option>
                        ))}
                        <option value={CUSTOM}>Type my own…</option>
                      </select>
                      {cfg.spots[c.scene] && (
                        <span className="mk-label shrink-0 text-[8px] text-amber" title="This cam's tag has its own spot">
                          PLACED
                        </span>
                      )}
                    </label>
                    {sel === CUSTOM && (
                      <input
                        value={cfg.labels[c.scene] ?? ""}
                        maxLength={60}
                        placeholder="Type the location"
                        onChange={(e) => engine.setTagLabel(c.scene, e.target.value)}
                        aria-label={`${c.name} custom location`}
                        className={cn(fieldClass, "ml-11 w-[calc(100%-2.75rem)]")}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </Field>
        </div>

        <div className="grid content-start gap-3">
          <Field label="3 · Where it sits">
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

          <Field label="4 · Look">
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
              <input type="range" min={50} max={220} step={5} value={cfg.size} onChange={(e) => engine.setTags({ size: Number(e.target.value) })} aria-label="Tag size" />
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

          <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-4">
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
      </div>
    </section>
  );
}
