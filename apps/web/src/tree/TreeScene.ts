/**
 * 物种树的 WebGL 场景。框架无关 —— React 只负责挂容器、传数据、接回调。
 *
 * 从 prototypes/clear-tree/v2-roots.html 移植。原型里踩过的坑记在
 * docs/wip/物种树-结构议题.md §5，改参数前先读那张表。
 *
 * ── 两套顶点缓冲 ────────────────────────────────────────────
 * tree 态（全树）与 fan 态（展开某一支）同时写进顶点属性，
 * 由 shader 的 uMorph 插值 —— 展开是连续变形，不是场景切换。
 *
 * ── 为什么展开层要单独一套高分辨率缓冲 ─────────────────────
 * 大树缓冲为省内存给深层枝只分 2~4 段（总览时它们只占几像素）。
 * 展开后同一根枝会放大到半个屏幕，2 段就是两条直线 —— 折线感的根因。
 * 全局提高段数太贵；展开时可见的枝最多几百根，单独给它们 10 段即可。
 */
import { formatRank, t } from "@biotrace/messages";
import { batchKids, FAN_BATCH, labelOf, orderKids, RANKS, type TreeNode } from "./treeModel";
import {
  type V3,
  add, bez3, dot, h01, kingdomHex, kvis, len3, lookAt, m4mul, nrm, ortho, persp, scl, sub, UP,
} from "./geom";

/** 每级枝的分段数，按 lvl+1 索引：主干/界/门/纲/目/科/属 */
const SEGS = [10, 8, 8, 6, 6, 4, 2];
const FOV = Math.PI / 4;
const BG: V3 = [0.933, 0.949, 0.965];
const GOLD = 2.399963;

const S = 62; // 扇形世界尺度
const FAN_LEN = [0, S * 0.5, S * 0.255, S * 0.15, S * 0.088];
const FAN_SPREAD = [0, 1.0, 0.72, 0.58, 0.5];
const MAXREL = 4;
const FUZZ = S * 0.032;
const ZOFF = S * 0.3;
const MAXEX = 1600;
const EX_SEGS = 10;
const TRUNK_H = 132;
/** 目科属种未收集时往灰里收多少。界门纲不走这条。 */
const COLLECT_UNLIT = 0.52;
/** 总览每节点最多几根外沿子枝。其余缩在冠内。大概画，不跟真扇出走。 */
const OV_VIS_KIDS = 9;

/**
 * 树冠布局表（拍板 2026-09-04）。
 *
 * 取消了原来的「中枝」—— 色藻/原生动物贴在主干腰上像瘤子，语义上它们也
 * 不是「介于地上地下之间」，就是不起眼的真核生物。改成树冠里的矮枝。
 *
 * tier：0=高枝 1=中高枝 2=矮枝（从主干 3/4 高处分出）
 * split：几何上拆成几支。**只影响形态，数据结构不变** —— 动物界 34 个门
 *   全挂一根枝上会粗得像根柱子，拆两支才有大枝杈的体量感。
 */
const CANOPY: Record<string, { tier: 0 | 1 | 2; split: number }> = {
  Animalia: { tier: 0, split: 2 },
  Plantae: { tier: 0, split: 2 },
  Fungi: { tier: 1, split: 1 },
  Chromista: { tier: 2, split: 1 },
  Protozoa: { tier: 2, split: 1 },
};
const CANOPY_DEF = { tier: 1 as const, split: 1 };
/** 三档枝长（主干高的倍数）。写死 —— 不随子级数量浮动，否则数据一变形态就乱。 */
const TIER_LEN = [0.72, 0.62, 0.20];
/** 档内 ±8% 的稳定扰动，避免同档几根一模一样长。 */
const TIER_JIT = 0.08;
/** 矮枝在主干上的分叉高度 */
const TIER2_AT = 0.70;
/** 拆枝：每根次主枝的分段数 */
const FORK_SEGS = 6;

type Fork = { A: V3; B: V3; C: V3 };

/**
 * 布局版本开关，仅用于 A/B 对比：`?layout=old` 走改造前的三段式。
 * 默认走新版，正式行为不受影响。对比看完即可删除本开关与 `growTrunkOld`。
 */
const LAYOUT_OLD = typeof location !== "undefined"
  && new URLSearchParams(location.search).get("layout") === "old";

type Geo = {
  vs: number; ve: number; ls: number; le: number; selfVs: number;
  p0: V3; p1: V3; dir: V3; L: number; w0: number; w1: number; depth: number;
  bA: V3; bB: V3; bC: V3; tA: V3; tB: V3; tC: V3;
  centroid?: V3;
  leafIdx: number[];
  fp?: V3;
  fbase?: V3;
};

export type TreeSceneEvents = {
  /** 点了某个节点。canExpand=false 表示末端，树不动只出卡 */
  onPick: (node: TreeNode, canExpand: boolean) => void;
  onBlank: () => void;
  /** 焦点变了（含动画开始时），用于同步 URL / 面包屑 */
  onFocus: (node: TreeNode) => void;
};

export type SceneStats = { branches: number; leaves: number; growMs: number };

/** 节点 id → 稳定整数，供 h01 使用 */
function strId(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const VS_BRANCH = `#version 300 es
layout(location=0) in vec3 aP0; layout(location=1) in vec3 aP1;
layout(location=2) in vec3 aF0; layout(location=3) in vec3 aF1;
layout(location=4) in vec2 aST; layout(location=5) in vec2 aW;
layout(location=6) in vec2 aWF; layout(location=7) in vec3 aCol;
layout(location=8) in float aFoc;
uniform mat4 uVP, uV;
uniform float uMorph, uOnly, uPx, uFogN, uFogF, uWK;
uniform vec2 uRes;
out vec3 vCol; out float vFog; out float vSide; out float vY;
void main(){
  float keep = (aFoc<-0.5) ? 0.0
             : ((uOnly>1.5) ? 1.0 : ((uOnly>0.5) ? aFoc : 1.0-aFoc));
  vec3 p0 = mix(aP0,aF0,uMorph);
  vec3 p1 = mix(aP1,aF1,uMorph);
  float t = aST.y;
  vec3 p  = mix(p0,p1,t);
  float w = mix(mix(aW.x,aW.y,t), mix(aWF.x,aWF.y,t), uMorph) * uWK;
  vec4 c0=uVP*vec4(p0,1.0), c1=uVP*vec4(p1,1.0), c=uVP*vec4(p,1.0);
  vec2 s0=c0.xy/max(abs(c0.w),1e-3)*uRes;
  vec2 s1=c1.xy/max(abs(c1.w),1e-3)*uRes;
  vec2 d=s1-s0;
  d = (dot(d,d)<1e-8)? vec2(1.0,0.0) : normalize(d);
  vec2 nn=vec2(-d.y,d.x);
  float wpx=max(w*uPx/max(abs(c.w),1e-3), 1.15);
  c.xy += nn*aST.x*wpx/uRes*c.w;
  float vz=-(uV*vec4(p,1.0)).z;
  vFog=clamp((vz-uFogN)/max(uFogF-uFogN,1.0),0.0,1.0);
  vCol=aCol; vSide=aST.x; vY=p.y;
  gl_Position = c*keep + vec4(0.0,0.0,2.0,1.0)*(1.0-keep);
}`;

const FS_BRANCH = `#version 300 es
precision highp float;
in vec3 vCol; in float vFog; in float vSide; in float vY;
uniform highp vec3 uFog;
uniform highp float uFogK, uDesat, uHorizon;
out vec4 o;
void main(){
  float m=abs(vSide);
  float sh = 0.74 + 0.20*(1.0-m) + 0.10*smoothstep(0.34,0.0,m);
  vec3 c = vCol*sh;
  float g = dot(c, vec3(0.34,0.5,0.16));
  c = mix(c, vec3(g), uDesat);
  float fog=vFog*uFogK;
  // 地平雾带：地面附近淡入背景色，让「地上／地下」有一条柔和的界
  if(uHorizon>0.0){
    float band=1.0-smoothstep(0.0,uHorizon,abs(vY));
    fog=max(fog, band*0.62);
  }
  o = vec4(mix(c, uFog, fog), 1.0);
}`;

const VS_LEAF = `#version 300 es
layout(location=0) in vec3 aP; layout(location=1) in vec3 aF;
layout(location=2) in vec3 aCol; layout(location=3) in float aSz;
layout(location=4) in float aFoc;
uniform mat4 uVP, uV;
uniform float uMorph, uOnly, uPx, uFogN, uFogF, uSzK;
uniform float uBudOn, uBudT;
uniform vec3 uBud;
out vec3 vCol; out float vFog; out float vLY; out float vPx; out float vSeed;
void main(){
  float keep=(aFoc<-0.5) ? 0.0
           : ((uOnly>1.5)?1.0:((uOnly>0.5)?aFoc:1.0-aFoc));
  vec3 p = (uBudOn>0.5) ? mix(uBud, aF, uBudT) : mix(aP, aF, uMorph);
  vec4 c=uVP*vec4(p,1.0);
  float vz=-(uV*vec4(p,1.0)).z;
  vFog=clamp((vz-uFogN)/max(uFogF-uFogN,1.0),0.0,1.0);
  vCol=aCol; vLY=p.y;
  float sz=clamp(aSz*uSzK*uPx/max(abs(c.w),1e-3),1.0,26.0);
  vPx=sz;
  vSeed=fract(sin(float(gl_VertexID)*12.9898)*43758.5453);
  gl_PointSize=sz;
  gl_Position=c*keep+vec4(0.0,0.0,2.0,1.0)*(1.0-keep);
}`;

const FS_LEAF = `#version 300 es
precision highp float;
in vec3 vCol; in float vFog; in float vLY; in float vPx; in float vSeed;
uniform highp vec3 uFog;
uniform highp float uFogK, uDesat, uAlpha, uDeep, uHorizon, uLeaf;
out vec4 o;
void main(){
  vec2 q=gl_PointCoord-0.5;
  float a;
  if(uLeaf<0.5){
    float r=length(q);
    if(r>0.5) discard;
    a=smoothstep(0.5,0.24,r);
  }else{
    // 点精灵本身无法旋转，但 UV 可以：按 seed 转 UV 就能画朝向各异的叶片
    float ang=vSeed*6.28318;
    float cs=cos(ang), sn=sin(ang);
    vec2 r2=vec2(q.x*cs-q.y*sn, q.x*sn+q.y*cs);
    vec2 e=vec2(r2.x*2.05, r2.y*0.86);
    float taper=pow(max(0.0,1.0-abs(e.y)*2.0),0.60);
    float d=abs(e.x)*2.0/max(taper,0.05);
    float leaf=(1.0-smoothstep(0.55,1.0,d))*(1.0-smoothstep(0.40,0.5,abs(e.y)));
    float r=length(q);
    float pt=smoothstep(0.5,0.24,r);
    a=mix(pt,leaf,smoothstep(4.0,10.0,vPx));
  }
  a*=uAlpha;
  if(uHorizon>0.0){
    a*=mix(1.0,0.34,1.0-smoothstep(0.0,uHorizon,abs(vLY)));
  }
  if(a<0.01) discard;
  vec3 c=vCol*mix(1.0,0.58,uDeep);
  float g=dot(c,vec3(0.34,0.5,0.16));
  c=mix(c,vec3(g),uDesat);
  o=vec4(mix(c,uFog,vFog*uFogK), a);
}`;

const VS_FS = `#version 300 es
layout(location=0) in vec2 aQ; out vec2 vUv;
void main(){vUv=aQ*0.5+0.5;gl_Position=vec4(aQ,0.0,1.0);}`;

const FS_BLUR = `#version 300 es
precision highp float; in vec2 vUv;
uniform highp sampler2D uT; uniform highp vec2 uDir; out vec4 o;
void main(){
  vec4 s=texture(uT,vUv)*0.227027;
  s+=texture(uT,vUv+uDir*1.3846)*0.316216;
  s+=texture(uT,vUv-uDir*1.3846)*0.316216;
  s+=texture(uT,vUv+uDir*3.2308)*0.070270;
  s+=texture(uT,vUv-uDir*3.2308)*0.070270;
  o=s;
}`;

const FS_BLIT = `#version 300 es
precision highp float; in vec2 vUv;
uniform highp sampler2D uT; uniform highp float uAmt, uKeep;
uniform highp vec3 uBg; out vec4 o;
void main(){
  vec3 c=texture(uT,vUv).rgb;
  c=mix(uBg,c,uKeep);
  o=vec4(mix(uBg,c,uAmt),1.0);
}`;

export class TreeScene {
  private cv: HTMLCanvasElement;
  private labelHost: HTMLDivElement;
  private gl: WebGL2RenderingContext;
  private ev: TreeSceneEvents;
  private root: TreeNode;
  private geo = new Map<TreeNode, Geo>();
  private raf = 0;
  private dead = false;

  private W = 0; private H = 0; private PX = 1; private SQ = 1;

  private NV = 0; private NI = 0; private leafCount = 0;
  private aP0!: Float32Array; private aP1!: Float32Array;
  private aF0!: Float32Array; private aF1!: Float32Array;
  private aST!: Float32Array; private aW!: Float32Array; private aWF!: Float32Array;
  private aCol!: Float32Array; private aFoc!: Float32Array; private idx!: Uint32Array;
  private lP!: Float32Array; private lF!: Float32Array;
  private lCol!: Float32Array; private lSz!: Float32Array; private lFoc!: Float32Array;

  private sP0!: Float32Array; private sP1!: Float32Array;
  private sF0!: Float32Array; private sF1!: Float32Array;
  private sW!: Float32Array; private sWF!: Float32Array; private sCol!: Float32Array;
  private exCount = 0;

  private pB!: WebGLProgram; private uB: Record<string, WebGLUniformLocation | null> = {};
  private pL!: WebGLProgram; private uL: Record<string, WebGLUniformLocation | null> = {};
  private pBlur!: WebGLProgram; private uBlur: Record<string, WebGLUniformLocation | null> = {};
  private pBlit!: WebGLProgram; private uBlit: Record<string, WebGLUniformLocation | null> = {};
  private vaoB!: WebGLVertexArrayObject; private vaoL!: WebGLVertexArrayObject;
  private vaoS!: WebGLVertexArrayObject; private vaoQ!: WebGLVertexArrayObject;
  private vaoG!: WebGLVertexArrayObject;
  private eb!: WebGLBuffer; private ebS!: WebGLBuffer;
  private bF0!: WebGLBuffer; private bF1!: WebGLBuffer; private bWF!: WebGLBuffer;
  private bFoc!: WebGLBuffer; private blF!: WebGLBuffer; private blFoc!: WebGLBuffer;
  private bsP0!: WebGLBuffer; private bsP1!: WebGLBuffer; private bsF0!: WebGLBuffer;
  private bsF1!: WebGLBuffer; private bsW!: WebGLBuffer; private bsWF!: WebGLBuffer;
  private bsCol!: WebGLBuffer;
  private fboA: WebGLFramebuffer | null = null; private fboB: WebGLFramebuffer | null = null;
  private texA: WebGLTexture | null = null; private texB: WebGLTexture | null = null;
  private rbA: WebGLRenderbuffer | null = null;
  private FW = 0; private FH = 0;

  private GND_N = 2400;
  private gP!: Float32Array; private gC!: Float32Array; private gS!: Float32Array;

  private TREE_H = 1; private TREE_CY = 0;
  private bbCX = 0; private bbCZ = 0; private bbX0 = 0; private bbX1 = 0;
  private bbZ0 = 0; private bbZ1 = 0;
  private OV_TGT: V3 = [0, 0, 0];
  private fanBB: { r0: number; r1: number; u0: number; u1: number } | null = null;
  private fanBBRef: V3 = [0, 0, 0];
  private fanBBBasis: [V3, V3, V3] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

  private cam = { yaw: 0.55, pitch: 0.11, dist: 1, tgt: [0, 0, 0] as V3, spin: 0.055, drag: false, px: 0, py: 0, moved: false };
  private camGoal = { yaw: 0.55, pitch: 0.11, dist: 1, tgt: [0, 0, 0] as V3 };
  private focus!: TreeNode;
  private pending: TreeNode | null = null;
  private phase: "idle" | "in" | "out" = "idle";
  private morph = 0; private morphGoal = 0;
  /** 换茬时只驱动展开缓冲，不动全局 morph（否则镜头里整棵树会跟着缩回去）。 */
  private bloom = 1;
  private bloomClock = 1;
  private batchAnim: "idle" | "out" | "in" = "idle";
  private pendingPage = 0;
  private exMode: "open" | "retract" | "grow" = "open";
  private budOrigin: V3 | null = null;
  /** 展开态真正要画的叶点。其余子树叶一律藏，避免收成梢上那一坨。 */
  private fanLeaf: number[] = [];
  private blurAmt = 0; private blurGoal = 0;
  private swayT = 0; private swayK = 0;
  private focusBasis: [V3, V3, V3] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  private last = 0;

  private POOLN = 96;
  private lab: HTMLButtonElement[] = [];
  private ftitle!: HTMLDivElement;
  private budBtn!: HTMLButtonElement;
  private prevBtn!: HTMLButtonElement;
  private nextBudP: V3 | null = null;
  private nextBudBase: V3 | null = null;
  private prevBudP: V3 | null = null;
  private prevBudBase: V3 | null = null;
  private batchPage = 0;
  private batchFocusId = "";
  private batchPages = 1;
  private cardOpen = false;
  private vc = 0; private ic = 0; private lc = 0;
  /** 叶点世界尺寸。和树高挂钩，与所在层级的枝长脱钩（见 growLeaves 说明）。 */
  private leafSize = 1;

  stats: SceneStats = { branches: 0, leaves: 0, growMs: 0 };

  constructor(host: HTMLElement, root: TreeNode, ev: TreeSceneEvents) {
    this.root = root;
    this.ev = ev;
    this.cv = document.createElement("canvas");
    this.cv.className = "tree3d-canvas";
    host.appendChild(this.cv);
    this.labelHost = document.createElement("div");
    this.labelHost.className = "tree3d-labels";
    host.appendChild(this.labelHost);

    const gl = this.cv.getContext("webgl2", {
      antialias: true, alpha: false, preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error(t("tree3d.webgl2"));
    this.gl = gl;

    const t0 = performance.now();
    this.growAll();
    this.stats.growMs = Math.round(performance.now() - t0);
    this.initGL();
    this.buildLabels();
    this.resize();
    this.SQ = this.calcSQ();
    this.focus = root;
    this.applyFocus(root);
    this.bindInput();
    window.addEventListener("resize", this.onResize);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    this.raf = requestAnimationFrame((t) => { this.last = t; this.frame(t); });
  }

  destroy() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
    this.cv.remove();
    this.labelHost.remove();
  }

  /** 概要卡开关。开着时焦点大标题让位（卡里已有同样的名字，重复是噪音）。 */
  setCardOpen(v: boolean) { this.cardOpen = v; }

  /** 外部（URL 变化 / 面包屑）驱动焦点。 */
  goTo(node: TreeNode) {
    if (node === this.focus) return;
    this.batchAnim = "idle";
    this.bloom = 1;
    this.bloomClock = 1;
    this.pending = node;
    if (this.morph > 0.02) this.phase = "out";
    else { this.applyFocus(node); this.phase = "in"; this.pending = null; }
    this.ev.onFocus(node);
  }

  getFocus() { return this.focus; }

  // ═══════════════════════ 生长 ═══════════════════════

  private G(n: TreeNode): Geo {
    let g = this.geo.get(n);
    if (!g) {
      g = {
        vs: 0, ve: 0, ls: 0, le: 0, selfVs: 0,
        p0: [0, 0, 0], p1: [0, 0, 0], dir: [0, 1, 0], L: 1, w0: 1, w1: 1, depth: 0,
        bA: [0, 0, 0], bB: [0, 0, 0], bC: [0, 0, 0],
        tA: [0, 0, 0], tB: [0, 0, 0], tC: [0, 0, 0], leafIdx: [],
      };
      this.geo.set(n, g);
    }
    return g;
  }

  private segsOf(n: TreeNode) { return SEGS[Math.min(SEGS.length - 1, n.lvl + 1)]!; }
  /** 画枝的节点（种只作为父级的叶点，不占枝） */
  private kidsOf(n: TreeNode) { return n.ch.filter((c) => c.lvl < 6); }
  private leavesOf(n: TreeNode) {
    return n.ch.filter((c) => c.lvl >= 6).length + n.fillLeaves;
  }

  private growAll() {
    let segs = 0, leaves = 0, branches = 0;
    const walk = (n: TreeNode) => {
      if (n.lvl >= 6) return;
      segs += this.segsOf(n); branches++; leaves += this.leavesOf(n);
      for (const c of n.ch) walk(c);
    };
    walk(this.root);
    /* 次主枝（拆枝）不属于任何节点，但同样占缓冲。见 growTrunk。 */
    if (!LAYOUT_OLD) for (const c of this.kidsOf(this.root)) {
      const sp = (CANOPY[c.kingdom] ?? CANOPY_DEF).split;
      if (sp > 1) segs += sp * FORK_SEGS;
    }

    this.NV = segs * 4; this.NI = segs * 6; this.leafCount = Math.max(1, leaves);
    this.stats.branches = branches; this.stats.leaves = leaves;

    this.aP0 = new Float32Array(this.NV * 3); this.aP1 = new Float32Array(this.NV * 3);
    this.aF0 = new Float32Array(this.NV * 3); this.aF1 = new Float32Array(this.NV * 3);
    this.aST = new Float32Array(this.NV * 2); this.aW = new Float32Array(this.NV * 2);
    this.aWF = new Float32Array(this.NV * 2); this.aCol = new Float32Array(this.NV * 3);
    this.aFoc = new Float32Array(this.NV); this.idx = new Uint32Array(this.NI);
    this.lP = new Float32Array(this.leafCount * 3); this.lF = new Float32Array(this.leafCount * 3);
    this.lCol = new Float32Array(this.leafCount * 3); this.lSz = new Float32Array(this.leafCount);
    this.lFoc = new Float32Array(this.leafCount);

    const sn = MAXEX * EX_SEGS * 4;
    this.sP0 = new Float32Array(sn * 3); this.sP1 = new Float32Array(sn * 3);
    this.sF0 = new Float32Array(sn * 3); this.sF1 = new Float32Array(sn * 3);
    this.sW = new Float32Array(sn * 2); this.sWF = new Float32Array(sn * 2);
    this.sCol = new Float32Array(sn * 3);

    this.vc = 0; this.ic = 0; this.lc = 0;
    /* 叶点尺寸必须在生长前定好（growLeaves 要用），而 TREE_H 要生长后才知道。
       用主干高推算：整棵树的总高约是主干的 2.2 倍，叶点取其千分之几。 */
    this.leafSize = TRUNK_H * 0.0135;
    this.growTrunk();
    this.measure();
    this.makeGround();
  }

  /**
   * 主干 + 树冠 + 根系。
   *
   * 树冠不再按「界的子级数量」定长短，而是按 CANOPY 表写死三档高度：
   * 数据一变形态就跟着乱是原来最大的毛病。同时动物/植物各拆两支，
   * 且两支相邻 —— 同色成簇才读得出「这是一个界」。
   */
  private growTrunk() {
    if (LAYOUT_OLD) { this.growTrunkOld(); return; }
    const nd = this.root;
    const g = this.G(nd);
    this.growSelf(nd, [0, 0, 0], [0, 1, 0], TRUNK_H, 7.2, 4.6, 0);

    const canopy: TreeNode[] = [], roots: TreeNode[] = [];
    for (const c of this.kidsOf(nd)) (c.zone === "root" ? roots : canopy).push(c);
    const cf = (c: TreeNode) => CANOPY[c.kingdom] ?? CANOPY_DEF;
    /* 排序决定枝位顺序。同档按 CANOPY 表里的书写顺序 —— 表里动物、植物挨着，
       它们的两支枝位就自然相邻，同色成簇才读得出「这是一个界」。 */
    const order = Object.keys(CANOPY);
    const rank = (c: TreeNode) => { const i = order.indexOf(c.kingdom); return i < 0 ? 99 : i; };
    canopy.sort((a, b) => cf(a).tier - cf(b).tier || rank(a) - rank(b));

    const upper = canopy.filter((c) => cf(c).tier < 2);
    const lower = canopy.filter((c) => cf(c).tier === 2);
    /* 枝位是全树共用的角度刻度：拆枝的每一支各占一位，所以动物的两支
       和真菌的一支在圆周上是等距的。若只按「界」分角度，两支会挤在一起，
       另外半边全空 —— 树整个偏向一侧。 */
    const slots = upper.reduce((s, c) => s + cf(c).split, 0);
    const gap = (Math.PI * 2) / Math.max(1, slots);
    const slotDir = (k: number): V3 => {
      const a = gap * (k + 0.5) - Math.PI / 2;
      return nrm([Math.cos(a) * 0.62, 1.0, Math.sin(a) * 0.62]);
    };
    const TOP = g.p1, BASE = g.p0;

    let slot = 0;
    for (const c of upper) {
      const { tier, split } = cf(c);
      const L = TRUNK_H * TIER_LEN[tier]!
        * (1 + TIER_JIT * (h01(strId(c.id), 1, 2, 3) * 2 - 1));
      const arms: V3[] = [];
      for (let i = 0; i < split; i++) arms.push(slotDir(slot + i));
      // 柄朝本界所占扇区的中心
      const ac = gap * (slot + split / 2) - Math.PI / 2;
      const stem = nrm([Math.cos(ac) * 0.62, 1.0, Math.sin(ac) * 0.62]);
      if (split > 1) this.growForked(c, TOP, stem, arms, L, 4.6, 2.8);
      else this.grow(c, TOP, arms[0]!, L, 4.6, 2.8, 1);
      slot += split;
    }

    /* 矮枝：从主干 3/4 高处分出，短、细、外倾。它要读作「树冠下缘够不着的
       小枝」，不是第二层树冠 —— 所以角度插在上层枝位的空隙里（枝位在
       (k+0.5)·gap，空隙就在 k·gap），才不会被大枝正面盖住。 */
    const lowAt = this.bzAtTree(nd, TIER2_AT);
    lower.forEach((c, j) => {
      const a = -Math.PI / 2 + gap * Math.round((j * slots) / Math.max(1, lower.length));
      const L = TRUNK_H * TIER_LEN[2]!
        * (1 + TIER_JIT * (h01(strId(c.id), 4, 5, 6) * 2 - 1));
      this.grow(c, lowAt, nrm([Math.cos(a) * 1.5, 0.5, Math.sin(a) * 1.5]), L, 2.2, 1.2, 1);
    });

    const rn = roots.length;
    roots.forEach((c, j) => {
      const a = (Math.PI * 2 * j) / Math.max(1, rn) + 2.1;
      this.grow(c, BASE, nrm([Math.cos(a) * 1.5, -0.3, Math.sin(a) * 1.5]), TRUNK_H * 0.42, 3.4, 1.8, 1);
    });
    g.ve = this.vc; g.le = this.lc;
  }

  /** 改造前的三段式布局。仅供 `?layout=old` 对比，看完删。 */
  private growTrunkOld() {
    const nd = this.root;
    const g = this.G(nd);
    this.growSelf(nd, [0, 0, 0], [0, 1, 0], TRUNK_H, 7.2, 4.6, 0);
    const groups: Record<string, TreeNode[]> = { crown: [], basal: [], root: [] };
    for (const c of this.kidsOf(nd)) (groups[c.zone] ?? groups.crown!).push(c);
    const TOP = g.p1, BASE = g.p0;
    const basalAt = this.bzAtTree(nd, 0.34);
    const cn = groups.crown!.length;
    groups.crown!.forEach((c, j) => {
      const a = (Math.PI * 2 * j) / Math.max(1, cn) - Math.PI / 2;
      this.grow(c, TOP, nrm([Math.cos(a) * 0.62, 1.0, Math.sin(a) * 0.62]), TRUNK_H * 0.72, 4.6, 2.8, 1);
    });
    const bn = groups.basal!.length;
    groups.basal!.forEach((c, j) => {
      const a = (Math.PI * 2 * j) / Math.max(1, bn) + 0.7;
      this.grow(c, basalAt, nrm([Math.cos(a) * 1.25, 0.30, Math.sin(a) * 1.25]), TRUNK_H * 0.17, 2.0, 1.0, 1);
    });
    const rn = groups.root!.length;
    groups.root!.forEach((c, j) => {
      const a = (Math.PI * 2 * j) / Math.max(1, rn) + 2.1;
      this.grow(c, BASE, nrm([Math.cos(a) * 1.5, -0.3, Math.sin(a) * 1.5]), TRUNK_H * 0.42, 3.4, 1.8, 1);
    });
    g.ve = this.vc; g.le = this.lc;
  }

  /**
   * 拆枝：一个界画成一短柄 + N 根次主枝，子级平分到各支上。
   *
   * 次主枝纯粹是几何，没有对应节点 —— 顶点写在本界的 [vs, ve) 区间内，
   * collapse / fanReset / 焦点隐藏都会连带处理，不需要额外分支。
   */
  private growForked(
    nd: TreeNode, A: V3, stem: V3, arms: V3[], L: number, w0: number, w1: number,
  ) {
    const g = this.G(nd);
    const n = arms.length;
    const stemL = L * 0.30;
    this.growSelf(nd, A, stem, stemL, w0, w0 * 0.88, 1);
    this.growLeaves(nd, stemL);

    const fp = g.p1;
    const col = this.branchColor(nd, 1);
    const armL = L * 0.76;
    const forks: Fork[] = arms.map((d) => {
      // 外凸：弯离柄的方向，两支才是「张开的杈」而不是两根平行棍
      const out = nrm(sub(d, scl(stem, dot(d, stem))));
      return this.writeFork(
        fp, d, armL, add(scl(out, 0.1), scl(UP, 0.04)), w0 * 0.86, w1, col,
      );
    });

    const kids = this.kidsOf(nd);
    const sid = strId(nd.id);
    const per = Math.ceil(kids.length / n);
    kids.forEach((c, j) => {
      const f = forks[j % n]!;
      const k = Math.floor(j / n);
      const ft = per <= 1 ? 0.72 : 0.3 + 0.68 * (k / Math.max(1, per - 1));
      const base = bez3(f.A, f.B, f.C, ft);
      const u = 1 - ft;
      const bdir = nrm([
        2 * (u * (f.B[0] - f.A[0]) + ft * (f.C[0] - f.B[0])),
        2 * (u * (f.B[1] - f.A[1]) + ft * (f.C[1] - f.B[1])),
        2 * (u * (f.B[2] - f.A[2]) + ft * (f.C[2] - f.B[2])),
      ]);
      const [bu, bv] = ortho(bdir);
      const a = (Math.PI * 2 * k) / Math.max(1, per) + nd.sib * 1.31 + 0.7
        + 0.42 * (h01(sid, 1, j, 7) - 0.5);
      const outer = k % Math.max(1, Math.ceil(per / OV_VIS_KIDS)) === 0;
      const sp = 0.98 * (1.34 - 0.62 * ft) * (outer ? 1 : 0.42);
      const perp = add(scl(bu, Math.cos(a)), scl(bv, Math.sin(a)));
      const d2 = nrm(add(add(scl(bdir, Math.cos(sp)), scl(perp, Math.sin(sp))), scl(UP, 0.225)));
      const visK = outer ? 1 : 0.28;
      const cl = armL * 0.72 * (0.86 + 0.28 * (((j * 3) % 4) / 3)) * visK;
      this.grow(c, base, d2, cl, w1 * visK, w1 * 0.6 * visK, 2);
    });
    g.ve = this.vc; g.le = this.lc;
  }

  /** 写一段不挂在节点上的枝几何（次主枝）。返回控制点，供子级沿枝错落分出。 */
  private writeFork(
    A: V3, dir: V3, L: number, bend: V3, w0: number, w1: number, col: V3,
  ): Fork {
    const C = add(A, scl(dir, L));
    const B = add(add(A, scl(dir, L * 0.5)), scl(bend, L));
    const v0 = this.vc;
    for (let i = 0; i < FORK_SEGS; i++) {
      const b = v0 + i * 4;
      this.aST[b * 2] = -1; this.aST[b * 2 + 1] = 0;
      this.aST[(b + 1) * 2] = 1; this.aST[(b + 1) * 2 + 1] = 0;
      this.aST[(b + 2) * 2] = -1; this.aST[(b + 2) * 2 + 1] = 1;
      this.aST[(b + 3) * 2] = 1; this.aST[(b + 3) * 2 + 1] = 1;
      this.idx[this.ic++] = b; this.idx[this.ic++] = b + 1; this.idx[this.ic++] = b + 2;
      this.idx[this.ic++] = b + 2; this.idx[this.ic++] = b + 1; this.idx[this.ic++] = b + 3;
      const t0 = i / FORK_SEGS, t1 = (i + 1) / FORK_SEGS;
      const p = bez3(A, B, C, t0), q = bez3(A, B, C, t1);
      const s0 = w0 + (w1 - w0) * t0, s1 = w0 + (w1 - w0) * t1;
      for (let k = 0; k < 4; k++) {
        const o = (b + k) * 3, o2 = (b + k) * 2;
        this.aP0[o] = p[0]; this.aP0[o + 1] = p[1]; this.aP0[o + 2] = p[2];
        this.aP1[o] = q[0]; this.aP1[o + 1] = q[1]; this.aP1[o + 2] = q[2];
        this.aW[o2] = s0; this.aW[o2 + 1] = s1;
        this.aCol[o] = col[0]; this.aCol[o + 1] = col[1]; this.aCol[o + 2] = col[2];
      }
    }
    this.vc += FORK_SEGS * 4;
    this.aF0.set(this.aP0.subarray(v0 * 3, this.vc * 3), v0 * 3);
    this.aF1.set(this.aP1.subarray(v0 * 3, this.vc * 3), v0 * 3);
    this.aWF.set(this.aW.subarray(v0 * 2, this.vc * 2), v0 * 2);
    return { A, B, C };
  }


  private growSelf(nd: TreeNode, A: V3, dir: V3, L: number, w0: number, w1: number, depth: number): V3 {
    const g = this.G(nd);
    g.vs = this.vc; g.ls = this.lc; g.selfVs = this.vc;
    const segs = this.segsOf(nd);
    for (let i = 0; i < segs; i++) {
      const b = this.vc + i * 4;
      this.aST[b * 2] = -1; this.aST[b * 2 + 1] = 0;
      this.aST[(b + 1) * 2] = 1; this.aST[(b + 1) * 2 + 1] = 0;
      this.aST[(b + 2) * 2] = -1; this.aST[(b + 2) * 2 + 1] = 1;
      this.aST[(b + 3) * 2] = 1; this.aST[(b + 3) * 2 + 1] = 1;
      this.idx[this.ic++] = b; this.idx[this.ic++] = b + 1; this.idx[this.ic++] = b + 2;
      this.idx[this.ic++] = b + 2; this.idx[this.ic++] = b + 1; this.idx[this.ic++] = b + 3;
    }
    const col = this.branchColor(nd, depth);
    for (let k = 0; k < segs * 4; k++) {
      const o = (this.vc + k) * 3;
      this.aCol[o] = col[0]; this.aCol[o + 1] = col[1]; this.aCol[o + 2] = col[2];
    }
    this.vc += segs * 4;

    const isTrunk = nd.lvl < 0;
    const isRoot = nd.zone === "root";
    /* 主干必须直立：它起点在原点，axialOut 的 `A[0]||…` 回退分支
       会把它强行推向 +X，导致整棵树冠偏向一侧。 */
    const axialOut: V3 = isTrunk
      ? [0, 0, 0]
      : nrm([A[0] || Math.cos(nd.sib * 1.7) * 0.3, 0, A[2] || Math.sin(nd.sib * 1.7) * 0.3]);
    const droop = isTrunk ? 0
      : isRoot ? -0.03 - depth * 0.006
        : depth <= 2 ? 0.1 : -0.055 - depth * 0.012;
    const bend = add(scl(axialOut, (isRoot ? 0.2 : 0.1) + depth * 0.012), scl(UP, droop));

    const end = this.writeBranch(nd, A, dir, L, bend, w0, w1);
    this.aF0.set(this.aP0.subarray(g.selfVs * 3, this.vc * 3), g.selfVs * 3);
    this.aF1.set(this.aP1.subarray(g.selfVs * 3, this.vc * 3), g.selfVs * 3);
    this.aWF.set(this.aW.subarray(g.selfVs * 2, this.vc * 2), g.selfVs * 2);
    g.tA = g.bA; g.tB = g.bB; g.tC = g.bC;
    g.p0 = A; g.p1 = end; g.dir = dir; g.L = L; g.w0 = w0; g.w1 = w1; g.depth = depth;
    return end;
  }

  private branchColor(nd: TreeNode, depth: number): V3 {
    if (nd.lvl < 0) return [0.38, 0.33, 0.28];
    const v = kvis(nd.kingdom);
    const bright = Math.min(0.42, depth * 0.07);
    let cr = v.c[0] + (0.99 - v.c[0]) * bright;
    let cg = v.c[1] + (0.96 - v.c[1]) * bright;
    let cb = v.c[2] + (0.86 - v.c[2]) * bright;
    /* 「高度即可及性」的色彩梯度。根系越深越隐 —— 它占的空间比树冠小，
       同样清晰就糊成一团絮状物；深度渐隐既避免糊团，也正是语义本身。 */
    if (v.zone !== "crown") {
      const isRoot = v.zone === "root";
      const gy = cr * 0.34 + cg * 0.5 + cb * 0.16;
      const dd = isRoot ? Math.min(1, Math.max(0, (depth - 2) / 4)) : 0;
      const desat = isRoot ? (v.dead ? 0.84 : 0.4) + dd * 0.22 : 0.22;
      const lift = isRoot ? (v.dead ? 0.12 : 0) + dd * 0.16 : 0.06;
      cr += (gy - cr) * desat; cg += (gy - cg) * desat; cb += (gy - cb) * desat;
      cr += (1 - cr) * lift; cg += (1 - cg) * lift; cb += (1 - cb) * lift;
    }
    /* 点亮：界门纲不因收集变灰；目科属种没走过才收一层饱和度。
       拍板 2026-09-03，见 docs/wip/物种树-结构议题.md §4.6。 */
    if (nd.lvl >= 3 && nd.got === 0) {
      const gy = cr * 0.34 + cg * 0.5 + cb * 0.16;
      cr += (gy - cr) * COLLECT_UNLIT;
      cg += (gy - cg) * COLLECT_UNLIT;
      cb += (gy - cb) * COLLECT_UNLIT;
    }
    return [cr, cg, cb];
  }

  private writeBranch(nd: TreeNode, A: V3, dir: V3, L: number, bend: V3, w0: number, w1: number): V3 {
    const g = this.G(nd);
    const segs = this.segsOf(nd);
    const C = add(A, scl(dir, L));
    const B = add(add(A, scl(dir, L * 0.5)), scl(bend, L));
    g.bA = A; g.bB = B; g.bC = C;
    let v = g.selfVs;
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs, t1 = (i + 1) / segs;
      const p = bez3(A, B, C, t0), q = bez3(A, B, C, t1);
      const s0 = w0 + (w1 - w0) * t0, s1 = w0 + (w1 - w0) * t1;
      for (let k = 0; k < 4; k++) {
        const o = (v + k) * 3, o2 = (v + k) * 2;
        this.aP0[o] = p[0]; this.aP0[o + 1] = p[1]; this.aP0[o + 2] = p[2];
        this.aP1[o] = q[0]; this.aP1[o + 1] = q[1]; this.aP1[o + 2] = q[2];
        this.aW[o2] = s0; this.aW[o2 + 1] = s1;
      }
      v += 4;
    }
    return C;
  }

  private bzAtTree(nd: TreeNode, t: number): V3 {
    const g = this.G(nd);
    return bez3(g.tA, g.tB, g.tC, t);
  }
  private bzTanTree(nd: TreeNode, t: number): V3 {
    const g = this.G(nd);
    const u = 1 - t;
    return nrm([
      2 * (u * (g.tB[0] - g.tA[0]) + t * (g.tC[0] - g.tB[0])),
      2 * (u * (g.tB[1] - g.tA[1]) + t * (g.tC[1] - g.tB[1])),
      2 * (u * (g.tB[2] - g.tA[2]) + t * (g.tC[2] - g.tB[2])),
    ]);
  }
  private bzAt(nd: TreeNode, t: number): V3 {
    const g = this.G(nd);
    return bez3(g.bA, g.bB, g.bC, t);
  }
  private bzTan(nd: TreeNode, t: number): V3 {
    const g = this.G(nd);
    const u = 1 - t;
    return nrm([
      2 * (u * (g.bB[0] - g.bA[0]) + t * (g.bC[0] - g.bB[0])),
      2 * (u * (g.bB[1] - g.bA[1]) + t * (g.bC[1] - g.bB[1])),
      2 * (u * (g.bB[2] - g.bA[2]) + t * (g.bC[2] - g.bB[2])),
    ]);
  }

  private grow(nd: TreeNode, A: V3, dir: V3, L: number, w0: number, w1: number, depth: number) {
    const g = this.G(nd);
    this.growSelf(nd, A, dir, L, w0, w1, depth);
    this.growLeaves(nd, L);

    const kids = this.kidsOf(nd);
    const n = kids.length;
    if (n === 0) { g.ve = this.vc; g.le = this.lc; return; }

    const isRoot = nd.zone === "root";
    const spread = depth === 0 ? 0.62 : 0.98;
    /* isBasal 是改造前的几何特例（近地矮丛专用），新版已删除。
       这里保留仅为 `?layout=old` 能还原旧形态。 */
    const isBasal = LAYOUT_OLD && nd.zone === "basal";
    /* 树冠的 photo 必须由正转负：内层上举、外缘下垂，冠才是圆的。
       若全程为正，所有枝互相平行 → 冠顶压平、下半空掉。 */
    const photo = isRoot ? -0.06 : isBasal ? 0.12 - depth * 0.03 : 0.34 - depth * 0.115;
    const spreadK = isRoot ? 1.6 : isBasal ? 1.45 : 1.0;
    const phase = nd.sib * 1.31 + depth * 0.7;
    const sid = strId(nd.id);
    const primary = new Set<number>();
    const visN = Math.min(n, OV_VIS_KIDS);
    if (n <= OV_VIS_KIDS) {
      for (let i = 0; i < n; i++) primary.add(i);
    } else {
      for (let i = 0; i < visN; i++) primary.add(Math.round(i * (n - 1) / Math.max(visN - 1, 1)));
    }

    for (let j = 0; j < n; j++) {
      /* 沿父枝全长错落分出。若都从末端一点爆开，每个节点会长成独立的球，
         整棵树成了「三叉戟挂三个球」，球之间必然空。 */
      const ft = n <= 1 ? 0.72 : 0.3 + 0.68 * (j / (n - 1));
      const base = this.bzAtTree(nd, ft);
      const bdir = this.bzTanTree(nd, ft);
      const [bu, bv] = ortho(bdir);
      /* 均匀分布 + 小扰动。纯黄金角螺旋只在数量多时才均匀；
         每节点 3~5 个子级时螺旋会把它们堆在一侧，逐层放大后整树偏心。 */
      const a = (Math.PI * 2 * j) / n + phase + 0.42 * (h01(sid, depth, j, 7) - 0.5);
      const outer = isRoot || isBasal || primary.has(j);
      const sp = spread * spreadK * (1.34 - 0.62 * ft) * (outer ? 1 : 0.42);
      const perp = add(scl(bu, Math.cos(a)), scl(bv, Math.sin(a)));
      let d2 = nrm(add(add(scl(bdir, Math.cos(sp)), scl(perp, Math.sin(sp))), scl(UP, photo)));
      // 根系「压扁」：竖直分量按比例压掉，长度全部转化为水平延展
      if (isRoot) d2 = nrm([d2[0], d2[1] * 0.3, d2[2]]);
      /* 同阶平等（§4.3）：总览大概画。外沿最多 OV_VIS_KIDS 根，
         多出来的缩在冠里，不跟 34 门 vs 9 门这种真数据走。改长度同比改宽度（§5）。 */
      const visK = outer ? 1 : 0.28;
      const cl = L * 0.72 * (0.86 + 0.28 * (((j * 3) % 4) / 3)) * visK;
      this.grow(kids[j]!, base, d2, cl, w1 * visK, w1 * 0.6 * visK, depth + 1);
    }
    g.ve = this.vc; g.le = this.lc;
  }

  /**
   * 叶点：沿本枝的末段分布，紧贴枝条。
   *
   * ⚠ 不能「全挂在枝端 p1 再往外发散」。原型那样写是因为它的末端枝很短
   * （属级 L≈18），偏移的绝对距离小；真骨架末端是目级 L≈35，同样的
   * 相对偏移会让叶点飘到枝外十几个单位 —— 整棵树成了一团喷雾，
   * 看不出枝叶的附着关系。
   *
   * 改成沿枝的后 35% 采样落点，再加一个很小的径向抖动：
   * 叶就是「长在枝上」的，树冠也才聚得起来。
   */
  private growLeaves(nd: TreeNode, L: number) {
    const g = this.G(nd);
    const species = nd.ch.filter((c) => c.lvl >= 6);
    const total = species.length + nd.fillLeaves;
    if (total === 0) return;
    const v = kvis(nd.kingdom);
    const dim = v.zone === "root" ? (v.dead ? 0.35 : 0.5) : v.zone === "basal" ? 0.82 : 1;
    const gy = v.c[0] * 0.34 + v.c[1] * 0.5 + v.c[2] * 0.16;
    const idxs: number[] = [];
    // 径向抖动半径：只有枝长的百分之几，叶才贴着枝
    const rad = L * 0.055;
    for (let i = 0; i < total; i++) {
      // 沿枝后 35% 铺开（0.65→1.0），末端稍密
      const t = 0.65 + 0.35 * Math.pow((i + 0.5) / total, 0.85);
      const base = this.bzAtTree(nd, t);
      const bdir = this.bzTanTree(nd, t);
      const [u, v2] = ortho(bdir);
      const a = GOLD * i + nd.sib * 1.7;
      const rr = rad * (0.45 + 0.55 * (((i * 7) % 5) / 4));
      const p = add(base, add(scl(u, Math.cos(a) * rr), scl(v2, Math.sin(a) * rr)));
      const o = this.lc * 3;
      this.lP[o] = p[0]; this.lP[o + 1] = p[1]; this.lP[o + 2] = p[2];
      this.lF[o] = p[0]; this.lF[o + 1] = p[1]; this.lF[o + 2] = p[2];
      let cr = v.c[0] + (1 - v.c[0]) * 0.3;
      let cg = v.c[1] + (1 - v.c[1]) * 0.32;
      let cb = v.c[2] + (0.92 - v.c[2]) * 0.3;
      if (dim < 1) {
        cr += (gy - cr) * (1 - dim); cg += (gy - cg) * (1 - dim); cb += (gy - cb) * (1 - dim);
      }
      if (nd.lvl >= 3 && nd.got === 0) {
        cr += (gy - cr) * COLLECT_UNLIT;
        cg += (gy - cg) * COLLECT_UNLIT;
        cb += (gy - cb) * COLLECT_UNLIT;
      }
      this.lCol[o] = cr; this.lCol[o + 1] = cg; this.lCol[o + 2] = cb;
      this.lSz[this.lc] = this.leafSize;
      const sp = species[i];
      if (sp) this.G(sp).leafIdx = [this.lc];
      idxs.push(this.lc);
      this.lc++;
    }
    g.leafIdx = idxs;
  }

  private measure() {
    let minY = 1e9, maxY = -1e9, x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    const upd = (x: number, y: number, z: number) => {
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (z < z0) z0 = z; if (z > z1) z1 = z;
    };
    for (let i = 0; i < this.NV; i++) upd(this.aP1[i * 3]!, this.aP1[i * 3 + 1]!, this.aP1[i * 3 + 2]!);
    // 包围盒必须统计叶点：叶簇长在枝端之外，只算枝会低估范围、取景必然溢出
    for (let i = 0; i < this.lc; i++) upd(this.lP[i * 3]!, this.lP[i * 3 + 1]!, this.lP[i * 3 + 2]!);
    this.TREE_CY = (minY + maxY) / 2;
    this.TREE_H = Math.max(1, maxY - minY);
    this.bbX0 = x0; this.bbX1 = x1; this.bbZ0 = z0; this.bbZ1 = z1;
    this.bbCX = (x0 + x1) / 2; this.bbCZ = (z0 + z1) / 2;

    // 界标签挂在各自树冠的质心，否则全挤在主干分叉处
    let cx = 0, cz = 0, cn = 0;
    for (const c of this.kidsOf(this.root)) {
      const g = this.G(c);
      let sx = 0, sy = 0, sz = 0, n = 0;
      for (let i = g.ls; i < g.le; i++) {
        sx += this.lP[i * 3]!; sy += this.lP[i * 3 + 1]!; sz += this.lP[i * 3 + 2]!; n++;
      }
      g.centroid = n > 0 ? [sx / n, sy / n, sz / n] : g.p1;
      if (c.zone === "crown") {
        // 三界各一票，不被叶最多的那一蓬把镜头拖走
        cx += g.p1[0]; cz += g.p1[2]; cn++;
      }
    }
    // 取景对准三界主枝端的平均，不对准整棵 AABB / 叶团质心
    this.OV_TGT = [
      cn ? cx / cn : this.bbCX,
      this.TREE_CY + this.TREE_H * 0.06,
      cn ? cz / cn : this.bbCZ,
    ];
  }

  private makeGround() {
    const N = this.GND_N;
    this.gP = new Float32Array(N * 3);
    this.gC = new Float32Array(N * 3);
    this.gS = new Float32Array(N);
    const R = Math.max(this.bbX1 - this.bbCX, this.bbZ1 - this.bbCZ) * 1.02;
    for (let i = 0; i < N; i++) {
      const t = Math.sqrt(h01(i, 11, 22, 33));
      const r = t * R, a = h01(i, 44, 55, 66) * 6.28318, o = i * 3;
      this.gP[o] = this.bbCX + Math.cos(a) * r;
      this.gP[o + 1] = (h01(i, 77, 88, 99) - 0.5) * this.TREE_H * 0.008;
      this.gP[o + 2] = this.bbCZ + Math.sin(a) * r;
      // 径向渐隐，否则地面会变成一块硬边的椭圆色块
      const fade = Math.pow(t, 2.2);
      const v = 0.86 + 0.1 * h01(i, 12, 34, 56);
      this.gC[o] = v * 0.995 + (BG[0] - v * 0.995) * fade;
      this.gC[o + 1] = v * 0.982 + (BG[1] - v * 0.982) * fade;
      this.gC[o + 2] = v * 0.96 + (BG[2] - v * 0.96) * fade;
      // 尺寸不能太小：小于 1px 会被 clamp 后再乘 alpha，直接消失
      this.gS[i] = this.TREE_H * (0.0026 + 0.0026 * h01(i, 65, 43, 21));
    }
  }

  // ═══════════════════════ GL ═══════════════════════

  private sh(type: number, src: string) {
    const gl = this.gl;
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error("shader: " + gl.getShaderInfoLog(s));
    return s;
  }
  private prog(vs: string, fs: string) {
    const gl = this.gl;
    const p = gl.createProgram()!;
    gl.attachShader(p, this.sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, this.sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
      throw new Error("link: " + gl.getProgramInfoLog(p));
    return p;
  }
  private U(p: WebGLProgram, names: string[]) {
    const o: Record<string, WebGLUniformLocation | null> = {};
    for (const n of names) o[n] = this.gl.getUniformLocation(p, n);
    return o;
  }
  /**
   * TS 5.7 起 Float32Array 带 ArrayBufferLike 泛型参数，
   * 而 WebGL 的 BufferSource 要求 ArrayBuffer —— 直接传会类型不兼容。
   * 这里统一收口，避免每个调用点都写断言。
   */
  private buf(data: Float32Array, dyn = false) {
    const gl = this.gl;
    const b = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data as unknown as BufferSource, dyn ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
    return b;
  }
  /** 同上，动态上传 */
  private put(b: WebGLBuffer, data: Float32Array) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data as unknown as BufferSource, gl.DYNAMIC_DRAW);
  }
  private attr(loc: number, b: WebGLBuffer, n: number) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 0, 0);
  }

  private initGL() {
    const gl = this.gl;
    this.pB = this.prog(VS_BRANCH, FS_BRANCH);
    this.uB = this.U(this.pB, ["uVP", "uV", "uMorph", "uOnly", "uPx", "uRes", "uFog", "uFogK", "uFogN", "uFogF", "uWK", "uDesat", "uHorizon"]);
    this.pL = this.prog(VS_LEAF, FS_LEAF);
    this.uL = this.U(this.pL, ["uVP", "uV", "uMorph", "uOnly", "uPx", "uFog", "uFogK", "uFogN", "uFogF", "uSzK", "uDesat", "uAlpha", "uDeep", "uHorizon", "uLeaf", "uBudOn", "uBudT", "uBud"]);
    this.pBlur = this.prog(VS_FS, FS_BLUR);
    this.uBlur = this.U(this.pBlur, ["uT", "uDir"]);
    this.pBlit = this.prog(VS_FS, FS_BLIT);
    this.uBlit = this.U(this.pBlit, ["uT", "uAmt", "uBg", "uKeep"]);

    this.vaoB = gl.createVertexArray()!;
    gl.bindVertexArray(this.vaoB);
    const bP0 = this.buf(this.aP0), bP1 = this.buf(this.aP1);
    this.bF0 = this.buf(this.aF0, true); this.bF1 = this.buf(this.aF1, true);
    const bST = this.buf(this.aST), bW = this.buf(this.aW);
    this.bWF = this.buf(this.aWF, true);
    const bCol = this.buf(this.aCol);
    this.bFoc = this.buf(this.aFoc, true);
    this.attr(0, bP0, 3); this.attr(1, bP1, 3); this.attr(2, this.bF0, 3); this.attr(3, this.bF1, 3);
    this.attr(4, bST, 2); this.attr(5, bW, 2); this.attr(6, this.bWF, 2);
    this.attr(7, bCol, 3); this.attr(8, this.bFoc, 1);
    this.eb = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.eb);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.idx as unknown as BufferSource, gl.STATIC_DRAW);

    this.vaoL = gl.createVertexArray()!;
    gl.bindVertexArray(this.vaoL);
    const blP = this.buf(this.lP);
    this.blF = this.buf(this.lF, true);
    const blC = this.buf(this.lCol), blS = this.buf(this.lSz);
    this.blFoc = this.buf(this.lFoc, true);
    this.attr(0, blP, 3); this.attr(1, this.blF, 3); this.attr(2, blC, 3);
    this.attr(3, blS, 1); this.attr(4, this.blFoc, 1);

    // 展开层高分辨率缓冲
    const sn = MAXEX * EX_SEGS * 4;
    const sST = new Float32Array(sn * 2);
    const sIdx = new Uint32Array(MAXEX * EX_SEGS * 6);
    for (let s = 0; s < MAXEX; s++)
      for (let i = 0; i < EX_SEGS; i++) {
        const b = (s * EX_SEGS + i) * 4, e = (s * EX_SEGS + i) * 6;
        sST[b * 2] = -1; sST[b * 2 + 1] = 0;
        sST[(b + 1) * 2] = 1; sST[(b + 1) * 2 + 1] = 0;
        sST[(b + 2) * 2] = -1; sST[(b + 2) * 2 + 1] = 1;
        sST[(b + 3) * 2] = 1; sST[(b + 3) * 2 + 1] = 1;
        sIdx[e] = b; sIdx[e + 1] = b + 1; sIdx[e + 2] = b + 2;
        sIdx[e + 3] = b + 2; sIdx[e + 4] = b + 1; sIdx[e + 5] = b + 3;
      }
    this.vaoS = gl.createVertexArray()!;
    gl.bindVertexArray(this.vaoS);
    this.bsP0 = this.buf(this.sP0, true); this.bsP1 = this.buf(this.sP1, true);
    this.bsF0 = this.buf(this.sF0, true); this.bsF1 = this.buf(this.sF1, true);
    const bsST = this.buf(sST);
    this.bsW = this.buf(this.sW, true); this.bsWF = this.buf(this.sWF, true);
    this.bsCol = this.buf(this.sCol, true);
    const bsFoc = this.buf(new Float32Array(sn).fill(1));
    this.attr(0, this.bsP0, 3); this.attr(1, this.bsP1, 3);
    this.attr(2, this.bsF0, 3); this.attr(3, this.bsF1, 3);
    this.attr(4, bsST, 2); this.attr(5, this.bsW, 2); this.attr(6, this.bsWF, 2);
    this.attr(7, this.bsCol, 3); this.attr(8, bsFoc, 1);
    this.ebS = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ebS);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, sIdx as unknown as BufferSource, gl.STATIC_DRAW);

    this.vaoG = gl.createVertexArray()!;
    gl.bindVertexArray(this.vaoG);
    this.attr(0, this.buf(this.gP), 3);
    this.attr(1, this.buf(this.gP), 3);
    this.attr(2, this.buf(this.gC), 3);
    this.attr(3, this.buf(this.gS), 1);
    this.attr(4, this.buf(new Float32Array(this.GND_N).fill(1)), 1);

    this.vaoQ = gl.createVertexArray()!;
    gl.bindVertexArray(this.vaoQ);
    this.attr(0, this.buf(new Float32Array([-1, -1, 3, -1, -1, 3])), 2);
    gl.bindVertexArray(null);
  }

  private mkTex(w: number, h: number) {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  private mkFBO(w: number, h: number) {
    const gl = this.gl;
    if (this.fboA) {
      gl.deleteFramebuffer(this.fboA); gl.deleteFramebuffer(this.fboB);
      gl.deleteTexture(this.texA); gl.deleteTexture(this.texB);
      gl.deleteRenderbuffer(this.rbA);
    }
    this.FW = w; this.FH = h;
    this.texA = this.mkTex(w, h); this.texB = this.mkTex(w, h);
    this.rbA = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.rbA);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
    this.fboA = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboA);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texA, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.rbA);
    this.fboB = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboB);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texB, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.W = this.cv.clientWidth || this.cv.parentElement?.clientWidth || innerWidth;
    this.H = this.cv.clientHeight || this.cv.parentElement?.clientHeight || innerHeight;
    this.cv.width = Math.max(2, Math.round(this.W * dpr));
    this.cv.height = Math.max(2, Math.round(this.H * dpr));
    this.PX = this.cv.height / (2 * Math.tan(FOV / 2));
    // 1/3 分辨率：既省，也让高斯等效核更大（背景更「化」得开）
    this.mkFBO(Math.max(2, Math.round(this.cv.width / 3)), Math.max(2, Math.round(this.cv.height / 3)));
  }

  private onResize = () => {
    if (this.dead) return;
    this.resize();
    this.SQ = this.calcSQ();
    if (this.focus === this.root) {
      this.camGoal.tgt = this.sqz(this.OV_TGT);
      this.camGoal.dist = this.ovDist();
    } else this.applyFocus(this.focus);
  };

  private halfWRaw() {
    return Math.max(
      this.bbX1 - this.bbCX, this.bbCX - this.bbX0,
      this.bbZ1 - this.bbCZ, this.bbCZ - this.bbZ0,
    ) * 0.92;
  }
  private get halfHRaw() { return this.TREE_H * 0.55; }

  /**
   * 水平压缩。这棵树宽大于高（三主枝 360° 铺开），
   * 手机竖屏时宽度成了取景瓶颈：相机被迫拉远，树只占屏幕中段，上下全空。
   * 解法不是把树改窄（那会牺牲宽屏），而是把 X/Z 压到「宽度刚好不再是瓶颈」，
   * 高度重新接管取景。宽屏 SQ=1 完全不变。真实的树也是密林里瘦高、旷野里宽展。
   */
  private calcSQ() {
    const asp = Math.max(0.4, (this.W || innerWidth) / Math.max(this.H || innerHeight, 1));
    return Math.max(0.45, Math.min(1, (asp * this.halfHRaw) / Math.max(this.halfWRaw(), 1e-3)));
  }
  private sqz(p: V3): V3 { return [p[0] * this.SQ, p[1], p[2] * this.SQ]; }

  private ovDist() {
    const asp = Math.max(0.4, (this.W || innerWidth) / Math.max(this.H || innerHeight, 1));
    return Math.max(this.halfHRaw, (this.halfWRaw() * this.SQ) / asp) / Math.tan(FOV / 2);
  }

  // ═══════════════════════ 展开布局 ═══════════════════════

  private bbInit(P: V3, basis: [V3, V3, V3]) {
    this.fanBB = { r0: 1e9, r1: -1e9, u0: 1e9, u1: -1e9 };
    this.fanBBRef = P; this.fanBBBasis = basis;
  }
  private bbAdd(p: V3) {
    const bb = this.fanBB;
    if (!bb) return;
    const d = sub(p, this.fanBBRef);
    const r = dot(d, this.fanBBBasis[0]), u = dot(d, this.fanBBBasis[1]);
    if (r < bb.r0) bb.r0 = r; if (r > bb.r1) bb.r1 = r;
    if (u < bb.u0) bb.u0 = u; if (u > bb.u1) bb.u1 = u;
  }

  /** 绒毛点：沿枝方向拉长的椭球，中心密外围疏（边缘自然衰减，不是硬球） */
  private fuzzPt(P: V3, r: number, k: number, dir: V3): V3 {
    const h = (v: number) => { const s = Math.sin(v) * 43758.5453; return s - Math.floor(s); };
    const u1 = h(k * 12.9898), u2 = h(k * 78.233), u3 = h(k * 39.4257);
    const ct = u1 * 2 - 1, st = Math.sqrt(Math.max(0, 1 - ct * ct)), ph = u2 * 6.28318;
    const rad = r * Math.pow(u3, 0.62);
    const [a1, a2] = ortho(dir);
    const el = 1.25;
    return [
      P[0] + (a1[0] * st * Math.cos(ph) + a2[0] * st * Math.sin(ph) + dir[0] * ct * el) * rad,
      P[1] + (a1[1] * st * Math.cos(ph) + a2[1] * st * Math.sin(ph) + dir[1] * ct * el) * rad,
      P[2] + (a1[2] * st * Math.cos(ph) + a2[2] * st * Math.sin(ph) + dir[2] * ct * el) * rad,
    ];
  }

  /** 子树收拢：枝塌到一点。show=true 时叶作为这根枝梢的叶簇留下，并进 fanLeaf。 */
  private collapse(nd: TreeNode, P: V3, rad: number, dir: V3, show = false) {
    this.bbAdd(P);
    const g = this.G(nd);
    for (let v = g.vs; v < g.ve; v++) {
      const o = v * 3;
      this.aF0[o] = P[0]; this.aF0[o + 1] = P[1]; this.aF0[o + 2] = P[2];
      this.aF1[o] = P[0]; this.aF1[o + 1] = P[1]; this.aF1[o + 2] = P[2];
      this.aWF[v * 2] = 0; this.aWF[v * 2 + 1] = 0;
    }
    for (let l = g.ls; l < g.le; l++) {
      const p = this.fuzzPt(P, rad, l, dir);
      this.placeFanLeaf(l, p, show);
    }
  }

  private placeFanLeaf(i: number, p: V3, show = true) {
    const o = i * 3;
    this.lF[o] = p[0]; this.lF[o + 1] = p[1]; this.lF[o + 2] = p[2];
    if (show) this.fanLeaf.push(i);
  }

  private fanReset(nd: TreeNode) {
    const g = this.G(nd);
    this.aF0.set(this.aP0.subarray(g.vs * 3, g.ve * 3), g.vs * 3);
    this.aF1.set(this.aP1.subarray(g.vs * 3, g.ve * 3), g.vs * 3);
    this.aWF.set(this.aW.subarray(g.vs * 2, g.ve * 2), g.vs * 2);
    this.lF.set(this.lP.subarray(g.ls * 3, g.le * 3), g.ls * 3);
  }

  /**
   * 展开扇形的张角系数。
   *
   * 扇形是横向铺开的，而手机竖屏 aspect≈0.46 —— 横向成了取景瓶颈：
   * 按横向需求定距，竖向就浪费掉一大半，整支内容只占屏幕 1/3。
   * 竖屏时收窄张角让扇形更竖直，横向需求下降，取景才能拉近。
   * 宽屏返回 1，行为完全不变。
   */
  private spreadK() {
    const asp = Math.max(0.4, this.W / Math.max(this.H, 1));
    return Math.max(0.62, Math.min(1, 0.62 + (asp - 0.45) * 0.62));
  }

  /** 沿视线的深度错开：屏幕角度不变，但前后拉开 → 透视/视差回来 */
  private zStagger(i: number, n: number) {
    if (n <= 1) return 0;
    const t = (i / (n - 1)) * 2 - 1;
    return Math.sin(i * GOLD) * 0.62 + t * t * 0.3 - 0.28;
  }
  private fanAngle(i: number, n: number, sp: number) {
    if (n <= 1) return 0;
    return -sp + (i / (n - 1)) * sp * 2;
  }
  /** 张角越大的子枝从越靠下分出（伞形），中间的从枝梢出 */
  private forkT(a: number, sp: number) {
    return 0.3 + 0.7 * (1 - Math.min(1, Math.abs(a) / Math.max(sp, 1e-4)));
  }

  /**
   * 往展开缓冲推一根枝。tree 态与 fan 态都写，GPU 里插值。
   * blade=true 时末端膨大成纺锤叶（用于「种」）—— 叶用真几何而非点精灵，
   * 因为点精灵屏幕对齐、无法绕柄旋转。
   */
  private pushExpand(
    tA: V3, tB: V3, tC: V3, tw0: number, tw1: number,
    fA: V3, fB: V3, fC: V3, fw0: number, fw1: number,
    col: V3, blade: boolean,
  ) {
    if (this.exCount >= MAXEX) return;
    const slot = this.exCount++;
    const LEAF_T = 0.42;
    const wF = (t: number) => {
      // 非线性收细：末端收尖。线性会让枝像截断的水管
      if (!blade) return fw1 + (fw0 - fw1) * Math.pow(1 - t, 0.72);
      if (t < LEAF_T) return fw0;
      const u = (t - LEAF_T) / (1 - LEAF_T);
      // 叶片轮廓：半宽必须远小于叶长（约 1:4），否则变成棒棒糖
      return fw1 * Math.sin(Math.PI * Math.pow(u, 0.72)) + fw0 * (1 - u);
    };
    let v = slot * EX_SEGS * 4;
    for (let i = 0; i < EX_SEGS; i++) {
      const t0 = i / EX_SEGS, t1 = (i + 1) / EX_SEGS;
      const tp = bez3(tA, tB, tC, t0), tq = bez3(tA, tB, tC, t1);
      const fp = bez3(fA, fB, fC, t0), fq = bez3(fA, fB, fC, t1);
      const a0 = tw0 + (tw1 - tw0) * t0, a1 = tw0 + (tw1 - tw0) * t1;
      const b0 = wF(t0), b1 = wF(t1);
      for (let k = 0; k < 4; k++) {
        const o = (v + k) * 3, o2 = (v + k) * 2;
        this.sP0[o] = tp[0]; this.sP0[o + 1] = tp[1]; this.sP0[o + 2] = tp[2];
        this.sP1[o] = tq[0]; this.sP1[o + 1] = tq[1]; this.sP1[o + 2] = tq[2];
        this.sF0[o] = fp[0]; this.sF0[o + 1] = fp[1]; this.sF0[o + 2] = fp[2];
        this.sF1[o] = fq[0]; this.sF1[o + 1] = fq[1]; this.sF1[o + 2] = fq[2];
        this.sW[o2] = a0; this.sW[o2 + 1] = a1;
        this.sWF[o2] = b0; this.sWF[o2 + 1] = b1;
        this.sCol[o] = col[0]; this.sCol[o + 1] = col[1]; this.sCol[o + 2] = col[2];
      }
      v += 4;
    }
  }

  /** 换茬：柄冻住；子枝从顶芽点长出 / 收回。点进去仍从总览树形展开。 */
  private pushExBranch(g: Geo, A: V3, fB: V3, fC: V3, w0: number, w1: number, col: V3, rel: number) {
    if (this.exMode !== "open" && rel === 0) {
      this.pushExpand(A, fB, fC, w0, w1, A, fB, fC, w0, w1, col, false);
      return;
    }
    const o = this.budOrigin;
    if (this.exMode === "grow" && rel > 0 && o) {
      this.pushExpand(o, o, o, 0, 0, A, fB, fC, w0, w1, col, false);
      return;
    }
    if (this.exMode === "retract" && rel > 0 && o) {
      this.pushExpand(A, fB, fC, w0, w1, o, o, o, 0, 0, col, false);
      return;
    }
    this.pushExpand(g.tA, g.tB, g.tC, g.w0, g.w1, A, fB, fC, w0, w1, col, false);
  }

  private pushExBlade(tp: V3, base: V3, mid: V3, p: V3, w0: number, w1: number, col: V3) {
    const o = this.budOrigin;
    if (this.exMode === "grow" && o) {
      this.pushExpand(o, o, o, 0, 0, base, mid, p, w0, w1, col, true);
      return;
    }
    if (this.exMode === "retract" && o) {
      this.pushExpand(base, mid, p, w0, w1, o, o, o, 0, 0, col, true);
      return;
    }
    this.pushExpand(tp, tp, tp, 0, 0, base, mid, p, w0, w1, col, true);
  }

  /** 把节点（含子树）写入展开缓冲。 */
  private fanNode(nd: TreeNode, A: V3, dir: V3, L: number, w0: number, w1: number, rel: number) {
    const [RB, UB, FB] = this.focusBasis;
    if (rel > MAXREL || L <= 0.001) { this.collapse(nd, A, FUZZ, dir, true); return; }
    const g = this.G(nd);
    /* 3D 弯曲。横向分量必须沿离心方向外凸而不是用 cos(phase) ——
       后者会让某些枝的横向弯曲正好归零，变成直棍。 */
    const amp = rel === 0 ? 2.6 : 2.0;
    const dr = dot(dir, RB);
    const sgn = rel === 0 ? (Math.sin(nd.sib * 2.3 + 1.1) >= 0 ? 1 : -1) : dr >= 0 ? 1 : -1;
    const bend = add(
      add(scl(RB, 0.075 * amp * sgn), scl(FB, 0.085 + rel * 0.03)),
      scl(UB, -0.055 - rel * 0.014),
    );
    const fC = add(A, scl(dir, L));
    const fB = add(add(A, scl(dir, L * 0.5)), scl(bend, L));
    const cs = g.selfVs * 3;
    const col: V3 = [this.aCol[cs]!, this.aCol[cs + 1]!, this.aCol[cs + 2]!];
    this.pushExBranch(g, A, fB, fC, w0, w1, col, rel);
    g.bA = A; g.bB = fB; g.bC = fC;
    const end = fC;
    g.fp = end;
    if (rel === 0) this.budOrigin = end;
    // 柄进取景。原先故意不进，扇形贴在上半屏、下面空一截。
    this.bbAdd(A);
    this.bbAdd(end);

    const speciesAll = orderKids(nd.ch.filter((c) => c.lvl >= 6));
    const kidsAll = this.kidsOf(nd);
    const speciesBat = rel === 0
      ? batchKids(speciesAll, this.batchPage)
      : { shown: speciesAll.slice(0, FAN_BATCH), ordered: speciesAll, pages: 1, page: 0 };
    const species = speciesBat.shown;

    // ── 焦点自身有「种」：做成一根长主枝 + 两侧互生短叶柄 ──
    if (speciesAll.length > 0 && kidsAll.length === 0) {
      const n = species.length;
      if (rel === 0) {
        this.batchPages = speciesBat.pages;
        const v = kvis(nd.kingdom);
        const lcol: V3 = [
          v.c[0] + (0.99 - v.c[0]) * 0.3,
          v.c[1] + (0.97 - v.c[1]) * 0.26,
          v.c[2] + (0.86 - v.c[2]) * 0.3,
        ];
        for (let i = 0; i < n; i++) {
          const lf = species[i]!;
          const lg = this.G(lf);
          const li = lg.leafIdx[0];
          const t = n <= 1 ? 0.62 : 0.17 + 0.8 * (i / (n - 1));
          const base = this.bzAt(nd, t), bdir = this.bzTan(nd, t);
          const side = i % 2 ? 1 : -1;
          const a = side * (0.72 + 0.3 * (((i * 5) % 3) / 2));
          const inPlane = nrm(add(scl(RB, Math.sin(a)), scl(bdir, Math.cos(a))));
          const pd = nrm(add(inPlane, scl(FB, 0.16 * Math.sin(i * 1.9))));
          const petiole = L * (0.155 + 0.055 * (((i * 7) % 4) / 3));
          const p = add(base, scl(pd, petiole));
          const lb = add(add(scl(RB, 0.14 * side), scl(FB, 0.05)), scl(UB, -0.06));
          const mid = add(scl(add(base, p), 0.5), scl(lb, petiole));
          const tp: V3 = li != null
            ? [this.lP[li * 3]!, this.lP[li * 3 + 1]!, this.lP[li * 3 + 2]!]
            : g.p1;
          this.pushExBlade(tp, base, mid, p, petiole * 0.03, petiole * 0.105, lcol);
          if (li != null) this.placeFanLeaf(li, p);
          lg.fp = p; lg.fbase = base;
          this.bbAdd(p); this.bbAdd(base);
        }
        if (this.exMode !== "retract" && speciesBat.pages > 1) {
          this.placeBatchBuds(end, dir, L, w1, col, RB, UB, speciesBat.page, speciesBat.pages);
        }
        this.bbAdd(end);
        return;
      }
      // 非焦点：种紧贴枝端聚成叶簇，避免枝与点之间出现「秃枝」
      const nl = FAN_LEN[Math.min(rel + 1, MAXREL)]! * 0.17;
      const spAdj = FAN_SPREAD[Math.min(rel + 1, MAXREL)]!;
      for (let i = 0; i < n; i++) {
        const lf = species[i]!;
        const lg = this.G(lf);
        const li = lg.leafIdx[0];
        if (li == null) continue;
        if (rel + 1 > MAXREL || nl <= 0.001) {
          const p = this.fuzzPt(end, FUZZ, li, dir);
          this.placeFanLeaf(li, p);
          lg.fp = p; continue;
        }
        const a = this.fanAngle(i, n, spAdj);
        const ring = n > 7 ? i % 2 : 0;
        const t = 0.8 + 0.2 * (((i * 3) % 4) / 3);
        const base = this.bzAt(nd, t), bdir = this.bzTan(nd, t);
        const pd = nrm(add(add(scl(bdir, Math.cos(a)), scl(RB, Math.sin(a))), scl(UB, 0.05)));
        const p = add(
          add(base, scl(pd, nl * (ring ? 1.0 : 0.6))),
          scl(FB, this.zStagger(i, n) * nl * 0.42),
        );
        this.placeFanLeaf(li, p);
        lg.fp = p; lg.fbase = base; this.bbAdd(p);
      }
      const shownSp = new Set(species);
      for (const lf of speciesAll) {
        if (!shownSp.has(lf)) this.collapse(lf, end, FUZZ, dir, true);
      }
      return;
    }

    // ── 装饰叶：跟着本枝末端走（它们没有对应节点，不需要标签）──
    if (g.leafIdx.length > 0 && kidsAll.length === 0) {
      for (const li of g.leafIdx) {
        const p = this.fuzzPt(end, FUZZ * (rel === 0 ? 2.2 : 1), li, dir);
        this.placeFanLeaf(li, p);
        this.bbAdd(p);
      }
      return;
    }

    const kidBat = rel === 0
      ? batchKids(kidsAll, this.batchPage)
      : { shown: orderKids(kidsAll).slice(0, FAN_BATCH), ordered: orderKids(kidsAll), pages: 1, page: 0 };
    const shownKids = kidBat.shown;
    const n = shownKids.length;
    if (n === 0) return;
    if (rel === 0) this.batchPages = kidBat.pages;
    const nl = FAN_LEN[Math.min(rel + 1, MAXREL)]!;
    // 竖屏收窄张角（见 spreadK），并让子级枝更长 —— 补回收窄损失的铺开感
    const sk = this.spreadK();
    const sp = FAN_SPREAD[Math.min(rel + 1, MAXREL)]! * sk;
    const lenK = 1 + (1 - sk) * 0.55;

    for (let j = 0; j < n; j++) {
      const c = shownKids[j]!;
      if (rel + 1 > MAXREL || nl <= 0.001) { this.collapse(c, end, FUZZ, dir, true); continue; }
      let d2: V3, ln: number, base: V3;
      if (rel === 0) {
        /* 直接子级：屏幕上仍是扇形均分（保证标签不重叠、可读），
           但沿视线方向前后错开。必须先定平面方向再加深度 ——
           若把 FB 混进方向再归一化，扇形会被压窄。 */
        const a = this.fanAngle(j, n, sp) + Math.sin(j * 4.7 + nd.sib) * 0.055;
        const t = this.forkT(a, sp);
        base = this.bzAt(nd, t);
        const bdir = this.bzTan(nd, t);
        const pd = nrm(add(scl(bdir, Math.cos(a)), scl(RB, Math.sin(a))));
        const jitter = 0.86 + 0.28 * h01(strId(c.id), 3, 5, 7);
        const tv = add(scl(pd, nl * jitter * lenK), scl(FB, this.zStagger(j, n) * ZOFF));
        ln = len3(tv); d2 = scl(tv, 1 / ln);
      } else {
        // 更深层：真正的 3D 径向散开（绕父枝旋转），恢复体积
        const s2 = sp * (0.68 + 0.44 * (((j * 5) % 4) / 3));
        const t = n <= 1 ? 1 : 0.46 + (0.54 * (j + 1)) / n;
        base = this.bzAt(nd, t);
        const bdir = this.bzTan(nd, t);
        const [u, v] = ortho(bdir);
        const gg = GOLD * j + rel * 1.7 + nd.sib * 0.9;
        const perp = add(scl(u, Math.cos(gg)), scl(v, Math.sin(gg)));
        d2 = nrm(add(add(scl(bdir, Math.cos(s2)), scl(perp, Math.sin(s2))), scl(FB, 0.08)));
        ln = nl * (0.76 + 0.36 * (((j * 3) % 4) / 3)) * lenK;
      }
      /* 末端收尖：子级已到最深一层时枝梢要收到近 0，
         否则每根枝都像被平切的水管。 */
      const isTip = rel + 1 >= MAXREL;
      this.fanNode(c, base, d2, ln, w1, w1 * (isTip ? 0.1 : 0.48), rel + 1);
    }
    const shownSet = new Set(shownKids);
    for (const c of kidBat.ordered) {
      if (shownSet.has(c)) continue;
      /* 焦点这一茬之外：藏。更深一层预览的溢出仍收成那根枝梢的叶簇。 */
      if (rel > 0) this.collapse(c, end, FUZZ, dir, true);
    }
    if (this.exMode !== "retract" && rel === 0 && kidBat.pages > 1) {
      this.placeBatchBuds(end, dir, L, w1, col, RB, UB, kidBat.page, kidBat.pages);
    }
  }

  private camDir(yaw: number, pitch: number): V3 {
    const cp = Math.cos(pitch);
    return nrm([Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp]);
  }
  private camBasis(yaw: number, pitch: number): [V3, V3, V3] {
    const FB = this.camDir(yaw, pitch);
    const R = nrm([FB[2], 0, -FB[0]]);
    const Uu = nrm([
      FB[1] * R[2] - FB[2] * R[1],
      FB[2] * R[0] - FB[0] * R[2],
      FB[0] * R[1] - FB[1] * R[0],
    ]);
    return [R, Uu, FB];
  }

  private setFocusFlags(nd: TreeNode) {
    const gl = this.gl;
    this.aFoc.fill(nd === this.root ? 1 : 0);
    this.lFoc.fill(nd === this.root ? 1 : 0);
    if (nd !== this.root) {
      const g = this.G(nd);
      /* 焦点子树的枝改由高分辨率缓冲绘制，在大树缓冲里必须彻底隐藏（-1），
         否则会和展开后的枝重影。祖先链留在背景层虚化：它们不参与 morph，
         若标成清晰层会在原地留下一根乱入的粗棍。「来路」由扇心下方那截柄表达。 */
      this.aFoc.fill(-1, g.vs, g.ve);
      /* 子树叶默认全藏。展开态只露出 fanNode 明确放到扇形上的那些；
         否则没上场的几十根子树会被 collapse 堆成梢上那一坨灰点。 */
      this.lFoc.fill(-1, g.ls, g.le);
      for (const i of this.fanLeaf) {
        if (i >= 0 && i < this.lFoc.length) this.lFoc[i] = 1;
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bFoc);
    gl.bufferData(gl.ARRAY_BUFFER, this.aFoc, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.blFoc);
    gl.bufferData(gl.ARRAY_BUFFER, this.lFoc, gl.DYNAMIC_DRAW);
  }

  private applyFocus(nd: TreeNode, keepView = false, exMode: "open" | "retract" | "grow" = "open") {
    this.focus = nd;
    this.exCount = 0;
    this.nextBudP = null;
    this.nextBudBase = null;
    this.prevBudP = null;
    this.prevBudBase = null;
    this.budOrigin = null;
    this.fanLeaf = [];
    this.exMode = keepView ? exMode : "open";
    if (!keepView) {
      this.batchAnim = "idle";
      this.bloom = 1;
      this.bloomClock = 1;
    }
    if (nd.id !== this.batchFocusId) {
      this.batchPage = 0;
      this.batchFocusId = nd.id;
    }
    if (nd === this.root) {
      this.batchPages = 1;
      this.fanReset(this.root);
      this.morphGoal = 0; this.blurGoal = 0;
      this.camGoal.tgt = this.sqz(this.OV_TGT);
      this.camGoal.dist = this.ovDist();
      this.camGoal.pitch = 0.11; this.cam.spin = 0.055;
      this.setFocusFlags(this.root);
      this.upload();
      return;
    }
    /* 换茬必须停在同一支上：镜头、morph、扇形坐标系都不动。
       若按当前 cam 重算 basis，枝会跟着微晃的镜头整扇跳一下。 */
    if (!keepView) {
      this.camGoal.pitch = 0.06;
      this.focusBasis = this.camBasis(this.camGoal.yaw, 0.06);
    }
    const [RB, UB] = this.focusBasis;
    const g = this.G(nd);
    const P = g.p1;
    /* 柄 = 承载所有子级的母枝。必须足够长，子枝才能沿它错落分出；
       太短的话所有子枝挤在一点，成了张开的五指而不是树。 */
    const atLeafParent = nd.ch.length > 0 && nd.ch.every((c) => c.lvl >= 6);
    const stalk = FAN_LEN[1]! * (atLeafParent ? 1.95 : 1.15);
    const A = sub(P, scl(UB, stalk));
    this.fanReset(nd);
    this.bbInit(P, this.focusBasis);
    this.fanNode(
      nd, A, UB, stalk,
      stalk * (atLeafParent ? 0.013 : 0.021),
      stalk * (atLeafParent ? 0.004 : 0.01), 0,
    );
    this.morphGoal = 1; this.blurGoal = 1;
    if (keepView) {
      this.morph = 1;
      this.phase = "idle";
      this.cam.spin = 0;
      this.setFocusFlags(nd);
      this.upload();
      return;
    }

    /* 自适应取景：展开层数随阶元变化（门有 4 层、属只有 1 层），尺寸差数倍。
       按实际包围盒定距，才能每层都恰好填满画面。
       展开态不受水平压缩 —— 它是「凑近看一支」，再压只会让扇形变窄变空。 */
    const bb = this.fanBB!;
    const aspect = Math.max(0.35, this.W / Math.max(this.H, 1));
    const halfR = Math.max(1, (bb.r1 - bb.r0) / 2) * 1.18;
    const halfU = Math.max(1, (bb.u1 - bb.u0) / 2) * 1.22;
    const widthNeed = halfR / aspect;
    /* 竖屏宽扇：若完全按宽度定距，内容只剩上半屏一小撮。
       允许两侧略微出画，换竖向把扇形落到画面中部。 */
    const need = aspect < 0.72
      ? Math.max(halfU, Math.min(widthNeed, halfU * 1.4))
      : Math.max(halfU, widthNeed);
    this.camGoal.dist = Math.max(S * 0.55, need / Math.tan(FOV / 2));
    const uMid = (bb.u0 + bb.u1) / 2;
    const uSpan = Math.max(1, bb.u1 - bb.u0);
    this.camGoal.tgt = add(
      add(P, scl(RB, (bb.r0 + bb.r1) / 2)),
      scl(UB, uMid - uSpan * 0.16),
    );
    this.cam.spin = 0;
    this.setFocusFlags(nd);
    this.upload();
  }

  private turnBatch(delta: number) {
    if (this.batchAnim !== "idle" || this.phase !== "idle") return;
    const next = this.batchPage + delta;
    if (next < 0 || next >= this.batchPages) return;
    this.pendingPage = next;
    this.batchAnim = "out";
    this.bloomClock = 0;
    this.bloom = 0;
    this.applyFocus(this.focus, true, "retract");
  }

  private drawBudAt(
    from: V3, dir: V3, L: number, w: number, col: V3, RB: V3, UB: V3,
    slot: "next" | "prev",
  ) {
    /* 合着的鳞片，体量和枝梢叶簇同类，不是一根带棱的粗纺锤。 */
    const n = slot === "next" ? 5 : 4;
    const len = L * (slot === "next" ? 0.075 : 0.06);
    let tip: V3 = from;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (slot === "prev" ? 0.5 : 0);
      const side = nrm(add(scl(RB, Math.cos(a)), scl(UB, Math.sin(a))));
      const d = nrm(add(dir, scl(side, 0.52)));
      const C = add(from, scl(d, len * (0.82 + 0.18 * (i % 2))));
      const B = add(add(from, scl(d, len * 0.38)), scl(side, len * 0.16));
      this.pushExpand(from, from, from, 0, 0, from, B, C, w * 0.9, w * 2.1, col, true);
      tip = C;
    }
    const label = add(from, scl(dir, len * 1.15));
    if (slot === "next") {
      this.nextBudP = label; this.nextBudBase = from;
    } else {
      this.prevBudP = label; this.prevBudBase = from;
    }
    this.bbAdd(tip);
    this.bbAdd(from);
  }

  private placeBatchBuds(
    end: V3, dir: V3, L: number, w: number, col: V3, RB: V3, UB: V3, page: number, pages: number,
  ) {
    if (pages <= 1) return;
    /* 两颗芽都从同一簇顶梢长出：顶芽向前，侧芽略回。不要在柄根另造一截悬空桩。 */
    if (page < pages - 1) {
      const ndir = nrm(add(dir, scl(UB, 0.18)));
      this.drawBudAt(end, ndir, L, w, col, RB, UB, "next");
    }
    if (page > 0) {
      const pdir = nrm(add(add(scl(dir, -0.12), scl(RB, -0.72)), scl(UB, -0.22)));
      this.drawBudAt(end, pdir, L, w, col, RB, UB, "prev");
    }
  }

  private upload() {
    this.put(this.bF0, this.aF0);
    this.put(this.bF1, this.aF1);
    this.put(this.bWF, this.aWF);
    this.put(this.blF, this.lF);
    this.put(this.bsP0, this.sP0);
    this.put(this.bsP1, this.sP1);
    this.put(this.bsF0, this.sF0);
    this.put(this.bsF1, this.sF1);
    this.put(this.bsW, this.sW);
    this.put(this.bsWF, this.sWF);
    this.put(this.bsCol, this.sCol);
  }

  // ═══════════════════════ 输入 ═══════════════════════

  private bindInput() {
    const cv = this.cv;
    cv.addEventListener("pointerdown", (e) => {
      this.cam.drag = true; this.cam.px = e.clientX; this.cam.py = e.clientY;
      this.cam.moved = false;
      try { cv.setPointerCapture(e.pointerId); } catch { /* 某些浏览器会拒绝 */ }
    });
    cv.addEventListener("pointermove", (e) => {
      if (!this.cam.drag) return;
      const dx = e.clientX - this.cam.px, dy = e.clientY - this.cam.py;
      this.cam.px = e.clientX; this.cam.py = e.clientY;
      if (Math.abs(dx) + Math.abs(dy) > 3) this.cam.moved = true;
      this.camGoal.yaw -= dx * 0.005;
      this.camGoal.pitch = Math.max(-0.42, Math.min(0.95, this.camGoal.pitch + dy * 0.004));
      this.cam.spin = 0;
    });
    cv.addEventListener("pointerup", () => {
      this.cam.drag = false;
      if (!this.cam.moved) this.ev.onBlank();
    });
    cv.addEventListener("pointercancel", () => { this.cam.drag = false; });
    cv.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.camGoal.dist = Math.max(
        S * 0.75,
        Math.min(this.TREE_H * 2.2, this.camGoal.dist * (1 + Math.sign(e.deltaY) * 0.1)),
      );
    }, { passive: false });
  }

  // ═══════════════════════ 标签 ═══════════════════════

  private mkBudBtn(slot: "next" | "prev") {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tree3d-nb bud " + slot;
    b.style.display = "none";
    b.innerHTML = '<span class="pill"></span><span class="sub"></span>';
    const next = slot === "next";
    b.setAttribute("aria-label", t(next ? "tree3d.budNext" : "tree3d.budPrev"));
    b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      this.turnBatch(next ? 1 : -1);
    });
    this.labelHost.appendChild(b);
    if (next) this.budBtn = b;
    else this.prevBtn = b;
  }

  private buildLabels() {
    this.ftitle = document.createElement("div");
    this.ftitle.className = "tree3d-ftitle";
    this.ftitle.innerHTML = "<b></b><span></span>";
    this.labelHost.appendChild(this.ftitle);
    this.mkBudBtn("next");
    this.mkBudBtn("prev");
    for (let i = 0; i < this.POOLN; i++) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "tree3d-nb"; b.style.display = "none";
      b.innerHTML = '<span class="pill"></span><span class="sub"></span><i class="dot"></i>';
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (this.batchAnim !== "idle") return;
        const n = (b as HTMLButtonElement & { _n?: TreeNode })._n;
        if (!n) return;
        this.ev.onPick(n, this.kidsOf(n).length > 0 || n.ch.length > 0);
      });
      this.labelHost.appendChild(b);
      this.lab.push(b);
    }
  }

  private project(p: V3, VP: Float32Array): [number, number] | null {
    const x = VP[0]! * p[0] + VP[4]! * p[1] + VP[8]! * p[2] + VP[12]!;
    const y = VP[1]! * p[0] + VP[5]! * p[1] + VP[9]! * p[2] + VP[13]!;
    const w = VP[3]! * p[0] + VP[7]! * p[1] + VP[11]! * p[2] + VP[15]!;
    if (w <= 0.001) return null;
    return [(x / w * 0.5 + 0.5) * this.W, (0.5 - (y / w) * 0.5) * this.H];
  }

  private updateLabels(VP: Float32Array) {
    const isLeafParent = this.focus.ch.length > 0 && this.focus.ch.every((c) => c.lvl >= 6);
    const rawKids = this.focus === this.root
      ? this.kidsOf(this.focus)
      : isLeafParent
        ? this.focus.ch.filter((c) => c.lvl >= 6)
        : this.kidsOf(this.focus);
    const kids = this.focus === this.root
      ? rawKids
      : batchKids(rawKids, this.batchPage).shown;
    let op: number;
    if (this.focus === this.root) op = 1;
    else if (this.batchAnim === "out") op = Math.max(0, 1 - this.bloom / 0.5);
    else if (this.batchAnim === "in") op = Math.max(0, (this.bloom - 0.42) / 0.58);
    else op = Math.max(0, (this.morph - 0.5) / 0.5);
    const items: { el: HTMLButtonElement; nd: TreeNode; s: [number, number] }[] = [];
    const N = Math.min(this.POOLN, kids.length);

    for (let i = 0; i < this.POOLN; i++) {
      const el = this.lab[i]!;
      const nd = kids[i];
      // filler 节点没有名字，不给标签（它们只表达规模，不可点）
      if (!nd || i >= N || nd.src === "filler") {
        if (el.style.display !== "none") el.style.display = "none";
        continue;
      }
      const g = this.G(nd);
      const isLeaf = nd.lvl >= 6;
      let tp: V3 = isLeaf
        ? (g.leafIdx[0] != null
          ? [this.lP[g.leafIdx[0]! * 3]!, this.lP[g.leafIdx[0]! * 3 + 1]!, this.lP[g.leafIdx[0]! * 3 + 2]!]
          : g.p1)
        : g.p1;
      if (this.focus === this.root && g.centroid) tp = g.centroid;
      const fp = g.fp ?? tp;
      const bud = this.budOrigin;
      let k = this.morph;
      let from = tp;
      if (this.batchAnim === "out" && bud) {
        from = fp; k = this.bloom;
      }
      if (this.batchAnim === "in" && bud) {
        from = bud; k = this.bloom;
      }
      const to = this.batchAnim === "out" && bud ? bud : fp;
      const p: V3 = [
        from[0] + (to[0] - from[0]) * k,
        from[1] + (to[1] - from[1]) * k,
        from[2] + (to[2] - from[2]) * k,
      ];
      const s = this.project(p, VP);
      if (!s || s[0] < -160 || s[0] > this.W + 160 || s[1] < -80 || s[1] > this.H + 80) {
        if (el.style.display !== "none") el.style.display = "none";
        continue;
      }
      // 标签外移，露出枝端那个节点（否则 pill 会把它完全盖住）
      if (this.morph > 0.5 || this.batchAnim === "in") {
        let dx: number, dy: number;
        if (g.fbase) {
          const b = this.project(g.fbase, VP);
          dx = b ? s[0] - b[0] : s[0] - this.W / 2;
          dy = b ? s[1] - b[1] : 0;
        } else {
          dx = s[0] - this.W / 2; dy = s[1] - this.H * 0.56;
        }
        const dl = Math.hypot(dx, dy) || 1;
        const off = isLeaf ? 30 : 20;
        s[0] += (dx / dl) * off; s[1] += (dy / dl) * off;
      }
      items.push({ el, nd, s });
    }

    /* ── 标签取舍（label decluttering）──
       旧实现是「碰撞就 y+=54 往下顶」，结果 16 个子级就叠成一竖列、
       脱离自己的枝，还盖住整棵树：标签需要 N×54px 竖向空间，
       而枝丛只占屏幕中间约 250px，差 3.5 倍，必然溢出。

       改成地图的做法：位置不动，放不下就降级为一个小圆点。
       每个标记永远贴在自己的枝上，点圆点能出概要卡（卡里有全名），
       信息没有丢失，只是从常显变成按需。 */
    /* ── 标签取舍（label decluttering）──
       旧实现是「碰撞就 y+=54 往下顶」，结果 16 个子级就叠成一竖列、
       脱离自己的枝，还盖住整棵树：标签需要 N×54px 竖向空间，
       而枝丛只占屏幕中间约 250px，差 3.5 倍，必然溢出。

       改成地图的做法：位置不动，放不下就降级为一个小圆点。
       每个标记永远贴在自己的枝上，点圆点能出概要卡（卡里有全名）。

       界是例外，走「推开」而不是「降级」—— 它们只有 8 个（推得开），
       而且总览时是唯一的路标，降成圆点就没法认路了。
       混合策略的依据就是这个：数量少且必须常显的推开，数量多的降级。 */
    const isK = (n: TreeNode) => n.lvl === 0;
    const pri = (it: { nd: TreeNode; s: [number, number] }) =>
      (isK(it.nd) ? -1e6 : 0) +
      (it.nd.got > 0 ? 0 : 1000) +
      Math.abs(it.s[0] - this.W / 2) / this.W +
      Math.abs(it.s[1] - this.H * 0.5) / this.H;
    items.sort((a, b) => pri(a) - pri(b));
    const placed: [number, number][] = [];
    const hitAt = (x: number, y: number) => {
      for (const pl of placed)
        if (Math.abs(pl[0] - x) < 132 && Math.abs(pl[1] - y) < 46) return pl[1];
      return null;
    };
    /* pill 是居中对齐的，半宽约 70px；贴边时会被画面切掉半个词。
       溢出的一律降级为圆点 —— 半个词比没有词更糟，它看起来就是坏了。 */
    const EDGE = 74;
    const fits = (x: number, y: number) =>
      x > EDGE && x < this.W - EDGE && y > 44 && y < this.H - 44;
    for (const it of items) {
      const { el, nd } = it;
      const s = it.s;
      let full = true;
      if (isK(nd)) {
        // 界永不降级，改用「夹回画面 + 交替上下推」保证可读
        s[0] = Math.max(EDGE, Math.min(this.W - EDGE, s[0]));
        s[1] = Math.max(46, Math.min(this.H - 46, s[1]));
        for (let q = 0; q < 10; q++) {
          const at = hitAt(s[0], s[1]);
          if (at == null) break;
          s[1] = at + (q % 2 ? -50 : 50) * (1 + Math.floor(q / 2) * 0.1);
        }
        placed.push([s[0], s[1]]);
      } else {
        full = fits(s[0], s[1]) && hitAt(s[0], s[1]) == null;
        if (full) placed.push([s[0], s[1]]);
      }
      el.style.display = "flex";
      (el as HTMLButtonElement & { _n?: TreeNode })._n = nd;
      el.style.left = s[0].toFixed(1) + "px";
      el.style.top = s[1].toFixed(1) + "px";
      el.style.opacity = String(op);
      const term = nd.ch.length === 0;
      const cls = "tree3d-nb" + (full ? "" : " mini")
        + (nd.lvl >= 6 ? " leaf" : term ? " term" : "")
        + (nd.got > 0 ? " has" : "");
      if (el.className !== cls) el.className = cls;
      el.style.setProperty("--kc", kingdomHex(nd.kingdom));
      if (!full) continue;
      const pill = el.children[0] as HTMLElement, sub = el.children[1] as HTMLElement;
      const name = labelOf(nd);
      if (pill.textContent !== name) pill.textContent = name;
      /* 副标只写「有多少收集」。
         不要写阶元名 —— 中文名本身已带阶元后缀（动物界／脊索动物门／鸟纲／
         雀形目），旁边再标一个「界」「门」是纯冗余。
         没有收集时留空，让画面安静。 */
      const s2 = nd.got > 0 ? t("tree3d.gotCount", { count: nd.got }) : nd.lvl >= 6 ? nd.la : "";
      if (sub.textContent !== s2) sub.textContent = s2;
    }

    this.pinBud(this.budBtn, this.nextBudP, this.nextBudBase, VP, op, t("tree3d.budNext"));
    this.pinBud(this.prevBtn, this.prevBudP, this.prevBudBase, VP, op, t("tree3d.budPrev"));

    // 焦点自身大标题：钉在柄的下端。概要卡开着时让位（卡里已有同样的名字）
    if (this.focus !== this.root && this.morph > 0.3 && !this.cardOpen) {
      const g = this.G(this.focus);
      const s = this.project(g.bA, VP);
      if (s) {
        const x = Math.max(78, Math.min(this.W - 78, s[0]));
        const y = Math.max(52, Math.min(this.H - 64, s[1] + 16));
        this.ftitle.style.left = x + "px";
        this.ftitle.style.top = y + "px";
        this.ftitle.style.opacity = String(Math.max(0, (this.morph - 0.3) / 0.7) * 0.95);
        (this.ftitle.children[0] as HTMLElement).textContent = labelOf(this.focus);
        const rank = formatRank(RANKS[this.focus.lvl] ?? "");
        (this.ftitle.children[1] as HTMLElement).textContent = this.batchPages > 1
          ? t("tree3d.focusMetaPage", {
            la: this.focus.la,
            rank,
            cur: this.batchPage + 1,
            total: this.batchPages,
          })
          : t("tree3d.focusMeta", { la: this.focus.la, rank });
      }
    } else this.ftitle.style.opacity = "0";
  }

  private pinBud(
    el: HTMLButtonElement,
    tip: V3 | null,
    base: V3 | null,
    VP: Float32Array,
    op: number,
    text: string,
  ) {
    if (!tip || this.focus === this.root || this.batchAnim === "out") {
      if (el.style.display !== "none") el.style.display = "none";
      return;
    }
    const vis = this.batchAnim === "in" ? this.bloom : this.morph;
    if (vis <= 0.5) {
      if (el.style.display !== "none") el.style.display = "none";
      return;
    }
    const s = this.project(tip, VP);
    if (!s) {
      if (el.style.display !== "none") el.style.display = "none";
      return;
    }
    if (base) {
      const b = this.project(base, VP);
      if (b) {
        const dx = s[0] - b[0], dy = s[1] - b[1];
        const dl = Math.hypot(dx, dy) || 1;
        s[0] += (dx / dl) * 28;
        s[1] += (dy / dl) * 28;
      }
    }
    s[0] = Math.max(78, Math.min(this.W - 78, s[0]));
    s[1] = Math.max(52, Math.min(this.H - 52, s[1]));
    el.style.display = "flex";
    el.style.left = s[0].toFixed(1) + "px";
    el.style.top = s[1].toFixed(1) + "px";
    el.style.opacity = String(op);
    el.style.setProperty("--kc", kingdomHex(this.focus.kingdom));
    const pill = el.children[0] as HTMLElement;
    if (pill.textContent !== text) pill.textContent = text;
    const sub = el.children[1] as HTMLElement;
    if (sub.textContent) sub.textContent = "";
  }

  // ═══════════════════════ 渲染 ═══════════════════════

  private drawScene(
    VP: Float32Array, V: Float32Array, only: number,
    fogN: number, fogF: number, fogK: number, szK: number, wk: number,
    desat: number, lalpha: number, ldeep: number, horizon: number, leafShape: number,
  ) {
    const gl = this.gl;
    const hz = horizon || 0;
    gl.useProgram(this.pB);
    gl.uniformMatrix4fv(this.uB.uVP!, false, VP);
    gl.uniformMatrix4fv(this.uB.uV!, false, V);
    gl.uniform1f(this.uB.uMorph!, this.morph);
    gl.uniform1f(this.uB.uOnly!, only);
    gl.uniform1f(this.uB.uPx!, this.PX);
    gl.uniform2f(this.uB.uRes!, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform3fv(this.uB.uFog!, BG);
    gl.uniform1f(this.uB.uFogK!, fogK);
    gl.uniform1f(this.uB.uFogN!, fogN);
    gl.uniform1f(this.uB.uFogF!, fogF);
    gl.uniform1f(this.uB.uWK!, wk);
    gl.uniform1f(this.uB.uDesat!, desat);
    gl.uniform1f(this.uB.uHorizon!, hz);
    gl.bindVertexArray(this.vaoB);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.eb);
    gl.drawElements(gl.TRIANGLES, this.NI, gl.UNSIGNED_INT, 0);

    if (this.exCount > 0) {
      const gm = this.batchAnim === "idle" ? this.morph : this.bloom;
      gl.uniform1f(this.uB.uMorph!, gm);
      gl.bindVertexArray(this.vaoS);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ebS);
      gl.drawElements(gl.TRIANGLES, this.exCount * EX_SEGS * 6, gl.UNSIGNED_INT, 0);
      gl.uniform1f(this.uB.uMorph!, this.morph);
    }

    gl.useProgram(this.pL);
    gl.uniformMatrix4fv(this.uL.uVP!, false, VP);
    gl.uniformMatrix4fv(this.uL.uV!, false, V);
    gl.uniform1f(this.uL.uMorph!, this.morph);
    gl.uniform1f(this.uL.uOnly!, only);
    gl.uniform1f(this.uL.uPx!, this.PX);
    const budOn = only > 0.5 && this.batchAnim !== "idle" && this.budOrigin ? 1 : 0;
    gl.uniform1f(this.uL.uBudOn!, budOn);
    gl.uniform1f(this.uL.uBudT!, this.batchAnim === "out" ? 1 - this.bloom : this.bloom);
    const bo = this.budOrigin ?? [0, 0, 0];
    gl.uniform3f(this.uL.uBud!, bo[0], bo[1], bo[2]);
    gl.uniform3fv(this.uL.uFog!, BG);
    gl.uniform1f(this.uL.uFogK!, fogK);
    gl.uniform1f(this.uL.uFogN!, fogN);
    gl.uniform1f(this.uL.uFogF!, fogF);
    gl.uniform1f(this.uL.uSzK!, szK);
    gl.uniform1f(this.uL.uDesat!, desat);
    gl.uniform1f(this.uL.uAlpha!, lalpha);
    gl.uniform1f(this.uL.uDeep!, ldeep || 0);
    gl.uniform1f(this.uL.uHorizon!, hz);
    /* 叶形只用于展开态。全树态必须用圆点：圆点能聚成雾状树冠、更饱满；
       屏幕对齐的叶片一旦被放大，就成了一堆「飘在枝外、连不到枝上」的小横线。 */
    gl.uniform1f(this.uL.uLeaf!, leafShape || 0);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.vaoL);
    gl.drawArrays(gl.POINTS, 0, this.lc);
    if (hz > 0 && only > 0.5) {
      gl.uniform1f(this.uL.uBudOn!, 0);
      gl.uniform1f(this.uL.uSzK!, 1.0);
      gl.uniform1f(this.uL.uAlpha!, 0.5);
      gl.uniform1f(this.uL.uDeep!, 0);
      gl.uniform1f(this.uL.uHorizon!, 0);
      gl.uniform1f(this.uL.uLeaf!, 0);
      gl.bindVertexArray(this.vaoG);
      gl.drawArrays(gl.POINTS, 0, this.GND_N);
    }
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  private blitFS(p: WebGLProgram, setup: () => void) {
    const gl = this.gl;
    gl.useProgram(p); setup();
    gl.bindVertexArray(this.vaoQ);
    gl.disable(gl.DEPTH_TEST);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  private frame = (now: number) => {
    if (this.dead) return;
    const gl = this.gl;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;

    if (this.cv.clientWidth !== this.W || this.cv.clientHeight !== this.H) this.onResize();

    if (this.phase === "out") {
      this.morph -= dt / 0.26;
      if (this.morph <= 0) {
        this.morph = 0;
        this.applyFocus(this.pending ?? this.root);
        this.pending = null; this.phase = "in";
      }
    } else if (this.batchAnim === "out" || this.batchAnim === "in") {
      const dur = this.batchAnim === "out" ? 0.28 : 0.52;
      this.bloomClock = Math.min(1, this.bloomClock + dt / dur);
      this.bloom = 1 - (1 - this.bloomClock) ** 3;
      if (this.bloomClock >= 1) {
        if (this.batchAnim === "out") {
          this.batchPage = this.pendingPage;
          this.batchAnim = "in";
          this.bloomClock = 0;
          this.bloom = 0;
          this.applyFocus(this.focus, true, "grow");
        } else {
          this.batchAnim = "idle";
          this.bloom = 1;
          this.bloomClock = 1;
        }
      }
    } else if (this.phase === "in") {
      if (this.morphGoal > 0) {
        this.morph = Math.min(1, this.morph + dt / 0.62);
        if (this.morph >= 1) this.phase = "idle";
      } else {
        this.morph = Math.max(0, this.morph - dt / 0.4);
        if (this.morph <= 0) this.phase = "idle";
      }
    }
    this.blurAmt += (this.blurGoal - this.blurAmt) * Math.min(1, dt * 4.5);

    if (this.cam.spin) this.camGoal.yaw += this.cam.spin * dt;
    const k = Math.min(1, dt * 4.2);
    this.cam.yaw += (this.camGoal.yaw - this.cam.yaw) * k;
    this.cam.pitch += (this.camGoal.pitch - this.cam.pitch) * k;
    this.cam.dist += (this.camGoal.dist - this.cam.dist) * k;
    for (let i = 0; i < 3; i++) this.cam.tgt[i] += (this.camGoal.tgt[i]! - this.cam.tgt[i]!) * k;

    /* 展开态的呼吸式视差摆动。立体感一半来自运动视差 ——
       静止的透视图看着仍像平面图。幅度小到不影响点击。 */
    this.swayK += ((this.focus !== this.root && !this.cam.drag ? 1 : 0) - this.swayK) * Math.min(1, dt * 1.6);
    this.swayT += dt;
    const swY = Math.sin(this.swayT * 0.314) * 0.052 * this.swayK;
    const swP = Math.sin(this.swayT * 0.221 + 1.1) * 0.026 * this.swayK;

    const asp = Math.max(0.2, this.cv.width / this.cv.height);
    const eye = add(this.cam.tgt, scl(this.camDir(this.cam.yaw + swY, this.cam.pitch + swP), this.cam.dist));
    const V = lookAt(eye, this.cam.tgt, [0, 1, 0]);
    const P = persp(FOV, asp, Math.max(0.6, this.cam.dist * 0.012), this.cam.dist * 4.5 + this.TREE_H * 3);
    /* 水平压缩只用于总览态。总览要「装下整棵树」所以受视口比例约束；
       展开是「凑近看一支」，取景本来就按包围盒自适应，再压只会让扇形变空。 */
    const sq = this.SQ + (1 - this.SQ) * this.morph;
    const M = new Float32Array([sq, 0, 0, 0, 0, 1, 0, 0, 0, 0, sq, 0, 0, 0, 0, 1]);
    const VP = m4mul(m4mul(P, V), M);

    const fogN = this.cam.dist * 0.55, fogF = this.cam.dist * 2.6 + this.TREE_H * 0.8;
    const anyBg = this.focus !== this.root || this.blurAmt > 0.02;

    if (anyBg) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboA);
      gl.viewport(0, 0, this.FW, this.FH);
      gl.clearColor(BG[0], BG[1], BG[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      // 背景层：枝略粗（虚化后才不消失）+ 强去饱和 + 重雾 → 隐约的树影
      this.drawScene(VP, V, 0, this.cam.dist * 0.16, fogF * 1.05, 0.95, 0.62, 1.15, 0.9, 0.3, 0, 0, 0);
      // 2 趟递增半径高斯：在 1/3 分辨率上等效很大的核，但仍留住枝的形状
      for (let r = 0; r < 2; r++) {
        const rad = 1.35 + r * 2.4;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboB); gl.viewport(0, 0, this.FW, this.FH);
        this.blitFS(this.pBlur, () => {
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.texA);
          gl.uniform1i(this.uBlur.uT!, 0); gl.uniform2f(this.uBlur.uDir!, rad / this.FW, 0);
        });
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboA); gl.viewport(0, 0, this.FW, this.FH);
        this.blitFS(this.pBlur, () => {
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.texB);
          gl.uniform1i(this.uBlur.uT!, 0); gl.uniform2f(this.uBlur.uDir!, 0, rad / this.FH);
        });
      }
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.cv.width, this.cv.height);
    gl.clearColor(BG[0], BG[1], BG[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (anyBg) {
      /* uKeep：背景层保留多少可见度。0.22 = 隐隐约约看得见别的树枝，
         再高的话贴近镜头的粗枝会糊成一大块深色，抢掉焦点。 */
      this.blitFS(this.pBlit, () => {
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.texA);
        gl.uniform1i(this.uBlit.uT!, 0); gl.uniform1f(this.uBlit.uAmt!, 1);
        gl.uniform1f(this.uBlit.uKeep!, 0.22); gl.uniform3fv(this.uBlit.uBg!, BG);
      });
    }
    gl.enable(gl.DEPTH_TEST);
    const ov = this.focus === this.root;
    // 展开态用近景雾：近处枝叶清晰、稍远即退淡 → 厚度感／立体分层
    const fN = ov ? fogN : this.cam.dist * 0.7;
    const fF = ov ? fogF : this.cam.dist * 1.62;
    const hz = ov ? this.TREE_H * 0.055 : 0;
    this.drawScene(
      VP, V, 1, fN, fF, ov ? 0.68 : 0.3, ov ? 0.88 : 1.75, 1.0, 0.0,
      ov ? 0.85 : 0.9, ov ? 0 : 0.35, hz, ov ? 0 : 1,
    );

    this.updateLabels(VP);
    this.raf = requestAnimationFrame(this.frame);
  };
}
