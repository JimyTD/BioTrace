import type { Observation } from "../db/schema.js";
import { ensureAcceptedTaxonomy } from "../settle/taxon.js";
import { loadVolumeConfigs } from "./load.js";
import { slotMatches } from "./match.js";
import {
  readVolumeProgress,
  writeVolumeProgress,
  type LitSlotEntry,
} from "./progress.js";

export type VolumeEvalResult = {
  newlyLit: Array<{
    volumeId: string;
    slotId: string;
    volumeTitleKey: string;
    slotTitleKey: string;
  }>;
  newlyCompletedVolumeIds: string[];
  newlyCompleted: Array<{ volumeId: string; titleKey: string }>;
};

/** After settle/claim: advance volumes for the observation uploader. */
export async function evaluateVolumesOnObservation(obs: Observation): Promise<VolumeEvalResult> {
  return evaluateVolumesForUser(obs.userId, obs);
}

/** Advance volumes for an arbitrary beneficiary (shared-trip members). */
export async function evaluateVolumesForUser(
  userId: string,
  obs: Observation,
): Promise<VolumeEvalResult> {
  const newlyLit: VolumeEvalResult["newlyLit"] = [];
  const newlyCompletedVolumeIds: string[] = [];
  const newlyCompleted: VolumeEvalResult["newlyCompleted"] = [];

  if (obs.status !== "settled") {
    return { newlyLit, newlyCompletedVolumeIds, newlyCompleted };
  }

  const taxonomy = await ensureAcceptedTaxonomy(obs);
  const volumes = loadVolumeConfigs();

  for (const vol of volumes) {
    const prev = await readVolumeProgress(userId, vol.id);
    const litSlots: Record<string, LitSlotEntry> = { ...prev.litSlots };
    const wasComplete = Boolean(prev.completedAt);
    let changed = false;

    for (const slot of vol.slots) {
      if (litSlots[slot.id]) continue;
      const ok = slotMatches({
        rule: slot.rule,
        taxonomy,
        finestReliableRank: obs.finestReliableRank,
      });
      if (ok) {
        litSlots[slot.id] = { observationId: obs.id };
        changed = true;
        newlyLit.push({
          volumeId: vol.id,
          slotId: slot.id,
          volumeTitleKey: vol.titleKey,
          slotTitleKey: slot.titleKey,
        });
      }
    }

    const complete = vol.slots.every((s) => Boolean(litSlots[s.id]));
    let completedAt = prev.completedAt;
    if (complete && !wasComplete) {
      completedAt = new Date();
      newlyCompletedVolumeIds.push(vol.id);
      newlyCompleted.push({ volumeId: vol.id, titleKey: vol.titleKey });
      changed = true;
    }

    if (changed) {
      await writeVolumeProgress({
        userId,
        volumeId: vol.id,
        litSlots,
        completedAt,
      });
    }
  }

  return { newlyLit, newlyCompletedVolumeIds, newlyCompleted };
}
