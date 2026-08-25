import { eq } from "drizzle-orm";
import { env } from "../env.js";
import { db } from "../db/index.js";
import { observations, type Observation } from "../db/schema.js";
import {
  TAXONOMY_RANKS,
  emptyTaxonomy,
  normalizeTaxonomy,
  type Taxonomy,
  type TaxonomyRank,
} from "../identify/types.js";
import { gbifMatchName } from "../rarity/gbif.js";
import {
  canonicalForTaxonKey,
  gbifRankCoversKey,
  isAcceptedGbifMatch,
  mergeGbifIntoTaxonomy,
  normalizeScientificQuery,
} from "../volumes/taxonomy-resolve.js";

export function parseTaxonomy(json: string | null | undefined): Taxonomy | null {
  if (!json) return null;
  try {
    return normalizeTaxonomy(JSON.parse(json));
  } catch {
    return null;
  }
}

/** 图鉴展示学名：GBIF 键优先，否则识图原串。 */
export function collectionScientificName(obs: {
  taxonKey?: string | null;
  scientificName?: string | null;
}) {
  return obs.taxonKey?.trim() || obs.scientificName || null;
}

/** 收集树分类链：有骨架用骨架，否则识图。 */
export function parseCollectionTaxonomy(obs: {
  acceptedTaxonomyJson?: string | null;
  taxonomyJson?: string | null;
}) {
  return parseTaxonomy(obs.acceptedTaxonomyJson) ?? parseTaxonomy(obs.taxonomyJson);
}

/** 开包之后必须有值：GBIF 骨架，或识图原文。null 只表示还没走过开包解析（旧行）。 */
export function storeAcceptedTaxonomyJson(
  accepted: Taxonomy | null,
  taxonomyJson: string | null | undefined,
): string | null {
  if (accepted) return JSON.stringify(accepted);
  return taxonomyJson ?? null;
}

/**
 * 套册点亮只认开包同一套 `resolveTaxonKey`。
 * 有存档（含「问过但只能用识图」写下的原文）直接用。
 * null 才是旧行没问过：用同一函数问一次并写回。
 */
export async function ensureAcceptedTaxonomy(obs: Observation): Promise<Taxonomy | null> {
  const stored = parseTaxonomy(obs.acceptedTaxonomyJson);
  if (stored) return stored;

  const raw = parseTaxonomy(obs.taxonomyJson);
  const resolved = await resolveTaxonKey({
    scientificName: obs.scientificName,
    taxonomy: raw,
    finestReliableRank: obs.finestReliableRank,
  });
  const next = resolved.acceptedTaxonomy ?? raw;
  const json = storeAcceptedTaxonomyJson(resolved.acceptedTaxonomy, obs.taxonomyJson);
  if (json) {
    await db
      .update(observations)
      .set({ acceptedTaxonomyJson: json, updatedAt: new Date() })
      .where(eq(observations.id, obs.id));
    obs.acceptedTaxonomyJson = json;
  }
  return next;
}

function normalizeRank(rank: string | null | undefined): string {
  return (rank ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

const RANK_ALIASES: Record<string, TaxonomyRank> = {
  kingdom: "kingdom",
  phylum: "phylum",
  class: "class",
  order: "order",
  family: "family",
  genus: "genus",
  species: "species",
  subspecies: "species",
  subfamily: "family",
  superfamily: "family",
  tribe: "family",
  界: "kingdom",
  门: "phylum",
  纲: "class",
  目: "order",
  科: "family",
  属: "genus",
  种: "species",
  亚种: "species",
  亚科: "family",
  总科: "family",
  族: "family",
};

/** Key for rarity/collection = taxon at finest_reliable_rank (e.g. family → Tipulidae). */
export function buildTaxonKey(opts: {
  scientificName?: string | null;
  taxonomyJson?: string | null;
  taxonomy?: Taxonomy | null;
  finestReliableRank?: string | null;
}): string | null {
  const tax = opts.taxonomy ?? parseTaxonomy(opts.taxonomyJson);
  const rankKey = RANK_ALIASES[normalizeRank(opts.finestReliableRank)];

  if (tax && rankKey) {
    const atRank = tax[rankKey]?.name_la?.trim();
    if (atRank) return atRank;
  }

  // Fallback: walk from fine to coarse
  if (tax) {
    for (const rank of [...TAXONOMY_RANKS].reverse()) {
      const name = tax[rank]?.name_la?.trim();
      if (name) return name;
    }
  }

  const sci = opts.scientificName?.trim();
  if (sci) {
    const parts = sci.split(/\s+/);
    if (rankKey === "species" && parts.length >= 2 && /^[A-Z]/.test(parts[0])) {
      return `${parts[0]} ${parts[1]}`;
    }
    return sci;
  }
  return null;
}

function keyRankOf(finestReliableRank?: string | null): TaxonomyRank | null {
  return RANK_ALIASES[normalizeRank(finestReliableRank)] ?? null;
}

/**
 * 图鉴 / 稀有度缓存 / 引入种的唯一身份。
 * 优先 GBIF Backbone 的 accepted canonical（种级强制二项名；同物异名跟 `species` 字段，
 * 不跟 synonym 的 canonicalName）。不把 AI 上级分类传给 match。
 * HIGHERRANK 粗于可靠阶元时不用（属卡与种卡必须分开）。
 * GBIF 关或失败回退 Gemini 名，不让结算失败。
 *
 * `acceptedTaxonomy`：骨架拉丁叠在识图中文上，供图鉴/收集树；观察页仍用识图 taxonomyJson。
 * 不回填历史观察：旧行无 accepted 字段；单条可走后台「重算开包结算」。
 */
export type TaxonKeyResolution = {
  taxonKey: string | null;
  acceptedTaxonomy: Taxonomy | null;
};

export async function resolveTaxonKey(opts: {
  scientificName?: string | null;
  taxonomyJson?: string | null;
  taxonomy?: Taxonomy | null;
  finestReliableRank?: string | null;
}): Promise<TaxonKeyResolution> {
  const fallback = buildTaxonKey(opts);
  const base = opts.taxonomy ?? parseTaxonomy(opts.taxonomyJson);
  if (!fallback) return { taxonKey: null, acceptedTaxonomy: null };
  if (!env.gbifEnabled) return { taxonKey: fallback, acceptedTaxonomy: null };

  const rankKey = keyRankOf(opts.finestReliableRank);
  if (!rankKey) return { taxonKey: fallback, acceptedTaxonomy: null };

  const query = normalizeScientificQuery(fallback);
  if (!query) return { taxonKey: fallback, acceptedTaxonomy: null };

  try {
    // Do NOT pass AI higher taxonomy as match context: a wrong family can veto
    // an otherwise good FUZZY species hit (e.g. family=Grapsida + Eriocher sinenss → NONE).
    const match = await gbifMatchName({ name: query, rank: rankKey });
    if (!isAcceptedGbifMatch(match) || !gbifRankCoversKey(match.rank, rankKey)) {
      return { taxonKey: fallback, acceptedTaxonomy: null };
    }
    const canonical = canonicalForTaxonKey(match, rankKey);
    if (!canonical) return { taxonKey: fallback, acceptedTaxonomy: null };
    if (canonical.toLowerCase() !== fallback.toLowerCase()) {
      console.info(
        `[settle] taxonKey GBIF ${match.matchType} conf=${match.confidence} ${fallback} → ${canonical}`,
      );
    }
    return {
      taxonKey: canonical,
      acceptedTaxonomy: mergeGbifIntoTaxonomy(base ?? emptyTaxonomy(), match),
    };
  } catch (err) {
    console.warn(
      "[settle] GBIF taxonKey resolve failed:",
      err instanceof Error ? err.message : err,
    );
    return { taxonKey: fallback, acceptedTaxonomy: null };
  }
}
