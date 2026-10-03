import { describe, expect, test } from "bun:test";
const store = new Map<string, string>();
(globalThis as any).window = { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) }, location: { origin: "http://x", href: "http://x/" }, addEventListener() {}, removeEventListener() {} };
(globalThis as any).document = { hidden: false, addEventListener() {}, removeEventListener() {} };

describe("engine: merge + tags + pip together (fake OBS)", () => {
  test("tags sit in their panes, PIP stays on, tags hide off", async () => {
    const { engine } = await import("../src/lib/mk/engine");
    const e = engine as any;
    const frames: any[] = [];
    const tagSets: any[] = [];
    const vis: Record<string, Record<string, boolean>> = { "MK LIVE A": {}, "MK LIVE B": {} };
    const t: any = new Proxy({}, {
      get: (_o, name: string) => {
        if (name === "fxStage") return async () => ({ width: 1920, height: 1080 });
        if (name === "fxFrame") return async (f: any, bus: string) => { frames.push({ f, bus }); for (const [k, v] of Object.entries(f)) vis[bus]![k] = !!v; };
        if (name === "liveRead") return async (bus: string) => ({ ...vis[bus] });
        if (name === "tagSet") return async (slot: number, url: string | null, w: number, h: number) => { tagSets.push({ slot, url, w, h }); };
        if (name === "resync") return async () => {};
        return async () => {};
      },
    });
    e.transport = t;
    e.state = { ...e.state, status: "connected", programScene: "Cam 1", previewScene: "Cam 2", config: { ...e.state.config, camScenes: ["Cam 1", "Cam 2", "Cam 3", "Cam 4", null, null], pips: [{ ...e.state.config.pips[0], scene: "Cam 3" }, e.state.config.pips[1]] } };
    engine.setTagLabel("Cam 1", "Kisumu");
    engine.setTagLabel("Cam 2", "Nairobi");
    engine.setTagLabel("Cam 3", "Mombasa");
    await engine.saveMergePreset(0, "Four", { ...e.state.config.mergePresets[0].merge, layout: "4g", border: 10 });
    await engine.toggleMerge();
    expect(e.state.live.merge).toBe(true);
    await engine.toggleTags();
    expect(e.state.live.tags).toBe(true);
    // 4 panes: Cam 1, Cam 2, then next free cams = Cam 3, Cam 4. Cam 4 has no label -> no tag.
    const last = frames.filter((x) => x.bus === "MK LIVE A").at(-1)!.f;
    const shown = ["MK TAG 1", "MK TAG 2", "MK TAG 3", "MK TAG 4"].map((n) => !!last[n]);
    expect(shown).toEqual([true, true, true, false]);
    // pane 2 (top-right) tag starts at the pane's left edge + half gap, i.e. x = 960 + 5
    expect(last["MK TAG 2"].x).toBeCloseTo(965, 3);
    expect(last["MK TAG 2"].y).toBeCloseTo(0, 3);
    // browser source sized to the visible pane: (960-5) x (540-5): outer edges have no border
    const s2 = tagSets.filter((s) => s.slot === 1 && s.url).at(-1)!;
    expect([s2.w, s2.h]).toEqual([955, 535]);
    // PIP still works on top of merge + tags
    await engine.togglePip(0);
    expect(e.state.live.pip[0]).toBe(true);
    // merge off: tags follow the cam on air (one tag, full picture)
    await engine.toggleMerge();
    expect(e.state.live.merge).toBe(false);
    await new Promise((r) => setTimeout(r, 700));
    const after = frames.filter((x) => x.bus === "MK LIVE A").at(-1)!.f;
    expect(!!after["MK TAG 1"]).toBe(true);
    expect(!!after["MK TAG 2"]).toBe(false);
    // tags off + pip off -> live mode ends
    await engine.toggleTags();
    expect(e.state.live.tags).toBe(false);
  });
});
