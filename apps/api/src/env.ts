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
  /** 单张上传原图上限（字节）；相册默认传原图，防止极端文件打爆磁盘。 */
  uploadMaxBytes: Number(process.env.UPLOAD_MAX_BYTES ?? 25 * 1024 * 1024),
  httpsProxy: process.env.HTTPS_PROXY?.trim() || process.env.HTTP_PROXY?.trim() || "",
  /**
   * 天地图**服务端** key（逆地理编码用，非前端瓦片的浏览器端 key）。
   * 留空则国别判定只走离线国界数据。
   */
  tiandituServerKey: process.env.TIANDITU_SERVER_KEY?.trim() || "",
  /** On-demand GBIF occurrence counts for rarity; disable for offline/dev. */
  gbifEnabled: (process.env.GBIF_ENABLED ?? "1") === "1",
  rarityCacheTtlDays: Number(process.env.RARITY_CACHE_TTL_DAYS ?? 30),
  identifyConcurrency: Number(process.env.IDENTIFY_CONCURRENCY ?? 1),
  /** Max time to wait on a short Gemini cool-down before switching to GLM. */
  identifyGeminiWaitMaxMs: Number(process.env.IDENTIFY_GEMINI_WAIT_MAX_MS ?? 90_000),
  /** Wall-clock budget for one observation identify (wait + calls). */
  identifyJobDeadlineMs: Number(process.env.IDENTIFY_JOB_DEADLINE_MS ?? 900_000),
  /**
   * Per-account daily cap for platform-default identify calls (UTC day).
   * `0` disables the account cap (provider-side limits still apply).
   */
  identifyDailyLimit: Number(process.env.IDENTIFY_DAILY_LIMIT ?? 100),
  /**
   * When `1`, identify returns a fixed local mock and never calls cloud vision.
   * Still applies platform day-cap / BYOK switch rules — for guardrail tests.
   */
  identifyMock: (process.env.IDENTIFY_MOCK ?? "").trim() === "1",
  /** Public site origin (no trailing slash). */
  appOrigin: (process.env.APP_ORIGIN ?? "http://127.0.0.1:5173").replace(/\/$/, ""),
  resendApiKey: process.env.RESEND_API_KEY?.trim() || "",
  mailFrom: process.env.MAIL_FROM?.trim() || "BioTrace <onboarding@resend.dev>",
  /** Session cookie + token TTL (default 90 days); renewed on authenticated requests. */
  sessionTtlMs: Number(process.env.SESSION_TTL_MS ?? 90 * 24 * 60 * 60_000),
  /** Password-reset OTP TTL (default 15 minutes). */
  passwordResetTtlMs: Number(process.env.PASSWORD_RESET_TTL_MS ?? 15 * 60_000),
};
