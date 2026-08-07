import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { binomialKey, normalizeSciName } from "./normalize.js";

export type IntroducedIndexFile = {
  generatedAt?: string;
  sources?: Record<string, { type?: string; datasetKey?: string; count?: number }>;
  byCountry: Record<string, string[]>;
};

const dataRoot = join(dirname(fileURLToPath(import.meta.url)), "../../data");

function loadJson<T>(name: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(join(dataRoot, name), "utf8")) as T;
  } catch {
    return fallback;
  }
}

/** country → Set of normalized lookup keys (full + binomial). */
function buildLookup(byCountry: Record<string, string[]>): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const [cc, names] of Object.entries(byCountry)) {
    const set = new Set<string>();
    for (const raw of names) {
      const full = normalizeSciName(raw);
      const bin = binomialKey(raw);
      if (full) set.add(full);
      if (bin) set.add(bin);
    }
    map.set(cc.toUpperCase(), set);
  }
  return map;
}

const indexFile = loadJson<IntroducedIndexFile>("introduced-index.json", { byCountry: {} });
/** Hand-curated overlay (gaps / product must-alert). Merged on top of public index. */
const seedFile = loadJson<Record<string, string[]>>("introduced-seed.json", {});

function mergeCountries(
  base: Record<string, string[]>,
  overlay: Record<string, unknown>,
): Record<string, string[]> {
  const out: Record<string, string[]> = { ...base };
  for (const [cc, names] of Object.entries(overlay)) {
    if (!/^[A-Za-z]{2}$/.test(cc)) continue; // skip _comment etc.
    if (!Array.isArray(names)) continue;
    const key = cc.toUpperCase();
    const prev = out[key] ?? out[cc] ?? [];
    out[key] = [...prev, ...(names as string[])];
  }
  return out;
}

const merged = mergeCountries(indexFile.byCountry ?? {}, seedFile);
export const introducedLookup = buildLookup(merged);

export function introducedIndexMeta() {
  return {
    generatedAt: indexFile.generatedAt ?? null,
    sources: indexFile.sources ?? {},
    countries: [...introducedLookup.keys()],
    sizes: Object.fromEntries([...introducedLookup.entries()].map(([k, v]) => [k, v.size])),
  };
}
