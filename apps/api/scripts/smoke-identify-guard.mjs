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
