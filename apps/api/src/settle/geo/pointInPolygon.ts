import type { Point, Polygon } from "./topojson.js";

/**
 * 射线法判断点是否在单个环内。
 * 经度跨 ±180 的环（如俄罗斯、斐济）由调用方按拆分后的多边形分别判断，
 * world-atlas 数据已按此拆好，无需在此处理跨日界线。
 */
function pointInRing(lng: number, lat: number, ring: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (!a || !b) continue;
    const [xi, yi] = a;
    const [xj, yj] = b;
    const straddles = yi > lat !== yj > lat;
    if (!straddles) continue;
    // 求边与水平射线的交点横坐标
    const t = (lat - yi) / (yj - yi);
    if (lng < xi + t * (xj - xi)) inside = !inside;
  }
  return inside;
}

/** 在外环内且不在任何内环（洞）内。 */
export function pointInPolygon(lng: number, lat: number, polygon: Polygon): boolean {
  const outer = polygon[0];
  if (!outer || !pointInRing(lng, lat, outer)) return false;
  for (let i = 1; i < polygon.length; i += 1) {
    const hole = polygon[i];
    if (hole && pointInRing(lng, lat, hole)) return false;
  }
  return true;
}
