import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { volumeProgress } from "../db/schema.js";

/** Per-slot progress; observationId set when lit by a settle claim. */
export type LitSlotEntry = {
  observationId: string | null;
};

export type VolumeProgressView = {
  litSlotIds: string[];
  litSlots: Record<string, LitSlotEntry>;
  completedAt: Date | null;
};

/**
 * Parse lit_slot_ids_json:
 * - legacy: `["slot_a","slot_b"]`
 * - current: `{"slot_a":{"observationId":"..."},"slot_b":{"observationId":null}}`
 */
export function parseLitSlotsJson(raw: string | null | undefined): {
  litSlotIds: string[];
  litSlots: Record<string, LitSlotEntry>;
} {
  const litSlots: Record<string, LitSlotEntry> = {};
  try {
    const parsed = JSON.parse(raw || "[]") as unknown;
    if (Array.isArray(parsed)) {
      for (const id of parsed.map(String)) {
        if (!id) continue;
        litSlots[id] = { observationId: null };
      }
    } else if (parsed && typeof parsed === "object") {
      for (const [id, val] of Object.entries(parsed as Record<string, unknown>)) {
        if (!id) continue;
        if (val && typeof val === "object") {
          const obsId = (val as { observationId?: unknown }).observationId;
          litSlots[id] = {
            observationId: typeof obsId === "string" && obsId.trim() ? obsId.trim() : null,
          };
        } else {
          litSlots[id] = { observationId: null };
        }
      }
    }
  } catch {
    /* empty */
  }
  return { litSlotIds: Object.keys(litSlots), litSlots };
}

function serializeLitSlots(litSlots: Record<string, LitSlotEntry>): string {
  return JSON.stringify(litSlots);
}

export async function readVolumeProgress(
  userId: string,
  volumeId: string,
): Promise<VolumeProgressView> {
  const row = await db.query.volumeProgress.findFirst({
    where: and(eq(volumeProgress.userId, userId), eq(volumeProgress.volumeId, volumeId)),
  });
  if (!row) {
    return { litSlotIds: [], litSlots: {}, completedAt: null };
  }
  const { litSlotIds, litSlots } = parseLitSlotsJson(row.litSlotIdsJson);
  return { litSlotIds, litSlots, completedAt: row.completedAt ?? null };
}

export async function listVolumeProgress(userId: string) {
  const rows = await db.query.volumeProgress.findMany({
    where: eq(volumeProgress.userId, userId),
  });
  return rows.map((row) => {
    const { litSlotIds, litSlots } = parseLitSlotsJson(row.litSlotIdsJson);
    return {
      volumeId: row.volumeId,
      litSlotIds,
      litSlots,
      completedAt: row.completedAt ?? null,
    };
  });
}

export async function writeVolumeProgress(input: {
  userId: string;
  volumeId: string;
  litSlots: Record<string, LitSlotEntry>;
  completedAt: Date | null;
}) {
  const now = new Date();
  const existing = await db.query.volumeProgress.findFirst({
    where: and(
      eq(volumeProgress.userId, input.userId),
      eq(volumeProgress.volumeId, input.volumeId),
    ),
  });
  const litSlotIdsJson = serializeLitSlots(input.litSlots);
  if (existing) {
    await db
      .update(volumeProgress)
      .set({
        litSlotIdsJson,
        completedAt: input.completedAt,
        updatedAt: now,
      })
      .where(eq(volumeProgress.id, existing.id));
    return;
  }
  await db.insert(volumeProgress).values({
    id: crypto.randomUUID(),
    userId: input.userId,
    volumeId: input.volumeId,
    litSlotIdsJson,
    completedAt: input.completedAt,
    updatedAt: now,
  });
}
