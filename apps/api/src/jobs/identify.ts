import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { observations } from "../db/schema.js";
import { localizeThrownMessage } from "../errors.js";
import { evaluateEligibility } from "../identify/eligibility.js";
import { runIdentifyForUser } from "../identify/run.js";
import { emptyTaxonomy, storedDomIdentity, type IdentifyResult } from "../identify/types.js";
import { geoSettleFields, resolveCountry } from "../settle/country.js";
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
  "identify_no_kingdom",
  "identify_soft_encounter",
  "identify_keepsake",
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

function domColumns(result: IdentifyResult) {
  const d = storedDomIdentity(result);
  return {
    domesticated: d.domesticated,
    breedZh: d.breedZh,
    domEvidenceZh: d.domEvidenceZh,
  };
}

const clearedDom = {
  domesticated: false,
  breedZh: null as string | null,
  domEvidenceZh: null as string | null,
};

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
  const dom = storedDomIdentity(opts.result);
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
    domesticated: dom.domesticated,
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
        ...domColumns(opts.result),
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
      ...domColumns(opts.result),
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
      const soft = gate.ok && "soft" in gate ? gate.soft : null;
      const keepsake = gate.ok && "keepsake" in gate ? gate.keepsake : null;
      if (!gate.ok && !soft && !keepsake) {
        console.log(
          `[identify] ineligible obs=${opts.observationId} code=${gate.code} kind=${gate.kind}`,
        );
        const fresh = await db.query.observations.findFirst({
          where: eq(observations.id, opts.observationId),
          columns: { lat: true, lng: true },
        });
        const geo = await geoSettleFields(fresh?.lat ?? opts.lat, fresh?.lng ?? opts.lng);
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
            countryCode: geo.countryCode,
            countrySource: geo.countrySource,
            locationLabel: geo.locationLabel,
            locationPrecise: geo.locationPrecise,
            alertIntroduced: false,
            taxonKey: null,
            acceptedTaxonomyJson: null,
            identifyProvider: provider,
            identifyModel: model,
            identifySubjectKind: result.subject_kind,
            identifyReason: result.ineligibility_reason_zh?.trim() || null,
            ...clearedDom,
            settledAt: null,
            updatedAt: new Date(),
          })
          .where(eq(observations.id, opts.observationId));
        return;
      }

      /* 软档（2026-09-07 拍板）：影像/标本上的真生物。识别放行、全套字段保留，
         但不进结算（无稀有度/taxonKey/图鉴），国别与可读地名照常判定。
         status=settled 让详情页按「已识别」渲染；错误码 identify_soft_encounter
         驱动前端印章（detail.softSeal「非实拍生物」）与理由文案。
         注意：不进图鉴靠 taxonKey=null 挡，不靠 status——任何按 settled
         查收录的地方都必须同时排 taxonKey。 */
      if (soft) {
        console.log(
          `[identify] soft encounter obs=${opts.observationId} kind=${soft.kind}`,
        );
        const fresh = await db.query.observations.findFirst({
          where: eq(observations.id, opts.observationId),
          columns: { lat: true, lng: true },
        });
        const country = await resolveCountry(fresh?.lat ?? opts.lat, fresh?.lng ?? opts.lng);
        const taxonomyJson = JSON.stringify(result.taxonomy);
        await db
          .update(observations)
          .set({
            status: "settled",
            commonName: result.common_name_zh || null,
            scientificName: result.scientific_name || null,
            finestReliableRank: result.finest_reliable_rank || null,
            confidence: result.confidence_0_to_1,
            taxonomyJson,
            blurb: result.blurb_zh || null,
            /* 留影没有科普简介，但 agent 一定给了不合格理由；写进 notes
               供详情页当这张照片的注——「看起来是个普通茶杯」那类话 */
            notes: keepsake?.reasonZh || result.notes || null,
            error: "identify_soft_encounter",
            settleTier: "none",
            rarity: null,
            countryCode: country.code,
            countrySource: country.source,
            locationLabel: country.locationLabel,
            locationPrecise: Boolean(country.code),
            alertIntroduced: false,
            taxonKey: null,
            acceptedTaxonomyJson: null,
            identifyProvider: provider,
            identifyModel: model,
            identifySubjectKind: result.subject_kind,
            identifyReason: result.ineligibility_reason_zh?.trim() || null,
            ...domColumns(result),
            settledAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(observations.id, opts.observationId));
        return;
      }

      /* 留影档（2026-09-08 拍板）：没生物/仅背景/分不清/人/器物。
         照片永远留在相册——身份字段照存不清空，只是不结算、不给稀有度、不进图鉴。
         status=settled 让详情页按「已识别」渲染；错误码 identify_keepsake
         驱动前端中性灰「留影」徽章；标题走 subject_title_zh（agent 短名）。 */
      if (keepsake) {
        console.log(`[identify] keepsake obs=${opts.observationId} kind=${keepsake.kind}`);
        const fresh = await db.query.observations.findFirst({
          where: eq(observations.id, opts.observationId),
          columns: { lat: true, lng: true },
        });
        const country = await resolveCountry(fresh?.lat ?? opts.lat, fresh?.lng ?? opts.lng);
        const taxonomyJson = JSON.stringify(result.taxonomy);
        await db
          .update(observations)
          .set({
            status: "settled",
            commonName: result.subject_title_zh?.trim() || result.common_name_zh || null,
            scientificName: result.scientific_name || null,
            finestReliableRank: result.finest_reliable_rank || null,
            confidence: result.confidence_0_to_1,
            taxonomyJson,
            blurb: result.blurb_zh || null,
            /* 留影没有科普简介，但 agent 一定给了不合格理由；写进 notes
               供详情页当这张照片的注——「看起来是个普通茶杯」那类话 */
            notes: keepsake?.reasonZh || result.notes || null,
            error: "identify_keepsake",
            settleTier: "none",
            rarity: null,
            countryCode: country.code,
            countrySource: country.source,
            locationLabel: country.locationLabel,
            locationPrecise: Boolean(country.code),
            alertIntroduced: false,
            taxonKey: null,
            acceptedTaxonomyJson: null,
            identifyProvider: provider,
            identifyModel: model,
            identifySubjectKind: result.subject_kind,
            identifyReason: result.ineligibility_reason_zh?.trim() || null,
            ...domColumns(result),
            settledAt: new Date(),
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
