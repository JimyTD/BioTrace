import { countryZhNameFromCode } from "../settle/geo/iso3166.js";

const LEVEL_SEP = "·";
const PLACE_SEP = "-";

export type TripObsForSummary = {
  capturedAt: Date | null;
  createdAt: Date;
  locationLabel: string | null;
  countryCode: string | null;
};

/** 去掉省/市等行政后缀，供摘要展示。 */
export function shortAdminName(name: string): string {
  return name
    .trim()
    .replace(/维吾尔自治区$/u, "")
    .replace(/壮族自治区$/u, "")
    .replace(/回族自治区$/u, "")
    .replace(/特别行政区$/u, "")
    .replace(/自治区$/u, "")
    .replace(/自治州$/u, "")
    .replace(/(?:省|市|地区|盟|州)$/u, "");
}

/**
 * 从单条观察抽出「国/省·市…」层级（最细到市，不到区县）。
 * 国内 label 为天地图连写；海外为「国家 · 城市」。
 */
export function placePathFromObservation(obs: {
  locationLabel?: string | null;
  countryCode?: string | null;
}): string[] {
  const label = obs.locationLabel?.trim() ?? "";
  if (label) {
    if (label.includes("·")) {
      return label
        .split(/\s*·\s*/u)
        .map((p) => p.trim())
        .filter(Boolean)
        .map(shortAdminName)
        .filter(Boolean);
    }

    const cn = parseCnLabel(label);
    if (cn.length) return cn;
  }

  const nation = countryZhNameFromCode(obs.countryCode);
  return nation ? [nation] : [];
}

function parseCnLabel(label: string): string[] {
  const provRe =
    /^(内蒙古自治区|广西壮族自治区|西藏自治区|宁夏回族自治区|新疆维吾尔自治区|[^省]+省|[^自]+自治区|北京市|天津市|上海市|重庆市)/u;
  const m = label.match(provRe);
  if (!m) {
    // 无省头：尝试直接抽末尾市名
    const cities = [...label.matchAll(/([^区县乡镇街路\d]{2,}?市)/gu)].map((x) => x[1]!);
    if (!cities.length) return [];
    return [shortAdminName(cities[cities.length - 1]!)].filter(Boolean);
  }

  const provRaw = m[1]!;
  const rest = label.slice(provRaw.length);
  const levels = [shortAdminName(provRaw)].filter(Boolean);

  // 直辖市：省名即市，不再拼下级（区县丢掉）
  if (/^(北京|天津|上海|重庆)/u.test(levels[0] ?? "")) {
    return levels;
  }

  const cities = [...rest.matchAll(/([^区县乡镇街路\d]{2,}?市)/gu)].map((x) => x[1]!);
  if (cities.length) {
    const city = shortAdminName(cities[cities.length - 1]!);
    if (city && city !== levels[0]) levels.push(city);
  }
  return levels;
}

/** 多处地点：段内 · ，段间 - ；更具体路径吞掉同前缀的粗路径。 */
export function aggregatePlaceSummary(obsList: TripObsForSummary[]): string | null {
  const ordered = [...obsList].sort(
    (a, b) => obsTime(a).getTime() - obsTime(b).getTime(),
  );
  const firstSeen: string[] = [];
  const seen = new Set<string>();
  for (const obs of ordered) {
    const path = placePathFromObservation(obs);
    if (!path.length) continue;
    const key = path.join(LEVEL_SEP);
    if (seen.has(key)) continue;
    seen.add(key);
    firstSeen.push(key);
  }
  if (!firstSeen.length) return null;

  const kept = preferSpecificPlaces(firstSeen);
  // 保持首次出现顺序
  const order = new Map(firstSeen.map((p, i) => [p, i]));
  kept.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  return kept.join(PLACE_SEP);
}

function preferSpecificPlaces(paths: string[]): string[] {
  const byLen = [...paths].sort((a, b) => b.length - a.length);
  const kept: string[] = [];
  for (const p of byLen) {
    if (kept.some((k) => k === p || k.startsWith(`${p}${LEVEL_SEP}`))) continue;
    kept.push(p);
  }
  return kept;
}

function obsTime(obs: TripObsForSummary): Date {
  return obs.capturedAt ?? obs.createdAt;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function ymd(d: Date): { y: number; m: number; day: number; s: string } {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return { y, m, day, s: `${y}-${pad2(m)}-${pad2(day)}` };
}

/** 首末观察日；单日不写区间。 */
export function aggregateDateSummary(obsList: TripObsForSummary[]): string | null {
  if (!obsList.length) return null;
  let minT = Infinity;
  let maxT = -Infinity;
  for (const obs of obsList) {
    const t = obsTime(obs).getTime();
    if (t < minT) minT = t;
    if (t > maxT) maxT = t;
  }
  const from = ymd(new Date(minT));
  const to = ymd(new Date(maxT));
  if (from.s === to.s) return from.s;
  if (from.y === to.y) return `${from.s}–${pad2(to.m)}-${pad2(to.day)}`;
  return `${from.s}–${to.s}`;
}

export type TripMetaFields = {
  metaManualEnabled?: boolean | null;
  manualDateText?: string | null;
  manualPlaceText?: string | null;
};

export type TripSummaryResolved = {
  autoDateSummary: string | null;
  autoPlaceSummary: string | null;
  dateSummary: string | null;
  placeSummary: string | null;
};

/** 开关开且手填非空 → 覆盖；否则自动。关开关不展示手填。 */
export function resolveTripSummary(
  obsList: TripObsForSummary[],
  meta: TripMetaFields,
): TripSummaryResolved {
  const autoDateSummary = aggregateDateSummary(obsList);
  const autoPlaceSummary = aggregatePlaceSummary(obsList);
  const manualOn = Boolean(meta.metaManualEnabled);
  const manualDate = meta.manualDateText?.trim() || "";
  const manualPlace = meta.manualPlaceText?.trim() || "";
  return {
    autoDateSummary,
    autoPlaceSummary,
    dateSummary: manualOn && manualDate ? manualDate : autoDateSummary,
    placeSummary: manualOn && manualPlace ? manualPlace : autoPlaceSummary,
  };
}
