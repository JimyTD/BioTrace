import {
  emptyTaxonomy,
  normalizeEligibility,
  normalizeSubjectKind,
  normalizeTaxonomy,
  type IdentifyInput,
  type IdentifyResult,
  type Taxonomy,
} from "./types.js";

export function buildIdentifyPrompt(input: IdentifyInput): string {
  const lat = input.lat != null ? String(input.lat) : "";
  const lon = input.lng != null ? String(input.lng) : "";
  const date = input.capturedAt ? input.capturedAt.toISOString().slice(0, 10) : "";
  const desc = input.description?.trim() || "";

  return `你是生物分类助手，服务于「旅行现场生命观察」App：只收集图中主体为**活的**生物（动物/植物/菌等，野生或饲养均可）的观察。

地点：（由坐标推断即可，无地名）
坐标：${lat},${lon}
拍摄日期：${date}
用户描述（仅辅助，必须以图像视觉证据为主；若描述与图像冲突，以图像为准）：${desc}

先判定主体是否合格，再决定分类深度。

要求：
1. 只输出一个 JSON 对象，不要 Markdown，不要其它文字。
2. 字段必须包含：
   - subject_kind：枚举之一
     living_organism | human | artifact_or_toy | depiction_or_media | no_organism | unclear
     · living_organism：现场活体生物（含动物园/盆栽等饲养个体）
     · human：真人/明显人类主体
     · artifact_or_toy：玩具、雕像、手办、标本模型、仿生道具等
     · depiction_or_media：卡通、插画、书页、屏幕截图、照片里的照片等影像/印刷形象
     · no_organism：书本、建筑、纯风景、日用品等无明显生物
     · unclear：难以判断
   - subject_living：boolean；仅 living_organism 可为 true，其余必须 false
   - eligibility：collectible | not_collectible
     · 只有 subject_kind=living_organism 且 subject_living=true 时才允许 collectible
     · 人、玩具、卡通、书页、无生物等必须 not_collectible
   - ineligibility_reason_zh：短中文；不合格时必填（说明为何不能进图鉴）；合格时可空字符串
   - common_name_zh（中文俗名；不合格时不要写真实物种名冒充；可空）
   - scientific_name（拉丁学名；不合格时必须空字符串，禁止把玩具写成 Ursus 等）
   - taxonomy：对象，键为 kingdom, phylum, class, order, family, genus, species。
     每一级值为对象 {"name_la":拉丁名或英文名或null,"name_zh":通行中文名或null}。
     不合格时 taxonomy 各级均为 null；合格时按证据填写。
     若该阶元没有稳定、通行的中文译名，name_zh 必须为 null，禁止臆造中译。
   - confidence_0_to_1（0~1 数字）
   - finest_reliable_rank（合格时：可靠最细阶元如 family/genus/species；不合格时空字符串）
   - blurb_zh（合格时：针对 finest_reliable_rank 的中文科普短文，3～4 行；不合格时可空）
   - notes（识别不确定性等简短技术备注）
3. 硬性禁止：
   - 玩具熊/雕像/卡通熊 → 不得标成棕熊等真实种，不得 collectible
   - 卡通人物/真人 → human 或 depiction_or_media，不得 collectible，不得按人类分类发卡
   - 书本/物体照片 → no_organism 或 depiction_or_media，不得硬凑生物分类
4. 不确定是否活体时：subject_kind=unclear，eligibility=not_collectible。
5. 合格但不确定种级时：finest_reliable_rank 最高只给到 genus 或 family，species 可为 null，不要编造异域种。
6. 若提供了地点，优先考虑该地可能出现的类群（仅对合格活体）。`;
}

export function extractIdentifyJson(text: string): IdentifyResult {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1].trim() : trimmed;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("model did not return JSON");
  const parsed = JSON.parse(raw.slice(start, end + 1)) as Partial<IdentifyResult> & {
    taxonomy?: unknown;
    subject_living?: unknown;
  };
  const taxonomy: Taxonomy = parsed.taxonomy
    ? normalizeTaxonomy(parsed.taxonomy)
    : emptyTaxonomy();

  const subjectLivingRaw = parsed.subject_living;
  const subject_living =
    typeof subjectLivingRaw === "boolean"
      ? subjectLivingRaw
      : String(subjectLivingRaw ?? "")
          .trim()
          .toLowerCase() === "true";

  return {
    common_name_zh: String(parsed.common_name_zh ?? ""),
    scientific_name: String(parsed.scientific_name ?? ""),
    taxonomy,
    confidence_0_to_1: Number(parsed.confidence_0_to_1 ?? 0),
    finest_reliable_rank: String(parsed.finest_reliable_rank ?? ""),
    blurb_zh: String(parsed.blurb_zh ?? "").trim(),
    notes: String(parsed.notes ?? ""),
    subject_kind: normalizeSubjectKind(parsed.subject_kind),
    subject_living,
    eligibility: normalizeEligibility(parsed.eligibility),
    ineligibility_reason_zh: String(parsed.ineligibility_reason_zh ?? "").trim(),
  };
}
