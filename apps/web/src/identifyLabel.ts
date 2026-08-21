import { t, type MessageKey } from "@biotrace/messages";

/** 有模型名就写模型；旧行没有则回退到线路名。 */
export function identifyDisplayName(
  provider: string | null | undefined,
  model?: string | null,
): string | null {
  const trimmed = model?.trim();
  if (trimmed) return trimmed;
  if (!provider) return null;
  const key = `identify.provider.${provider}` as MessageKey;
  const name = t(key);
  return name === key ? provider : name;
}

export function identifyByLine(
  provider: string | null | undefined,
  model?: string | null,
): string | null {
  const name = identifyDisplayName(provider, model);
  return name ? t("identify.by", { name }) : null;
}
