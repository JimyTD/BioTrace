import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dataRoot = join(dirname(fileURLToPath(import.meta.url)), "../../data");

export type CnProtectLevel = "class_i" | "class_ii";
export type CnExtinctStatus = "EX" | "EW" | "FE";
export type CnListLevel = "extinct" | "class_i" | "class_ii" | "sanyou" | null;
export type CnMatchBy = "scientificName" | "alias" | "taxon" | "zh" | null;

export type CnStatus = {
  extinct: boolean;
  extinctStatus: CnExtinctStatus | null;
  class_i: boolean;
  class_ii: boolean;
  sanyou: boolean;
  level: CnListLevel;
  matchedBy: CnMatchBy;
};

type NamedEntry = {
  zh: string;
  scientificName: string;
  kind?: "species" | "taxon";
  aliases?: string[];
};

type Tagged<T> = { value: T; by: Exclude<CnMatchBy, null> };

type NameIndex<T> = {
  exact: Map<string, Tagged<T>>;
  zh: Map<string, Tagged<T>>;
  taxon: Array<{ prefix: string; value: T }>;
};

const empty: CnStatus = {
  extinct: false,
  extinctStatus: null,
  class_i: false,
  class_ii: false,
  sanyou: false,
  level: null,
  matchedBy: null,
};

let cached: {
  protect: NameIndex<CnProtectLevel>;
  sanyou: NameIndex<true>;
  extinct: NameIndex<CnExtinctStatus>;
} | null = null;

function norm(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\bspp\.?$/i, "spp.")
    .toLowerCase();
}

function zhKey(name: string): string {
  return name.replace(/\s+/g, "").replace(/[（(].*$/, "");
}

function buildIndex<T>(entries: NamedEntry[], valueOf: (e: NamedEntry) => T): NameIndex<T> {
  const exact = new Map<string, Tagged<T>>();
  const zh = new Map<string, Tagged<T>>();
  const taxon: NameIndex<T>["taxon"] = [];
  for (const e of entries) {
    const value = valueOf(e);
    const key = norm(e.scientificName);
    if (e.kind === "taxon" || key.endsWith(" spp.")) {
      taxon.push({ prefix: key.replace(/\s+spp\.$/, ""), value });
    } else {
      exact.set(key, { value, by: "scientificName" });
    }
    for (const alias of e.aliases ?? []) {
      const a = norm(alias);
      if (a && !exact.has(a)) exact.set(a, { value, by: "alias" });
    }
    const z = zhKey(e.zh);
    if (z && !zh.has(z)) zh.set(z, { value, by: "zh" });
  }
  return { exact, zh, taxon };
}

function readEntries(rel: string): NamedEntry[] {
  const raw = JSON.parse(readFileSync(join(dataRoot, rel), "utf8")) as {
    entries?: NamedEntry[];
  };
  return raw.entries ?? [];
}

function load(): NonNullable<typeof cached> {
  if (cached) return cached;
  cached = {
    protect: buildIndex(
      readEntries("cn-protected/list.json") as Array<NamedEntry & { level: CnProtectLevel }>,
      (e) => (e as NamedEntry & { level: CnProtectLevel }).level,
    ),
    sanyou: buildIndex(readEntries("cn-sanyou/list.json"), () => true as const),
    extinct: buildIndex(
      readEntries("cn-extinct/list.json") as Array<NamedEntry & { status: CnExtinctStatus }>,
      (e) => (e as NamedEntry & { status: CnExtinctStatus }).status,
    ),
  };
  return cached;
}

function lookupIndex<T>(
  idx: NameIndex<T>,
  scientificName: string | null | undefined,
  chineseName?: string | null,
): Tagged<T> | null {
  const raw = scientificName?.trim();
  if (raw) {
    const key = norm(raw);
    const exact = idx.exact.get(key);
    if (exact) return exact;
    const genus = key.split(" ")[0] ?? "";
    const hit = idx.taxon.find((t) => t.prefix === genus || t.prefix === key);
    if (hit) return { value: hit.value, by: "taxon" };
  }
  const z = zhKey(chineseName ?? "");
  if (!z) return null;
  return idx.zh.get(z) ?? null;
}

/**
 * 名录查表，不问模型。顺序：IUCN 轴（EX/EW/CR→XR）→ 中国一级 → 二级 → 三有。
 * 查不到 = 不在这些表里，不是模型猜测。
 * 匹配只走精确学名、官方备注异名、Genus spp.、中文名去括号；不做编辑距离。
 */
export function lookupCnStatus(
  scientificName: string | null | undefined,
  chineseName?: string | null,
): CnStatus {
  const idx = load();
  const extinct = lookupIndex(idx.extinct, scientificName, chineseName);
  const protect = lookupIndex(idx.protect, scientificName, chineseName);
  const sanyou = lookupIndex(idx.sanyou, scientificName, chineseName);
  const matchedBy = extinct?.by ?? protect?.by ?? sanyou?.by ?? null;
  if (extinct) {
    return {
      extinct: true,
      extinctStatus: extinct.value,
      class_i: protect?.value === "class_i",
      class_ii: protect?.value === "class_ii",
      sanyou: Boolean(sanyou),
      level: "extinct",
      matchedBy,
    };
  }
  if (protect?.value === "class_i") {
    return {
      ...empty,
      class_i: true,
      class_ii: false,
      sanyou: Boolean(sanyou),
      level: "class_i",
      matchedBy,
    };
  }
  if (protect?.value === "class_ii") {
    return {
      ...empty,
      class_i: false,
      class_ii: true,
      sanyou: Boolean(sanyou),
      level: "class_ii",
      matchedBy,
    };
  }
  if (sanyou) {
    return { ...empty, sanyou: true, level: "sanyou", matchedBy };
  }
  return empty;
}

/** 中国国家重点保护。查不到 = 非名录内。 */
export function lookupCnProtected(
  scientificName: string | null | undefined,
  chineseName?: string | null,
): {
  class_i: boolean;
  class_ii: boolean;
  level: CnProtectLevel | null;
} {
  const s = lookupCnStatus(scientificName, chineseName);
  return {
    class_i: s.class_i,
    class_ii: s.class_ii,
    level: s.class_i ? "class_i" : s.class_ii ? "class_ii" : null,
  };
}
