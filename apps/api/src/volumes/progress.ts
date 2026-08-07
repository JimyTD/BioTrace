import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { volumeProgress } from "../db/schema.js";

export async function readVolumeProgress(userId: string, volumeId: string) {
  const row = await db.query.volumeProgress.findFirst({
    where: and(eq(volumeProgress.userId, userId), eq(volumeProgress.volumeId, volumeId)),
  });
  if (!row) {
    return { litSlotIds: [] as string[], completedAt: null as Date | null };
  }
  let litSlotIds: string[] = [];
  try {
    const parsed = JSON.parse(row.litSlotIdsJson || "[]") as unknown;
    if (Array.isArray(parsed)) litSlotIds = parsed.map(String);
  } catch {
    litSlotIds = [];
  }
  return { litSlotIds, completedAt: row.completedAt ?? null };
}

export async function listVolumeProgress(userId: string) {
  const rows = await db.query.volumeProgress.findMany({
    where: eq(volumeProgress.userId, userId),
  });
  return rows.map((row) => {
    let litSlotIds: string[] = [];
    try {
      const parsed = JSON.parse(row.litSlotIdsJson || "[]") as unknown;
      if (Array.isArray(parsed)) litSlotIds = parsed.map(String);
    } catch {
      litSlotIds = [];
    }
    return {
      volumeId: row.volumeId,
      litSlotIds,
      completedAt: row.completedAt ?? null,
    };
  });
}

export async function writeVolumeProgress(input: {
  userId: string;
  volumeId: string;
  litSlotIds: string[];
  completedAt: Date | null;
}) {
  const now = new Date();
  const existing = await db.query.volumeProgress.findFirst({
    where: and(
      eq(volumeProgress.userId, input.userId),
      eq(volumeProgress.volumeId, input.volumeId),
    ),
  });
  const litSlotIdsJson = JSON.stringify(input.litSlotIds);
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
