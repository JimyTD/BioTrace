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
  slots: Array<{ id: string; titleKey: string; lit: boolean }>;
};

export async function listVolumesForUser(userId: string): Promise<VolumeListItem[]> {
  const configs = loadVolumeConfigs();
  const progress = await listVolumeProgress(userId);
  const byId = new Map(progress.map((p) => [p.volumeId, p]));

  return configs.map((vol) => {
    const p = byId.get(vol.id);
    const litSet = new Set(p?.litSlotIds ?? []);
    const slots = vol.slots.map((s) => ({
      id: s.id,
      titleKey: s.titleKey,
      lit: litSet.has(s.id),
    }));
    const litCount = slots.filter((s) => s.lit).length;
    const completed = Boolean(p?.completedAt) || litCount >= vol.slots.length;
    return {
      id: vol.id,
      sort: vol.sort ?? 100,
      titleKey: vol.titleKey,
      ledeKey: vol.ledeKey,
      completed,
      completedAt: p?.completedAt ? p.completedAt.toISOString() : null,
      litCount,
      totalSlots: vol.slots.length,
      slots,
    };
  });
}
