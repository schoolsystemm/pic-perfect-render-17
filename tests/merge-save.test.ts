// Merge presets: SAVE / SAVE AS NEW persist to storage and survive a reload.
import { describe, expect, test } from "bun:test";

const store = new Map<string, string>();
(globalThis as any).window = {
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) },
  location: { origin: "http://localhost:8080", href: "http://localhost:8080/" },
  addEventListener() {},
  removeEventListener() {},
};
(globalThis as any).document = { hidden: false, addEventListener() {}, removeEventListener() {} };

describe("merge presets", () => {
  test("save + save-as-new persist and reload", async () => {
    const { engine } = await import("../src/lib/mk/engine");
    const { loadConfig } = await import("../src/lib/mk/config");
    const base = engine.getSnapshot().config.mergePresets[0]!.merge;
    await engine.saveMergePreset(0, "Four up", { ...base, layout: "4g", border: 10, color: "#ffffff" });
    let re = loadConfig();
    expect(re.mergePresets[0]!.name).toBe("Four up");
    expect(re.mergePresets[0]!.merge.layout).toBe("4g");
    expect(re.mergePresets[0]!.merge.border).toBe(10);

    await engine.saveMergePresetAs("Six up", { ...re.mergePresets[0]!.merge, layout: "6g", outer: true });
    re = loadConfig();
    expect(re.mergePresets.map((p) => p.name)).toEqual(["Four up", "Six up"]);
    expect(re.mergeActive).toBe(1);
    expect(re.mergePresets[1]!.merge.layout).toBe("6g");
    expect(re.mergePresets[0]!.merge.layout).toBe("4g");
  });
});
