import { Agent, fetch as undiciFetch } from "undici";
import { env } from "../../env.js";
import { countryCodeFromZhName } from "./iso3166.js";

/**
 * 天地图逆地理编码 → 国家 alpha-2 + 可读地名。
 *
 * 实测要点（见 docs/OPS.md 附录 A.5）：
 * - `postStr` 必须百分号编码，否则返回 `{"msg":"参数格式错误","status":400}`
 * - 取值字段是 `result.addressComponent.nation`，返回**中文常用简称**（美国/英国/韩国）
 * - 境内另有 province / city / county；境外省市常空
 * - 海上等无陆地归属：`status:"0"`、`msg:"ok"`，但 nation 为**空字符串**——
 *   这是「成功且确实没有国家」，不是失败，不该触发离线兜底
 * - 台北返回 nation=中国 / province=台湾省，官方数据本身合规，无需我方归一化
 */

const ENDPOINT = "https://api.tianditu.gov.cn/geocoder";

/** 识别流程本身要花数秒到数十秒，不该再为地名多等。失败即走离线，不重试。 */
const TIMEOUT_MS = 2_000;

/** 约 1.1km 网格：同一地点连拍多张只算一次调用，又不会跨越国境。 */
const GRID_DEG = 0.01;

/** 上限防止长跑进程内存无界增长；超出即整体清空（这是省调用的缓存，不是正确性依赖）。 */
const CACHE_MAX = 5_000;

export type GeocodeOk = {
  ok: true;
  code: string | null;
  /** 可读地名（国内省市区 / 海外国家·城市）；海上等可为 null */
  label: string | null;
};

export type GeocodeOutcome =
  | GeocodeOk
  /** 调用未能得到结论，调用方应回落离线判定。 */
  | { ok: false; reason: "no_key" | "timeout" | "http" | "payload" | "network" };

type CacheVal = { code: string | null; label: string | null };

const cache = new Map<string, CacheVal>();

function gridKey(lat: number, lng: number): string {
  const snap = (v: number) => (Math.round(v / GRID_DEG) * GRID_DEG).toFixed(2);
  return `${snap(lat)},${snap(lng)}`;
}

/**
 * 必须显式直连：`identify/gemini.ts` 用 setGlobalDispatcher 装了出境代理，
 * 若沿用全局 dispatcher，对国内服务的请求会被绕去境外代理再回来。
 */
let directAgent: Agent | null = null;
function agent(): Agent {
  if (!directAgent) directAgent = new Agent();
  return directAgent;
}

type AddressComponent = {
  nation?: string;
  province?: string;
  city?: string;
  county?: string;
  town?: string;
};

type GeocoderResponse = {
  status?: string | number;
  msg?: string;
  result?: { addressComponent?: AddressComponent };
};

function pushUnique(parts: string[], next: string | undefined) {
  const t = (next ?? "").trim();
  if (!t) return;
  if (parts.some((p) => p === t || p.includes(t) || t.includes(p))) return;
  parts.push(t);
}

/** 国内：省+市+区连写；海外：国家 · 城市（有则）。 */
export function formatLocationLabel(ac: AddressComponent | undefined): string | null {
  if (!ac) return null;
  const nation = (ac.nation ?? "").trim();
  const code = countryCodeFromZhName(nation);
  const province = (ac.province ?? "").trim();
  const city = (ac.city ?? "").trim();
  const county = (ac.county ?? "").trim();

  if (code === "CN" || nation === "中国") {
    const parts: string[] = [];
    pushUnique(parts, province);
    pushUnique(parts, city);
    pushUnique(parts, county);
    return parts.length ? parts.join("") : nation || null;
  }

  const overseas: string[] = [];
  if (nation) overseas.push(nation);
  const locality = city || county || (ac.town ?? "").trim();
  if (locality && locality !== nation) overseas.push(locality);
  return overseas.length ? overseas.join(" · ") : null;
}

export async function tiandituCountryFromLatLng(
  lat: number,
  lng: number,
): Promise<GeocodeOutcome> {
  if (!env.tiandituServerKey) return { ok: false, reason: "no_key" };

  const key = gridKey(lat, lng);
  const hit = cache.get(key);
  if (hit) return { ok: true, code: hit.code, label: hit.label };

  const postStr = JSON.stringify({ lon: Number(lng.toFixed(6)), lat: Number(lat.toFixed(6)), ver: 1 });
  const url =
    `${ENDPOINT}?postStr=${encodeURIComponent(postStr)}` +
    `&type=geocode&tk=${encodeURIComponent(env.tiandituServerKey)}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await undiciFetch(url, {
      signal: ctrl.signal,
      dispatcher: agent(),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { ok: false, reason: "http" };

    const body = (await res.json()) as GeocoderResponse;
    // status 是字符串 "0" 表示成功；非 0 时 msg 里带原因
    if (String(body.status ?? "") !== "0") return { ok: false, reason: "payload" };

    const ac = body.result?.addressComponent;
    const code = countryCodeFromZhName(ac?.nation);
    const label = formatLocationLabel(ac);
    if (cache.size >= CACHE_MAX) cache.clear();
    cache.set(key, { code, label });
    return { ok: true, code, label };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return { ok: false, reason: aborted ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}

/** 仅供测试/诊断。 */
export function tiandituCacheSize(): number {
  return cache.size;
}
