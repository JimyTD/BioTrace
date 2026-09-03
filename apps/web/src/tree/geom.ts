/** 三维小工具 + 界的视觉定义。从 prototypes/clear-tree/v2-roots.html 移植。 */
export type V3 = [number, number, number];

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scl = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const crs = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len3 = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export function nrm(a: V3): V3 {
  const l = len3(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
/** 与 d 正交的一组基 */
export function ortho(d: V3): [V3, V3] {
  const t: V3 = Math.abs(d[1]) < 0.92 ? [0, 1, 0] : [1, 0, 0];
  const u = nrm(crs(d, t));
  return [u, nrm(crs(d, u))];
}
export const UP: V3 = [0, 1, 0];

export function m4mul(a: Float32Array, b: Float32Array) {
  const o = new Float32Array(16);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + j]! * b[i * 4 + k]!;
      o[i * 4 + j] = s;
    }
  return o;
}
export function persp(fov: number, asp: number, n: number, f: number) {
  const t = 1 / Math.tan(fov / 2);
  const o = new Float32Array(16);
  o[0] = t / asp;
  o[5] = t;
  o[10] = (f + n) / (n - f);
  o[11] = -1;
  o[14] = (2 * f * n) / (n - f);
  return o;
}
export function lookAt(e: V3, c: V3, up: V3) {
  const z = nrm(sub(e, c));
  const x = nrm(crs(up, z));
  const y = crs(z, x);
  const o = new Float32Array(16);
  o[0] = x[0]; o[1] = y[0]; o[2] = z[0];
  o[4] = x[1]; o[5] = y[1]; o[6] = z[1];
  o[8] = x[2]; o[9] = y[2]; o[10] = z[2];
  o[12] = -dot(x, e); o[13] = -dot(y, e); o[14] = -dot(z, e);
  o[15] = 1;
  return o;
}

/** 二次贝塞尔取点 */
export function bez3(A: V3, B: V3, C: V3, t: number): V3 {
  const u = 1 - t;
  return [
    u * u * A[0] + 2 * u * t * B[0] + t * t * C[0],
    u * u * A[1] + 2 * u * t * B[1] + t * t * C[1],
    u * u * A[2] + 2 * u * t * B[2] + t * t * C[2],
  ];
}

/** 确定性 hash → [0,1)。必须用 imul：普通乘法超 2^53 会丢低位使 hash 退化。 */
export function h01(a: number, b: number, c: number, d: number) {
  let x =
    (Math.imul(a, 374761393) +
      Math.imul(b, 668265263) +
      Math.imul(c, 2246822519) +
      Math.imul(d, 3266489917)) | 0;
  x = Math.imul(x ^ (x >>> 15), 2246822519);
  x = Math.imul(x ^ (x >>> 13), 3266489917);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/**
 * 界的视觉定义。
 *
 * 三段式「高度即可及性」：越往上越容易拍到，越往下越隐微。
 * 见 docs/wip/物种树-结构议题.md §4.2。
 * 顺序即主枝的排布顺序，不要随意改动。
 */
export const KINGDOM_VIS: Record<
  string,
  { c: V3; zone: "crown" | "basal" | "root"; dead?: boolean }
> = {
  Animalia: { c: [0.29, 0.56, 0.71], zone: "crown" },
  Plantae: { c: [0.35, 0.62, 0.42], zone: "crown" },
  Fungi: { c: [0.77, 0.49, 0.27], zone: "crown" },
  Chromista: { c: [0.52, 0.45, 0.24], zone: "basal" },
  Protozoa: { c: [0.58, 0.42, 0.6], zone: "basal" },
  Bacteria: { c: [0.45, 0.52, 0.58], zone: "root" },
  Archaea: { c: [0.54, 0.5, 0.42], zone: "root" },
  Viruses: { c: [0.52, 0.52, 0.54], zone: "root", dead: true },
};
const FALLBACK = { c: [0.5, 0.5, 0.5] as V3, zone: "crown" as const };

export function kvis(kingdom: string) {
  return KINGDOM_VIS[kingdom] ?? FALLBACK;
}

/** 浅色版界色，用于 HTML 标签的左边框 */
export function kingdomHex(kingdom: string) {
  const c = kvis(kingdom).c;
  return (
    "#" +
    c
      .map((v) =>
        Math.round(255 - (255 - v * 255) * 0.42)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
