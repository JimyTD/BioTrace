import { config } from "dotenv";
import { resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const apiRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
config({ path: resolve(apiRoot, ".env") });
config({ path: resolve(apiRoot, "../../.env") });

function resolvePath(p: string): string {
  return isAbsolute(p) ? p : resolve(apiRoot, p);
}

const databaseUrlRaw = process.env.DATABASE_URL ?? "file:../../data/biotrace.db";
const databasePath = databaseUrlRaw.startsWith("file:")
  ? resolvePath(databaseUrlRaw.slice("file:".length))
  : resolvePath(databaseUrlRaw);

const uploadDir = resolvePath(process.env.UPLOAD_DIR ?? "../../data/uploads");

mkdirSync(resolve(databasePath, ".."), { recursive: true });
mkdirSync(uploadDir, { recursive: true });

function parseCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN?.trim();
  if (!raw) {
    return ["http://127.0.0.1:5173", "http://localhost:5173"];
  }
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseCookieSecure(): boolean {
  const v = (process.env.COOKIE_SECURE ?? "").trim().toLowerCase();
  if (v === "0" || v === "false") return false;
  if (v === "1" || v === "true") return true;
  return process.env.NODE_ENV === "production";
}

export const env = {
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? "127.0.0.1",
  sessionSecret: process.env.SESSION_SECRET ?? "dev-change-me-to-a-long-random-string",
  devAuth: (process.env.DEV_AUTH ?? "1") === "1",
  corsOrigins: parseCorsOrigins(),
  /** Set COOKIE_SECURE=1 behind HTTPS; defaults true when NODE_ENV=production. */
  cookieSecure: parseCookieSecure(),
  databaseUrl: `file:${databasePath}`,
  databasePath,
  uploadDir,
  geminiApiKey: process.env.GEMINI_API_KEY?.trim() || "",
  geminiModel: process.env.GEMINI_MODEL?.trim() || "gemini-flash-latest",
  zhipuApiKey: process.env.ZHIPU_API_KEY?.trim() || "",
  zhipuVlModel: process.env.ZHIPU_VL_MODEL?.trim() || "glm-4v-flash",
  /** Text model for encounter-class rarity (not vision). */
  zhipuTextModel: process.env.ZHIPU_TEXT_MODEL?.trim() || "glm-4-flash",
  zhipuBaseUrl: process.env.ZHIPU_BASE_URL?.trim() || "https://open.bigmodel.cn/api/paas/v4",
  displayMaxEdge: Number(process.env.DISPLAY_MAX_EDGE ?? 1600),
  httpsProxy: process.env.HTTPS_PROXY?.trim() || process.env.HTTP_PROXY?.trim() || "",
  /** On-demand GBIF occurrence counts for rarity; disable for offline/dev. */
  gbifEnabled: (process.env.GBIF_ENABLED ?? "1") === "1",
  rarityCacheTtlDays: Number(process.env.RARITY_CACHE_TTL_DAYS ?? 30),
  identifyConcurrency: Number(process.env.IDENTIFY_CONCURRENCY ?? 1),
  /** Max time to wait on a short Gemini cool-down before switching to GLM. */
  identifyGeminiWaitMaxMs: Number(process.env.IDENTIFY_GEMINI_WAIT_MAX_MS ?? 90_000),
  /** Wall-clock budget for one observation identify (wait + calls). */
  identifyJobDeadlineMs: Number(process.env.IDENTIFY_JOB_DEADLINE_MS ?? 900_000),
  /** Public site origin for magic links and post-login redirect (no trailing slash). */
  appOrigin: (process.env.APP_ORIGIN ?? "http://127.0.0.1:5173").replace(/\/$/, ""),
  resendApiKey: process.env.RESEND_API_KEY?.trim() || "",
  mailFrom: process.env.MAIL_FROM?.trim() || "BioTrace <onboarding@resend.dev>",
  magicLinkTtlMs: Number(process.env.MAGIC_LINK_TTL_MS ?? 15 * 60_000),
  /**
   * Grace window after a magic-link token is first consumed during which the same
   * token still logs in. Absorbs email-client link prefetch/scanning (e.g. QQ Mail)
   * that consumes the token before the real user click. Token stays effectively
   * one-time; the window is short and does not extend on reuse.
   */
  magicLinkConsumeGraceMs: Number(process.env.MAGIC_LINK_CONSUME_GRACE_MS ?? 60_000),
};
