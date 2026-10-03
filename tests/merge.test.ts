// Split-screen Merge: geometry (2..6 panes, borders, cover-crop) and saved presets.
import { describe, expect, test } from "bun:test";

import { DEFAULT_MERGE, MERGE_LAYOUTS, cleanMerge, mergeRects, resolvePaneScenes } from "../src/lib/mk/merge";

const W = 1920;
const H = 1080;

describe("merge layouts", () => {
  test("every layout has 2..6 panes that tile the picture", () => {
    for (const l of MERGE_LAYOUTS) {
      expect(l.panes).toBeGreaterThanOrEqual(2);
      expect(l.panes).toBeLessThanOrEqual(6);
      expect(l.cells.length).toBe(l.panes);
      const area = l.cells.reduce((a, c) => a + c.w * c.h, 0);
      expect(Math.abs(area - 1)).toBeLessThan(1e-9);
    }
    for (let n = 2; n <= 6; n++) expect(MERGE_LAYOUTS.some((l) => l.panes === n)).toBe(true);
  });

  test("no border: panes touch and fill the screen; the picture is cropped, not squashed", () => {
    const { panes } = mergeRects({ ...DEFAULT_MERGE, layout: "2c", border: 0 }, W, H);
    const [a, b] = panes;
    expect(a!.x).toBe(0);
    expect(b!.x).toBeCloseTo(W / 2, 5);
    expect(a!.sx).toBeCloseTo(a!.sy, 9); // uniform scale = never squashed
    expect(a!.cl).toBeCloseTo(a!.cr, 9);
    // shown width = (W - crops) * scale = half the screen
    expect((W - a!.cl - a!.cr) * a!.sx).toBeCloseTo(W / 2, 3);
    expect((H - a!.ct - a!.cb) * a!.sy).toBeCloseTo(H, 3);
  });

  test("border leaves a gap between panes (and round the outside when asked)", () => {
    const between = mergeRects({ ...DEFAULT_MERGE, layout: "2c", border: 10, outer: false }, W, H).panes;
    const gap = between[1]!.x - (between[0]!.x + (W - between[0]!.cl - between[0]!.cr) * between[0]!.sx);
    expect(gap).toBeCloseTo(10, 3);
    expect(between[0]!.x).toBe(0);

    const round = mergeRects({ ...DEFAULT_MERGE, layout: "2c", border: 10, outer: true }, W, H).panes;
    expect(round[0]!.x).toBeCloseTo(10, 5);
    expect(round[0]!.y).toBeCloseTo(10, 5);
  });

  test("hidden at t = 0, in place at t = 1", () => {
    const off = mergeRects(DEFAULT_MERGE, W, H, 0);
    expect(off.bg).toBeNull();
    expect(off.panes.every((p) => p === null)).toBe(true);
    const on = mergeRects(DEFAULT_MERGE, W, H, 1);
    expect(on.bg).not.toBeNull();
    expect(on.panes.every((p) => p !== null)).toBe(true);
  });

  test("auto panes: PGM, PVW, then the next free cams", () => {
    const cams = ["A", "B", "C", "D"];
    expect(resolvePaneScenes({ ...DEFAULT_MERGE, layout: "4g" }, cams, "C", "A")).toEqual(["C", "A", "B", "D"]);
    // a pane picked by hand keeps its cam and is not used twice
    expect(resolvePaneScenes({ ...DEFAULT_MERGE, layout: "3c", scenes: ["D", null, null, null, null, null] }, cams, "C", "A")).toEqual(["D", "A", "B"]);
  });

  test("cleanMerge repairs junk", () => {
    const c = cleanMerge({ layout: "nope", border: 9999, color: "red", style: "x", scenes: [1, "Cam 1"] });
    expect(c.layout).toBe(DEFAULT_MERGE.layout);
    expect(c.border).toBe(60);
    expect(c.color).toBe(DEFAULT_MERGE.color);
    expect(c.scenes[0]).toBeNull();
    expect(c.scenes[1]).toBe("Cam 1");
  });
});
