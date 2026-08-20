import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { env } from "../env.js";
import { readEnvRaw, SECRET_SLOTS, slotById, type SecretSlot } from "./secret-catalog.js";

/** Gitignored overlay under data/ — overrides process env for selected slots. */
export type RuntimeSecretsFile = Record<string, string | number>;

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

function effectiveString(slot: SecretSlot): string {
  const fromOverlay = overlay[slot.id];
  if (typeof fromOverlay === "string" && fromOverlay.trim()) return fromOverlay.trim();
  if (typeof fromOverlay === "number") return String(fromOverlay);
  return readEnvRaw(slot);
}

function effectiveNumber(slot: SecretSlot, fallback: number): number {
  const fromOverlay = overlay[slot.id];
  if (typeof fromOverlay === "number" && Number.isFinite(fromOverlay)) return fromOverlay;
  if (typeof fromOverlay === "string" && fromOverlay.trim()) {
    const n = Number(fromOverlay);
    if (Number.isFinite(n)) return n;
  }
  const raw = readEnvRaw(slot);
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

/** Apply overlay onto the live `env` object (imported as mutable bag). */
export function applyRuntimeSecrets() {
  overlay = readDisk();
  env.geminiApiKey = effectiveString(slotById("geminiApiKey")!);
  env.zhipuApiKey = effectiveString(slotById("zhipuApiKey")!);
  env.tokenhubApiKey = effectiveString(slotById("tokenhubApiKey")!);
  env.resendApiKey = effectiveString(slotById("resendApiKey")!);
  env.tiandituServerKey = effectiveString(slotById("tiandituServerKey")!);
  env.tiandituBrowserKey = effectiveString(slotById("tiandituBrowserKey")!);
  env.tiandituBrowserFallback = effectiveString(slotById("tiandituBrowserFallback")!);
  env.tiandituBrowserFallback2 = effectiveString(slotById("tiandituBrowserFallback2")!);
  env.geminiModel = effectiveString(slotById("geminiModel")!) || env.geminiModel;
  env.zhipuVlModel = effectiveString(slotById("zhipuVlModel")!) || env.zhipuVlModel;
  env.identifyDailyLimit = effectiveNumber(slotById("identifyDailyLimit")!, env.identifyDailyLimit);
  env.identifyConcurrency = effectiveNumber(
    slotById("identifyConcurrency")!,
    env.identifyConcurrency,
  );
}

export function getRuntimeSecretsPath(): string {
  return secretsPath;
}

function hintOf(value: string | undefined | null): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  if (v.length <= 8) return `共 ${v.length} 位（过短，不展示片段）`;
  const head = v.slice(0, 6);
  const tail = v.slice(-6);
  return `共 ${v.length} 位 · 开头 ${head} · 结尾 ${tail}`;
}

function sourceOf(slot: SecretSlot): "overlay" | "env" | "none" {
  const o = overlay[slot.id];
  if (o !== undefined && o !== null && String(o).trim() !== "") return "overlay";
  if (readEnvRaw(slot)) return "env";
  return "none";
}

/** Browser-side Tianditu key chain (主 → 备用1 → 备用2), deduped. */
export function effectiveTiandituBrowserKeys(): string[] {
  applyRuntimeSecrets();
  const chunks = [
    env.tiandituBrowserKey,
    env.tiandituBrowserFallback,
    env.tiandituBrowserFallback2,
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const chunk of chunks) {
    for (const part of chunk.split(",")) {
      const key = part.trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

export function secretsPublicView() {
  applyRuntimeSecrets();
  const live: Record<string, string | number> = {
    geminiApiKey: env.geminiApiKey,
    zhipuApiKey: env.zhipuApiKey,
    tokenhubApiKey: env.tokenhubApiKey,
    resendApiKey: env.resendApiKey,
    tiandituServerKey: env.tiandituServerKey,
    tiandituBrowserKey: env.tiandituBrowserKey,
    tiandituBrowserFallback: env.tiandituBrowserFallback,
    tiandituBrowserFallback2: env.tiandituBrowserFallback2,
    geminiModel: env.geminiModel,
    zhipuVlModel: env.zhipuVlModel,
    identifyDailyLimit: env.identifyDailyLimit,
    identifyConcurrency: env.identifyConcurrency,
  };

  const slots = SECRET_SLOTS.map((slot) => {
    if (slot.kind === "secret") {
      const value = String(live[slot.id] ?? "");
      return {
        id: slot.id,
        kind: slot.kind,
        group: slot.group,
        env: slot.env,
        configured: Boolean(value),
        hint: hintOf(value),
        source: sourceOf(slot),
      };
    }
    const value = live[slot.id];
    return {
      id: slot.id,
      kind: slot.kind,
      group: slot.group,
      env: slot.env,
      value: value ?? "",
      source: sourceOf(slot) === "none" && value !== undefined && value !== "" ? "env" : sourceOf(slot),
    };
  });

  return {
    slots,
    sessionSecretIsDefault: env.sessionSecret === "dev-change-me-to-a-long-random-string",
    mailFrom: env.mailFrom,
    appOrigin: env.appOrigin,
    httpsProxySet: Boolean(env.httpsProxy),
    gbifEnabled: env.gbifEnabled,
    identifyMock: env.identifyMock,
    devAuth: env.devAuth,
    cookieSecure: env.cookieSecure,
    overlayPath: secretsPath,
    // backward-compatible aliases used by older UI
    geminiApiKey: { configured: Boolean(env.geminiApiKey), hint: hintOf(env.geminiApiKey) },
    zhipuApiKey: { configured: Boolean(env.zhipuApiKey), hint: hintOf(env.zhipuApiKey) },
    resendApiKey: { configured: Boolean(env.resendApiKey), hint: hintOf(env.resendApiKey) },
    tiandituServerKey: {
      configured: Boolean(env.tiandituServerKey),
      hint: hintOf(env.tiandituServerKey),
    },
    identifyDailyLimit: env.identifyDailyLimit,
    identifyConcurrency: env.identifyConcurrency,
  };
}

export type SecretsPatch = {
  /** Catalog slot id */
  id: string;
  /** null/"" clears overlay for this slot (fall back to process env) */
  value: string | number | null;
};

/** Patch one slot by catalog id. */
export function patchRuntimeSecretSlot(patch: SecretsPatch): RuntimeSecretsFile {
  const slot = slotById(patch.id);
  if (!slot) throw new Error(`unknown_secret_slot:${patch.id}`);

  const next: RuntimeSecretsFile = { ...readDisk() };
  const v = patch.value;

  if (v === null || v === "") {
    delete next[slot.id];
  } else if (slot.kind === "setting" && slot.valueType === "number") {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) throw new Error("invalid_number");
    next[slot.id] = n;
  } else {
    next[slot.id] = String(v).trim();
  }

  mkdirSync(dirname(secretsPath), { recursive: true });
  writeFileSync(secretsPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  applyRuntimeSecrets();
  return next;
}

/** @deprecated multi-field patch — prefer patchRuntimeSecretSlot */
export function patchRuntimeSecrets(legacy: Record<string, string | number | null | undefined>) {
  for (const [id, value] of Object.entries(legacy)) {
    if (value === undefined) continue;
    if (!slotById(id)) continue;
    patchRuntimeSecretSlot({ id, value });
  }
  return readDisk();
}
