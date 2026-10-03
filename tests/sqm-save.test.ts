// Squeeze Merge presets: SAVE / SAVE AS NEW persist to storage and survive a reload.
import { describe, expect, test } from "bun:test";

const store = new Map<string, string>();
(globalThis as any).window = {
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) },
  location: { origin: "http://localhost:8080", href: "http://localhost:8080/" },
  addEventListener() {},
  removeEventListener() {},
};
(globalThis as any).document = { hidden: false, addEventListener() {}, removeEventListener() {} };

describe("squeeze merge presets", () => {
  test("save + save-as-new persist and reload", async () => {
    const { engine } = await import("../src/lib/mk/engine");
    const { loadConfig } = await import("../src/lib/mk/config");
    const cfg = engine.getSnapshot().config;
    await engine.saveAdPreset(0, "Sponsor A", { ...cfg.ad, look: "strip", layout: "l", size: 0.35, style: "pop" });
    let re = loadConfig();
    expect(re.adPresets[0]!.name).toBe("Sponsor A");
    expect(re.ad.look).toBe("strip");
    expect(re.ad.size).toBe(0.35);

    await engine.saveAdPresetAs("Sponsor B", { ...re.ad, look: "frame", anchor: "bl", size: 0.2 });
    re = loadConfig();
    expect(re.adPresets.map((p) => p.name)).toEqual(["Sponsor A", "Sponsor B"]);
    expect(re.adActive).toBe(1);
    expect(re.ad.anchor).toBe("bl");
    expect(re.adPresets[0]!.ad.look).toBe("strip");
  });
});
