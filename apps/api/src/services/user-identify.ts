import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { env } from "../env.js";
import { keyHint, openSecret, sealSecret } from "../lib/secret-box.js";
import type { OpenAICompatibleCreds } from "../identify/openai-compatible.js";

export type UserIdentifyPublic = {
  useOwnKey: boolean;
  hasKey: boolean;
  keyHint: string | null;
  baseUrl: string | null;
  model: string | null;
  ready: boolean;
};

export type UserIdentifyResolved = {
  useOwnKey: boolean;
  ready: boolean;
  creds: OpenAICompatibleCreds | null;
};

function normalizeBaseUrl(raw: string | null | undefined): string | null {
  const t = raw?.trim() ?? "";
  return t ? t.replace(/\/+$/, "") : null;
}

function normalizeModel(raw: string | null | undefined): string | null {
  const t = raw?.trim() ?? "";
  return t || null;
}

export async function getUserIdentifyPublic(userId: string): Promise<UserIdentifyPublic> {
  const row = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      identifyUseOwnKey: true,
      identifyUserKeyEnc: true,
      identifyUserKeyHint: true,
      identifyUserBaseUrl: true,
      identifyUserModel: true,
    },
  });
  const hasKey = Boolean(row?.identifyUserKeyEnc);
  const baseUrl = row?.identifyUserBaseUrl ?? null;
  const model = row?.identifyUserModel ?? null;
  const useOwnKey = Boolean(row?.identifyUseOwnKey);
  return {
    useOwnKey,
    hasKey,
    keyHint: row?.identifyUserKeyHint ?? null,
    baseUrl,
    model,
    ready: useOwnKey && hasKey && Boolean(baseUrl?.trim()) && Boolean(model?.trim()),
  };
}

export async function resolveUserIdentify(userId: string): Promise<UserIdentifyResolved> {
  const row = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      identifyUseOwnKey: true,
      identifyUserKeyEnc: true,
      identifyUserBaseUrl: true,
      identifyUserModel: true,
    },
  });
  const useOwnKey = Boolean(row?.identifyUseOwnKey);
  if (!useOwnKey) {
    return { useOwnKey: false, ready: false, creds: null };
  }
  const baseUrl = normalizeBaseUrl(row?.identifyUserBaseUrl);
  const model = normalizeModel(row?.identifyUserModel);
  const enc = row?.identifyUserKeyEnc?.trim() || "";
  if (!enc || !baseUrl || !model) {
    return { useOwnKey: true, ready: false, creds: null };
  }
  try {
    const apiKey = openSecret(enc, env.sessionSecret).trim();
    if (!apiKey) return { useOwnKey: true, ready: false, creds: null };
    return { useOwnKey: true, ready: true, creds: { baseUrl, apiKey, model } };
  } catch {
    return { useOwnKey: true, ready: false, creds: null };
  }
}

export type UpdateUserIdentifyInput = {
  useOwnKey?: boolean;
  apiKey?: string | null;
  baseUrl?: string | null;
  model?: string | null;
  clearKey?: boolean;
};

export async function updateUserIdentify(
  userId: string,
  patch: UpdateUserIdentifyInput,
): Promise<UserIdentifyPublic> {
  const current = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      identifyUseOwnKey: true,
      identifyUserKeyEnc: true,
      identifyUserKeyHint: true,
      identifyUserBaseUrl: true,
      identifyUserModel: true,
    },
  });
  if (!current) throw new Error("user not found");

  const next: {
    identifyUseOwnKey?: boolean;
    identifyUserKeyEnc?: string | null;
    identifyUserKeyHint?: string | null;
    identifyUserBaseUrl?: string | null;
    identifyUserModel?: string | null;
  } = {};

  if (patch.useOwnKey !== undefined) {
    next.identifyUseOwnKey = patch.useOwnKey;
  }
  if (patch.clearKey) {
    next.identifyUserKeyEnc = null;
    next.identifyUserKeyHint = null;
  } else if (patch.apiKey != null && patch.apiKey.trim()) {
    const key = patch.apiKey.trim();
    next.identifyUserKeyEnc = sealSecret(key, env.sessionSecret);
    next.identifyUserKeyHint = keyHint(key);
  }
  if (patch.baseUrl !== undefined) {
    next.identifyUserBaseUrl = normalizeBaseUrl(patch.baseUrl);
  }
  if (patch.model !== undefined) {
    next.identifyUserModel = normalizeModel(patch.model);
  }

  if (Object.keys(next).length) {
    await db.update(users).set(next).where(eq(users.id, userId));
  }
  return getUserIdentifyPublic(userId);
}

/** Platform day-cap applies only when the user is not on the own-key path. */
export async function usesOwnIdentifyKey(userId: string): Promise<boolean> {
  const row = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { identifyUseOwnKey: true },
  });
  return Boolean(row?.identifyUseOwnKey);
}
