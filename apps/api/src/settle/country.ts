/**
 * 坐标 → 国家 alpha-2（+ 可读地名，若线上逆地理成功）。
 *
 * 历史：这里曾是 23 个手写的经纬度矩形 + first-match-wins，导致首尔/河内/
 * 新德里等大量境外坐标被判成 CN（CN 的矩形覆盖了众多邻国且排在首位），
 * KR/VN/TW/SG 四条规则永远命中不到。稀有度与引入种名录因此在海外全部算错。
 *
 * 现在有两条路径：
 * - 线上优先：天地图逆地理（官方权威，境外亦可用；见 geo/tiandituGeocode.ts）
 * - 离线兜底：真实国界 + 点在多边形（见 geo/offlineCountry.ts）
 *
 * 台湾/香港/澳门的归入规则统一在 geo/iso3166.ts，本文件不做任何映射。
 */
import { validCoords } from "./geo/coords.js";
import { offlineCountryFromLatLng } from "./geo/offlineCountry.js";
import { tiandituCountryFromLatLng } from "./geo/tiandituGeocode.js";

/** 判定来源，落库用于日后只重跑该重跑的记录。 */
export type CountrySource = "tianditu" | "offline" | "none";

export type CountryResolution = {
  code: string | null;
  source: CountrySource;
  /** 仅线上逆地理有；离线兜底时为 null */
  locationLabel: string | null;
};

/**
 * 纯离线判定，同步。给测试与不便走网络的场合用；
 * 业务流程请用 resolveCountry。
 */
export function countryFromLatLng(
  lat: number | null | undefined,
  lng: number | null | undefined,
): string | null {
  const c = validCoords(lat, lng);
  if (!c) return null;
  return offlineCountryFromLatLng(c.lat, c.lng);
}

/**
 * 线上优先、离线兜底。
 *
 * 注意「成功但无国家」与「调用失败」是两件事：前者（海上等）直接采信 null,
 * 不该再去问离线数据；只有后者才回落。
 */
export async function resolveCountry(
  lat: number | null | undefined,
  lng: number | null | undefined,
): Promise<CountryResolution> {
  const c = validCoords(lat, lng);
  if (!c) return { code: null, source: "none", locationLabel: null };

  const online = await tiandituCountryFromLatLng(c.lat, c.lng);
  if (online.ok) {
    return { code: online.code, source: "tianditu", locationLabel: online.label };
  }

  return {
    code: offlineCountryFromLatLng(c.lat, c.lng),
    source: "offline",
    locationLabel: null,
  };
}
