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

const BREED_LINE_CAP = 3;

/** 图窗下那行品种：前三个，多的写「等 N 个」。N 是总数。 */
export function petBreedLine(breeds: Array<string | null> | undefined): string {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const raw of breeds ?? []) {
    const label = petBreedLabel({ domesticated: true, breedZh: raw });
    if (!label || seen.has(label)) continue;
    seen.add(label);
    names.push(label);
  }
  if (names.length === 0) return t("detail.breedUnknown");
  if (names.length <= BREED_LINE_CAP) return names.join(" · ");
  return `${names.slice(0, BREED_LINE_CAP).join(" · ")} ${t("collection.petsBreedMore", { count: names.length })}`;
}

export function hasDomesticatedTag(tags?: StatusTag[] | null): boolean {
  return Boolean(tags?.includes("domesticated"));
}
