import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { countryCodeFromNumeric } from "./iso3166.js";
import { pointInPolygon } from "./pointInPolygon.js";
import { decodeTopology, type DecodedFeature, type Topology } from "./topojson.js";

/**
 * 离线国别判定：坐标 → ISO alpha-2。
 *
 * 数据：data/geo/countries-10m.topo.json（world-atlas，源自 Natural Earth 10m，公有领域）。
 * 量化网格约 400m × 190m，边境城市市中心不会误判到邻国。
 *
 * 懒加载：这是天地图逆地理失败时的兜底路径，正常流程不该触发。
 * 因此数据只在**首次真正需要时**才读盘并解码，之后常驻缓存；
 * 若线上路径一直健康，进程内不会为它花任何内存。
 */

const dataFile = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../data/geo/countries-10m.topo.json",
);

let features: DecodedFeature[] | null = null;
let loadFailed = false;

function load(): DecodedFeature[] | null {
  if (features) return features;
  if (loadFailed) return null;
  try {
    const topo = JSON.parse(readFileSync(dataFile, "utf8")) as Topology;
    features = decodeTopology(topo, "countries");
    if (!features.length) {
      console.warn("[geo] countries topology decoded to 0 features");
      loadFailed = true;
      return null;
    }
    return features;
  } catch (err) {
    console.warn("[geo] cannot load countries topology:", err instanceof Error ? err.message : err);
    loadFailed = true;
    return null;
  }
}

/**
 * 返回归一化后的 alpha-2；落在任何国家之外（海上等）返回 null。
 * null → 结算无国别：引入不警示；稀有度按 CN 回落（见 rarity/encounter effectiveCountry）。
 */
export function offlineCountryFromLatLng(lat: number, lng: number): string | null {
  const all = load();
  if (!all) return null;

  for (const feat of all) {
    const [minLng, minLat, maxLng, maxLat] = feat.bbox;
    // bbox 粗筛：绝大多数国家一次比较即被排除
    if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) continue;
    for (const polygon of feat.polygons) {
      if (pointInPolygon(lng, lat, polygon)) {
        return countryCodeFromNumeric(feat.id);
      }
    }
  }
  return null;
}

/** 仅供测试/诊断：确认数据可加载且规模合理。 */
export function offlineCountryDataSize(): number {
  return load()?.length ?? 0;
}
