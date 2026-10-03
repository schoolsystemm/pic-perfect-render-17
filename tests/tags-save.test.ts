// Location tag settings are saved at once and survive a reload.
import { describe, expect, test } from "bun:test";

const store = new Map<string, string>();
(globalThis as any).window = {
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) },
  location: { origin: "http://localhost:8080", href: "http://localhost:8080/" },
  addEventListener() {},
  removeEventListener() {},
};
(globalThis as any).document = { hidden: false, addEventListener() {}, removeEventListener() {} };

describe("tag settings", () => {
  test("text, placed spot and look persist", async () => {
    const { engine } = await import("../src/lib/mk/engine");
    const { loadConfig } = await import("../src/lib/mk/config");
    engine.setTagLabel("Cam 1", "Kisumu · Lakeside");
    engine.setTagSpot("Cam 1", { x: 0.7, y: 0.1 });
    engine.setTags({ style: "bar", size: 140, anchor: "tr" });
    const re = loadConfig().tags;
    expect(re.labels["Cam 1"]).toBe("Kisumu · Lakeside");
    expect(re.spots["Cam 1"]).toEqual({ x: 0.7, y: 0.1 });
    expect(re.style).toBe("bar");
    expect(re.size).toBe(140);
    expect(re.anchor).toBe("tr");
    engine.setTagLabel("Cam 1", "");
    engine.setTagSpot("Cam 1", null);
    const cleared = loadConfig().tags;
    expect(cleared.labels["Cam 1"]).toBeUndefined();
    expect(cleared.spots["Cam 1"]).toBeUndefined();
  });
});
