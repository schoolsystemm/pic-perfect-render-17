import { LiveFxSettings } from "@/components/mk/live-fx-settings";
import { MergeEditor } from "@/components/mk/merge-editor";
import { SqueezeMergeEditor } from "@/components/mk/squeeze-merge-editor";
import { TagsSettings } from "@/components/mk/tags-editor";
import { useSwitcher } from "@/lib/mk/use-switcher";

/**
 * Graphics Studio → "Live FX & Tags": everything you set up once for Merge, Squeeze Merge, PIP / DSK and the
 * location tags. The switcher keeps only the buttons that take them on and off.
 */
export function LiveSetup() {
  const state = useSwitcher();
  const { config, live, fx } = state;
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-3">
      <TagsSettings />

      <section className="mk-panel rounded-md p-3 sm:p-4" aria-label="Merge and Squeeze Merge looks">
        <h2 className="mk-label mb-1 text-foreground">Merge · Squeeze Merge looks</h2>
        <p className="mb-3 font-mono text-[10px] text-muted-foreground">
          MERGE (split screen, 2 to 6 panes with borders) and SQZ MERGE (squeeze the picture and slide the advertisement in). Pick the
          layout, borders, cams and motion, then SAVE. The switcher only has the MERGE / SQZ MERGE buttons.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="mk-panel grid gap-1 rounded-md p-2">
            <span className="mk-label text-[9px]">Merge — now using “{config.mergePresets[config.mergeActive]?.name ?? "—"}”</span>
            <div className="[&_button]:h-9 [&_button]:text-[11px]">
              <MergeEditor presets={config.mergePresets} active={config.mergeActive} merging={live.merge} busy={fx.running} />
            </div>
          </div>
          <div className="mk-panel grid gap-1 rounded-md p-2">
            <span className="mk-label text-[9px]">Squeeze Merge — now using “{config.adPresets[config.adActive]?.name ?? "—"}”</span>
            <div className="[&_button]:h-9 [&_button]:text-[11px]">
              <SqueezeMergeEditor presets={config.adPresets} adActive={config.adActive} sqmOn={live.sqm} busy={fx.running} />
            </div>
          </div>
        </div>
      </section>

      <LiveFxSettings />
    </div>
  );
}
