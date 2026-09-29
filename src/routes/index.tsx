import { createFileRoute } from "@tanstack/react-router";

import { SourceBus } from "@/components/mk/source-bus";
import { StatusBar } from "@/components/mk/status-bar";
import { TransitionPanel } from "@/components/mk/transition-panel";
import { engine, useSwitcher } from "@/lib/mk/use-switcher";
import { useShortcuts } from "@/lib/mk/use-shortcuts";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MK VISION — Professional Live Production Control" },
      {
        name: "description",
        content:
          "MK VISION is a professional virtual broadcast switcher for OBS Studio: Program, Preview, Cut, Auto Take, T-Bar and DSK on desktop, tablet and phone.",
      },
      { property: "og:title", content: "MK VISION — Professional Live Production Control" },
      {
        property: "og:description",
        content:
          "Control OBS Studio like a compact television vision mixer. Program/Preview buses, CUT, AUTO TAKE, T-BAR and DSK.",
      },
    ],
  }),
  component: Switcher,
});

function Switcher() {
  const state = useSwitcher();
  useShortcuts(state.config.shortcuts);

  return (
    <div className="mk-chassis flex h-[100dvh] flex-col overflow-hidden">
      <StatusBar status={state.status} statusMessage={state.statusMessage} demo={state.demo} />

      <main className="flex min-h-0 flex-1 flex-col gap-2 p-2 sm:flex-row sm:gap-3 sm:p-3">
        <div className="flex min-h-0 flex-1 flex-col gap-2 sm:gap-3">
          <SourceBus
            kind="program"
            active={state.program}
            camScenes={state.config.camScenes}
            onSelect={(cam) => void engine.selectProgram(cam)}
          />
          <SourceBus
            kind="preview"
            active={state.preview}
            camScenes={state.config.camScenes}
            onSelect={(cam) => void engine.selectPreview(cam)}
          />
        </div>

        <TransitionPanel
          dskActive={state.dskActive}
          tBar={state.tBar}
          transitionName={state.config.transition}
          duration={state.config.transitionDuration}
          onDsk={() => void engine.toggleDSK()}
          onAutoTake={() => void engine.autoTake()}
          onCut={() => void engine.cut()}
          onTBarChange={(value) => engine.setTBar(value)}
          onTBarRelease={(value) => engine.setTBar(value, true)}
        />
      </main>
    </div>
  );
}
