import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { VolumeConfig, VolumeSlotConfig, VolumeSlotRule } from "./types.js";

const volumesDir = join(dirname(fileURLToPath(import.meta.url)), "../../data/volumes");

function isTaxonomyRank(raw: string): boolean {
  return ["kingdom", "phylum", "class", "order", "family", "genus", "species"].includes(raw);
}

function parseRule(raw: unknown, volumeId: string, slotId: string): VolumeSlotRule | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.type !== "taxonomy_in") {
    console.warn(`[volumes] ${volumeId}/${slotId}: unknown rule type ${String(o.type)}`);
    return null;
  }
  const rank = String(o.rank ?? "")
    .trim()
    .toLowerCase();
  const minReliableRank = String(o.minReliableRank ?? o.rank ?? "")
    .trim()
    .toLowerCase();
  const names = Array.isArray(o.names)
    ? o.names.map((n) => String(n).trim()).filter(Boolean)
    : [];
  if (!isTaxonomyRank(rank) || !isTaxonomyRank(minReliableRank) || !names.length) {
    console.warn(`[volumes] ${volumeId}/${slotId}: invalid taxonomy_in rule`);
    return null;
  }
  return { type: "taxonomy_in", rank, names, minReliableRank };
}

function parseVolume(raw: unknown, file: string): VolumeConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = String(o.id ?? "").trim();
  if (!id) {
    console.warn(`[volumes] skip ${file}: missing id`);
    return null;
  }
  if (o.enabled === false) return null;
  const titleKey = String(o.titleKey ?? "").trim();
  const ledeKey = String(o.ledeKey ?? "").trim();
  if (!titleKey || !ledeKey) {
    console.warn(`[volumes] skip ${id}: missing titleKey/ledeKey`);
    return null;
  }
  const slotsRaw = Array.isArray(o.slots) ? o.slots : [];
  const slots: VolumeSlotConfig[] = [];
  for (const s of slotsRaw) {
    if (!s || typeof s !== "object") continue;
    const slot = s as Record<string, unknown>;
    const slotId = String(slot.id ?? "").trim();
    const slotTitle = String(slot.titleKey ?? "").trim();
    if (!slotId || !slotTitle) continue;
    const rule = parseRule(slot.rule, id, slotId);
    if (!rule) continue;
    slots.push({ id: slotId, titleKey: slotTitle, rule });
  }
  if (!slots.length) {
    console.warn(`[volumes] skip ${id}: no valid slots`);
    return null;
  }
  return {
    id,
    sort: Number(o.sort ?? 100),
    enabled: true,
    titleKey,
    ledeKey,
    slots,
  };
}

let cached: VolumeConfig[] | null = null;

/** Load all enabled volume configs from data/volumes/*.json (no code branch on volume ids). */
export function loadVolumeConfigs(force = false): VolumeConfig[] {
  if (cached && !force) return cached;
  const out: VolumeConfig[] = [];
  try {
    const files = readdirSync(volumesDir).filter(
      (f) => f.endsWith(".json") && !f.startsWith("_"),
    );
    for (const file of files) {
      try {
        const raw = JSON.parse(readFileSync(join(volumesDir, file), "utf8"));
        const vol = parseVolume(raw, file);
        if (vol) out.push(vol);
      } catch (err) {
        console.warn(`[volumes] bad file ${file}:`, err instanceof Error ? err.message : err);
      }
    }
  } catch (err) {
    console.warn("[volumes] cannot read volumes dir:", err instanceof Error ? err.message : err);
  }
  out.sort((a, b) => (a.sort ?? 100) - (b.sort ?? 100) || a.id.localeCompare(b.id));
  cached = out;
  return out;
}

export function getVolumeConfig(volumeId: string): VolumeConfig | null {
  return loadVolumeConfigs().find((v) => v.id === volumeId) ?? null;
}
