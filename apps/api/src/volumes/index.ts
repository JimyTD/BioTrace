import { inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { observations } from "../db/schema.js";
import { observationDisplayUrl } from "../serialize.js";
import { loadVolumeConfigs } from "./load.js";
import { listVolumeProgress } from "./progress.js";

export { evaluateVolumesOnObservation } from "./evaluate.js";
export { loadVolumeConfigs } from "./load.js";
export type { VolumeConfig } from "./types.js";

export type VolumeListItem = {
  id: string;
  sort: number;
  titleKey: string;
  ledeKey: string;
  completed: boolean;
  completedAt: string | null;
  litCount: number;
  totalSlots: number;
  /** Compact cover for list card: first lit slot with a photo, else null. */
  coverDisplayUrl: string | null;
  slots: Array<{
    id: string;
    titleKey: string;
    lit: boolean;
    coverObservationId: string | null;
    coverDisplayUrl: string | null;
  }>;
};

export async function listVolumesForUser(userId: string): Promise<VolumeListItem[]> {
  const configs = loadVolumeConfigs();
  const progress = await listVolumeProgress(userId);
  const byId = new Map(progress.map((p) => [p.volumeId, p]));

  const obsIds = new Set<string>();
  for (const p of progress) {
    for (const entry of Object.values(p.litSlots)) {
      if (entry.observationId) obsIds.add(entry.observationId);
    }
  }

  const pathByObsId = new Map<string, string>();
  if (obsIds.size > 0) {
    const rows = await db.query.observations.findMany({
      where: inArray(observations.id, [...obsIds]),
      columns: { id: true, displayPath: true, userId: true },
    });
    for (const row of rows) {
      if (row.userId === userId) {
        pathByObsId.set(row.id, observationDisplayUrl(row.displayPath));
      }
    }
  }

  return configs.map((vol) => {
    const p = byId.get(vol.id);
    const litSlots = p?.litSlots ?? {};
    const slots = vol.slots.map((s) => {
      const entry = litSlots[s.id];
      const lit = Boolean(entry);
      const coverObservationId = entry?.observationId ?? null;
      const coverDisplayUrl =
        coverObservationId && pathByObsId.has(coverObservationId)
          ? pathByObsId.get(coverObservationId)!
          : null;
      return {
        id: s.id,
        titleKey: s.titleKey,
        lit,
        coverObservationId,
        coverDisplayUrl,
      };
    });
    const litCount = slots.filter((s) => s.lit).length;
    const completed = Boolean(p?.completedAt) || litCount >= vol.slots.length;
    const coverDisplayUrl =
      slots.find((s) => s.coverDisplayUrl)?.coverDisplayUrl ?? null;
    return {
      id: vol.id,
      sort: vol.sort ?? 100,
      titleKey: vol.titleKey,
      ledeKey: vol.ledeKey,
      completed,
      completedAt: p?.completedAt ? p.completedAt.toISOString() : null,
      litCount,
      totalSlots: vol.slots.length,
      coverDisplayUrl,
      slots,
    };
  });
}
