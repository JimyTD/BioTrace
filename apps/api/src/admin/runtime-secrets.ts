import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { env } from "../env.js";

/** Gitignored overlay under data/ — overrides process env for selected keys. */
export type RuntimeSecretsFile = {
  geminiApiKey?: string;
  zhipuApiKey?: string;
  resendApiKey?: string;
  tiandituServerKey?: string;
  geminiModel?: string;
  zhipuVlModel?: string;
  zhipuTextModel?: string;
  identifyDailyLimit?: number;
  identifyConcurrency?: number;
};

const secretsPath = resolve(dirname(env.databasePath), "admin-runtime-secrets.json");

let overlay: RuntimeSecretsFile = {};

function readDisk(): RuntimeSecretsFile {
  if (!existsSync(secretsPath)) return {};
  try {
    const raw = JSON.parse(readFileSync(secretsPath, "utf8")) as RuntimeSecretsFile;
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

/** Apply overlay onto the live `env` object (imported as mutable bag). */
export function applyRuntimeSecrets() {
  overlay = readDisk();
  if (overlay.geminiApiKey !== undefined) env.geminiApiKey = overlay.geminiApiKey;
  if (overlay.zhipuApiKey !== undefined) env.zhipuApiKey = overlay.zhipuApiKey;
  if (overlay.resendApiKey !== undefined) env.resendApiKey = overlay.resendApiKey;
  if (overlay.tiandituServerKey !== undefined) env.tiandituServerKey = overlay.tiandituServerKey;
  if (overlay.geminiModel !== undefined) env.geminiModel = overlay.geminiModel;
  if (overlay.zhipuVlModel !== undefined) env.zhipuVlModel = overlay.zhipuVlModel;
  if (overlay.zhipuTextModel !== undefined) env.zhipuTextModel = overlay.zhipuTextModel;
  if (overlay.identifyDailyLimit !== undefined) env.identifyDailyLimit = overlay.identifyDailyLimit;
  if (overlay.identifyConcurrency !== undefined) env.identifyConcurrency = overlay.identifyConcurrency;
}

export function getRuntimeSecretsPath(): string {
  return secretsPath;
}

function hintOf(value: string | undefined | null): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  if (v.length <= 4) return "****";
  return `…${v.slice(-4)}`;
}

export function secretsPublicView() {
  return {
    geminiApiKey: { configured: Boolean(env.geminiApiKey), hint: hintOf(env.geminiApiKey) },
    zhipuApiKey: { configured: Boolean(env.zhipuApiKey), hint: hintOf(env.zhipuApiKey) },
    resendApiKey: { configured: Boolean(env.resendApiKey), hint: hintOf(env.resendApiKey) },
    tiandituServerKey: {
      configured: Boolean(env.tiandituServerKey),
      hint: hintOf(env.tiandituServerKey),
    },
    geminiModel: env.geminiModel,
    zhipuVlModel: env.zhipuVlModel,
    zhipuTextModel: env.zhipuTextModel,
    identifyDailyLimit: env.identifyDailyLimit,
    identifyConcurrency: env.identifyConcurrency,
    sessionSecretIsDefault: env.sessionSecret === "dev-change-me-to-a-long-random-string",
    mailFrom: env.mailFrom,
    appOrigin: env.appOrigin,
    httpsProxySet: Boolean(env.httpsProxy),
    gbifEnabled: env.gbifEnabled,
    identifyMock: env.identifyMock,
    devAuth: env.devAuth,
    cookieSecure: env.cookieSecure,
    overlayPath: secretsPath,
  };
}

export type SecretsPatch = {
  geminiApiKey?: string | null;
  zhipuApiKey?: string | null;
  resendApiKey?: string | null;
  tiandituServerKey?: string | null;
  geminiModel?: string;
  zhipuVlModel?: string;
  zhipuTextModel?: string;
  identifyDailyLimit?: number;
  identifyConcurrency?: number;
};

/** null = clear overlay entry (fall back to process env); undefined = leave unchanged; string = set. */
export function patchRuntimeSecrets(patch: SecretsPatch): RuntimeSecretsFile {
  const next: RuntimeSecretsFile = { ...readDisk() };

  const secretKeys = [
    "geminiApiKey",
    "zhipuApiKey",
    "resendApiKey",
    "tiandituServerKey",
  ] as const;
  for (const k of secretKeys) {
    if (!(k in patch)) continue;
    const v = patch[k];
    if (v === null || v === "") delete next[k];
    else if (typeof v === "string") next[k] = v.trim();
  }

  if (patch.geminiModel !== undefined) next.geminiModel = patch.geminiModel.trim();
  if (patch.zhipuVlModel !== undefined) next.zhipuVlModel = patch.zhipuVlModel.trim();
  if (patch.zhipuTextModel !== undefined) next.zhipuTextModel = patch.zhipuTextModel.trim();
  if (patch.identifyDailyLimit !== undefined) next.identifyDailyLimit = patch.identifyDailyLimit;
  if (patch.identifyConcurrency !== undefined) {
    next.identifyConcurrency = patch.identifyConcurrency;
  }

  mkdirSync(dirname(secretsPath), { recursive: true });
  writeFileSync(secretsPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  applyRuntimeSecrets();
  return next;
}
