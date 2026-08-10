import { ProxyAgent, fetch as undiciFetch, type RequestInit } from "undici";
import { env } from "../env.js";

const BASE = "https://api.gbif.org/v1";
/** GBIF Backbone checklist — prefer these when name is ambiguous. */
const BACKBONE_DATASET = "d7dddbf4-2cf0-4f39-9b2a-bb099caae36c";

function fetchInit(): RequestInit {
  const init: RequestInit = {
    headers: { Accept: "application/json", "User-Agent": "BioTrace/0.1 (personal non-profit)" },
  };
  if (env.httpsProxy) {
    init.dispatcher = new ProxyAgent(env.httpsProxy);
  }
  return init;
}

function rankParam(rank: string | null | undefined): string | null {
  const r = (rank ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  const map: Record<string, string> = {
    species: "SPECIES",
    subspecies: "SPECIES",
    种: "SPECIES",
    亚种: "SPECIES",
    genus: "GENUS",
    属: "GENUS",
    family: "FAMILY",
    subfamily: "FAMILY",
    tribe: "FAMILY",
    superfamily: "FAMILY",
    科: "FAMILY",
    亚科: "FAMILY",
    族: "FAMILY",
    总科: "FAMILY",
    order: "ORDER",
    目: "ORDER",
    class: "CLASS",
    纲: "CLASS",
    phylum: "PHYLUM",
    门: "PHYLUM",
    kingdom: "KINGDOM",
    界: "KINGDOM",
  };
  return map[r] ?? null;
}

export type GbifMatchType = "EXACT" | "FUZZY" | "HIGHERRANK" | "NONE" | string;

export type GbifMatchResult = {
  usageKey: number | null;
  matchType: GbifMatchType;
  confidence: number;
  canonicalName: string | null;
  rank: string | null;
  kingdom: string | null;
  phylum: string | null;
  class: string | null;
  order: string | null;
  family: string | null;
  genus: string | null;
  species: string | null;
};

type MatchQuery = {
  name: string;
  rank?: string | null;
  kingdom?: string | null;
  phylum?: string | null;
  class?: string | null;
  order?: string | null;
  family?: string | null;
  genus?: string | null;
};

function asTrimmed(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s || null;
}

function parseMatchPayload(data: Record<string, unknown>): GbifMatchResult {
  const usageKeyRaw = data.usageKey ?? data.acceptedUsageKey;
  const usageKey =
    typeof usageKeyRaw === "number" && Number.isFinite(usageKeyRaw) ? usageKeyRaw : null;
  const confidenceRaw = data.confidence;
  const confidence =
    typeof confidenceRaw === "number" && Number.isFinite(confidenceRaw) ? confidenceRaw : 0;
  return {
    usageKey,
    matchType: asTrimmed(data.matchType) ?? "NONE",
    confidence,
    canonicalName: asTrimmed(data.canonicalName),
    rank: asTrimmed(data.rank),
    kingdom: asTrimmed(data.kingdom),
    phylum: asTrimmed(data.phylum),
    class: asTrimmed(data.class),
    order: asTrimmed(data.order),
    family: asTrimmed(data.family),
    genus: asTrimmed(data.genus),
    species: asTrimmed(data.species),
  };
}

/** Full `/species/match` (classification + matchType). Used by volumes taxonomy resolve. */
export async function gbifMatchName(query: MatchQuery): Promise<GbifMatchResult> {
  const params = new URLSearchParams({ name: query.name });
  const rp = rankParam(query.rank);
  if (rp) params.set("rank", rp);
  for (const key of ["kingdom", "phylum", "class", "order", "family", "genus"] as const) {
    const v = query[key]?.trim();
    if (v) params.set(key, v);
  }
  const res = await undiciFetch(`${BASE}/species/match?${params}`, fetchInit());
  if (!res.ok) throw new Error(`GBIF match HTTP ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>;
  return parseMatchPayload(data);
}

async function matchOnce(name: string, rank?: string | null): Promise<number | null> {
  const data = await gbifMatchName({ name, rank });
  if (data.matchType === "NONE") return null;
  return data.usageKey;
}

/** Exact name lookup; prefer ACCEPTED backbone when match API is ambiguous. */
async function speciesByName(name: string, rank?: string | null): Promise<number | null> {
  const params = new URLSearchParams({ name });
  const rp = rankParam(rank);
  if (rp) params.set("rank", rp);
  const res = await undiciFetch(`${BASE}/species?${params}`, fetchInit());
  if (!res.ok) throw new Error(`GBIF species HTTP ${res.status}`);
  const data = (await res.json()) as {
    results?: Array<{
      key?: number;
      nubKey?: number;
      taxonomicStatus?: string;
      datasetKey?: string;
      canonicalName?: string;
      scientificName?: string;
    }>;
  };
  const results = data.results ?? [];
  if (!results.length) return null;

  const backboneAccepted = results.find(
    (r) =>
      r.datasetKey === BACKBONE_DATASET &&
      (r.taxonomicStatus ?? "").toUpperCase() === "ACCEPTED" &&
      r.key != null,
  );
  if (backboneAccepted?.key != null) return backboneAccepted.key;

  const accepted = results.find(
    (r) => (r.taxonomicStatus ?? "").toUpperCase() === "ACCEPTED" && r.key != null,
  );
  if (accepted?.key != null) return accepted.key;

  return results[0]?.key ?? results[0]?.nubKey ?? null;
}

/**
 * Resolve a GBIF usage key. `match` alone fails on ambiguous genera (e.g. Ligia → NONE);
 * fall back to checklist species?name= lookup preferring backbone ACCEPTED.
 */
export async function gbifResolveUsageKey(opts: {
  names: string[];
  rank?: string | null;
}): Promise<{ usageKey: number; matchedName: string } | null> {
  const seen = new Set<string>();
  for (const raw of opts.names) {
    const name = raw?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    let usageKey = await matchOnce(name, opts.rank);
    if (usageKey == null) {
      usageKey = await speciesByName(name, opts.rank);
    }
    if (usageKey == null && opts.rank) {
      // retry without rank constraint
      usageKey = await matchOnce(name, null);
      if (usageKey == null) usageKey = await speciesByName(name, null);
    }
    if (usageKey != null) {
      return { usageKey, matchedName: name };
    }
  }
  return null;
}

export async function gbifOccurrenceCount(opts: {
  usageKey: number;
  countryCode?: string | null;
}): Promise<number> {
  const params = new URLSearchParams({
    taxonKey: String(opts.usageKey),
    limit: "0",
  });
  if (opts.countryCode) params.set("country", opts.countryCode);
  const url = `${BASE}/occurrence/search?${params}`;
  const res = await undiciFetch(url, fetchInit());
  if (!res.ok) throw new Error(`GBIF occurrence HTTP ${res.status}`);
  const data = (await res.json()) as { count?: number };
  return Number(data.count ?? 0);
}
