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
  taxonKeys?: string[];
  commonNameZh: string;
  breeds: BreedDef[];
};

export type FreeBreedCell = {
  id: string;
  zh: string;
};

export type BreedResolve =
  | { kind: "empty" }
  | { kind: "discard" }
  | { kind: "catalog"; breed: BreedDef }
  | { kind: "free"; zh: string; id: string };

const PREVALENCE = new Set<BreedPrevalence>(["common", "uncommon", "rare"]);

const breedsDir = join(dirname(fileURLToPath(import.meta.url)), "../../data/breeds");

const PET_COMMON_ZH: Record<string, string> = {
  "canis lupus": "家犬",
  "felis catus": "家猫",
  "gallus gallus": "家鸡",
  "equus caballus": "家马",
  "bos taurus": "家牛",
  "bos indicus": "家牛",
};

const SUFFIXES = [
  "猫咪",
  "小狗",
  "小猫",
  "猫",
  "犬",
  "狗",
  "鸡",
  "牛",
  "马",
  "羊",
  "猪",
  "兔",
];

function normKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normName(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "");
}

function isCjk(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return c >= 0x3400 && c <= 0x9fff;
}

function minContainLen(s: string): number {
  return [...s].every(isCjk) ? 2 : 4;
}

/** 去掉末尾物种量词，金渐层猫 → 金渐层。剩太短则不剥。 */
export function stripBreedSuffix(raw: string): string {
  let s = normName(raw);
  if (!s) return s;
  for (const suf of SUFFIXES) {
    if (s.length > suf.length && s.endsWith(suf)) {
      const cut = s.slice(0, s.length - suf.length);
      if (cut.length >= minContainLen(cut) || (cut.length >= 2 && [...cut].some(isCjk))) {
        return cut;
      }
    }
  }
  return s;
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
  const taxonKeys = Array.isArray(o.taxonKeys)
    ? o.taxonKeys.map((k) => String(k).trim()).filter(Boolean)
    : undefined;
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
  return { id, taxonKey, taxonKeys, commonNameZh, breeds };
}

let cached: BreedCatalog[] | null = null;
let byTaxon: Map<string, BreedCatalog> | null = null;
let discardNames: string[] | null = null;

function loadDiscardNames(): string[] {
  if (discardNames) return discardNames;
  try {
    const raw = JSON.parse(readFileSync(join(breedsDir, "discard.json"), "utf8")) as {
      names?: unknown;
    };
    discardNames = Array.isArray(raw.names)
      ? raw.names.map((n) => String(n).trim()).filter(Boolean)
      : [];
  } catch {
    discardNames = [];
  }
  return discardNames;
}

/** 实际会被 stripBreedSuffix 剥掉的那一截；剥不动则没有物种量词。 */
function trailingSuffix(raw: string): string | null {
  const s = normName(raw);
  for (const suf of SUFFIXES) {
    if (s.length > suf.length && s.endsWith(suf)) {
      const cut = s.slice(0, s.length - suf.length);
      if (cut.length >= minContainLen(cut) || (cut.length >= 2 && [...cut].some(isCjk))) {
        return suf;
      }
    }
  }
  return null;
}

export function loadBreedCatalogs(force = false): BreedCatalog[] {
  if (cached && !force) return cached;
  const files = readdirSync(breedsDir).filter(
    (f) => f.endsWith(".json") && f !== "discard.json",
  );
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
  byTaxon = new Map();
  for (const c of list) {
    byTaxon.set(normKey(c.taxonKey), c);
    for (const extra of c.taxonKeys ?? []) {
      byTaxon.set(normKey(extra), c);
    }
  }
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

function namesOf(breed: BreedDef): string[] {
  const raw = [breed.zh, breed.en, ...(breed.aliases ?? [])].filter(
    (n): n is string => Boolean(n && n.trim()),
  );
  const out = new Set<string>();
  for (const n of raw) {
    out.add(normName(n));
    out.add(stripBreedSuffix(n));
  }
  return [...out].filter(Boolean);
}

export function isDiscardName(raw: string | null | undefined): boolean {
  const display = raw?.trim() ?? "";
  if (!display) return false;
  const n = normName(display);
  const stripped = stripBreedSuffix(display);
  const inputSuf = trailingSuffix(display);
  for (const name of loadDiscardNames()) {
    const dn = normName(name);
    const dstrip = stripBreedSuffix(name);
    const dSuf = trailingSuffix(name);
    if (n === dn) return true;
    if (stripped && dstrip && stripped === dstrip) {
      // 田园猫 / 田园犬剥完都是「田园」，量词不同则不当同一排除项。
      if (!inputSuf || !dSuf || inputSuf === dSuf) return true;
    }
  }
  return false;
}

export function matchBreed(
  taxonKey: string | null | undefined,
  breedZh: string | null | undefined,
): BreedDef | null {
  const resolved = resolveBreed(taxonKey, breedZh);
  return resolved.kind === "catalog" ? resolved.breed : null;
}

function uniqueContainment(needle: string, catalog: BreedCatalog): BreedDef | null {
  if (needle.length < minContainLen(needle)) return null;
  const hits = new Map<string, BreedDef>();
  for (const breed of catalog.breeds) {
    for (const key of namesOf(breed)) {
      if (key.length < minContainLen(key) && key.length < needle.length) continue;
      if (key === needle || key.includes(needle) || needle.includes(key)) {
        if (key !== needle) {
          const shorter = key.length <= needle.length ? key : needle;
          if (shorter.length < minContainLen(shorter)) continue;
        }
        hits.set(breed.id, breed);
        break;
      }
    }
  }
  if (hits.size !== 1) return null;
  return [...hits.values()][0] ?? null;
}

export function resolveBreed(
  taxonKey: string | null | undefined,
  breedZh: string | null | undefined,
): BreedResolve {
  const display = breedZh?.trim() ?? "";
  if (!display) return { kind: "empty" };
  if (isDiscardName(display)) return { kind: "discard" };

  const catalog = catalogForTaxon(taxonKey);
  const forms = [...new Set([normName(display), stripBreedSuffix(display)])].filter(Boolean);

  if (catalog) {
    for (const form of forms) {
      for (const breed of catalog.breeds) {
        if (namesOf(breed).includes(form)) return { kind: "catalog", breed };
      }
    }
    for (const form of forms) {
      const hit = uniqueContainment(form, catalog);
      if (hit) return { kind: "catalog", breed: hit };
    }
  }

  const idKey = stripBreedSuffix(display) || normName(display);
  return { kind: "free", zh: display, id: `free:${idKey}` };
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

export function parseFreeBreedList(raw: string | null | undefined): FreeBreedCell[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    const out: FreeBreedCell[] = [];
    const seen = new Set<string>();
    for (const item of v) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const id = String(o.id ?? "").trim();
      const zh = String(o.zh ?? "").trim();
      if (!id || !zh || seen.has(id)) continue;
      seen.add(id);
      out.push({ id, zh });
    }
    return out;
  } catch {
    return [];
  }
}
