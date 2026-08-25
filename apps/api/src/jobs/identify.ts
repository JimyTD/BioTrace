import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { observations } from "../db/schema.js";
import { localizeThrownMessage } from "../errors.js";
import { evaluateEligibility } from "../identify/eligibility.js";
import { runIdentifyForUser } from "../identify/run.js";
import { emptyTaxonomy, type IdentifyResult } from "../identify/types.js";
import { computeSettle } from "../settle/rules.js";
import { storeAcceptedTaxonomyJson } from "../settle/taxon.js";
import { enqueueIdentifyJob } from "./identify-queue.js";
import { enqueueSettleJob } from "./settle-queue.js";

const STORED_CODES = new Set([
  "identify_unavailable",
  "identify_too_coarse",
  "identify_quota",
  "identify_daily_limit",
  "identify_user_key_incomplete",
  "identify_not_organism",
  "identify_human",
  "identify_not_living",
]);

type IdentifyOpts = {
  observationId: string;
  imagePath: string;
  mimeType: string;
  lat?: number | null;
  lng?: number | null;
  capturedAt?: Date | null;
  description?: string | null;
};

function storedError(raw: string): string {
  if (!STORED_CODES.has(raw)) return localizeThrownMessage(raw);
  return raw === "identify_quota" ? "identify_unavailable" : raw;
}

async function markFailed(observationId: string, err: unknown) {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw === "identify_daily_limit") {
    console.log(`[identify] daily limit obs=${observationId}`);
  }
  await db
    .update(observations)
    .set({
      status: "failed",
      error: storedError(raw),
      updatedAt: new Date(),
    })
    .where(eq(observations.id, observationId));
}

async function persistSettle(opts: {
  observationId: string;
  result: IdentifyResult;
  provider: string;
  model: string | null;
  lat?: number | null;
  lng?: number | null;
}) {
  const t0 = Date.now();
  const taxonomyJson = JSON.stringify(opts.result.taxonomy);
  const fresh = await db.query.observations.findFirst({
    where: eq(observations.id, opts.observationId),
    columns: { lat: true, lng: true },
  });
  const settle = await computeSettle({
    lat: fresh?.lat ?? opts.lat,
    lng: fresh?.lng ?? opts.lng,
    finestReliableRank: opts.result.finest_reliable_rank,
    scientificName: opts.result.scientific_name,
    commonName: opts.result.common_name_zh,
    taxonomyJson,
  });

  if (settle.settleTier === "none") {
    await db
      .update(observations)
      .set({
        status: "failed",
        commonName: opts.result.common_name_zh || null,
        scientificName: opts.result.scientific_name || null,
        finestReliableRank: opts.result.finest_reliable_rank || null,
        confidence: opts.result.confidence_0_to_1,
        taxonomyJson,
        blurb: opts.result.blurb_zh || null,
        notes: opts.result.notes || null,
        error: "identify_too_coarse",
        settleTier: "none",
        rarity: null,
        countryCode: settle.countryCode,
        countrySource: settle.countrySource,
        locationLabel: settle.locationLabel,
        locationPrecise: settle.locationPrecise,
        alertIntroduced: false,
        taxonKey: settle.taxonKey,
        acceptedTaxonomyJson: storeAcceptedTaxonomyJson(settle.acceptedTaxonomy, taxonomyJson),
        identifyProvider: opts.provider,
        identifyModel: opts.model,
        settledAt: null,
        updatedAt: new Date(),
      })
      .where(eq(observations.id, opts.observationId));
    console.log(
      `[settle] too_coarse obs=${opts.observationId} ${Date.now() - t0}ms`,
    );
    return;
  }

  await db
    .update(observations)
    .set({
      status: "pending_settle",
      commonName: opts.result.common_name_zh || null,
      scientificName: opts.result.scientific_name || null,
      finestReliableRank: opts.result.finest_reliable_rank || null,
      confidence: opts.result.confidence_0_to_1,
      taxonomyJson,
      blurb: opts.result.blurb_zh || null,
      notes: opts.result.notes || null,
      error: null,
      settleTier: settle.settleTier,
      rarity: settle.rarity,
      countryCode: settle.countryCode,
      countrySource: settle.countrySource,
      locationLabel: settle.locationLabel,
      locationPrecise: settle.locationPrecise,
      alertIntroduced: settle.alertIntroduced,
      taxonKey: settle.taxonKey,
      acceptedTaxonomyJson: storeAcceptedTaxonomyJson(settle.acceptedTaxonomy, taxonomyJson),
      identifyProvider: opts.provider,
      identifyModel: opts.model,
      settledAt: null,
      updatedAt: new Date(),
    })
    .where(eq(observations.id, opts.observationId));
  console.log(
    `[settle] ok obs=${opts.observationId} rarity=${settle.rarity} ${Date.now() - t0}ms`,
  );
}

export function enqueueIdentify(opts: IdentifyOpts) {
  enqueueIdentifyJob(async () => {
    const t0 = Date.now();
    try {
      const obs = await db.query.observations.findFirst({
        where: eq(observations.id, opts.observationId),
        columns: { userId: true },
      });
      if (!obs) return;

      const { result, provider, model } = await runIdentifyForUser(obs.userId, {
        imagePath: opts.imagePath,
        mimeType: opts.mimeType,
        lat: opts.lat,
        lng: opts.lng,
        capturedAt: opts.capturedAt,
        description: opts.description,
      });
      console.log(
        `[identify] ok provider=${provider}${model ? ` model=${model}` : ""} obs=${opts.observationId} ${Date.now() - t0}ms`,
      );

      const gate = evaluateEligibility(result);
      if (!gate.ok) {
        console.log(
          `[identify] ineligible obs=${opts.observationId} code=${gate.code} kind=${gate.kind}`,
        );
        await db
          .update(observations)
          .set({
            status: "failed",
            commonName: null,
            scientificName: null,
            finestReliableRank: null,
            confidence: null,
            taxonomyJson: JSON.stringify(emptyTaxonomy()),
            blurb: null,
            notes: [gate.reasonZh, result.notes].filter(Boolean).join(" · ") || null,
            error: gate.code,
            settleTier: "none",
            rarity: null,
            countryCode: null,
            countrySource: null,
            locationLabel: null,
            locationPrecise: false,
            alertIntroduced: false,
            taxonKey: null,
            acceptedTaxonomyJson: null,
            identifyProvider: provider,
            identifyModel: model,
            settledAt: null,
            updatedAt: new Date(),
          })
          .where(eq(observations.id, opts.observationId));
        return;
      }

      enqueueSettleJob(async () => {
        try {
          await persistSettle({
            observationId: opts.observationId,
            result,
            provider,
            model,
            lat: opts.lat,
            lng: opts.lng,
          });
        } catch (err) {
          await markFailed(opts.observationId, err);
        }
      });
    } catch (err) {
      await markFailed(opts.observationId, err);
    }
  });
}
