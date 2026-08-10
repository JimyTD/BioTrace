import { Agent, fetch as undiciFetch } from "undici";
import { env } from "../../env.js";
import { countryCodeFromZhName } from "./iso3166.js";

/**
 * 天地图逆地理编码 → 国家 alpha-2。
 *
 * 实测要点（见 docs/map-geo-compliance-notes.md）：
 * - `postStr` 必须百分号编码，否则返回 `{"msg":"参数格式错误","status":400}`
 * - 取值字段是 `result.addressComponent.nation`，返回**中文常用简称**（美国/英国/韩国）
 * - 境外坐标同样返回 nation（省市为空），故可全局使用而不必按区域分流
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

export type GeocodeOutcome =
  /** 调用成功。code 为 null 表示该坐标确实不属于任何国家（海上等）。 */
  | { ok: true; code: string | null }
  /** 调用未能得到结论，调用方应回落离线判定。 */
  | { ok: false; reason: "no_key" | "timeout" | "http" | "payload" | "network" };

const cache = new Map<string, string | null>();

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

type GeocoderResponse = {
  status?: string | number;
  msg?: string;
  result?: { addressComponent?: { nation?: string } };
};

export async function tiandituCountryFromLatLng(
  lat: number,
  lng: number,
): Promise<GeocodeOutcome> {
  if (!env.tiandituServerKey) return { ok: false, reason: "no_key" };

  const key = gridKey(lat, lng);
  if (cache.has(key)) return { ok: true, code: cache.get(key) ?? null };

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

    const code = countryCodeFromZhName(body.result?.addressComponent?.nation);
    if (cache.size >= CACHE_MAX) cache.clear();
    cache.set(key, code);
    return { ok: true, code };
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
