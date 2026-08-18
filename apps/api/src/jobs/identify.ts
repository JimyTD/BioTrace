import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { observations } from "../db/schema.js";
import { localizeThrownMessage } from "../errors.js";
import { evaluateEligibility } from "../identify/eligibility.js";
import { runIdentifyForUser } from "../identify/run.js";
import { emptyTaxonomy } from "../identify/types.js";
import { computeSettle } from "../settle/rules.js";
import { enqueueIdentifyJob } from "./identify-queue.js";

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

export function enqueueIdentify(opts: {
  observationId: string;
  imagePath: string;
  mimeType: string;
  lat?: number | null;
  lng?: number | null;
  capturedAt?: Date | null;
  description?: string | null;
}) {
  enqueueIdentifyJob(async () => {
    try {
      const obs = await db.query.observations.findFirst({
        where: eq(observations.id, opts.observationId),
        columns: { userId: true },
      });
      if (!obs) return;

      const { result, provider } = await runIdentifyForUser(obs.userId, {
        imagePath: opts.imagePath,
        mimeType: opts.mimeType,
        lat: opts.lat,
        lng: opts.lng,
        capturedAt: opts.capturedAt,
        description: opts.description,
      });
      console.log(`[identify] ok provider=${provider} obs=${opts.observationId}`);

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
            settledAt: null,
            updatedAt: new Date(),
          })
          .where(eq(observations.id, opts.observationId));
        return;
      }

      const taxonomyJson = JSON.stringify(result.taxonomy);
      const fresh = await db.query.observations.findFirst({
        where: eq(observations.id, opts.observationId),
        columns: { lat: true, lng: true },
      });
      const settle = await computeSettle({
        lat: fresh?.lat ?? opts.lat,
        lng: fresh?.lng ?? opts.lng,
        finestReliableRank: result.finest_reliable_rank,
        scientificName: result.scientific_name,
        commonName: result.common_name_zh,
        taxonomyJson,
      });

      if (settle.settleTier === "none") {
        await db
          .update(observations)
          .set({
            status: "failed",
            commonName: result.common_name_zh || null,
            scientificName: result.scientific_name || null,
            finestReliableRank: result.finest_reliable_rank || null,
            confidence: result.confidence_0_to_1,
            taxonomyJson,
            blurb: result.blurb_zh || null,
            notes: result.notes || null,
            error: "identify_too_coarse",
            settleTier: "none",
            rarity: null,
            countryCode: settle.countryCode,
            countrySource: settle.countrySource,
            locationLabel: settle.locationLabel,
            locationPrecise: settle.locationPrecise,
            alertIntroduced: false,
            taxonKey: settle.taxonKey,
            acceptedTaxonomyJson: settle.acceptedTaxonomy
              ? JSON.stringify(settle.acceptedTaxonomy)
              : null,
            identifyProvider: provider,
            settledAt: null,
            updatedAt: new Date(),
          })
          .where(eq(observations.id, opts.observationId));
        return;
      }

      await db
        .update(observations)
        .set({
          status: "pending_settle",
          commonName: result.common_name_zh || null,
          scientificName: result.scientific_name || null,
          finestReliableRank: result.finest_reliable_rank || null,
          confidence: result.confidence_0_to_1,
          taxonomyJson,
          blurb: result.blurb_zh || null,
          notes: result.notes || null,
          error: null,
          settleTier: settle.settleTier,
          rarity: settle.rarity,
          countryCode: settle.countryCode,
          countrySource: settle.countrySource,
          locationLabel: settle.locationLabel,
          locationPrecise: settle.locationPrecise,
          alertIntroduced: settle.alertIntroduced,
          taxonKey: settle.taxonKey,
          acceptedTaxonomyJson: settle.acceptedTaxonomy
            ? JSON.stringify(settle.acceptedTaxonomy)
            : null,
          identifyProvider: provider,
          settledAt: null,
          updatedAt: new Date(),
        })
        .where(eq(observations.id, opts.observationId));
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      if (raw === "identify_daily_limit") {
        console.log(`[identify] daily limit obs=${opts.observationId}`);
      }
      const stored =
        STORED_CODES.has(raw)
          ? raw === "identify_quota"
            ? "identify_unavailable"
            : raw
          : localizeThrownMessage(raw);
      await db
        .update(observations)
        .set({
          status: "failed",
          error: stored,
          updatedAt: new Date(),
        })
        .where(eq(observations.id, opts.observationId));
    }
  });
}
