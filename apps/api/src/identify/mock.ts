import { emptyTaxonomy, type IdentifyInput, type IdentifyResult } from "./types.js";

/**
 * Deterministic identify result for local / quota tests.
 * Enabled with `IDENTIFY_MOCK=1` — never calls cloud vision APIs.
 */
export function mockIdentifyResult(input: IdentifyInput): IdentifyResult {
  const taxonomy = emptyTaxonomy();
  taxonomy.kingdom = { name_la: "Animalia", name_zh: "动物界" };
  taxonomy.phylum = { name_la: "Chordata", name_zh: "脊索动物门" };
  taxonomy.class = { name_la: "Aves", name_zh: "鸟纲" };
  taxonomy.order = { name_la: "Passeriformes", name_zh: "雀形目" };
  taxonomy.family = { name_la: "Passeridae", name_zh: "雀科" };
  taxonomy.genus = { name_la: "Passer", name_zh: "麻雀属" };
  taxonomy.species = { name_la: "Passer montanus", name_zh: "树麻雀" };

  const note = input.description?.trim()
    ? `mock; desc=${input.description.trim().slice(0, 80)}`
    : "mock identify (IDENTIFY_MOCK=1)";

  return {
    common_name_zh: "假识图·树麻雀",
    scientific_name: "Passer montanus",
    taxonomy,
    confidence_0_to_1: 0.91,
    finest_reliable_rank: "species",
    blurb_zh: "这是本地假识图结果，未调用云端模型。",
    notes: note,
    subject_kind: "living_organism",
    subject_living: true,
    eligibility: "collectible",
    ineligibility_reason_zh: "",
  };
}
