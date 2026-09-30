import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { SoundPad } from "@/components/mk/sound-pad";

export const Route = createFileRoute("/sounds")({
  head: () => ({ meta: [{ title: "Sounds — MK VISION" }] }),
  component: SoundsPage,
});

function SoundsPage() {
  return (
    <div className="mk-chassis min-h-[100dvh] pb-10">
      <header className="mk-chassis flex items-center gap-3 border-b border-border px-3 py-2">
        <Link to="/" className="mk-button flex h-9 items-center gap-2 rounded-sm px-3 text-xs" aria-label="Back to switcher">
          <ArrowLeft className="h-4 w-4" /> Switcher
        </Link>
        <h1 className="text-base tracking-[0.2em] text-foreground">SOUNDS</h1>
        <span className="mk-label ml-auto text-[9px]">By Konchella</span>
      </header>
      <div className="mx-auto grid max-w-3xl gap-3 p-3">
        <SoundPad manage />
        <p className="font-mono text-[10px] text-muted-foreground">
          Files are stored in this browser only — nothing is uploaded anywhere. CUE plays through this device’s
          speaker or headphones and never reaches OBS. AIR adds a small “MK Audio” source to the scene that is on
          air, plays the clip through OBS’s mixer, then removes it. If you take to another scene mid-clip, the clip
          stops with that scene.
        </p>
      </div>
    </div>
  );
}
