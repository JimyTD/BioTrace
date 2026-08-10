/**
 * 离线国别判定 smoke（无DB）：
 *   pnpm --filter @biotrace/api exec tsx scripts/smoke-country.mjs
 *
 * 用途：验证 TopoJSON 解码 + 点在多边形 + 台港澳归一化是否正确。
 * 上半部分的六个城市在旧的手写 bbox 实现下全部判错，是本次修复的核心回归用例。
 */
import { countryFromLatLng } from "../src/settle/country.ts";
import { offlineCountryDataSize } from "../src/settle/geo/offlineCountry.ts";

const size = offlineCountryDataSize();
console.log(`decoded countries: ${size}`);
if (size < 150) {
  console.error(`FAIL expected >=150 countries, got ${size}`);
  process.exit(1);
}

/** [名称, lat, lng, 期望 alpha-2 或 null] */
const cases = [
  // 旧实现全部错判为 CN（新德里/清迈/河内/福冈/首尔）或 MY（新加坡）
  ["Seoul", 37.5665, 126.978, "KR"],
  ["Fukuoka", 33.5904, 130.4017, "JP"],
  ["Hanoi", 21.0285, 105.8542, "VN"],
  ["Chiang Mai", 18.7883, 98.9853, "TH"],
  ["New Delhi", 28.6139, 77.209, "IN"],
  ["Singapore", 1.3521, 103.8198, "SG"],

  // 归一化：台港澳 → CN
  ["Taipei", 25.033, 121.5654, "CN"],
  ["Hong Kong", 22.3193, 114.1694, "CN"],
  ["Macao", 22.1987, 113.5439, "CN"],

  // 境内基准
  ["Beijing", 39.9042, 116.4074, "CN"],
  ["Urumqi", 43.8256, 87.6168, "CN"],

  // 边境城市：应判本国，不得落到邻国
  ["Dandong (CN/KP border)", 40.1292, 124.3944, "CN"],
  ["Ruili (CN/MM border)", 24.0128, 97.8517, "CN"],

  // 其他大洲抽样
  ["Berlin", 52.52, 13.405, "DE"],
  ["London", 51.5072, -0.1276, "GB"],
  ["New York", 40.7128, -74.006, "US"],
  ["Sydney", -33.8688, 151.2093, "AU"],
  ["Nairobi", -1.2864, 36.8172, "KE"],
  ["Sao Paulo", -23.5505, -46.6333, "BR"],

  // 无陆地归属 → null，走「无国别」降级
  ["Pacific Ocean", 30.0, -140.0, null],
  ["Atlantic Ocean", 0.0, -30.0, null],

  // 非法输入
  ["null coords", null, null, null],
];

let fail = 0;
for (const [name, lat, lng, expect] of cases) {
  const got = countryFromLatLng(lat, lng);
  const ok = got === expect;
  console.log(`${ok ? "OK  " : "FAIL"} ${name} → ${got ?? "null"}${ok ? "" : ` (expected ${expect ?? "null"})`}`);
  if (!ok) fail += 1;
}

console.log(fail ? `\n${fail} case(s) failed` : "\nall cases passed");
process.exit(fail ? 1 : 0);
