import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ProxyAgent, fetch as undiciFetch, type RequestInit } from "undici";
import { env } from "../env.js";
import { cacheKey as taxonCacheKey, rarityConfig } from "./config.js";
import { readRarityCache, writeRarityCache } from "./cache.js";
import { ENCOUNTER_RUBRIC } from "./encounter-rubric.js";
import {
  parseBoolFlag,
  parseExtinctFlag,
  parseFrequency,
  parseHardToPhotograph,
  parseIconicAppeal,
  parseProtectionLevel,
  parseSwarm,
  resolveFromEncounter,
} from "./formula.js";

export type EncounterRarityResolution = {
  rarity: string;
  source: "cache" | "encounter" | "seed" | "default";
  frequency: number | null;
  adjustments: string[];
  occurrenceCount: number | null;
  gbifUsageKey: number | null;
};

/** Bump when encounter rubric / formula semantics change enough to invalidate cache. */
export const ENCOUNTER_CACHE_VER = "enc4";

export function encounterCacheKey(countryCode: string | null, taxonKey: string): string {
  return `${ENCOUNTER_CACHE_VER}|${taxonCacheKey(countryCode, taxonKey)}`;
}

/** `enc4|CN|Passer montanus` → parts; taxon may contain `|`. */
export function parseEncounterCacheKey(
  key: string,
): { version: string; countryCode: string; taxonKey: string } | null {
  const i1 = key.indexOf("|");
  if (i1 < 0) return null;
  const i2 = key.indexOf("|", i1 + 1);
  if (i2 < 0) return null;
  const version = key.slice(0, i1);
  const countryCode = key.slice(i1 + 1, i2);
  const taxonKey = key.slice(i2 + 1);
  if (!version || !countryCode || !taxonKey) return null;
  return { version, countryCode, taxonKey };
}

function fetchInit(): RequestInit {
  const init: RequestInit = {};
  if (env.httpsProxy) init.dispatcher = new ProxyAgent(env.httpsProxy);
  return init;
}

function extractJson(text: string): Record<string, unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  let raw = (fenced?.[1] ?? text).trim();
  raw = raw.replace(/\bFalse\b/g, "false").replace(/\bTrue\b/g, "true").replace(/\bNone\b/g, "null");
  const start = raw.indexOf("{");
  if (start < 0) throw new Error(`no json: ${text.slice(0, 160)}`);
  let depth = 0;
  let end = -1;
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === "{") depth += 1;
    else if (raw[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) throw new Error(`unbalanced json: ${text.slice(0, 160)}`);
  return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function callZhipuText(prompt: string): Promise<string> {
  if (!env.zhipuApiKey) throw new Error("ZHIPU_API_KEY is not set");
  const model = env.zhipuTextModel;
  const url = `${env.zhipuBaseUrl.replace(/\/$/, "")}/chat/completions`;
  const res = await undiciFetch(url, {
    ...fetchInit(),
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.zhipuApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: "只输出合法 JSON 对象。" },
        { role: "user", content: prompt },
      ],
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Zhipu HTTP ${res.status}: ${body.slice(0, 300)}`);
  const data = JSON.parse(body) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content?.trim()) throw new Error("empty content");
  return content;
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!/429|quota|rate|Too Many|timeout|ECONNRESET|503|fetch failed/i.test(msg) || i === attempts) {
        throw err;
      }
      await sleep(Math.min(20_000, 2_000 * i));
    }
  }
  throw last;
}

function loadSeed(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(join(rarityConfig.dataRoot, "rarity-seed.json"), "utf8")) as Record<
      string,
      string
    >;
  } catch {
    return {};
  }
}

let seedCache: Record<string, string> | null = null;
/** Seed keys may still use GLOBAL as last-resort overlay; scoring country is never null here. */
function seedLookup(taxonKey: string, countryCode: string): string | null {
  if (!seedCache) seedCache = loadSeed();
  if (seedCache[`${countryCode}|${taxonKey}`]) return seedCache[`${countryCode}|${taxonKey}`]!;
  if (seedCache[`GLOBAL|${taxonKey}`]) return seedCache[`GLOBAL|${taxonKey}`]!;
  return null;
}

/** 无国家 → CN，与 cacheKey / Prompt / 结算文案一致。 */
function effectiveCountry(countryCode: string | null | undefined): string {
  return countryCode?.trim().toUpperCase() || "CN";
}

export async function scoreEncounter(input: {
  label?: string | null;
  taxonKey: string;
  scientificName?: string | null;
  finestReliableRank?: string | null;
  countryCode: string | null;
}): Promise<{
  frequency: number;
  extinct: boolean;
  pestOrWeed: boolean;
  iconicAppeal: number;
  swarmOrHabituated: number;
  protectionLevel: string;
  hardToPhotograph: number;
  reason: string;
}> {
  const country = effectiveCountry(input.countryCode);
  const prompt = `${ENCOUNTER_RUBRIC}

对象：
- label: ${input.label?.trim() || input.scientificName?.trim() || input.taxonKey}
- taxon: ${input.scientificName?.trim() || input.taxonKey}
- rank: ${input.finestReliableRank?.trim() || "unknown"}
- country: ${country}
- context: wild field encounter`;

  const parsed = extractJson(await withRetry(() => callZhipuText(prompt)));
  const frequency = parseFrequency(parsed.encounter_frequency);
  if (frequency == null) {
    throw new Error(`bad encounter_frequency: ${String(parsed.encounter_frequency)}`);
  }
  return {
    frequency,
    extinct: parseExtinctFlag(parsed.extinct_or_unobtainable, parsed.extinct_year),
    pestOrWeed: parseBoolFlag(parsed.pest_or_weed),
    iconicAppeal: parseIconicAppeal(parsed.iconic_appeal),
    swarmOrHabituated: parseSwarm(parsed.swarm_or_habituated),
    protectionLevel: parseProtectionLevel(parsed.protection_level),
    hardToPhotograph: parseHardToPhotograph(parsed.hard_to_photograph),
    reason: String(parsed.reason ?? ""),
  };
}

/**
 * Production rarity: GLM encounter frequency + gates → local resolve.
 * Cached under enc|… keys (does not reuse GBIF cache rows).
 */
export async function resolveEncounterRarity(input: {
  taxonKey: string;
  countryCode: string | null;
  label?: string | null;
  scientificName?: string | null;
  finestReliableRank?: string | null;
  /** Skip read (still writes on success). Admin rescore. */
  skipCache?: boolean;
}): Promise<EncounterRarityResolution> {
  const countryCode = effectiveCountry(input.countryCode);
  const key = encounterCacheKey(countryCode, input.taxonKey);
  if (!input.skipCache) {
    const cached = await readRarityCache(key);
    if (cached && cached.source === "encounter") {
      return {
        rarity: cached.rarity,
        source: "cache",
        frequency: null,
        adjustments: [],
        occurrenceCount: null,
        gbifUsageKey: null,
      };
    }
  }

  if (!env.zhipuApiKey) {
    console.warn("[rarity] encounter skipped: ZHIPU_API_KEY missing");
  } else {
    try {
      const scored = await scoreEncounter({ ...input, countryCode });
      const resolved = resolveFromEncounter({
        frequency: scored.frequency,
        extinct: scored.extinct,
        pestOrWeed: scored.pestOrWeed,
        iconicAppeal: scored.iconicAppeal,
        swarmOrHabituated: scored.swarmOrHabituated,
        protectionLevel: scored.protectionLevel,
        hardToPhotograph: scored.hardToPhotograph,
      });
      await writeRarityCache({
        cacheKey: key,
        rarity: resolved.rarity,
        occurrenceCount: null,
        gbifUsageKey: null,
        source: "encounter",
      });
      console.log(
        `[rarity] encounter ${input.taxonKey} freq=${resolved.frequency} → ${resolved.rarity}` +
          (resolved.adjustments.length ? ` [${resolved.adjustments.join(",")}]` : "") +
          (scored.reason ? ` · ${scored.reason.slice(0, 80)}` : ""),
      );
      return {
        rarity: resolved.rarity,
        source: "encounter",
        frequency: resolved.frequency,
        adjustments: resolved.adjustments,
        occurrenceCount: null,
        gbifUsageKey: null,
      };
    } catch (err) {
      console.warn(
        "[rarity] encounter failed, falling back:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  const fromSeed = seedLookup(input.taxonKey, countryCode);
  if (fromSeed) {
    return {
      rarity: fromSeed,
      source: "seed",
      frequency: null,
      adjustments: [],
      occurrenceCount: null,
      gbifUsageKey: null,
    };
  }

  return {
    rarity: rarityConfig.defaultRarity,
    source: "default",
    frequency: null,
    adjustments: [],
    occurrenceCount: null,
    gbifUsageKey: null,
  };
}
