import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  observations,
  petCollectionEntries,
  sharedCollectionCredits,
  type Observation,
  type PetCollectionEntry,
} from "../db/schema.js";
import { collectibleRankFromTier } from "../rarity/scale-rubric.js";
import { collectionScientificName } from "../settle/taxon.js";
import { matchBreed, parseBreedIdList, petDisplayCommonName } from "../pets/breeds.js";

function isDomesticated(obs: Pick<Observation, "domesticated">): boolean {
  return Boolean(obs.domesticated);
}

async function settledSourcesForTaxon(userId: string, taxonKey: string): Promise<{
  own: Observation[];
  credited: Observation[];
}> {
  const own = await db.query.observations.findMany({
    where: and(
      eq(observations.userId, userId),
      eq(observations.taxonKey, taxonKey),
      eq(observations.status, "settled"),
    ),
    orderBy: [desc(observations.settledAt)],
  });

  const credits = await db.query.sharedCollectionCredits.findMany({
    where: and(
      eq(sharedCollectionCredits.userId, userId),
      eq(sharedCollectionCredits.taxonKey, taxonKey),
    ),
  });
  const creditObsIds = credits.map((c) => c.observationId);
  const credited =
    creditObsIds.length > 0
      ? await db.query.observations.findMany({
          where: and(
            inArray(observations.id, creditObsIds),
            eq(observations.status, "settled"),
            eq(observations.taxonKey, taxonKey),
          ),
        })
      : [];

  return { own, credited };
}

function bestRarity(sources: Observation[]): string {
  let best = sources[0]?.rarity ?? "N";
  for (const o of sources) {
    const tier = o.rarity ?? "N";
    if (collectibleRankFromTier(tier) > collectibleRankFromTier(best)) best = tier;
  }
  return best;
}

function breedProgress(sources: Observation[], taxonKey: string): {
  litIds: string[];
  unregisteredLit: boolean;
} {
  const lit = new Set<string>();
  let unregisteredLit = false;
  for (const obs of sources) {
    const matched = matchBreed(taxonKey, obs.breedZh);
    if (matched) lit.add(matched.id);
    else unregisteredLit = true;
  }
  return { litIds: [...lit], unregisteredLit };
}

export async function rebuildPetTaxonForUser(userId: string, taxonKey: string) {
  const { own, credited } = await settledSourcesForTaxon(userId, taxonKey);
  const ownPet = own.filter(isDomesticated);
  const creditedPet = credited.filter(isDomesticated);
  const sources = [...ownPet, ...creditedPet];
  const existing = await db.query.petCollectionEntries.findFirst({
    where: and(eq(petCollectionEntries.userId, userId), eq(petCollectionEntries.taxonKey, taxonKey)),
  });

  if (sources.length === 0) {
    if (existing) await db.delete(petCollectionEntries).where(eq(petCollectionEntries.id, existing.id));
    return;
  }

  const cover = ownPet[0] ?? sources[0]!;
  const nameSource = cover;
  const { litIds, unregisteredLit } = breedProgress(sources, taxonKey);
  const now = new Date();
  const commonName = petDisplayCommonName(taxonKey, nameSource.commonName);
  const scientificName = collectionScientificName(nameSource);
  const rarity = bestRarity(sources);

  if (!existing) {
    await db.insert(petCollectionEntries).values({
      id: crypto.randomUUID(),
      userId,
      taxonKey,
      commonName,
      scientificName,
      rarity,
      coverObservationId: cover.id,
      litBreedIdsJson: JSON.stringify(litIds),
      unregisteredLit,
      firstCollectedAt: now,
      updatedAt: now,
    });
    return;
  }

  await db
    .update(petCollectionEntries)
    .set({
      commonName: commonName ?? existing.commonName,
      scientificName: scientificName ?? existing.scientificName,
      rarity,
      coverObservationId: cover.id,
      litBreedIdsJson: JSON.stringify(litIds),
      unregisteredLit,
      updatedAt: now,
    })
    .where(eq(petCollectionEntries.id, existing.id));
}

export async function sanitizeUserPets(userId: string) {
  const entries = await db.query.petCollectionEntries.findMany({
    where: eq(petCollectionEntries.userId, userId),
  });
  for (const entry of entries) {
    await rebuildPetTaxonForUser(userId, entry.taxonKey);
  }
}

export async function detachObservationFromPets(
  userId: string,
  observationId: string,
  taxonKey: string | null,
) {
  const candidates = await db.query.petCollectionEntries.findMany({
    where: and(
      eq(petCollectionEntries.userId, userId),
      taxonKey
        ? eq(petCollectionEntries.taxonKey, taxonKey)
        : eq(petCollectionEntries.coverObservationId, observationId),
    ),
  });
  const keys = new Set(candidates.map((e) => e.taxonKey));
  if (taxonKey) keys.add(taxonKey);
  for (const key of keys) {
    await rebuildPetTaxonForUser(userId, key);
  }
}

export function litBreedIdsOf(entry: PetCollectionEntry): string[] {
  return parseBreedIdList(entry.litBreedIdsJson);
}
