import { useMemo } from "react";

import { GFX_LAYERS, layerUrl } from "@/lib/mk/graphics";
import type { GfxId, GraphicsConfig } from "@/lib/mk/types";

/**
 * Demo Mode has no real OBS output, so the layers are drawn over the fake video.
 * They are the exact same HTML OBS would render, so what you design is what you see.
 */
export function DemoGraphics({ g, active }: { g: GraphicsConfig; active: Record<GfxId, boolean> }) {
  return (
    <>
      {GFX_LAYERS.map((l) => (active[l.id] ? <Layer key={l.id} id={l.id} g={g} /> : null))}
    </>
  );
}

function Layer({ id, g }: { id: GfxId; g: GraphicsConfig }) {
  // Only rebuild the layer when ITS settings change.
  const part = JSON.stringify(g[id]);
  const url = useMemo(() => layerUrl(id, g), [id, part]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <iframe
      title={`${id} on air`}
      src={url}
      sandbox="allow-scripts"
      className="pointer-events-none absolute inset-0 h-full w-full border-0 bg-transparent"
    />
  );
}
