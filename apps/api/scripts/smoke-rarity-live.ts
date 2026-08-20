/**
 * 端到端冒烟：真调 TokenHub 走一遍生产稀有度路径，确认链路通、缓存写得进、名录闸不调模型。
 * 会写本地 dev 库的 rarity_cache。花费很小（灭绝种 0 次调用，普通物种 3 次起）。
 *
 *   node node_modules/tsx/dist/cli.mjs scripts/smoke-rarity-live.ts
 */
import { env } from "../src/env.js";
import { migrate } from "../src/db/index.js";
import { resolveScaleRarity, scaleCacheKey } from "../src/rarity/scale.js";

const CASES = [
  { label: "白鲟", scientificName: "Psephurus gladius", rank: "species", expect: "灭绝名录 → XR，0 次调用" },
  { label: "乌鸫", scientificName: "Turdus mandarinus", rank: "species", expect: "常见野鸟" },
  { label: "大熊猫", scientificName: "Ailuropoda melanoleuca", rank: "species", expect: "一级保护 → 高档" },
];

async function main() {
  await migrate();
  console.log(`模型链: ${env.rarityTextModels.join(" → ")}`);
  console.log(
    `采样 ${env.raritySamples}（贴界 ±${env.rarityEdgeMargin} 补到 ${env.rarityEdgeSamples}）· thinking=${env.rarityThinking ? "on" : "off"}\n`,
  );

  for (const c of CASES) {
    const key = scaleCacheKey("CN", c.scientificName);
    const t0 = Date.now();
    const r = await resolveScaleRarity({
      taxonKey: c.scientificName,
      countryCode: "CN",
      label: c.label,
      scientificName: c.scientificName,
      finestReliableRank: c.rank,
      skipCache: true,
    });
    const ms = Date.now() - t0;
    console.log(
      `${c.label}  ${r.rarity}  S=${r.score ?? "-"}  source=${r.source}  ` +
        `model=${r.model || "-"}  采样=${r.samples}  list=${r.listLevel ?? "-"}  ${ms}ms`,
    );
    if (r.adjustments.length) console.log(`   加减: ${r.adjustments.join(", ")}`);
    if (r.items) {
      const compact = Object.entries(r.items)
        .map(([k, v]) => `${k}=${v === true ? "T" : v === false ? "F" : "?"}`)
        .join(" ");
      console.log(`   ${compact}`);
    }

    // 再来一次，这次不跳缓存：应命中 cache 且不再调模型。
    const t1 = Date.now();
    const again = await resolveScaleRarity({
      taxonKey: c.scientificName,
      countryCode: "CN",
      label: c.label,
      scientificName: c.scientificName,
      finestReliableRank: c.rank,
    });
    const hit = again.source === "cache" || again.source === "list";
    console.log(
      `   缓存复查: ${again.rarity} source=${again.source} ${Date.now() - t1}ms ${hit ? "OK" : "未命中!"}  key=${key}`,
    );
    if (again.rarity !== r.rarity) console.log(`   !! 档位不一致: ${r.rarity} vs ${again.rarity}`);
    console.log(`   期望: ${c.expect}\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
