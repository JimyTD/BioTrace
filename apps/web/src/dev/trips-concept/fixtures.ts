import { draftText } from "./copy";
import type { Trip } from "../../api";

export type PreviewTrip = Trip & { samplePhotos?: string[] };
const photo = (name: string) => `/themes/_demo/demo-photo-${name}.jpg`;
const trip = (id: string, title: string, dateSummary: string, placeSummary: string, count: number, cover: string | null, members = 1): PreviewTrip => ({
  id, title, userId: "preview", createdAt: "2026-09-01", dateSummary, placeSummary,
  observationCount: count, coverDisplayUrl: cover, memberCount: members,
  samplePhotos: cover ? [cover, photo("bird"), photo("dragonfly"), photo("mushroom")] : [],
});

export function sampleTrips(state: string): PreviewTrip[] {
  const rows = [
    trip("jiuzhai", draftText("jiuzhai"), "2026.09.18 — 09.21", draftText("sichuan"), 48, photo("mushroom"), 3),
    trip("coast", draftText("coast"), "2026.08.24 — 08.26", draftText("xiamen"), 126, photo("dragonfly"), 2),
    trip("park", draftText("park"), "2026.08.09", draftText("hangzhou"), 17, photo("squirrel")),
    trip("next", draftText("emptyTrip"), "", "", 0, null),
    trip("long", draftText("longTitle"), "2026.07.12 — 07.18", draftText("jiangxi"), 236, photo("butterfly")),
  ];
  if (state === "empty") return [];
  if (state === "single") return rows.slice(0, 1);
  if (state === "long") return [rows[4]!, ...rows.slice(0, 4)];
  if (state === "many") return Array.from({ length: 20 }, (_, i) => ({ ...rows[i % rows.length]!, id: `sample-${i}`, title: `${rows[i % rows.length]!.title} ${String(i + 1).padStart(2, "0")}` }));
  return rows;
}
