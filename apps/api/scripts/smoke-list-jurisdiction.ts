/**
 * 保护名录按法域判定的离线验证（不调模型、不联网）。
 *
 * 跑法：pnpm --filter @biotrace/api exec tsx scripts/smoke-list-jurisdiction.ts
 *
 * 背景：cn-protected / cn-sanyou / cn-extinct 是中国法域名录，此前不看国别，
 * 境外拍摄的物种也挂中国保护级、也吃稀有度加成。本次把「是否套用」收敛到
 * isListJurisdiction，标签、稀有度加成、灭绝门三条通道一起按国别生效。
 *
 * 覆盖：
 *   1. 国别门槛（含港澳台归一化在 geo/iso3166，本层只认传入的 alpha-2）
 *   2. 标签通道 statusTagsFrom
 *   3. 稀有度加成与灭绝门 scoreFromScale
 *   4. 对照通道：引入种告警本就看国别，不该被改坏
 */
import { lookupListed, statusTagsFrom, isListJurisdiction } from "../src/rarity/cn-status.js";
import { emptyItems, scoreFromScale } from "../src/rarity/scale-rubric.js";
import { resolveIntroducedAlert } from "../src/introduced/index.js";
import { normalizeStoredCountryCode } from "../src/settle/geo/iso3166.js";

let failed = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `\n  期望 ${e}\n  实际 ${a}`}`);
}

const PANDA = { scientificName: "Ailuropoda melanoleuca", label: "大熊猫" };

// ── 1. 国别门槛 ───────────────────────────────────────────────
check("CN 命中一级", lookupListed({ ...PANDA, countryCode: "CN" }).level, "class_i");
check("无国别按 CN", lookupListed({ ...PANDA, countryCode: null }).level, "class_i");
check("空串按 CN", lookupListed({ ...PANDA, countryCode: "" }).level, "class_i");
check("小写 cn 归 CN", lookupListed({ ...PANDA, countryCode: "cn" }).level, "class_i");
check("JP 不套名录", lookupListed({ ...PANDA, countryCode: "JP" }).level, null);
check("US 不套名录", lookupListed({ ...PANDA, countryCode: "US" }).level, null);
check("isListJurisdiction(JP)", isListJurisdiction("JP"), false);
check("isListJurisdiction(null)", isListJurisdiction(null), true);

// 港澳台：落库前已归一化成 CN；这里验证归一化确实生效，且归一后的值套名录
check("HK 归一化", normalizeStoredCountryCode("HK"), "CN");
check("TW 归一化", normalizeStoredCountryCode("TW"), "CN");
check(
  "归一后的 HK 仍套名录",
  lookupListed({ ...PANDA, countryCode: normalizeStoredCountryCode("HK") }).level,
  "class_i",
);

// 驯养豁免优先级：国内的驯养个体依旧不领名录
check(
  "CN 驯养仍豁免",
  lookupListed({ ...PANDA, countryCode: "CN", domesticated: true }).level,
  null,
);

// ── 2. 标签通道 ───────────────────────────────────────────────
check("CN 出一级标签", statusTagsFrom(lookupListed({ ...PANDA, countryCode: "CN" })), [
  "class_i",
]);
check("JP 无保护标签", statusTagsFrom(lookupListed({ ...PANDA, countryCode: "JP" })), []);

// ── 3. 稀有度加成与灭绝门 ─────────────────────────────────────
// 同一份中性量表输入，只换名录开关，隔离出名录带来的分差
const neutral = emptyItems();
const withList = { sanyou: false, extinct: false, class_i: true, class_ii: false };
const noList = { sanyou: false, extinct: false, class_i: false, class_ii: false };
const cnScored = scoreFromScale({ ...neutral }, withList);
const jpScored = scoreFromScale({ ...neutral }, noList);
console.log(`INFO 一级加成后 S=${cnScored.score}，境外应为 S=${jpScored.score}`);
check("一级确实加分（说明用例有效）", cnScored.score > jpScored.score, true);
check("境外不吃一级加成", jpScored.score, 0);

const extinctGated = scoreFromScale(
  { ...neutral },
  { sanyou: false, extinct: true, class_i: false, class_ii: false },
);
check("灭绝门在名录生效侧仍锁 XR", extinctGated.rarity, "XR");

// ── 4. 对照通道：引入种告警 ───────────────────────────────────
check(
  "引入种：无国别不告警",
  resolveIntroducedAlert({
    countryCode: null,
    finestReliableRank: "species",
    scientificName: "Ailuropoda melanoleuca",
  }).alert,
  false,
);
check(
  "引入种：有国别仍可告警",
  typeof resolveIntroducedAlert({
    countryCode: "JP",
    finestReliableRank: "species",
    scientificName: "Ailuropoda melanoleuca",
  }).alert,
  "boolean",
);

console.log(failed === 0 ? "\n全部通过" : `\n${failed} 项失败`);
process.exit(failed === 0 ? 0 : 1);
