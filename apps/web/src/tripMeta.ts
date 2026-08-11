import { t } from "@biotrace/messages";
import type { Trip } from "./api";

/** 列表/相册副行：张数 · 时间 · 地点（缺段省略）。 */
export function tripMetaLine(trip: Trip): string {
  const count = trip.observationCount ?? 0;
  const parts: string[] = [
    count > 0 ? t("trips.photoCount", { count }) : t("trips.noPhotosYet"),
  ];
  if (trip.dateSummary?.trim()) parts.push(trip.dateSummary.trim());
  if (trip.placeSummary?.trim()) parts.push(trip.placeSummary.trim());
  return parts.join(" · ");
}
