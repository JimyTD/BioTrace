import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ProxyAgent, fetch as undiciFetch, type RequestInit } from "undici";
import { env } from "../env.js";
import { cacheKey as taxonCacheKey, rarityConfig } from "./config.js";
import { readRarityCache, writeRarityCache } from "./cache.js";
import { ENCOUNTER_RUBRIC } from "./encounter-rubric.js";
import {
  parseEncounterClass,
  parseProtectionLevel,
  resolveFromEncounter,
  type EncounterClass,
} from "./formula.js";

export type EncounterRarityResolution = {
  rarity: string;
  source: "cache" | "encounter" | "seed" | "default";
  encounterClass: EncounterClass | null;
  adjustments: string[];
  occurrenceCount: number | null;
  gbifUsageKey: number | null;
};

/** Bump when encounter rubric / formula semantics change enough to invalidate cache. */
const ENCOUNTER_CACHE_VER = "enc2";

function encounterCacheKey(countryCode: string | null, taxonKey: string): string {
  return `${ENCOUNTER_CACHE_VER}|${taxonCacheKey(countryCode, taxonKey)}`;
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
function seedLookup(taxonKey: string, countryCode: string | null): string | null {
  if (!seedCache) seedCache = loadSeed();
  if (countryCode && seedCache[`${countryCode}|${taxonKey}`]) return seedCache[`${countryCode}|${taxonKey}`]!;
  if (seedCache[`GLOBAL|${taxonKey}`]) return seedCache[`GLOBAL|${taxonKey}`]!;
  return null;
}

export async function scoreEncounterClass(input: {
  label?: string | null;
  taxonKey: string;
  scientificName?: string | null;
  finestReliableRank?: string | null;
  countryCode: string | null;
}): Promise<{
  encounterClass: EncounterClass;
  swarmOrHabituated: number;
  protectionLevel: string;
  hardToPhotograph: boolean;
  reason: string;
}> {
  const country = input.countryCode?.trim() || "CN";
  const prompt = `${ENCOUNTER_RUBRIC}

对象：
- label: ${input.label?.trim() || input.scientificName?.trim() || input.taxonKey}
- taxon: ${input.scientificName?.trim() || input.taxonKey}
- rank: ${input.finestReliableRank?.trim() || "unknown"}
- country: ${country}
- context: wild field encounter`;

  const parsed = extractJson(await withRetry(() => callZhipuText(prompt)));
  const cls = parseEncounterClass(parsed.encounter_class);
  if (!cls) throw new Error(`bad encounter_class: ${String(parsed.encounter_class)}`);
  return {
    encounterClass: cls,
    swarmOrHabituated: Number(parsed.swarm_or_habituated ?? 0),
    protectionLevel: parseProtectionLevel(parsed.protection_level),
    hardToPhotograph: Boolean(parsed.hard_to_photograph),
    reason: String(parsed.reason ?? ""),
  };
}

/**
 * Production rarity: GLM encounter_class → local veto/resolve.
 * Cached under enc|… keys (does not reuse GBIF cache rows).
 */
export async function resolveEncounterRarity(input: {
  taxonKey: string;
  countryCode: string | null;
  label?: string | null;
  scientificName?: string | null;
  finestReliableRank?: string | null;
}): Promise<EncounterRarityResolution> {
  const key = encounterCacheKey(input.countryCode, input.taxonKey);
  const cached = await readRarityCache(key);
  if (cached && cached.source === "encounter") {
    return {
      rarity: cached.rarity,
      source: "cache",
      encounterClass: null,
      adjustments: [],
      occurrenceCount: null,
      gbifUsageKey: null,
    };
  }

  if (!env.zhipuApiKey) {
    console.warn("[rarity] encounter skipped: ZHIPU_API_KEY missing");
  } else {
    try {
      const scored = await scoreEncounterClass(input);
      const resolved = resolveFromEncounter({
        encounterClass: scored.encounterClass,
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
        `[rarity] encounter ${input.taxonKey} class=${resolved.encounterClass} → ${resolved.rarity}` +
          (resolved.adjustments.length ? ` [${resolved.adjustments.join(",")}]` : "") +
          (scored.reason ? ` · ${scored.reason.slice(0, 80)}` : ""),
      );
      return {
        rarity: resolved.rarity,
        source: "encounter",
        encounterClass: resolved.encounterClass,
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

  const fromSeed = seedLookup(input.taxonKey, input.countryCode);
  if (fromSeed) {
    return {
      rarity: fromSeed,
      source: "seed",
      encounterClass: null,
      adjustments: [],
      occurrenceCount: null,
      gbifUsageKey: null,
    };
  }

  return {
    rarity: rarityConfig.defaultRarity,
    source: "default",
    encounterClass: null,
    adjustments: [],
    occurrenceCount: null,
    gbifUsageKey: null,
  };
}
