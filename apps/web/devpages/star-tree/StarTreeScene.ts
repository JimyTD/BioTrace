/**
 * 星空皮肤预研 —— 独立渲染器，不进生产环境。
 *
 * 复用 treeModel.ts 的数据和 geom.ts 的工具，完全替换渲染管线。
 * 通过 /dev/startree 独立访问。
 *
 * 核心隐喻：
 *   总览：八个星系团（八界），光点聚成星云
 *   展开：拉近视野，光点散开成子星群，级级递进 = 星系拉近
 *   连线：父子间极细淡光线（星座连线感）
 *   粒子：星尘漂浮、光晕呼吸
 */
import {
  type SpeciesTree,
  type TreeNode,
  labelOf,
} from "./treeModel";
import {
  type V3,
  add, nrm, scl,
  kvis, h01,
  lookAt, persp, m4mul,
  UP,
} from "./geom";

// ═══════════════════════ 常量 ═══════════════════════

/** 深空背景。压得比常见"科技蓝"更暗，才衬得出微光星点 */
const STAR_BG: V3 = [0.012, 0.018, 0.045];
/** 星点大小区间（像素）。幂律分布：绝大多数贴着 DIM，极少数逼近 MAX */
const STAR_SIZE_DIM = 1.1;
const STAR_SIZE_MAX = 11.0;

/**
 * 银河乳白光带的参数。
 *
 * 这条雾不是"画上去的"，是无数暗到分辨不出的一颗颗恒星叠加出来的
 * （见真实银河照片：the combined light of dim, unresolved stars）。
 * 所以这里也用海量极小极暗的点去堆，靠加法混合自然过曝成乳白。
 */
const HAZE_COUNT = 9000;
const HAZE_ALPHA = 0.16;

/**
 * 点尺寸参考距离（= 总览态相机距离）。
 * 星点的设计尺寸都以此距离为准，透视缩放围绕它做归一化。
 */
const STAR_REF_DIST = 220;

/**
 * 恒星色温表，从蓝白（O/B 型）到橙红（M 型）。
 * 真实夜空不是清一色冷白：参宿四橙红、十字架二蓝白、天狼白里泛蓝。
 * 界色仍是主色（保证八界可辨），色温只做冷暖微调。
 */
const STAR_TEMPS: V3[] = [
  [0.72, 0.82, 1.0],
  [0.85, 0.9, 1.0],
  [1.0, 1.0, 1.0],
  [1.0, 0.96, 0.87],
  [1.0, 0.88, 0.72],
  [1.0, 0.74, 0.56],
  [1.0, 0.62, 0.48],
];

/** 总览时八个星系团的布局半径 */
const GALAXY_RADIUS = 90;
/** 展开时子星群散布半径 */
const FAN_RADIUS_BASE = 60;
/**
 * 连线强度。
 *
 * 总览态会把整棵树的父子连线全画出来（几千条），加法混合下
 * 很容易叠加成一片白线团，把星点和银河全盖住 —— 这是本皮肤
 * 最该防的事。所以单条必须压得极淡，连线的本分是"暗示结构"，
 * 不是抢戏。
 */
const LINK_ALPHA = 0.05;

/** 视野角。略收一点，星图的纵深靠透视而不是大广角。 */
const FOV = Math.PI / 4;

// ═══════════════════════ Shader ═══════════════════════

const VS_STAR = `#version 300 es
layout(location=0) in vec3 aP;
layout(location=1) in vec3 aF;
layout(location=2) in vec3 aCol;
layout(location=3) in float aSize;
layout(location=4) in float aSeed;
layout(location=5) in float aMag;
uniform mat4 uVP;
uniform float uMorph;
uniform float uPx;
uniform float uRefDist;
out vec3 vCol;
out float vSize;
out float vSeed;
out float vMag;
void main() {
  vec3 p = mix(aP, aF, uMorph);
  vec4 c = uVP * vec4(p, 1.0);
  /* 点尺寸按"参考距离"归一化，不是直接除 c.w。
     相机在 220 远处，直接 /c.w 会把 1.1~11px 的星全压到 0.7px 下限
     —— 半物理像素不发光的点 = 一片全黑。
     除以 (c.w / uRefDist) 后，位于参考距离上的星恰好是设计尺寸，
     近了变大远了变小，这才是正确的透视缩放。 */
  float persp = c.w / max(uRefDist, 1e-3);
  float sz = clamp(aSize * uPx / max(persp, 0.06), 0.9, 64.0);
  vSize = sz;
  vCol = aCol;
  vSeed = aSeed;
  vMag = aMag;
  gl_PointSize = sz;
  gl_Position = c;
}`;

const FS_STAR = `#version 300 es
precision highp float;
in vec3 vCol;
in float vSize;
in float vSeed;
in float vMag;
uniform float uTime;
uniform float uAlpha;
out vec4 o;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float r = length(q) * 2.0;
  if (r > 1.0) discard;

  // 视亮度：幂律的结果。暗星是勉强可见的微光，亮星才过曝
  float lum = mix(0.34, 1.0, vMag * vMag);

  // 恒星是点光源：核心极小且过曝成白
  float core = exp(-r * r * 90.0);
  // 柔和辉光
  float glow = exp(-r * r * 9.0) * 0.5;
  // 亮星独有的大范围柔光（镜头与大气的散射感）
  float halo = exp(-r * 2.6) * vMag * vMag * 0.38;

  float a = (core + glow + halo) * lum;

  // 衍射星芒：只有够亮的星才看得出，细长十字，角度随种子
  if (vMag > 0.5 && vSize > 3.0) {
    float ang = atan(q.y, q.x) + vSeed * 6.28318;
    float beam = pow(abs(cos(ang * 2.0)), 26.0);
    a += beam * exp(-r * 3.2) * (vMag - 0.5) * 1.6;
  }

  // 微光星轻微闪烁，亮星稳定（亮星闪是大气扰动，不是恒星本身）
  a *= 1.0 + (1.0 - vMag) * 0.22 * sin(vSeed * 40.0 + uTime * 1.3);

  a *= uAlpha;
  if (a < 0.004) discard;

  // 核心过曝偏白，边缘保留恒星色温
  vec3 c = mix(vCol, vec3(1.0), clamp(core * 1.1, 0.0, 0.92));

  // 预乘 alpha：配合加法混合，密集处自然叠加成乳白（银河的成因）
  o = vec4(c * a, a);
}`;

const VS_LINK = `#version 300 es
layout(location=0) in vec3 aP0;
layout(location=1) in vec3 aP1;
layout(location=2) in vec3 aF0;
layout(location=3) in vec3 aF1;
layout(location=4) in float aAlpha;
layout(location=5) in float aLvl;
uniform mat4 uVP;
uniform float uMorph;
uniform float uFocusLvl;
out float vAlpha;
void main() {
  vec3 p0 = mix(aP0, aF0, uMorph);
  vec3 p1 = mix(aP1, aF1, uMorph);
  vec3 p = gl_VertexID % 2 == 0 ? p0 : p1;
  /* 只让焦点附近两三层的连线显形。
     整棵树几千条连线全画出来，加法混合下会叠成一片白线团，
     星点和银河全被盖住 —— 那就不是星空了。
     星座之所以是星座，正因为只连该连的那几颗。 */
  float d = aLvl - uFocusLvl;
  float near = d < 0.0 ? 1.0 : exp(-d * 1.1);
  vAlpha = aAlpha * near;
  gl_Position = uVP * vec4(p, 1.0);
}`;

const FS_LINK = `#version 300 es
precision highp float;
in float vAlpha;
uniform float uLinkAlpha;
out vec4 o;
void main() {
  float a = vAlpha * uLinkAlpha;
  /* 必须预乘 alpha。
     整场是加法混合（ONE, ONE），RGB 会被直接累加，
     不预乘的话 alpha 形同虚设、每条线都满亮度烧上去。 */
  vec3 c = vec3(0.55, 0.66, 0.9) * a;
  o = vec4(c, a);
}`;

const VS_PARTICLE = `#version 300 es
layout(location=0) in vec3 aP;
layout(location=1) in float aSeed;
uniform mat4 uVP;
uniform float uTime;
uniform float uPx;
uniform float uRefDist;
uniform float uAlpha;
out float vAlpha;
out float vSeed;
void main() {
  // 极缓慢的自行。银河里的星不是尘埃，不该飘
  float drift = uTime * 0.02;
  float rx = sin(aSeed * 12.9898 + drift) * 0.5;
  float ry = cos(aSeed * 78.233 + drift * 1.3) * 0.5;
  float rz = sin(aSeed * 45.164 + drift * 0.7) * 0.5;
  vec3 p = aP + vec3(rx, ry, rz) * 1.2;
  vec4 c = uVP * vec4(p, 1.0);
  /* 同星点：按参考距离归一化，否则远处的雾点全塌到下限、一条光带都出不来 */
  float persp = c.w / max(uRefDist, 1e-3);
  float sz = clamp(1.7 * uPx / max(persp, 0.06), 0.8, 7.0);
  vAlpha = uAlpha * aSeed;
  vSeed = aSeed;
  gl_PointSize = sz;
  gl_Position = c;
}`;

const FS_PARTICLE = `#version 300 es
precision highp float;
in float vAlpha;
in float vSeed;
out vec4 o;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float r = length(q) * 2.0;
  if (r > 1.0) discard;
  // 极软的衰减：单颗几乎看不见，成千上万颗叠起来才是乳白的光
  float glow = exp(-r * r * 7.0);
  float a = glow * vAlpha;
  if (a < 0.002) discard;
  // 乳白偏暖：银河的光是大量恒星混色后的结果，不是纯蓝
  vec3 c = mix(vec3(0.72, 0.78, 1.0), vec3(1.0, 0.97, 0.92), glow * 0.6);
  o = vec4(c * a, a);
}`;

// ═══════════════════════ 类型 ═══════════════════════

export type StarTreeEvents = {
  onPick: (node: TreeNode, canExpand: boolean) => void;
  onBlank: () => void;
  onFocus: (node: TreeNode) => void;
};

type StarGeo = {
  p0: V3;       // 总览位置
  p1: V3;       // 展开位置
  col: V3;      // 颜色（界色 + 恒星色温）
  size: number; // 光点大小（像素）
  mag: number;  // 视亮度 0~1，幂律分布：极少数亮星，绝大多数微光
  seed: number; // 随机种子
  lvl: number;  // 分类层级（界=0，往下递增；根为负）
  parentIdx: number;
};

// ═══════════════════════ 主类 ═══════════════════════

export class StarTreeScene {
  private cv: HTMLCanvasElement;
  private labelHost: HTMLDivElement;
  private gl: WebGL2RenderingContext;
  private ev: StarTreeEvents;
  private root: TreeNode;
  private tree: SpeciesTree;

  private W = 0;
  private H = 0;
  private PX = 1;

  // 几何
  private stars: StarGeo[] = [];
  private starCount = 0;

  // WebGL
  private pStar: WebGLProgram = null!;
  private pLink: WebGLProgram = null!;
  private pParticle: WebGLProgram = null!;
  private vaoStar: WebGLVertexArrayObject = null!;
  private vaoLink: WebGLVertexArrayObject = null!;
  private vaoParticle: WebGLVertexArrayObject = null!;
  private linkCount = 0;

  // 状态
  private focus: TreeNode;
  private morph = 0;
  private morphGoal = 0;
  private phase: "idle" | "in" | "out" = "idle";

  // 相机
  private cam = {
    yaw: 0.3,
    pitch: 0.15,
    dist: 220,
    tgt: [0, 20, 0] as V3,
    drag: false,
    px: 0,
    py: 0,
    moved: false,
    spin: 0.04,
  };
  private camGoal = {
    yaw: 0.3,
    pitch: 0.15,
    dist: 220,
    tgt: [0, 20, 0] as V3,
    spin: 0.04,
  };

  private raf = 0;
  private dead = false;
  private last = 0;
  private time = 0;

  // 粒子
  private particleCount = HAZE_COUNT;
  private particles: Float32Array = null!;
  private particleSeeds: Float32Array = null!;

  // 标签
  private lab: HTMLButtonElement[] = [];
  private readonly POOLN = 40;
  private ftitle!: HTMLDivElement;
  private ftitleName!: HTMLElement;
  private ftitleMeta!: HTMLElement;

  constructor(
    host: HTMLDivElement,
    root: TreeNode,
    tree: SpeciesTree,
    ev: StarTreeEvents,
  ) {
    this.root = root;
    this.tree = tree;
    this.focus = root;
    this.ev = ev;

    this.cv = document.createElement("canvas");
    this.cv.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%";
    host.appendChild(this.cv);

    this.labelHost = document.createElement("div");
    this.labelHost.style.cssText =
      "position:absolute;inset:0;pointer-events:none;overflow:hidden";
    host.appendChild(this.labelHost);

    const gl = this.cv.getContext("webgl2", {
      alpha: false,
      antialias: true,
      premultipliedAlpha: false,
    });
    if (!gl) throw new Error("WebGL2 not available");
    this.gl = gl;

    this.initGL();
    this.buildLabels();
    this.buildStars(root);
    this.buildParticles();
    this.uploadAll();
    this.bindInput();
    this.onResize();

    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  /** 暴露整棵树（含 byId），宿主可据此做 URL ↔ 焦点互转。 */
  getTree(): SpeciesTree {
    return this.tree;
  }

  // ═══════════════════════ WebGL ═══════════════════════

  private initGL() {
    const gl = this.gl;
    this.pStar = this.compile(VS_STAR, FS_STAR);
    this.pLink = this.compile(VS_LINK, FS_LINK);
    this.pParticle = this.compile(VS_PARTICLE, FS_PARTICLE);
    gl.enable(gl.BLEND);
    /* 加法混合（ONE, ONE）。
       恒星是点光源，光只会叠加不会遮挡；银河那条乳白带正是
       无数暗星的光加出来的。用普通的 alpha 混合会出现"前面的
       点把后面的点盖住"的塑料感，所以整场都用加法。
       着色器已输出预乘 alpha，故这里两项都是 ONE。 */
    gl.blendFunc(gl.ONE, gl.ONE);
  }

  private compile(vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const mkShader = (src: string, type: number) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const err = gl.getShaderInfoLog(sh);
        gl.deleteShader(sh);
        throw new Error(err ?? "shader compile failed");
      }
      return sh;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, mkShader(vs, gl.VERTEX_SHADER));
    gl.attachShader(p, mkShader(fs, gl.FRAGMENT_SHADER));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(p) ?? "program link failed");
    }
    return p;
  }

  // ═══════════════════════ 建星图 ═══════════════════════

  private buildStars(root: TreeNode) {
    this.stars = [];
    const kingdoms = root.ch.filter((c) => c.lvl === 0);
    const kn = kingdoms.length;

    const collect = (nd: TreeNode, parentIdx: number): number => {
      const idx = this.stars.length;
      const seed = this.hashId(nd.id);

      // ── 星等：幂律分布 ──
      // 真实夜空里亮星是极少数，满天绝大多数是勉强可见的微光。
      // 均匀分布会让所有星点一样大、一样亮，那就成了"撒芝麻"，不是星空。
      // 用 u^3 把绝大多数压向 0（微光），只留一条长长的亮星尾巴。
      const u = this.hashId(nd.id + "#mag");
      const mag = Math.pow(u, 3);

      // 收集到的物种：确实该更亮（这是"我的图鉴"的意义），
      // 但幅度要压住 —— 一颗被点亮的星不该盖过整条银河的层次。
      const lit = nd.got > 0 ? 0.28 : 0;

      // 高阶元（界/门）本来就该是这片天区里最显眼的定位星
      const rankBoost = nd.lvl <= 0 ? 0.42 : Math.max(0, 0.22 - nd.lvl * 0.05);
      const bm = Math.min(1, mag + lit + rankBoost);

      // 大小跟着星等走，但暗星不缩到 0（否则整棵树在远处会消失）
      const size = STAR_SIZE_DIM + bm * (STAR_SIZE_MAX - STAR_SIZE_DIM);

      // ── 色温：界色是主色（保证八界可辨），再叠一层恒星冷暖 ──
      const vis = kvis(nd.kingdom);
      const temp = STAR_TEMPS[
        Math.floor(this.hashId(nd.id + "#t") * STAR_TEMPS.length)
      ]!;
      // 亮星更接近本身的色温（看得出蓝白/橙红），暗星偏冷偏灰
      const col: V3 = [
        Math.min(1, vis.c[0] * temp[0] + (1 - bm) * 0.05),
        Math.min(1, vis.c[1] * temp[1] + (1 - bm) * 0.05),
        Math.min(1, vis.c[2] * temp[2] + (1 - bm) * 0.05),
      ];

      let p0: V3;
      if (nd.lvl === 0) {
        // 界级：均匀分布在球面上（斐波那契球）
        const ki = kingdoms.indexOf(nd);
        const phi = Math.acos(1 - 2 * (ki + 0.5) / kn);
        const theta = Math.PI * (1 + Math.sqrt(5)) * ki;
        p0 = [
          GALAXY_RADIUS * Math.sin(phi) * Math.cos(theta),
          GALAXY_RADIUS * Math.sin(phi) * Math.sin(theta) + 15,
          GALAXY_RADIUS * Math.cos(phi),
        ];
      } else if (nd.lvl < 0) {
        p0 = [0, 0, 0];
      } else {
        const parent = this.stars[parentIdx]!;
        const spread = GALAXY_RADIUS * 0.12 * (1 + nd.lvl * 0.3);
        const a = seed * Math.PI * 2;
        const b = (seed * 1.7) % 1 * Math.PI;
        p0 = add(parent.p0, [
          Math.cos(a) * Math.sin(b) * spread,
          Math.sin(a) * Math.sin(b) * spread,
          Math.cos(b) * spread,
        ]);
      }

      let p1: V3;
      if (nd.lvl <= 0) {
        p1 = p0;
      } else {
        const parent = this.stars[parentIdx]!;
        const fanR = FAN_RADIUS_BASE / (1 + nd.lvl * 0.5);
        const a = seed * Math.PI * 2;
        const spreadAngle = 0.6 + nd.lvl * 0.15;
        p1 = add(parent.p1, [
          Math.cos(a) * fanR * spreadAngle,
          Math.sin(a) * fanR * spreadAngle * 0.6,
          (seed - 0.5) * fanR * 0.8,
        ]);
      }

      this.stars.push({
        p0, p1, col, size, mag: bm, seed, lvl: nd.lvl, parentIdx,
      });

      for (const ch of nd.ch) {
        collect(ch, idx);
      }

      return idx;
    };

    collect(root, -1);
    this.starCount = this.stars.length;
  }

  private hashId(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++)
      h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return (h >>> 0) / 4294967296;
  }

  // ═══════════════════════ 粒子 ═══════════════════════

  /**
   * 银河乳白光雾。
   *
   * 真实银河照片里那条乳白的光带，不是画出来的渐变，
   * 是无数暗到分辨不出的一颗颗恒星叠加出来的光。所以这里
   * 用海量极小极暗的点去堆，靠加法混合自然过曝 —— 而不是贴一张雾图。
   *
   * 三个从照片里学来的结构：
   *   · 银道面：星点集中在一个薄盘里（银河是扁平的），厚度按高斯衰减
   *   · 核球：靠近银心方向更密更亮
   *   · 暗尘带：巨大的尘埃云挡住后面的星光，把光带切出黑色裂缝
   */
  private buildParticles() {
    const n = this.particleCount;
    this.particles = new Float32Array(n * 3);
    this.particleSeeds = new Float32Array(n);
    const R = GALAXY_RADIUS * 2.35;

    for (let i = 0; i < n; i++) {
      // 确定性 hash，不用 Math.random：每次刷新形态一致，方便比对
      const h1 = h01(i, 11, 3, 7);
      const h2 = h01(i, 29, 5, 13);
      const h3 = h01(i, 47, 17, 23);
      const h4 = h01(i, 91, 31, 41);

      // 薄盘：半径铺开，但厚度压得很薄（银河的扁）
      const rad = Math.sqrt(h1) * R;
      const ang = h2 * Math.PI * 2;
      // 高斯厚度：大部分星点贴着银道面，少数散开到盘外
      const thick = (h3 + h3 + h3 + h4 - 2) * 0.5;
      const hgt = thick * GALAXY_RADIUS * 0.16 * (1 - rad / R * 0.45);

      this.particles[i * 3] = Math.cos(ang) * rad;
      this.particles[i * 3 + 1] = hgt;
      this.particles[i * 3 + 2] = Math.sin(ang) * rad;

      // 核球更亮 + 暗尘带遮光：两者相乘决定这一点的可见度
      const core = 1 - Math.min(1, rad / R);
      // 尘埃带沿盘面蜿蜒，不是规则条纹
      const dust = Math.sin(ang * 2.0 + h4 * 1.2) * 0.5 + 0.5;
      const lane = Math.min(1, Math.max(0, dust * 1.35 - 0.28));
      this.particleSeeds[i] = 0.2 + core * 0.55 * lane;
    }
  }

  // ═══════════════════════ 上传 ═══════════════════════

  private uploadAll() {
    const n = this.starCount;

    const p0 = new Float32Array(n * 3);
    const p1 = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const seed = new Float32Array(n);
    const mag = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      const s = this.stars[i]!;
      p0[i * 3] = s.p0[0]; p0[i * 3 + 1] = s.p0[1]; p0[i * 3 + 2] = s.p0[2];
      p1[i * 3] = s.p1[0]; p1[i * 3 + 1] = s.p1[1]; p1[i * 3 + 2] = s.p1[2];
      col[i * 3] = s.col[0]; col[i * 3 + 1] = s.col[1]; col[i * 3 + 2] = s.col[2];
      size[i] = s.size;
      seed[i] = s.seed;
      mag[i] = s.mag;
    }

    // 连线：父子对
    const links: number[] = [];
    for (let i = 1; i < n; i++) {
      const s = this.stars[i]!;
      if (s.parentIdx >= 0) links.push(s.parentIdx, i);
    }
    this.linkCount = links.length / 2;

    const linkP0 = new Float32Array(this.linkCount * 3);
    const linkP1 = new Float32Array(this.linkCount * 3);
    const linkF0 = new Float32Array(this.linkCount * 3);
    const linkF1 = new Float32Array(this.linkCount * 3);
    const linkAlpha = new Float32Array(this.linkCount);
    const linkLvl = new Float32Array(this.linkCount);

    for (let i = 0; i < this.linkCount; i++) {
      const pi = links[i * 2]!;
      const ci = links[i * 2 + 1]!;
      const ps = this.stars[pi]!;
      const cs = this.stars[ci]!;
      linkP0[i * 3] = ps.p0[0]; linkP0[i * 3 + 1] = ps.p0[1]; linkP0[i * 3 + 2] = ps.p0[2];
      linkP1[i * 3] = cs.p0[0]; linkP1[i * 3 + 1] = cs.p0[1]; linkP1[i * 3 + 2] = cs.p0[2];
      linkF0[i * 3] = ps.p1[0]; linkF0[i * 3 + 1] = ps.p1[1]; linkF0[i * 3 + 2] = ps.p1[2];
      linkF1[i * 3] = cs.p1[0]; linkF1[i * 3 + 1] = cs.p1[1]; linkF1[i * 3 + 2] = cs.p1[2];
      linkAlpha[i] = 0.3 + cs.seed * 0.4;
      linkLvl[i] = cs.lvl;
    }

    this.vaoStar = this.createVAO([
      { data: p0, loc: 0, size: 3 },
      { data: p1, loc: 1, size: 3 },
      { data: col, loc: 2, size: 3 },
      { data: size, loc: 3, size: 1 },
      { data: seed, loc: 4, size: 1 },
      { data: mag, loc: 5, size: 1 },
    ]);

    this.vaoLink = this.createVAO([
      { data: linkP0, loc: 0, size: 3 },
      { data: linkP1, loc: 1, size: 3 },
      { data: linkF0, loc: 2, size: 3 },
      { data: linkF1, loc: 3, size: 3 },
      { data: linkAlpha, loc: 4, size: 1 },
      { data: linkLvl, loc: 5, size: 1 },
    ]);

    this.vaoParticle = this.createVAO([
      { data: this.particles, loc: 0, size: 3 },
      { data: this.particleSeeds, loc: 1, size: 1 },
    ]);
  }

  private createVAO(
    attrs: { data: Float32Array; loc: number; size: number }[],
  ): WebGLVertexArrayObject {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    for (const a of attrs) {
      const buf = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, a.data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(a.loc);
      gl.vertexAttribPointer(a.loc, a.size, gl.FLOAT, false, 0, 0);
    }
    gl.bindVertexArray(null);
    return vao;
  }

  // ═══════════════════════ 标签 ═══════════════════════

  private buildLabels() {
    this.ftitle = document.createElement("div");
    this.ftitle.className = "tree3d-ftitle";
    this.ftitle.style.cssText =
      "position:absolute;pointer-events:none;color:#c8d6e5;" +
      "font-size:0.9rem;text-align:center;transform:translate(-50%,0)";
    this.ftitleName = document.createElement("b");
    this.ftitleMeta = document.createElement("span");
    this.ftitleMeta.style.cssText =
      "display:block;font-size:0.7rem;opacity:0.6";
    this.ftitle.append(this.ftitleName, this.ftitleMeta);
    this.labelHost.appendChild(this.ftitle);

    for (let i = 0; i < this.POOLN; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tree3d-nb";
      b.style.cssText =
        "position:absolute;transform:translate(-50%,-50%);pointer-events:auto;" +
        "background:rgba(10,15,30,0.75);border:1px solid rgba(100,140,200,0.3);" +
        "border-radius:12px;color:#b0c8e0;font-size:0.72rem;padding:3px 10px;" +
        "cursor:pointer;white-space:nowrap;backdrop-filter:blur(4px)";
      b.style.display = "none";
      b.innerHTML = '<span class="pill"></span>';
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const n = (b as any)._n as TreeNode | undefined;
        if (!n) return;
        const kids = this.kidsOf(n);
        this.ev.onPick(n, kids.length > 0 || n.ch.length > 0);
      });
      this.labelHost.appendChild(b);
      this.lab.push(b);
    }
  }

  private kidsOf(nd: TreeNode): TreeNode[] {
    return nd.ch.filter((c) => c.src !== "filler");
  }

  // ═══════════════════════ 输入 ═══════════════════════

  private bindInput() {
    const cv = this.cv;
    cv.addEventListener("pointerdown", (e) => {
      this.cam.drag = true;
      this.cam.px = e.clientX;
      this.cam.py = e.clientY;
      this.cam.moved = false;
      try { cv.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    });
    cv.addEventListener("pointermove", (e) => {
      if (!this.cam.drag) return;
      const dx = e.clientX - this.cam.px;
      const dy = e.clientY - this.cam.py;
      this.cam.px = e.clientX;
      this.cam.py = e.clientY;
      if (Math.abs(dx) + Math.abs(dy) > 3) this.cam.moved = true;
      this.camGoal.yaw -= dx * 0.005;
      this.camGoal.pitch = Math.max(
        -0.4,
        Math.min(0.9, this.camGoal.pitch + dy * 0.004),
      );
      this.camGoal.spin = 0;
    });
    cv.addEventListener("pointerup", () => {
      this.cam.drag = false;
      if (!this.cam.moved) this.ev.onBlank();
    });
    cv.addEventListener("pointercancel", () => {
      this.cam.drag = false;
    });
    cv.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.camGoal.dist = Math.max(
        40,
        Math.min(600, this.camGoal.dist * (1 + Math.sign(e.deltaY) * 0.1)),
      );
    }, { passive: false });
  }

  // ═══════════════════════ 导航 ═══════════════════════

  goTo(nd: TreeNode) {
    if (nd === this.focus && this.phase !== "idle") return;
    if (nd === this.focus) return;

    if (nd === this.root) {
      this.morphGoal = 0;
      this.camGoal.tgt = [0, 20, 0];
      this.camGoal.dist = 220;
      this.camGoal.pitch = 0.15;
      this.camGoal.spin = 0.04;
    } else {
      this.morphGoal = 1;
      const idx = this.findStarIndex(nd);
      if (idx >= 0) {
        const s = this.stars[idx]!;
        this.camGoal.tgt = s.p1;
        this.camGoal.dist = 80;
        this.camGoal.pitch = 0.1;
        this.camGoal.spin = 0;
      }
    }

    this.focus = nd;
    this.phase = this.morphGoal > this.morph ? "in" : "out";
    this.ev.onFocus(nd);
  }

  getFocus(): TreeNode {
    return this.focus;
  }

  private findStarIndex(nd: TreeNode): number {
    const targetSeed = this.hashId(nd.id);
    return this.stars.findIndex((s) => s.seed === targetSeed);
  }

  // ═══════════════════════ 渲染 ═══════════════════════

  private onResize() {
    const cv = this.cv;
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    if (w === this.W && h === this.H) return;
    this.W = w;
    this.H = h;
    this.PX = window.devicePixelRatio || 1;
    cv.width = w * this.PX;
    cv.height = h * this.PX;
    this.gl.viewport(0, 0, cv.width, cv.height);
  }

  private frame = (now: number) => {
    if (this.dead) return;
    const gl = this.gl;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;

    if (this.cv.clientWidth !== this.W || this.cv.clientHeight !== this.H) {
      this.onResize();
    }

    // morph 动画
    if (this.phase === "in") {
      this.morph = Math.min(1, this.morph + dt / 0.8);
      if (this.morph >= 1) this.phase = "idle";
    } else if (this.phase === "out") {
      this.morph = Math.max(0, this.morph - dt / 0.5);
      if (this.morph <= 0) this.phase = "idle";
    }

    // 相机缓动
    const k = Math.min(1, dt * 3.5);
    this.cam.yaw += (this.camGoal.yaw - this.cam.yaw) * k;
    this.cam.pitch += (this.camGoal.pitch - this.cam.pitch) * k;
    this.cam.dist += (this.camGoal.dist - this.cam.dist) * k;
    this.cam.yaw += this.camGoal.spin * dt;
    for (let i = 0; i < 3; i++) {
      this.cam.tgt[i] += (this.camGoal.tgt[i]! - this.cam.tgt[i]!) * k;
    }

    // 矩阵
    const asp = Math.max(0.2, this.W / this.H);
    const eye = add(this.cam.tgt, scl(this.camDir(), this.cam.dist));
    const V = lookAt(eye, this.cam.tgt, UP);
    const P = persp(FOV, asp, 1, 1200);
    const VP = m4mul(P, V);

    // 清屏
    gl.clearColor(STAR_BG[0], STAR_BG[1], STAR_BG[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // 渲染顺序：银河光雾在最底层（它是背景的一部分），星点叠在最上
    this.drawParticles(VP);
    this.drawLinks(VP);
    this.drawStars(VP);
    this.updateLabels(VP);

    this.raf = requestAnimationFrame(this.frame);
  };

  private camDir(): V3 {
    const cp = Math.cos(this.cam.pitch);
    return nrm([
      Math.sin(this.cam.yaw) * cp,
      Math.sin(this.cam.pitch),
      Math.cos(this.cam.yaw) * cp,
    ]);
  }

  private drawStars(VP: Float32Array) {
    const gl = this.gl;
    gl.useProgram(this.pStar);
    gl.uniformMatrix4fv(
      gl.getUniformLocation(this.pStar, "uVP"), false, VP,
    );
    gl.uniform1f(gl.getUniformLocation(this.pStar, "uMorph"), this.morph);
    gl.uniform1f(gl.getUniformLocation(this.pStar, "uPx"), this.PX);
    gl.uniform1f(
      gl.getUniformLocation(this.pStar, "uRefDist"), STAR_REF_DIST,
    );
    gl.uniform1f(gl.getUniformLocation(this.pStar, "uTime"), this.time);
    gl.uniform1f(gl.getUniformLocation(this.pStar, "uAlpha"), 0.95);
    gl.bindVertexArray(this.vaoStar);
    gl.drawArrays(gl.POINTS, 0, this.starCount);
    gl.bindVertexArray(null);
  }

  private drawLinks(VP: Float32Array) {
    if (!this.linkCount) return;
    const gl = this.gl;
    gl.useProgram(this.pLink);
    gl.uniformMatrix4fv(
      gl.getUniformLocation(this.pLink, "uVP"), false, VP,
    );
    gl.uniform1f(gl.getUniformLocation(this.pLink, "uMorph"), this.morph);
    gl.uniform1f(
      gl.getUniformLocation(this.pLink, "uFocusLvl"), this.focus.lvl,
    );
    gl.uniform1f(
      gl.getUniformLocation(this.pLink, "uLinkAlpha"), LINK_ALPHA,
    );
    gl.bindVertexArray(this.vaoLink);
    gl.drawArrays(gl.LINES, 0, this.linkCount * 2);
    gl.bindVertexArray(null);
  }

  private drawParticles(VP: Float32Array) {
    const gl = this.gl;
    gl.useProgram(this.pParticle);
    gl.uniformMatrix4fv(
      gl.getUniformLocation(this.pParticle, "uVP"), false, VP,
    );
    gl.uniform1f(gl.getUniformLocation(this.pParticle, "uTime"), this.time);
    gl.uniform1f(gl.getUniformLocation(this.pParticle, "uPx"), this.PX);
    gl.uniform1f(
      gl.getUniformLocation(this.pParticle, "uRefDist"), STAR_REF_DIST,
    );
    gl.uniform1f(
      gl.getUniformLocation(this.pParticle, "uAlpha"), HAZE_ALPHA,
    );
    gl.bindVertexArray(this.vaoParticle);
    gl.drawArrays(gl.POINTS, 0, this.particleCount);
    gl.bindVertexArray(null);
  }

  // ═══════════════════════ 标签更新 ═══════════════════════

  private project(p: V3, VP: Float32Array): [number, number] | null {
    const x = VP[0]! * p[0] + VP[4]! * p[1] + VP[8]! * p[2] + VP[12]!;
    const y = VP[1]! * p[0] + VP[5]! * p[1] + VP[9]! * p[2] + VP[13]!;
    const w = VP[3]! * p[0] + VP[7]! * p[1] + VP[11]! * p[2] + VP[15]!;
    if (w <= 0.001) return null;
    return [
      (x / w * 0.5 + 0.5) * this.W,
      (0.5 - y / w * 0.5) * this.H,
    ];
  }

  private updateLabels(VP: Float32Array) {
    // 焦点标题
    if (this.focus !== this.root && this.morph > 0.3) {
      const idx = this.findStarIndex(this.focus);
      if (idx >= 0) {
        const s = this.stars[idx]!;
        const p = this.project(s.p1, VP);
        if (p) {
          this.ftitle.style.left = p[0] + "px";
          this.ftitle.style.top = (p[1] - 30) + "px";
          this.ftitle.style.opacity = String(
            Math.max(0, (this.morph - 0.3) / 0.7),
          );
          this.ftitleName.textContent = labelOf(this.focus);
          this.ftitleMeta.textContent = this.focus.la;
        }
      }
    } else {
      this.ftitle.style.opacity = "0";
    }

    // 子节点标签
    const kids = this.kidsOf(this.focus);
    const N = Math.min(this.POOLN, kids.length);
    for (let i = 0; i < this.POOLN; i++) {
      const el = this.lab[i]!;
      const nd = kids[i];
      if (!nd || i >= N) {
        el.style.display = "none";
        continue;
      }
      const idx = this.findStarIndex(nd);
      if (idx < 0) { el.style.display = "none"; continue; }
      const s = this.stars[idx]!;
      const p = this.project(
        this.morph > 0.5 ? s.p1 : s.p0,
        VP,
      );
      if (!p || p[0] < -100 || p[0] > this.W + 100 ||
          p[1] < -50 || p[1] > this.H + 50) {
        el.style.display = "none";
        continue;
      }
      el.style.display = "block";
      el.style.left = p[0] + "px";
      el.style.top = p[1] + "px";
      (el as any)._n = nd;
      const pill = el.children[0] as HTMLElement;
      const name = labelOf(nd);
      if (pill.textContent !== name) pill.textContent = name;
    }
  }

  // ═══════════════════════ 生命周期 ═══════════════════════

  setCardOpen(_open: boolean) {
    // 星空皮肤暂不需要
  }

  destroy() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.cv.remove();
    this.labelHost.remove();
  }
}
