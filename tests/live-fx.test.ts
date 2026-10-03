// End-to-end mock test: the real MK VISION engine + real OBS transport talking to a simulated OBS.
// Every step checks what OBS actually puts on PROGRAM, not just what the controller shows.
import { beforeAll, describe, expect, mock, test } from "bun:test";

import { ObsSim } from "./obs-sim";

const CAMS = ["CAM 1", "CAM 2", "CAM 3", "CAM 4"];
const sim = new ObsSim(CAMS, ["Ad Banner"]);

mock.module("obs-websocket-js", () => ({
  default: function OBSWebSocket() {
    return sim;
  },
  EventSubscription: { All: 1, InputVolumeMeters: 2 },
}));

const store = new Map<string, string>();
(globalThis as any).window = {
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) },
  location: { origin: "http://localhost:8080", href: "http://localhost:8080/" },
  addEventListener() {},
  removeEventListener() {},
};
(globalThis as any).document = { hidden: false, addEventListener() {}, removeEventListener() {} };
store.set(
  "mkvision.config.v1",
  JSON.stringify({
    demoMode: false,
    autoConnect: false,
    host: "sim",
    port: 4455,
    password: "",
    camScenes: CAMS,
    transitionDuration: 250,
    pips: [
      { scene: "CAM 3", corner: "br", size: 0.3 },
      { scene: "CAM 4", corner: "tl", size: 0.2 },
    ],
    ad: { scene: "Ad Banner", layout: "r", size: 0.25, fit: "fit" },
  }),
);

let engine: any;
const settle = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const camOf = (src: string) => src.replace(/ source$/, "");
/** Leaf cam/ad sources really visible on OBS program, with rounded rects. */
const onAir = () =>
  sim.visible().map((p) => ({ src: camOf(p.source), x: Math.round(p.x), y: Math.round(p.y), w: Math.round(p.w), h: Math.round(p.h) }));
const full = (src: string) => onAir().some((p) => p.src === src && p.x === 0 && p.y === 0 && p.w === 1920 && p.h === 1080);
const notices: string[] = [];

beforeAll(async () => {
  ({ engine } = await import("../src/lib/mk/engine"));
  engine.boot();
  engine.subscribe(() => {
    const n = engine.getSnapshot().notice;
    const text = typeof n === "string" ? n : n?.text;
    if (text && notices[notices.length - 1] !== text) notices.push(text);
  });
  await engine.connect();
  await settle(150);
});

describe("MK VISION vs OBS (simulated)", () => {
  test("connects, studio mode on, PGM/PVW mirrored", () => {
    const s = engine.getSnapshot();
    expect(s.status).toBe("connected");
    expect(sim.studio).toBe(true);
    expect(s.programScene).toBe("CAM 1");
    expect(s.previewScene).toBe("CAM 2");
    expect(full("CAM 1")).toBe(true);
  });

  test("preview select + CUT", async () => {
    await engine.selectPreview(2);
    await settle();
    expect(sim.preview).toBe("CAM 3");
    await engine.cut();
    await settle(400);
    expect(sim.program).toBe("CAM 3");
    expect(engine.getSnapshot().programScene).toBe("CAM 3");
    expect(engine.getSnapshot().previewScene).toBe("CAM 1");
  });

  test("AUTO TAKE swaps PGM and PVW", async () => {
    await engine.autoTake();
    await settle(600);
    expect(sim.program).toBe("CAM 1");
    expect(engine.getSnapshot().programScene).toBe("CAM 1");
  });

  test("MERGE: OBS shows PGM left half, PVW right half; closes back to PGM", async () => {
    await engine.selectPreview(1);
    await settle();
    await engine.toggleLayout("merge");
    await settle(100);
    expect(engine.getSnapshot().fx.layout).toBe("merge");
    expect(sim.program).toBe("MK FX");
    const pic = onAir();
    expect(pic).toContainEqual({ src: "CAM 1", x: 0, y: 0, w: 960, h: 1080 });
    expect(pic).toContainEqual({ src: "CAM 2", x: 960, y: 0, w: 960, h: 1080 });
    // change the right half live
    await engine.selectPreview(3);
    await settle(100);
    expect(onAir()).toContainEqual({ src: "CAM 4", x: 960, y: 0, w: 960, h: 1080 });
    expect(onAir().some((p) => p.src === "CAM 2")).toBe(false);
    await engine.toggleLayout("merge");
    await settle(300);
    expect(engine.getSnapshot().fx.layout).toBe(null);
    expect(sim.program).toBe("CAM 1");
    expect(full("CAM 1")).toBe(true);
  });

  test("SQUEEZE ends with PVW on air", async () => {
    await engine.selectPreview(1);
    await settle();
    await engine.squeeze();
    await settle(300);
    expect(sim.program).toBe("CAM 2");
    expect(engine.getSnapshot().programScene).toBe("CAM 2");
    expect(full("CAM 2")).toBe(true);
  });

  test("PIP 1 on: program bus shows CAM 2 full + CAM 3 inset bottom-right", async () => {
    await engine.togglePip(0);
    await settle(150);
    const s = engine.getSnapshot();
    expect(s.live.pip[0]).toBe(true);
    expect(sim.program.startsWith("MK LIVE")).toBe(true);
    expect(full("CAM 2")).toBe(true);
    const inset = onAir().find((p) => p.src === "CAM 3");
    expect(inset).toBeDefined();
    expect(inset!.w).toBe(576);
    expect(inset!.x + inset!.w).toBeGreaterThan(1800);
    expect(inset!.y + inset!.h).toBeGreaterThan(1000);
    // inset is drawn above the main cam
    const order = onAir().map((p) => p.src);
    expect(order.indexOf("CAM 3")).toBeGreaterThan(order.indexOf("CAM 2"));
  });

  test("PIP 2 on too, and both survive a CUT", async () => {
    await engine.togglePip(1);
    await settle(150);
    expect(onAir().some((p) => p.src === "CAM 4" && p.w === 384)).toBe(true);
    await engine.selectPreview(0);
    await settle(150);
    await engine.cut();
    await settle(500);
    expect(engine.getSnapshot().programScene).toBe("CAM 1");
    expect(full("CAM 1")).toBe(true);
    expect(onAir().some((p) => p.src === "CAM 3" && p.w === 576)).toBe(true);
    expect(onAir().some((p) => p.src === "CAM 4" && p.w === 384)).toBe(true);
  });

  test("PIP corner/size changes reach OBS", async () => {
    await engine.setPip(0, { corner: "tl" });
    await settle(600);
    const inset = onAir().find((p) => p.src === "CAM 3")!;
    expect(inset.x).toBeLessThan(100);
    expect(inset.y).toBeLessThan(100);
  });

  test("SQZ MERGE: program squeezes, ad fills the right side", async () => {
    await engine.squeezeMerge();
    await settle(200);
    expect(engine.getSnapshot().live.sqm).toBe(true);
    const pic = onAir();
    const main = pic.find((p) => p.src === "CAM 1")!;
    const ad = pic.find((p) => p.src === "Ad Banner")!;
    expect(main.w).toBe(1440);
    expect(ad).toBeDefined();
    expect(ad.x).toBe(1440);
    expect(ad.w).toBe(480);
    // a take keeps the ad + squeeze
    await engine.selectPreview(1);
    await settle(150);
    await engine.cut();
    await settle(500);
    const after = onAir();
    expect(after.find((p) => p.src === "CAM 2")?.w).toBe(1440);
    expect(after.some((p) => p.src === "Ad Banner" && p.x === 1440)).toBe(true);
    await engine.squeezeMerge();
    await settle(200);
    expect(engine.getSnapshot().live.sqm).toBe(false);
    expect(onAir().some((p) => p.src === "Ad Banner")).toBe(false);
    expect(full("CAM 2")).toBe(true);
  });

  test("all overlays off: OBS returns to the plain cam scene", async () => {
    await engine.togglePip(0);
    await settle(150);
    await engine.togglePip(1);
    await settle(400);
    const s = engine.getSnapshot();
    expect(s.live.on).toBe(false);
    expect(sim.program).toBe("CAM 2");
    expect(full("CAM 2")).toBe(true);
    expect(onAir().length).toBe(1);
  });

  test("no unexpected warnings", () => {
    const bad = notices.filter((n) => /fail|refused|did not|could not|not found/i.test(n));
    expect(bad).toEqual([]);
  });
});
