/**
 * Platform secret / setting slots for Admin.
 * Add new rows here when keys grow — UI is catalog-driven (dropdown).
 */
export type SecretSlotKind = "secret" | "setting";

export type SecretSlot = {
  id: string;
  /** Primary process.env name */
  env: string;
  /** Alternate env names (e.g. VITE_* aliases) */
  envAliases?: string[];
  kind: SecretSlotKind;
  /** Group for UI */
  group: "identify" | "mail" | "tianditu" | "quota" | "model";
  /** value type for settings */
  valueType?: "string" | "number";
};

export const SECRET_SLOTS: readonly SecretSlot[] = [
  {
    id: "geminiApiKey",
    env: "GEMINI_API_KEY",
    kind: "secret",
    group: "identify",
  },
  {
    id: "zhipuApiKey",
    env: "ZHIPU_API_KEY",
    kind: "secret",
    group: "identify",
  },
  {
    id: "resendApiKey",
    env: "RESEND_API_KEY",
    kind: "secret",
    group: "mail",
  },
  {
    id: "tiandituServerKey",
    env: "TIANDITU_SERVER_KEY",
    kind: "secret",
    group: "tianditu",
  },
  {
    id: "tiandituBrowserKey",
    env: "TIANDITU_BROWSER_KEY",
    envAliases: ["VITE_TIANDITU_KEY"],
    kind: "secret",
    group: "tianditu",
  },
  {
    id: "tiandituBrowserFallback",
    env: "TIANDITU_BROWSER_KEY_FALLBACK",
    envAliases: ["VITE_TIANDITU_KEY_FALLBACK"],
    kind: "secret",
    group: "tianditu",
  },
  {
    id: "tiandituBrowserFallback2",
    env: "TIANDITU_BROWSER_KEY_FALLBACK_2",
    envAliases: ["VITE_TIANDITU_KEY_FALLBACK_2"],
    kind: "secret",
    group: "tianditu",
  },
  {
    id: "geminiModel",
    env: "GEMINI_MODEL",
    kind: "setting",
    group: "model",
    valueType: "string",
  },
  {
    id: "zhipuVlModel",
    env: "ZHIPU_VL_MODEL",
    kind: "setting",
    group: "model",
    valueType: "string",
  },
  {
    id: "zhipuTextModel",
    env: "ZHIPU_TEXT_MODEL",
    kind: "setting",
    group: "model",
    valueType: "string",
  },
  {
    id: "identifyDailyLimit",
    env: "IDENTIFY_DAILY_LIMIT",
    kind: "setting",
    group: "quota",
    valueType: "number",
  },
  {
    id: "identifyConcurrency",
    env: "IDENTIFY_CONCURRENCY",
    kind: "setting",
    group: "quota",
    valueType: "number",
  },
] as const;

export function slotById(id: string): SecretSlot | undefined {
  return SECRET_SLOTS.find((s) => s.id === id);
}

export function readEnvRaw(slot: SecretSlot): string {
  const names = [slot.env, ...(slot.envAliases ?? [])];
  for (const name of names) {
    const v = process.env[name]?.trim();
    if (v) return v;
  }
  return "";
}
