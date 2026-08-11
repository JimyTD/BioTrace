import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { observations } from "../db/schema.js";
import { localizeThrownMessage } from "../errors.js";
import { evaluateEligibility } from "../identify/eligibility.js";
import { identifyWithFallback } from "../identify/orchestrator.js";
import { emptyTaxonomy } from "../identify/types.js";
import { computeSettle } from "../settle/rules.js";
import { enqueueIdentifyJob } from "./identify-queue.js";

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
      const { result, provider } = await identifyWithFallback({
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
            notes: gate.reasonZh || null,
            error: gate.code,
            settleTier: "none",
            rarity: null,
            countryCode: null,
            // 闸门在识别前就拦下了，computeSettle 未执行 → 尚未判定，而非「判过但无坐标」
            countrySource: null,
            locationLabel: null,
            locationPrecise: false,
            alertIntroduced: false,
            taxonKey: null,
            identifyProvider: provider,
            settledAt: null,
            updatedAt: new Date(),
          })
          .where(eq(observations.id, opts.observationId));
        return;
      }

      const taxonomyJson = JSON.stringify(result.taxonomy);
      // 识图 Prompt 可用上传时闭包坐标；地理结算读库内最新 lat/lng（支持 analyzing 期间补标）。
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
          identifyProvider: provider,
          settledAt: null,
          updatedAt: new Date(),
        })
        .where(eq(observations.id, opts.observationId));
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const stored =
        raw === "identify_unavailable" ||
        raw === "identify_too_coarse" ||
        raw === "identify_quota" ||
        raw === "identify_not_organism" ||
        raw === "identify_human" ||
        raw === "identify_not_living"
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
