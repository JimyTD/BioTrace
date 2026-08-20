import { config } from "dotenv";
import { resolve, isAbsolute, dirname, join } from "node:path";
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
const androidReleaseDir = resolvePath(
  process.env.ANDROID_RELEASE_DIR ?? join(dirname(databasePath), "android-release"),
);

mkdirSync(resolve(databasePath, ".."), { recursive: true });
mkdirSync(uploadDir, { recursive: true });
mkdirSync(androidReleaseDir, { recursive: true });

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

const RARITY_MODEL_CHAIN_DEFAULT = ["glm-5.3", "glm-5.2", "kimi-k3", "glm-5.1"];

function parseModelChain(): string[] {
  const raw = process.env.RARITY_TEXT_MODELS?.trim();
  if (!raw) return RARITY_MODEL_CHAIN_DEFAULT;
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : RARITY_MODEL_CHAIN_DEFAULT;
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
  /** 侧载 APK 发布目录：仅保留最新 BioTrace.apk + latest.json。 */
  androidReleaseDir,
  geminiApiKey: process.env.GEMINI_API_KEY?.trim() || "",
  geminiModel: process.env.GEMINI_MODEL?.trim() || "gemini-flash-latest",
  zhipuApiKey: process.env.ZHIPU_API_KEY?.trim() || "",
  zhipuVlModel: process.env.ZHIPU_VL_MODEL?.trim() || "glm-4v-flash",
  /** Text model for encounter-class rarity (not vision). */
  zhipuTextModel: process.env.ZHIPU_TEXT_MODEL?.trim() || "glm-4-flash-250414",
  zhipuBaseUrl: process.env.ZHIPU_BASE_URL?.trim() || "https://open.bigmodel.cn/api/paas/v4",
  /** TokenHub 在线推理（稀有度量表 + 标定脚本）。Coding Plan / Token Plan 的套餐 Key 不能用于脚本。 */
  tokenhubApiKey: process.env.TOKENHUB_API_KEY?.trim() || "",
  tokenhubBaseUrl: process.env.TOKENHUB_BASE_URL?.trim() || "https://tokenhub.tencentmaas.com/v1",
  /**
   * 稀有度量表的模型优先级链（TokenHub 单 key，只换模型名）。
   * 按序试，某档配额耗尽/鉴权失败就打冷却降到下一档；生效模型名会写进缓存供事后复核。
   */
  rarityTextModels: parseModelChain(),
  /** 每物种采样次数。一次采样 = 3 批调用。 */
  raritySamples: Number(process.env.RARITY_SAMPLES ?? 1),
  /** 得分离档位界不超过这个距离就补采样到 rarityEdgeSamples，别让一道噪声题决定档位。 */
  rarityEdgeMargin: Number(process.env.RARITY_EDGE_MARGIN ?? 0.2),
  rarityEdgeSamples: Number(process.env.RARITY_EDGE_SAMPLES ?? 3),
  /** 量表题只要判断不要推理链；开 thinking 在免费档极易撞限流。 */
  rarityThinking: (process.env.RARITY_THINKING ?? "").trim() === "1",
  /** 同一物种相邻两批之间的间隔，避开免费档约 1 req/s 的限制。 */
  rarityCallDelayMs: Number(process.env.RARITY_CALL_DELAY_MS ?? 1200),
  displayMaxEdge: Number(process.env.DISPLAY_MAX_EDGE ?? 1600),
  /** 单张上传原图上限（字节）；相册默认传原图，防止极端文件打爆磁盘。 */
  uploadMaxBytes: Number(process.env.UPLOAD_MAX_BYTES ?? 25 * 1024 * 1024),
  httpsProxy: process.env.HTTPS_PROXY?.trim() || process.env.HTTP_PROXY?.trim() || "",
  /**
   * 天地图**服务端** key（逆地理编码用，非前端瓦片的浏览器端 key）。
   * 留空则国别判定只走离线国界数据。
   */
  tiandituServerKey: process.env.TIANDITU_SERVER_KEY?.trim() || "",
  /**
   * 天地图**浏览器端** key 链（瓦片）。可由 admin overlay 覆盖；
   * 也认 VITE_TIANDITU_*（便于与前端构建环境同名）。
   */
  tiandituBrowserKey:
    process.env.TIANDITU_BROWSER_KEY?.trim() || process.env.VITE_TIANDITU_KEY?.trim() || "",
  tiandituBrowserFallback:
    process.env.TIANDITU_BROWSER_KEY_FALLBACK?.trim() ||
    process.env.VITE_TIANDITU_KEY_FALLBACK?.trim() ||
    "",
  tiandituBrowserFallback2:
    process.env.TIANDITU_BROWSER_KEY_FALLBACK_2?.trim() ||
    process.env.VITE_TIANDITU_KEY_FALLBACK_2?.trim() ||
    "",
  /** On-demand GBIF occurrence counts for rarity; disable for offline/dev. */
  gbifEnabled: (process.env.GBIF_ENABLED ?? "1") === "1",
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
  /** Seed first admin when `admin_users` is empty (username + password ≥ 8). */
  adminBootstrapUsername: (process.env.ADMIN_BOOTSTRAP_USERNAME ?? "").trim(),
  adminBootstrapPassword: process.env.ADMIN_BOOTSTRAP_PASSWORD ?? "",
};
