import type { Observation } from "../db/schema.js";
import { parseTaxonomy } from "../settle/taxon.js";
import { loadVolumeConfigs } from "./load.js";
import { slotMatches } from "./match.js";
import { readVolumeProgress, writeVolumeProgress } from "./progress.js";

export type VolumeEvalResult = {
  newlyLit: Array<{ volumeId: string; slotId: string }>;
  newlyCompletedVolumeIds: string[];
};

/** After settle/claim: advance all configured volumes for this observation. */
export async function evaluateVolumesOnObservation(obs: Observation): Promise<VolumeEvalResult> {
  const newlyLit: Array<{ volumeId: string; slotId: string }> = [];
  const newlyCompletedVolumeIds: string[] = [];

  if (obs.status !== "settled") {
    return { newlyLit, newlyCompletedVolumeIds };
  }

  const taxonomy = parseTaxonomy(obs.taxonomyJson);
  const volumes = loadVolumeConfigs();

  for (const vol of volumes) {
    const prev = await readVolumeProgress(obs.userId, vol.id);
    const lit = new Set(prev.litSlotIds);
    const wasComplete = Boolean(prev.completedAt);

    for (const slot of vol.slots) {
      if (lit.has(slot.id)) continue;
      const ok = slotMatches({
        rule: slot.rule,
        taxonomy,
        finestReliableRank: obs.finestReliableRank,
      });
      if (ok) {
        lit.add(slot.id);
        newlyLit.push({ volumeId: vol.id, slotId: slot.id });
      }
    }

    const litSlotIds = [...lit];
    const complete = vol.slots.every((s) => lit.has(s.id));
    let completedAt = prev.completedAt;
    if (complete && !wasComplete) {
      completedAt = new Date();
      newlyCompletedVolumeIds.push(vol.id);
    }

    if (newlyLit.some((x) => x.volumeId === vol.id) || (complete && !wasComplete)) {
      await writeVolumeProgress({
        userId: obs.userId,
        volumeId: vol.id,
        litSlotIds,
        completedAt,
      });
    }
  }

  return { newlyLit, newlyCompletedVolumeIds };
}
