// My packages: editable, saved sets of coordinated graphics for the Graphics Rundown.
//
// The built-in packages (GRAPHIC_PACKAGES) are fixed in code. Anything the operator makes, duplicates or
// imports lives here, in this browser, and can be edited, renamed, exported and deleted.
import { useSyncExternalStore } from "react";

import {
  GRAPHIC_PACKAGES,
  TRANSITIONS,
  getTemplate,
  uid,
  type GraphicPackage,
  type PackageItemSpec,
  type Transition,
} from "./gfx-rundown";
import { GFX_THEMES } from "./gfx-themes";

const KEY = "mkvision.gfx.packages.v1";
const MAX_PACKS = 40;
const MAX_ITEMS = 40;

export interface CustomPackage extends GraphicPackage {
  custom: true;
  updated: number;
}

interface PackFile {
  app: "mkvision-packages";
  v: 1;
  packages: GraphicPackage[];
}

// ------------------------------------------------------------------ sanitize (imports are untrusted)

const text = (v: unknown, fallback: string, max: number) =>
  typeof v === "string" ? v.slice(0, max) : fallback;

function cleanSpec(raw: unknown): PackageItemSpec | null {
  const r = (raw && typeof raw === "object" ? raw : null) as Record<string, unknown> | null;
  if (!r || typeof r["templateId"] !== "string") return null;
  const t = getTemplate(r["templateId"]);
  if (!t) return null;
  const data: Record<string, string> = {};
  if (r["data"] && typeof r["data"] === "object") {
    for (const f of t.fields) {
      const v = (r["data"] as Record<string, unknown>)[f.key];
      if (v !== undefined && v !== null) data[f.key] = String(v).slice(0, 1200);
    }
  }
  const spec: PackageItemSpec = {
    templateId: t.id,
    name: text(r["name"], t.name, 80) || t.name,
    data,
  };
  if (TRANSITIONS.some((x) => x.id === r["transition"])) {
    spec.transition = r["transition"] as Transition;
  }
  const ms = Number(r["animMs"]);
  if (Number.isFinite(ms)) spec.animMs = Math.max(100, Math.min(3000, ms));
  const dur = Number(r["durationSec"]);
  if (Number.isFinite(dur)) spec.durationSec = Math.max(0, Math.min(86400, dur));
  return spec;
}

export function cleanPackage(raw: unknown, keepId = true): CustomPackage | null {
  const r = (raw && typeof raw === "object" ? raw : null) as Record<string, unknown> | null;
  if (!r || !Array.isArray(r["items"])) return null;
  const items = (r["items"] as unknown[])
    .slice(0, MAX_ITEMS)
    .map(cleanSpec)
    .filter((i): i is PackageItemSpec => !!i);
  const name = text(r["name"], "", 60).trim() || "Untitled package";
  return {
    custom: true,
    id: keepId && typeof r["id"] === "string" && r["id"] ? r["id"].slice(0, 40) : `my-${uid()}`,
    name,
    shortName: text(r["shortName"], name.slice(0, 12).toUpperCase(), 16),
    description: text(r["description"], "", 240),
    themeId: GFX_THEMES.some((t) => t.id === r["themeId"]) ? (r["themeId"] as string) : GFX_THEMES[0]!.id,
    items,
    updated: Number(r["updated"]) || Date.now(),
  };
}

// ------------------------------------------------------------------ store

class PackageStore {
  private items: CustomPackage[] = [];
  private loaded = false;
  private listeners = new Set<() => void>();

  private load() {
    if (this.loaded || typeof window === "undefined") return;
    this.loaded = true;
    try {
      const raw = window.localStorage.getItem(KEY);
      const list = raw ? (JSON.parse(raw) as unknown) : [];
      this.items = (Array.isArray(list) ? list : [])
        .map((p) => cleanPackage(p))
        .filter((p): p is CustomPackage => !!p);
    } catch {
      this.items = [];
    }
  }

  private persist() {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(this.items));
    } catch {
      /* storage full — keep running in memory */
    }
    this.listeners.forEach((l) => l());
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  getSnapshot = (): CustomPackage[] => {
    this.load();
    return this.items;
  };

  get(id: string): CustomPackage | undefined {
    this.load();
    return this.items.find((p) => p.id === id);
  }

  /** Create a new package, or overwrite the one with the same id. */
  save(pack: GraphicPackage): CustomPackage {
    this.load();
    const clean = cleanPackage({ ...pack, updated: Date.now() })!;
    const exists = this.items.some((p) => p.id === clean.id);
    this.items = exists
      ? this.items.map((p) => (p.id === clean.id ? clean : p))
      : [clean, ...this.items].slice(0, MAX_PACKS);
    this.persist();
    return clean;
  }

  /** Copy any package (built-in or custom) into My packages under a new id. */
  duplicate(pack: GraphicPackage, name?: string): CustomPackage {
    return this.save({
      ...structuredClone(pack),
      id: `my-${uid()}`,
      name: name ?? (pack.id.startsWith("my-") ? `${pack.name} copy` : `${pack.name} (mine)`),
    });
  }

  remove(id: string) {
    this.load();
    this.items = this.items.filter((p) => p.id !== id);
    this.persist();
  }

  exportJson(list: GraphicPackage[]): string {
    const file: PackFile = {
      app: "mkvision-packages",
      v: 1,
      packages: list.map((p) => ({
        id: p.id,
        name: p.name,
        shortName: p.shortName,
        description: p.description,
        themeId: p.themeId,
        items: p.items,
      })),
    };
    return JSON.stringify(file, null, 2);
  }

  /** Add the packages in an exported file. Imported packages always get fresh ids. */
  importJson(raw: string): CustomPackage[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("That is not a MK VISION package file");
    }
    const file = parsed as Partial<PackFile>;
    if (!file || file.app !== "mkvision-packages" || !Array.isArray(file.packages)) {
      throw new Error("That is not a MK VISION package file");
    }
    const made = file.packages
      .slice(0, 20)
      .map((p) => cleanPackage(p, false))
      .filter((p): p is CustomPackage => !!p && p.items.length > 0);
    if (!made.length) throw new Error("No packages found in that file");
    return made.map((p) => this.save(p));
  }
}

export const packageStore = new PackageStore();

const EMPTY: CustomPackage[] = [];

export function useMyPackages(): CustomPackage[] {
  return useSyncExternalStore(packageStore.subscribe, packageStore.getSnapshot, () => EMPTY);
}

export const isBuiltIn = (id: string) => GRAPHIC_PACKAGES.some((p) => p.id === id);
