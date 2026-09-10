import { t } from "@biotrace/messages";
import type { StatusTag } from "./api";

/** 驯养观察才有品种；认不出也给「品种不详」，不把栏撤掉。 */
export function petBreedLabel(input: {
  domesticated?: boolean | null;
  breedZh?: string | null;
}): string | null {
  if (!input.domesticated) return null;
  const name = input.breedZh?.trim();
  return name || t("detail.breedUnknown");
}

export function hasDomesticatedTag(tags?: StatusTag[] | null): boolean {
  return Boolean(tags?.includes("domesticated"));
}
