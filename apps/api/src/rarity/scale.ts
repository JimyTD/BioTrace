/**
 * 生产稀有度：名录查表 + 12 道原子题分 3 批问 → 本地线性加权切档。
 * 打分逻辑全在 scale-rubric.ts，与标定脚本共用同一份，这里只管调度、采样与缓存。
 *
 * 调用预算：名录里的灭绝种 0 次调用；普通物种 3 次（1 次采样 × 3 批）；
 * 得分贴着档位界的补到 3 次采样共 9 次。缓存按「国家 + taxonKey」永久保存。
 */
import { env } from "../env.js";
import { extractJson } from "../llm/json.js";
import { callTextChain } from "../llm/text-chain.js";
import { readRarityCache, writeRarityCache } from "./cache.js";
import { lookupCnStatus, type CnListLevel, type CnStatus } from "./cn-status.js";
import {
  SCALE_BATCHES,
  distanceToBand,
  emptyItems,
  mergeItems,
  parseScaleItems,
  scoreFromScale,
  UNKNOWN_PLACEHOLDER_TIER,
  type ScaleItems,
} from "./scale-rubric.js";

/** 题面、权重或结算语义变到旧分不能用了就升版本，缓存自然作废。 */
export const SCALE_CACHE_VER = "scale1";

export type ScaleRaritySource = "cache" | "scale" | "list" | "unavailable";

export type ScaleRarityResolution = {
  rarity: string;
  source: ScaleRaritySource;
  score: number | null;
  items: ScaleItems | null;
  adjustments: string[];
  /** 实际出货的模型名；跨批降级时是逗号分隔的多个。 */
  model: string | null;
  samples: number;
  listLevel: CnListLevel;
  reasons: Record<string, string>;
};

export type ScaleRarityInput = {
  taxonKey: string;
  countryCode: string | null;
  label?: string | null;
  scientificName?: string | null;
  finestReliableRank?: string | null;
  /** 跳过读缓存（仍会写）。后台重打用。 */
  skipCache?: boolean;
};

/** 无国家 → CN，与缓存键、Prompt、结算文案一致。 */
export function effectiveCountry(countryCode: string | null | undefined): string {
  return countryCode?.trim().toUpperCase() || "CN";
}

export function scaleCacheKey(countryCode: string | null, taxonKey: string): string {
  return `${SCALE_CACHE_VER}|${effectiveCountry(countryCode)}|${taxonKey}`;
}

/** `scale1|CN|Passer montanus` → 三段；taxonKey 自身可能含 `|`。 */
export function parseScaleCacheKey(
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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 与标定脚本的 taxonBlock 逐字一致——两边送给模型的东西必须是同一个形状。 */
function taxonBlock(input: ScaleRarityInput, country: string): string {
  const label = input.label?.trim() || input.scientificName?.trim() || input.taxonKey;
  const taxon = input.scientificName?.trim() || input.taxonKey;
  return `对象：
- label: ${label}
- taxon: ${taxon}
- rank: ${input.finestReliableRank?.trim() || "unknown"}
- country: ${country}
- context: ordinary encounter`;
}

/**
 * 名录查名要把识图原名和 GBIF 接受名都试一遍：同物异名时往往只有一个在名录里，
 * 只试一个就可能整个漏掉保护级——那是 0.8～2.5 分，足够错两档。
 */
function lookupListed(input: ScaleRarityInput): CnStatus {
  const names = [input.scientificName?.trim(), input.taxonKey?.trim()].filter(
    (n): n is string => Boolean(n),
  );
  let last: CnStatus | null = null;
  for (const name of names) {
    const hit = lookupCnStatus(name, input.label);
    if (hit.level) return hit;
    last = hit;
  }
  return last ?? lookupCnStatus(null, input.label);
}

function listOpts(listed: CnStatus) {
  return {
    sanyou: listed.sanyou,
    extinct: listed.extinct,
    class_i: listed.class_i,
    class_ii: listed.class_ii,
  };
}

type Draw = { items: ScaleItems; reasons: Record<string, string>; models: string[] };

/** 一次采样 = 顺序问完 3 批。任一批彻底失败就整次采样作废。 */
async function drawOnce(input: ScaleRarityInput, country: string): Promise<Draw> {
  const items: Partial<ScaleItems> = {};
  const reasons: Record<string, string> = {};
  const models: string[] = [];
  const block = taxonBlock(input, country);
  let first = true;
  for (const batch of SCALE_BATCHES) {
    if (!first) await sleep(env.rarityCallDelayMs);
    first = false;
    const { content, model } = await callTextChain(`${batch.rubric}\n\n${block}`);
    const parsed = extractJson(content);
    Object.assign(items, parseScaleItems(parsed, batch.keys));
    reasons[batch.id] = String(parsed.reason ?? "").slice(0, 200);
    models.push(model);
  }
  return { items: items as ScaleItems, reasons, models };
}

function distinctModels(draws: Draw[]): string {
  return [...new Set(draws.flatMap((d) => d.models))].join(",");
}

export async function resolveScaleRarity(
  input: ScaleRarityInput,
): Promise<ScaleRarityResolution> {
  const country = effectiveCountry(input.countryCode);
  const key = scaleCacheKey(country, input.taxonKey);

  if (!input.skipCache) {
    const cached = await readRarityCache(key);
    if (cached && cached.source !== "unavailable") {
      return {
        rarity: cached.rarity,
        source: "cache",
        score: cached.score ?? null,
        items: cached.itemsJson ? (JSON.parse(cached.itemsJson) as ScaleItems) : null,
        adjustments: cached.adjustmentsJson
          ? (JSON.parse(cached.adjustmentsJson) as string[])
          : [],
        model: cached.model ?? null,
        samples: cached.samples ?? 0,
        listLevel: (cached.listLevel as CnListLevel) ?? null,
        reasons: cached.reasonsJson ? (JSON.parse(cached.reasonsJson) as Record<string, string>) : {},
      };
    }
  }

  // 名录先行：灭绝种直接 XR，一次模型都不调。
  const listed = lookupListed(input);
  if (listed.extinct) {
    const scored = scoreFromScale(emptyItems(), listOpts(listed));
    await writeRarityCache({
      cacheKey: key,
      rarity: scored.rarity,
      source: "list",
      score: scored.score,
      itemsJson: null,
      adjustmentsJson: JSON.stringify(scored.adjustments),
      model: null,
      samples: 0,
      listLevel: listed.level,
      reasonsJson: null,
    });
    return {
      rarity: scored.rarity,
      source: "list",
      score: scored.score,
      items: null,
      adjustments: scored.adjustments,
      model: null,
      samples: 0,
      listLevel: listed.level,
      reasons: {},
    };
  }

  const base = Math.max(1, env.raritySamples);
  const target = Math.max(base, env.rarityEdgeSamples);
  const draws: Draw[] = [];

  try {
    for (let i = 0; i < base; i++) {
      if (i > 0) await sleep(env.rarityCallDelayMs);
      draws.push(await drawOnce(input, country));
    }
  } catch (err) {
    console.warn(
      `[rarity] scale 失败 ${input.taxonKey}:`,
      err instanceof Error ? err.message : err,
    );
  }

  if (!draws.length) {
    // 全链不可用：给占位档但不写缓存，下次还能重算，不把兜底值钉死。
    return {
      rarity: UNKNOWN_PLACEHOLDER_TIER,
      source: "unavailable",
      score: null,
      items: null,
      adjustments: ["chain_unavailable"],
      model: null,
      samples: 0,
      listLevel: listed.level,
      reasons: {},
    };
  }

  let items = mergeItems(draws.map((d) => d.items));
  let scored = scoreFromScale(items, listOpts(listed));

  // 贴着档位界就补采样：这一分再动 0.2 就换档，不值得让一道噪声题拍板。
  if (draws.length < target && distanceToBand(scored.score) <= env.rarityEdgeMargin) {
    try {
      while (draws.length < target) {
        await sleep(env.rarityCallDelayMs);
        draws.push(await drawOnce(input, country));
      }
    } catch (err) {
      // 补采样失败不致命，用已有的采样定档。
      console.warn(
        `[rarity] 补采样中断 ${input.taxonKey}:`,
        err instanceof Error ? err.message : err,
      );
    }
    items = mergeItems(draws.map((d) => d.items));
    scored = scoreFromScale(items, listOpts(listed));
  }

  const model = distinctModels(draws);
  const reasons = draws[0]!.reasons;
  await writeRarityCache({
    cacheKey: key,
    rarity: scored.rarity,
    source: "scale",
    score: scored.score,
    itemsJson: JSON.stringify(items),
    adjustmentsJson: JSON.stringify(scored.adjustments),
    model,
    samples: draws.length,
    listLevel: listed.level,
    reasonsJson: JSON.stringify(reasons),
  });

  console.log(
    `[rarity] scale ${input.taxonKey} S=${scored.score} → ${scored.rarity} ` +
      `(${model}, ${draws.length} 采样${listed.level ? `, list=${listed.level}` : ""})` +
      (scored.adjustments.length ? ` [${scored.adjustments.join(",")}]` : ""),
  );

  return {
    rarity: scored.rarity,
    source: "scale",
    score: scored.score,
    items,
    adjustments: scored.adjustments,
    model,
    samples: draws.length,
    listLevel: listed.level,
    reasons,
  };
}
