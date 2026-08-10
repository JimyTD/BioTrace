/**
 * 天地图逆地理 + 离线兜底 smoke：
 *   pnpm --filter @biotrace/api geocode:smoke
 *
 * 无 TIANDITU_SERVER_KEY 时只跑「无 key 必须回落离线」这一段（不需要网络）；
 * 配了 key 才跑真实调用那一段（需要网络与配额，每次约 4 次调用）。
 */
import { env } from "../src/env.ts";
import { resolveCountry } from "../src/settle/country.ts";
import {
  tiandituCacheSize,
  tiandituCountryFromLatLng,
} from "../src/settle/geo/tiandituGeocode.ts";

let failed = 0;

function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failed += 1;
  console.log(`${ok ? "OK  " : "FAIL"} ${label} → ${actual}${ok ? "" : ` (expected ${expected})`}`);
}

// —— 与 key 无关：坐标非法必须直接 none，不该发起任何调用 ——
{
  const r = await resolveCountry(null, null);
  check("null coords → code", r.code, null);
  check("null coords → source", r.source, "none");
}
{
  const r = await resolveCountry(999, 999);
  check("out-of-range coords → source", r.source, "none");
}

if (!env.tiandituServerKey) {
  console.log("\nTIANDITU_SERVER_KEY 未配置：验证「无 key 时回落离线」");
  const out = await tiandituCountryFromLatLng(37.5665, 126.978);
  check("no key → ok", out.ok, false);
  check("no key → reason", out.ok ? "-" : out.reason, "no_key");

  // 兜底必须仍然给出正确答案（这是旧 bbox 实现判错的首尔）
  const r = await resolveCountry(37.5665, 126.978);
  check("Seoul via offline fallback → code", r.code, "KR");
  check("Seoul via offline fallback → source", r.source, "offline");
} else {
  console.log("\nTIANDITU_SERVER_KEY 已配置：跑真实逆地理调用");

  // 台北必须是 CN —— 官方数据本身合规，不依赖我方归一化
  const taipei = await resolveCountry(25.033, 121.5654);
  check("Taipei → code", taipei.code, "CN");
  check("Taipei → source", taipei.source, "tianditu");

  // 境外覆盖：旧 bbox 实现把这里判成 CN
  const seoul = await resolveCountry(37.5665, 126.978);
  check("Seoul → code", seoul.code, "KR");
  check("Seoul → source", seoul.source, "tianditu");

  const berlin = await resolveCountry(52.52, 13.405);
  check("Berlin → code", berlin.code, "DE");

  // 海上：status ok 但 nation 为空 → 采信 null，且来源仍是 tianditu（不是失败）
  const ocean = await resolveCountry(30, -140);
  check("Pacific Ocean → code", ocean.code, null);
  check("Pacific Ocean → source", ocean.source, "tianditu");

  // 网格缓存：同一地点微移不应产生新调用
  const before = tiandituCacheSize();
  await resolveCountry(25.0331, 121.5655);
  check("cache reused for nearby point", tiandituCacheSize(), before);
}

console.log(failed ? `\n${failed} case(s) failed` : "\nall cases passed");
process.exit(failed ? 1 : 0);
