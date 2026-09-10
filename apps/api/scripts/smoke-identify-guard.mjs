/**
 * Guardrail smoke — no cloud vision / no GLM encounter.
 *   pnpm --filter @biotrace/api identify:guard-smoke
 *
 * Covers: secret-box, day quota, mock identify shape, OpenAI URL join,
 *         BYOK switch does not consume platform quota (in-memory via service APIs).
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const dbDir = mkdtempSync(join(tmpdir(), "bt-guard-"));
process.env.IDENTIFY_MOCK = "1";
process.env.IDENTIFY_DAILY_LIMIT = "2";
process.env.SESSION_SECRET = "smoke-identify-guard-secret";
process.env.DATABASE_URL = `file:${join(dbDir, "t.db")}`;
process.env.UPLOAD_DIR = join(dbDir, "uploads");

const { migrate, db } = await import("../src/db/index.ts");
const { users } = await import("../src/db/schema.ts");
const { sealSecret, openSecret, keyHint } = await import("../src/lib/secret-box.ts");
const {
  getIdentifyQuota,
  tryConsumePlatformIdentifyQuota,
  utcDayKey,
} = await import("../src/services/identify-quota.ts");
const { updateUserIdentify, resolveUserIdentify } = await import("../src/services/user-identify.ts");
const { runIdentifyForUser } = await import("../src/identify/run.ts");
const { chatCompletionsUrl } = await import("../src/identify/openai-compatible.ts");
const { mockIdentifyResult } = await import("../src/identify/mock.ts");
const { evaluateEligibility } = await import("../src/identify/eligibility.ts");
const { emptyTaxonomy, storedDomIdentity } = await import("../src/identify/types.ts");
const { buildIdentifyPrompt, extractIdentifyJson } = await import("../src/identify/prompt.ts");

await migrate();

let failed = 0;
function check(name, ok) {
  if (ok) console.log(`ok  ${name}`);
  else {
    console.error(`FAIL ${name}`);
    failed += 1;
  }
}

// secret-box
const sealed = sealSecret("sk-test-abcdef", process.env.SESSION_SECRET);
check("seal roundtrip", openSecret(sealed, process.env.SESSION_SECRET) === "sk-test-abcdef");
check("key hint", keyHint("sk-test-abcdef") === "cdef");

// URL join
check("url append", chatCompletionsUrl("https://api.openai.com/v1") === "https://api.openai.com/v1/chat/completions");
check(
  "url idempotent",
  chatCompletionsUrl("https://x/v1/chat/completions") === "https://x/v1/chat/completions",
);

// mock shape
const mock = mockIdentifyResult({ imagePath: "/x", mimeType: "image/jpeg" });
check("mock collectible", mock.eligibility === "collectible" && mock.finest_reliable_rank === "species");
check("mock wild sparrow", mock.domesticated === false && mock.breed_zh === null);

{
  const prompt = buildIdentifyPrompt({ imagePath: "/x", mimeType: "image/jpeg" });
  check("prompt body-only", prompt.includes("只看生物本体"));
  check("prompt forbids collar", prompt.includes("项圈") && prompt.includes("牵引绳"));
  const stray = extractIdentifyJson(
    JSON.stringify({
      subject_kind: "living_organism",
      subject_living: true,
      eligibility: "collectible",
      common_name_zh: "家犬",
      scientific_name: "Canis lupus familiaris",
      taxonomy: { kingdom: { name_la: "Animalia", name_zh: "动物界" } },
      confidence_0_to_1: 0.9,
      finest_reliable_rank: "species",
      blurb_zh: "x",
      notes: "",
      domesticated: true,
      breed_zh: null,
      dom_evidence_zh: "L1:家犬垂耳与吻部",
    }),
  );
  check("parse stray dog", stray.domesticated === true && stray.breed_zh === null);
  check("store stray dog", storedDomIdentity(stray).domesticated === true);
  const missing = extractIdentifyJson(JSON.stringify({ common_name_zh: "狼", scientific_name: "Canis lupus" }));
  check("parse missing dom", missing.domesticated === null);
  check("fold missing to wild", storedDomIdentity(missing).domesticated === false);
  const wild = extractIdentifyJson(
    JSON.stringify({
      common_name_zh: "狼",
      scientific_name: "Canis lupus",
      domesticated: false,
      breed_zh: "哈士奇",
      dom_evidence_zh: "L1:狼的吻部与耳形",
    }),
  );
  check("strip breed if wild", wild.breed_zh === null && wild.domesticated === false);
}

{
  const clean = { ...mock, blurb_zh: "麻雀常见于城市。", notes: "" };
  check("kingdom ok", evaluateEligibility(clean).ok === true);
  const noKingdom = {
    ...clean,
    taxonomy: { ...emptyTaxonomy(), species: { name_la: "Passer montanus", name_zh: "树麻雀" } },
  };
  const gate = evaluateEligibility(noKingdom);
  check("no kingdom blocked", gate.ok === false && gate.code === "identify_no_kingdom");
}

// soft encounter: depiction/specimen with identity + kingdom → soft pass
{
  const taxonomy = emptyTaxonomy();
  taxonomy.kingdom = { name_la: "Animalia", name_zh: "动物界" };
  taxonomy.species = { name_la: "Bos taurus", name_zh: "牛" };

  const depiction = {
    ...mock,
    subject_kind: "depiction_or_media",
    eligibility: "not_collectible",
    ineligibility_reason_zh: "画布上的真牛，非野外相遇",
    common_name_zh: "牛",
    scientific_name: "Bos taurus",
    taxonomy,
  };
  const g1 = evaluateEligibility(depiction);
  check(
    "soft depiction pass",
    g1.ok === true && "soft" in g1 && g1.soft.kind === "depiction_or_media",
  );

  const specimen = {
    ...depiction,
    subject_kind: "specimen",
    ineligibility_reason_zh: "馆藏标本，非野外相遇",
  };
  const g2 = evaluateEligibility(specimen);
  check(
    "soft specimen pass",
    g2.ok === true && "soft" in g2 && g2.soft.kind === "specimen",
  );

  // 无身份（名字全空）→ 照旧拦死 identify_not_living
  const noName = { ...depiction, common_name_zh: "", scientific_name: "" };
  const g3 = evaluateEligibility(noName);
  check(
    "soft no identity blocked",
    g3.ok === false && g3.code === "identify_not_living",
  );

  // 无界 → 照旧拦死
  const noK = { ...depiction, taxonomy: emptyTaxonomy() };
  const g4 = evaluateEligibility(noK);
  check(
    "soft no kingdom blocked",
    g4.ok === false && g4.code === "identify_not_living",
  );

  // 玩具（artifact_or_toy）即使带名字也拦死，不走软档
  const toy = {
    ...depiction,
    subject_kind: "artifact_or_toy",
    ineligibility_reason_zh: "玩具模型",
  };
  const g5 = evaluateEligibility(toy);
  check(
    "toy still blocked",
    g5.ok === false && g5.code === "identify_not_living",
  );
}

// 议题3回归（2026-09-10）：翻盘只看结论字段，不扫科普描述
{
  const catTaxonomy = emptyTaxonomy();
  catTaxonomy.kingdom = { name_la: "Animalia", name_zh: "动物界" };
  catTaxonomy.species = { name_la: "Felis catus", name_zh: "家猫" };

  const livingCat = {
    ...mock,
    subject_kind: "living_organism",
    eligibility: "collectible",
    common_name_zh: "布偶猫",
    scientific_name: "Felis catus",
    taxonomy: catTaxonomy,
    ineligibility_reason_zh: "",
  };

  // 1. 家养布偶猫：名字含「布偶」但它是真实猫品种，必须放行
  const ragdoll = {
    ...livingCat,
    blurb_zh: "布偶猫（Ragdoll）是人工选育的宠物猫品种，以身体松弛如“布偶”著称。",
  };
  check("ragdoll cat passes", evaluateEligibility(ragdoll).ok === true);

  // 2. 描述里提到玩具的真猫：主体是活猫，不能因为画面里有玩具就被推翻
  const catWithToyInBlurb = {
    ...livingCat,
    common_name_zh: "家猫",
    blurb_zh: "图中这只长毛黑猫正趴在地面，背上还趴着一个狐獴造型的玩具。",
    notes: "猫背上有玩具。",
  };
  check("cat with toy in blurb passes", evaluateEligibility(catWithToyInBlurb).ok === true);

  // 3. 名字本身就是器物、且模型没给界 → 仍要拦住（翻盘该起作用的场景）
  const plushBear = {
    ...livingCat,
    subject_kind: "living_organism",
    common_name_zh: "毛绒玩具熊",
    blurb_zh: "这是一只熊。",
    taxonomy: emptyTaxonomy(),
  };
  const pbGate = evaluateEligibility(plushBear);
  check(
    "plush toy name still blocked",
    pbGate.ok === true && "keepsake" in pbGate && pbGate.keepsake.kind === "artifact_or_toy",
  );

  // 4. 保险 B：模型给了界（kingdom 非空）→ 代码无权翻盘，直接放行
  const plushWithKingdom = { ...plushBear, taxonomy: catTaxonomy };
  const pkGate = evaluateEligibility(plushWithKingdom);
  check(
    "kingdom present blocks override",
    pkGate.ok === true && !("keepsake" in pkGate),
  );

  // 5. 保险 A：翻盘时留痕，能还原是谁改的、命中了哪个词
  check(
    "override recorded",
    pbGate.ok === true &&
      "keepsake" in pbGate &&
      pbGate.keepsake.override?.from === "living_organism" &&
      pbGate.keepsake.override?.to === "artifact_or_toy" &&
      pbGate.keepsake.override?.hit === "毛绒",
  );

  // 6. 未被翻盘时不留痕
  check(
    "no override when clean",
    evaluateEligibility(ragdoll).ok === true &&
      !("keepsake" in evaluateEligibility(ragdoll) &&
        evaluateEligibility(ragdoll).keepsake?.override),
  );
}

const userId = randomUUID();
await db.insert(users).values({
  id: userId,
  email: `guard-${userId.slice(0, 8)}@test.local`,
  passwordHash: "x",
  displayName: "guard",
  createdAt: new Date(),
});

// platform quota: 2 then exhaust
check("quota start", (await getIdentifyQuota(userId)).used === 0);
check("consume 1", await tryConsumePlatformIdentifyQuota(userId));
check("consume 2", await tryConsumePlatformIdentifyQuota(userId));
check("consume 3 blocked", !(await tryConsumePlatformIdentifyQuota(userId)));
check("quota used 2", (await getIdentifyQuota(userId)).used === 2);
check("day utc", (await getIdentifyQuota(userId)).day === utcDayKey());

// mock identify on platform path should also be blocked when exhausted
let blocked = false;
try {
  await runIdentifyForUser(userId, {
    imagePath: join(tmpdir(), "nope.jpg"),
    mimeType: "image/jpeg",
  });
} catch (e) {
  blocked = e instanceof Error && e.message === "identify_daily_limit";
}
check("mock+platform blocked at cap", blocked);

// BYOK switch: no platform consume; incomplete → error; mock ready → ok
await updateUserIdentify(userId, {
  useOwnKey: true,
  baseUrl: "https://example.com/v1",
  model: "fake-vision",
  apiKey: "sk-user-9999",
});
const resolved = await resolveUserIdentify(userId);
check("byok ready", resolved.useOwnKey && resolved.ready && resolved.creds?.apiKey === "sk-user-9999");

const before = (await getIdentifyQuota(userId)).used;
const tmp = mkdtempSync(join(tmpdir(), "bt-img-"));
const img = join(tmp, "a.jpg");
writeFileSync(img, Buffer.from([0xff, 0xd8, 0xff, 0xd9])); // minimal jpeg-ish
const out = await runIdentifyForUser(userId, { imagePath: img, mimeType: "image/jpeg" });
check("byok mock ok", out.provider === "mock" && out.result.common_name_zh.includes("假识图"));
check("byok did not consume", (await getIdentifyQuota(userId)).used === before);

await updateUserIdentify(userId, { clearKey: true });
let incomplete = false;
try {
  await runIdentifyForUser(userId, { imagePath: img, mimeType: "image/jpeg" });
} catch (e) {
  incomplete = e instanceof Error && e.message === "identify_user_key_incomplete";
}
check("byok incomplete", incomplete);

await updateUserIdentify(userId, { useOwnKey: false });
check("switch off", !(await resolveUserIdentify(userId)).useOwnKey);

rmSync(tmp, { recursive: true, force: true });
// Windows may keep the SQLite handle briefly; ignore cleanup errors.
try {
  rmSync(dbDir, { recursive: true, force: true });
} catch {
  /* ignore */
}

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall ok");
process.exit(0);
