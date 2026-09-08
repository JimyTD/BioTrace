import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type BreedPrevalence = "common" | "uncommon" | "rare";

export type BreedDef = {
  id: string;
  zh: string;
  en?: string;
  aliases?: string[];
  prevalence: BreedPrevalence;
};

export type BreedCatalog = {
  id: string;
  taxonKey: string;
  commonNameZh: string;
  breeds: BreedDef[];
};

const PREVALENCE = new Set<BreedPrevalence>(["common", "uncommon", "rare"]);

const breedsDir = join(dirname(fileURLToPath(import.meta.url)), "../../data/breeds");

/** 宠物卡俗名：折叠键仍是野生父种，卡上不能写「狼」。 */
const PET_COMMON_ZH: Record<string, string> = {
  "canis lupus": "家犬",
  "felis catus": "家猫",
  "gallus gallus": "家鸡",
  "equus caballus": "家马",
};

function normKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

function normName(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "");
}

function parseCatalog(raw: unknown, file: string): BreedCatalog | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = String(o.id ?? "").trim();
  const taxonKey = String(o.taxonKey ?? "").trim();
  const commonNameZh = String(o.commonNameZh ?? "").trim();
  if (!id || !taxonKey || !commonNameZh) {
    console.warn(`[breeds] skip ${file}: missing id/taxonKey/commonNameZh`);
    return null;
  }
  const breedsRaw = Array.isArray(o.breeds) ? o.breeds : [];
  const breeds: BreedDef[] = [];
  const seen = new Set<string>();
  for (const item of breedsRaw) {
    if (!item || typeof item !== "object") continue;
    const b = item as Record<string, unknown>;
    const breedId = String(b.id ?? "").trim();
    const zh = String(b.zh ?? "").trim();
    const prevalence = String(b.prevalence ?? "").trim() as BreedPrevalence;
    if (!breedId || !zh || !PREVALENCE.has(prevalence)) continue;
    if (seen.has(breedId)) continue;
    seen.add(breedId);
    const aliases = Array.isArray(b.aliases)
      ? b.aliases.map((a) => String(a).trim()).filter(Boolean)
      : undefined;
    const en = String(b.en ?? "").trim() || undefined;
    breeds.push({ id: breedId, zh, en, aliases, prevalence });
  }
  return { id, taxonKey, commonNameZh, breeds };
}

let cached: BreedCatalog[] | null = null;
let byTaxon: Map<string, BreedCatalog> | null = null;

export function loadBreedCatalogs(force = false): BreedCatalog[] {
  if (cached && !force) return cached;
  const files = readdirSync(breedsDir).filter((f) => f.endsWith(".json"));
  const list: BreedCatalog[] = [];
  for (const file of files) {
    try {
      const parsed = parseCatalog(JSON.parse(readFileSync(join(breedsDir, file), "utf8")), file);
      if (parsed) list.push(parsed);
    } catch (err) {
      console.warn(`[breeds] skip ${file}:`, err);
    }
  }
  cached = list;
  byTaxon = new Map(list.map((c) => [normKey(c.taxonKey), c]));
  return list;
}

export function catalogForTaxon(taxonKey: string | null | undefined): BreedCatalog | null {
  if (!taxonKey?.trim()) return null;
  loadBreedCatalogs();
  return byTaxon?.get(normKey(taxonKey)) ?? null;
}

export function petDisplayCommonName(
  taxonKey: string | null | undefined,
  fallback: string | null | undefined,
): string | null {
  if (taxonKey?.trim()) {
    const mapped = PET_COMMON_ZH[normKey(taxonKey)];
    if (mapped) return mapped;
    const catalog = catalogForTaxon(taxonKey);
    if (catalog?.commonNameZh) return catalog.commonNameZh;
  }
  return fallback?.trim() || null;
}

export function matchBreed(
  taxonKey: string | null | undefined,
  breedZh: string | null | undefined,
): BreedDef | null {
  const needle = breedZh?.trim();
  if (!needle) return null;
  const catalog = catalogForTaxon(taxonKey);
  if (!catalog) return null;
  const n = normName(needle);
  for (const breed of catalog.breeds) {
    if (normName(breed.zh) === n) return breed;
    if (breed.en && normName(breed.en) === n) return breed;
    if (breed.aliases?.some((a) => normName(a) === n)) return breed;
  }
  return null;
}

export function parseBreedIdList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return [...new Set(v.filter((id): id is string => typeof id === "string" && id.trim().length > 0))];
  } catch {
    return [];
  }
}
