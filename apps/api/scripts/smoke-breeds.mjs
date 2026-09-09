/**
 * 品种纠偏三刀（catalog / discard / free）。
 *   pnpm --filter @biotrace/api breeds:smoke
 */
import { displayBreedLabel, resolveBreed } from "../src/pets/breeds.ts";

let fail = 0;
function check(name, ok) {
  console.log(`${ok ? "OK" : "FAIL"} ${name}`);
  if (!ok) fail += 1;
}

function kindOf(taxon, zh) {
  return resolveBreed(taxon, zh).kind;
}

function catalogId(taxon, zh) {
  const r = resolveBreed(taxon, zh);
  return r.kind === "catalog" ? r.breed.id : null;
}

function freeZh(taxon, zh) {
  const r = resolveBreed(taxon, zh);
  return r.kind === "free" ? r.zh : null;
}

const CAT = "Felis catus";
const DOG = "Canis lupus";
const COW = "Bos taurus";
const COW_ZEBU = "Bos indicus";

check("英短 → 英国短毛猫", catalogId(CAT, "英短") === "british-shorthair");
check("英国短毛猫 → 英国短毛猫", catalogId(CAT, "英国短毛猫") === "british-shorthair");
check("British Shorthair → 英国短毛猫", catalogId(CAT, "British Shorthair") === "british-shorthair");
check("英国短毛 → 英国短毛猫（唯一包含）", catalogId(CAT, "英国短毛") === "british-shorthair");
check("金渐层猫 → 金渐层", catalogId(CAT, "金渐层猫") === "golden-shaded");
check("金渐层不是银渐层", catalogId(CAT, "金渐层") === "golden-shaded");
check("短毛 → 不进库，不强行猜", kindOf(CAT, "短毛") === "free" && freeZh(CAT, "短毛") === "短毛");
check("狸花 → 排除", kindOf(CAT, "狸花") === "discard");
check("橘猫 → 排除", kindOf(CAT, "橘猫") === "discard");
check("空 → 无品种", kindOf(CAT, "") === "empty" && kindOf(CAT, null) === "empty");
check("品种不详四字也排除", kindOf(CAT, "品种不详") === "discard");
check("未确定四字也排除", kindOf(CAT, "未确定") === "discard");
check("家猫 → 排除", kindOf(CAT, "家猫") === "discard");
check("串串 → 排除", kindOf(CAT, "串串") === "discard");
check("田园猫 → 排除", kindOf(CAT, "田园猫") === "discard");
check("奥特曼 → 保留原文", kindOf(CAT, "奥特曼") === "free" && freeZh(CAT, "奥特曼") === "奥特曼");

check("田园犬 → 中华田园犬", catalogId(DOG, "田园犬") === "chinese-rural");
check("土狗 → 中华田园犬", catalogId(DOG, "土狗") === "chinese-rural");
check("金毛 → 金毛寻回犬", catalogId(DOG, "金毛") === "golden-retriever");
check("泰迪 → 贵宾犬", catalogId(DOG, "泰迪") === "poodle");
check("家犬 → 排除", kindOf(DOG, "家犬") === "discard");

check("荷斯坦 → 标准名（扩库后）", catalogId(COW, "荷斯坦") === "holstein");
check("瘤牛键也能对上荷斯坦", catalogId(COW_ZEBU, "荷斯坦") === "holstein");
check("家牛 → 排除", kindOf(COW, "家牛") === "discard");
check("奶牛 → 排除", kindOf(COW, "奶牛") === "discard");

check("展示：英短 → 英国短毛猫", displayBreedLabel(CAT, "英短") === "英国短毛猫");
check("展示：狸花不写品种", displayBreedLabel(CAT, "狸花") === null);
check("展示：空不写品种", displayBreedLabel(CAT, "") === null);
check("展示：奥特曼保留原文", displayBreedLabel(CAT, "奥特曼") === "奥特曼");

if (fail) {
  console.error(`FAIL ${fail}`);
  process.exit(1);
}
console.log("OK all");
