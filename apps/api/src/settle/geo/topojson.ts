/**
 * 极小 TopoJSON 解码器：只支持本项目实际用到的部分
 * （Topology + GeometryCollection + Polygon/MultiPolygon + 量化 transform）。
 *
 * 为什么不引运行时依赖：离线国别判定只是天地图逆地理失败时的兜底路径，
 * 为它加一个包不值得；解码逻辑本身是确定的，可被单测覆盖。
 */

export type Point = [number, number];
/** 一个多边形：第0 个是外环，其余为内环（洞）。 */
export type Ring = Point[];
export type Polygon = Ring[];

export type TopoTransform = {
  scale: [number, number];
  translate: [number, number];
};

type TopoGeometry = {
  type: string;
  id?: string | number;
  arcs?: unknown;
  properties?: Record<string, unknown>;
};

export type Topology = {
  type: "Topology";
  transform?: TopoTransform;
  arcs: number[][][];
  objects: Record<string, { type: string; geometries?: TopoGeometry[] }>;
};

/** 量化坐标 + delta 编码 → 绝对经纬度。无 transform 时按原样返回。 */
function decodeArc(arc: number[][], transform?: TopoTransform): Point[] {
  const out: Point[] = [];
  let x = 0;
  let y = 0;
  for (const pair of arc) {
    const dx = pair[0] ?? 0;
    const dy = pair[1] ?? 0;
    if (transform) {
      x += dx;
      y += dy;
      out.push([
        x * transform.scale[0] + transform.translate[0],
        y * transform.scale[1] + transform.translate[1],
      ]);
    } else {
      out.push([dx, dy]);
    }
  }
  return out;
}

/** 按arc 索引拼环。负索引 ~i 表示反向使用 arc i。 */
function ringFromArcIndices(indices: number[], decoded: Point[][]): Ring {
  const ring: Ring = [];
  for (const idx of indices) {
    const reversed = idx < 0;
    const arc = decoded[reversed ? ~idx : idx];
    if (!arc) continue;
    const pts = reversed ? [...arc].reverse() : arc;
    // 相邻 arc 首尾共享一个点，拼接时去重
    if (ring.length > 0) ring.push(...pts.slice(1));
    else ring.push(...pts);
  }
  return ring;
}

function isNumberMatrix(v: unknown): v is number[][] {
  return Array.isArray(v) && v.every((r) => Array.isArray(r));
}

export type DecodedFeature = {
  /** TopoJSON 的 id；world-atlas 用 ISO 3166-1 numeric 字符串。 */
  id: string;
  polygons: Polygon[];
  /** [minLng, minLat, maxLng, maxLat]，用于 PIP 前的粗筛。 */
  bbox: [number, number, number, number];
};

function bboxOf(polygons: Polygon[]): [number, number, number, number] {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const poly of polygons) {
    for (const ring of poly) {
      for (const [lng, lat] of ring) {
        if (lng < minLng) minLng = lng;
        if (lat < minLat) minLat = lat;
        if (lng > maxLng) maxLng = lng;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }
  return [minLng, minLat, maxLng, maxLat];
}

/** 解码指定 object（如 "countries"）下的全部 Polygon/MultiPolygon。 */
export function decodeTopology(topo: Topology, objectName: string): DecodedFeature[] {
  const layer = topo.objects?.[objectName];
  const geometries = layer?.geometries ?? [];
  const decodedArcs = topo.arcs.map((a) => decodeArc(a, topo.transform));

  const out: DecodedFeature[] = [];
  for (const geom of geometries) {
    if (geom.id == null) continue;
    let polygons: Polygon[] = [];

    if (geom.type === "Polygon" && isNumberMatrix(geom.arcs)) {
      polygons = [geom.arcs.map((ringIdx) => ringFromArcIndices(ringIdx, decodedArcs))];
    } else if (geom.type === "MultiPolygon" && Array.isArray(geom.arcs)) {
      polygons = (geom.arcs as number[][][])
        .filter(isNumberMatrix)
        .map((poly) => poly.map((ringIdx) => ringFromArcIndices(ringIdx, decodedArcs)));
    } else {
      continue;
    }

    polygons = polygons.filter((p) => p.length > 0 && (p[0]?.length ?? 0) >= 4);
    if (!polygons.length) continue;

    out.push({ id: String(geom.id), polygons, bbox: bboxOf(polygons) });
  }
  return out;
}
