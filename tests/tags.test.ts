// Location tags: settings cleaning, placement, the page drawn for each pane, and that they persist.
import { describe, expect, test } from "bun:test";

import { DEFAULT_TAGS, TAG_SCENES, TAG_SLOTS, cleanTags, tagSpot, tagUrl } from "../src/lib/mk/tags";

const html = (url: string) => decodeURIComponent(url.replace("data:text/html;charset=utf-8,", ""));

describe("location tags", () => {
  test("six tag slots, one per possible pane", () => {
    expect(TAG_SLOTS).toBe(6);
    expect(new Set(TAG_SCENES).size).toBe(6);
  });

  test("cleanTags repairs junk and keeps good settings", () => {
    const c = cleanTags({
      labels: { "Cam 1": "Kisumu", "": "x", "Cam 2": 5 },
      spots: { "Cam 1": { x: 2, y: -1 }, "Cam 2": "no" },
      at: { x: 0.5, y: 0.25 },
      anchor: "zz",
      size: 9999,
      style: "nope",
      accent: "red",
      font: "comic",
      pin: false,
    });
    expect(c.labels).toEqual({ "Cam 1": "Kisumu" });
    expect(c.spots).toEqual({ "Cam 1": { x: 1, y: 0 } });
    expect(c.at).toEqual({ x: 0.5, y: 0.25 });
    expect(c.anchor).toBe(DEFAULT_TAGS.anchor);
    expect(c.size).toBe(250);
    expect(c.style).toBe(DEFAULT_TAGS.style);
    expect(c.accent).toBe(DEFAULT_TAGS.accent);
    expect(c.font).toBe(DEFAULT_TAGS.font);
    expect(c.pin).toBe(false);
  });

  test("a cam's own spot wins over the default spot", () => {
    const cfg = cleanTags({ at: { x: 0.1, y: 0.1 }, spots: { A: { x: 0.9, y: 0.9 } } });
    expect(tagSpot(cfg, "A")).toEqual({ x: 0.9, y: 0.9 });
    expect(tagSpot(cfg, "B")).toEqual({ x: 0.1, y: 0.1 });
    expect(tagSpot(cleanTags({}), "B")).toBeNull();
  });

  test("the page shows the text (escaped), sits at the top by default, and obeys a hand-placed spot", () => {
    const top = html(tagUrl("Kisumu <b>Lake</b>", DEFAULT_TAGS, null));
    expect(top).toContain("Kisumu &lt;b&gt;Lake&lt;/b&gt;");
    expect(top).toContain("top:3vh");
    const placed = html(tagUrl("Nairobi", DEFAULT_TAGS, { x: 0.5, y: 1 }));
    expect(placed).toContain("left:50.000%");
    expect(placed).toContain("top:100.000%");
  });

  test("an empty text draws nothing", () => {
    expect(html(tagUrl("   ", DEFAULT_TAGS, null))).not.toContain('class="t"');
  });
});
