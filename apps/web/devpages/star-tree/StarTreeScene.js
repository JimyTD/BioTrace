var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import {
  labelOf
} from "./treeModel.js";
import {
  add,
  nrm,
  scl,
  kvis,
  h01,
  lookAt,
  persp,
  m4mul,
  UP
} from "./geom.js";
const STAR_BG = [0.012, 0.018, 0.045];
const STAR_SIZE_DIM = 1.1;
const STAR_SIZE_MAX = 11;
const HAZE_COUNT = 9e3;
const HAZE_ALPHA = 0.16;
const STAR_REF_DIST = 220;
const STAR_TEMPS = [
  [0.72, 0.82, 1],
  [0.85, 0.9, 1],
  [1, 1, 1],
  [1, 0.96, 0.87],
  [1, 0.88, 0.72],
  [1, 0.74, 0.56],
  [1, 0.62, 0.48]
];
const GALAXY_RADIUS = 90;
const FAN_RADIUS_BASE = 60;
const LINK_ALPHA = 0.05;
const FOV = Math.PI / 4;
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
  /* \u70B9\u5C3A\u5BF8\u6309"\u53C2\u8003\u8DDD\u79BB"\u5F52\u4E00\u5316\uFF0C\u4E0D\u662F\u76F4\u63A5\u9664 c.w\u3002
     \u76F8\u673A\u5728 220 \u8FDC\u5904\uFF0C\u76F4\u63A5 /c.w \u4F1A\u628A 1.1~11px \u7684\u661F\u5168\u538B\u5230 0.7px \u4E0B\u9650
     \u2014\u2014 \u534A\u7269\u7406\u50CF\u7D20\u4E0D\u53D1\u5149\u7684\u70B9 = \u4E00\u7247\u5168\u9ED1\u3002
     \u9664\u4EE5 (c.w / uRefDist) \u540E\uFF0C\u4F4D\u4E8E\u53C2\u8003\u8DDD\u79BB\u4E0A\u7684\u661F\u6070\u597D\u662F\u8BBE\u8BA1\u5C3A\u5BF8\uFF0C
     \u8FD1\u4E86\u53D8\u5927\u8FDC\u4E86\u53D8\u5C0F\uFF0C\u8FD9\u624D\u662F\u6B63\u786E\u7684\u900F\u89C6\u7F29\u653E\u3002 */
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

  // \u89C6\u4EAE\u5EA6\uFF1A\u5E42\u5F8B\u7684\u7ED3\u679C\u3002\u6697\u661F\u662F\u52C9\u5F3A\u53EF\u89C1\u7684\u5FAE\u5149\uFF0C\u4EAE\u661F\u624D\u8FC7\u66DD
  float lum = mix(0.34, 1.0, vMag * vMag);

  // \u6052\u661F\u662F\u70B9\u5149\u6E90\uFF1A\u6838\u5FC3\u6781\u5C0F\u4E14\u8FC7\u66DD\u6210\u767D
  float core = exp(-r * r * 90.0);
  // \u67D4\u548C\u8F89\u5149
  float glow = exp(-r * r * 9.0) * 0.5;
  // \u4EAE\u661F\u72EC\u6709\u7684\u5927\u8303\u56F4\u67D4\u5149\uFF08\u955C\u5934\u4E0E\u5927\u6C14\u7684\u6563\u5C04\u611F\uFF09
  float halo = exp(-r * 2.6) * vMag * vMag * 0.38;

  float a = (core + glow + halo) * lum;

  // \u884D\u5C04\u661F\u8292\uFF1A\u53EA\u6709\u591F\u4EAE\u7684\u661F\u624D\u770B\u5F97\u51FA\uFF0C\u7EC6\u957F\u5341\u5B57\uFF0C\u89D2\u5EA6\u968F\u79CD\u5B50
  if (vMag > 0.5 && vSize > 3.0) {
    float ang = atan(q.y, q.x) + vSeed * 6.28318;
    float beam = pow(abs(cos(ang * 2.0)), 26.0);
    a += beam * exp(-r * 3.2) * (vMag - 0.5) * 1.6;
  }

  // \u5FAE\u5149\u661F\u8F7B\u5FAE\u95EA\u70C1\uFF0C\u4EAE\u661F\u7A33\u5B9A\uFF08\u4EAE\u661F\u95EA\u662F\u5927\u6C14\u6270\u52A8\uFF0C\u4E0D\u662F\u6052\u661F\u672C\u8EAB\uFF09
  a *= 1.0 + (1.0 - vMag) * 0.22 * sin(vSeed * 40.0 + uTime * 1.3);

  a *= uAlpha;
  if (a < 0.004) discard;

  // \u6838\u5FC3\u8FC7\u66DD\u504F\u767D\uFF0C\u8FB9\u7F18\u4FDD\u7559\u6052\u661F\u8272\u6E29
  vec3 c = mix(vCol, vec3(1.0), clamp(core * 1.1, 0.0, 0.92));

  // \u9884\u4E58 alpha\uFF1A\u914D\u5408\u52A0\u6CD5\u6DF7\u5408\uFF0C\u5BC6\u96C6\u5904\u81EA\u7136\u53E0\u52A0\u6210\u4E73\u767D\uFF08\u94F6\u6CB3\u7684\u6210\u56E0\uFF09
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
  /* \u53EA\u8BA9\u7126\u70B9\u9644\u8FD1\u4E24\u4E09\u5C42\u7684\u8FDE\u7EBF\u663E\u5F62\u3002
     \u6574\u68F5\u6811\u51E0\u5343\u6761\u8FDE\u7EBF\u5168\u753B\u51FA\u6765\uFF0C\u52A0\u6CD5\u6DF7\u5408\u4E0B\u4F1A\u53E0\u6210\u4E00\u7247\u767D\u7EBF\u56E2\uFF0C
     \u661F\u70B9\u548C\u94F6\u6CB3\u5168\u88AB\u76D6\u4F4F \u2014\u2014 \u90A3\u5C31\u4E0D\u662F\u661F\u7A7A\u4E86\u3002
     \u661F\u5EA7\u4E4B\u6240\u4EE5\u662F\u661F\u5EA7\uFF0C\u6B63\u56E0\u4E3A\u53EA\u8FDE\u8BE5\u8FDE\u7684\u90A3\u51E0\u9897\u3002 */
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
  /* \u5FC5\u987B\u9884\u4E58 alpha\u3002
     \u6574\u573A\u662F\u52A0\u6CD5\u6DF7\u5408\uFF08ONE, ONE\uFF09\uFF0CRGB \u4F1A\u88AB\u76F4\u63A5\u7D2F\u52A0\uFF0C
     \u4E0D\u9884\u4E58\u7684\u8BDD alpha \u5F62\u540C\u865A\u8BBE\u3001\u6BCF\u6761\u7EBF\u90FD\u6EE1\u4EAE\u5EA6\u70E7\u4E0A\u53BB\u3002 */
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
  // \u6781\u7F13\u6162\u7684\u81EA\u884C\u3002\u94F6\u6CB3\u91CC\u7684\u661F\u4E0D\u662F\u5C18\u57C3\uFF0C\u4E0D\u8BE5\u98D8
  float drift = uTime * 0.02;
  float rx = sin(aSeed * 12.9898 + drift) * 0.5;
  float ry = cos(aSeed * 78.233 + drift * 1.3) * 0.5;
  float rz = sin(aSeed * 45.164 + drift * 0.7) * 0.5;
  vec3 p = aP + vec3(rx, ry, rz) * 1.2;
  vec4 c = uVP * vec4(p, 1.0);
  /* \u540C\u661F\u70B9\uFF1A\u6309\u53C2\u8003\u8DDD\u79BB\u5F52\u4E00\u5316\uFF0C\u5426\u5219\u8FDC\u5904\u7684\u96FE\u70B9\u5168\u584C\u5230\u4E0B\u9650\u3001\u4E00\u6761\u5149\u5E26\u90FD\u51FA\u4E0D\u6765 */
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
  // \u6781\u8F6F\u7684\u8870\u51CF\uFF1A\u5355\u9897\u51E0\u4E4E\u770B\u4E0D\u89C1\uFF0C\u6210\u5343\u4E0A\u4E07\u9897\u53E0\u8D77\u6765\u624D\u662F\u4E73\u767D\u7684\u5149
  float glow = exp(-r * r * 7.0);
  float a = glow * vAlpha;
  if (a < 0.002) discard;
  // \u4E73\u767D\u504F\u6696\uFF1A\u94F6\u6CB3\u7684\u5149\u662F\u5927\u91CF\u6052\u661F\u6DF7\u8272\u540E\u7684\u7ED3\u679C\uFF0C\u4E0D\u662F\u7EAF\u84DD
  vec3 c = mix(vec3(0.72, 0.78, 1.0), vec3(1.0, 0.97, 0.92), glow * 0.6);
  o = vec4(c * a, a);
}`;
class StarTreeScene {
  constructor(host, root, tree, ev) {
    __publicField(this, "cv");
    __publicField(this, "labelHost");
    __publicField(this, "gl");
    __publicField(this, "ev");
    __publicField(this, "root");
    __publicField(this, "tree");
    __publicField(this, "W", 0);
    __publicField(this, "H", 0);
    __publicField(this, "PX", 1);
    // 几何
    __publicField(this, "stars", []);
    __publicField(this, "starCount", 0);
    // WebGL
    __publicField(this, "pStar", null);
    __publicField(this, "pLink", null);
    __publicField(this, "pParticle", null);
    __publicField(this, "vaoStar", null);
    __publicField(this, "vaoLink", null);
    __publicField(this, "vaoParticle", null);
    __publicField(this, "linkCount", 0);
    // 状态
    __publicField(this, "focus");
    __publicField(this, "morph", 0);
    __publicField(this, "morphGoal", 0);
    __publicField(this, "phase", "idle");
    // 相机
    __publicField(this, "cam", {
      yaw: 0.3,
      pitch: 0.15,
      dist: 220,
      tgt: [0, 20, 0],
      drag: false,
      px: 0,
      py: 0,
      moved: false,
      spin: 0.04
    });
    __publicField(this, "camGoal", {
      yaw: 0.3,
      pitch: 0.15,
      dist: 220,
      tgt: [0, 20, 0],
      spin: 0.04
    });
    __publicField(this, "raf", 0);
    __publicField(this, "dead", false);
    __publicField(this, "last", 0);
    __publicField(this, "time", 0);
    // 粒子
    __publicField(this, "particleCount", HAZE_COUNT);
    __publicField(this, "particles", null);
    __publicField(this, "particleSeeds", null);
    // 标签
    __publicField(this, "lab", []);
    __publicField(this, "POOLN", 40);
    __publicField(this, "ftitle");
    __publicField(this, "ftitleName");
    __publicField(this, "ftitleMeta");
    __publicField(this, "frame", (now) => {
      if (this.dead) return;
      const gl = this.gl;
      const dt = Math.min(0.05, (now - this.last) / 1e3);
      this.last = now;
      this.time += dt;
      if (this.cv.clientWidth !== this.W || this.cv.clientHeight !== this.H) {
        this.onResize();
      }
      if (this.phase === "in") {
        this.morph = Math.min(1, this.morph + dt / 0.8);
        if (this.morph >= 1) this.phase = "idle";
      } else if (this.phase === "out") {
        this.morph = Math.max(0, this.morph - dt / 0.5);
        if (this.morph <= 0) this.phase = "idle";
      }
      const k = Math.min(1, dt * 3.5);
      this.cam.yaw += (this.camGoal.yaw - this.cam.yaw) * k;
      this.cam.pitch += (this.camGoal.pitch - this.cam.pitch) * k;
      this.cam.dist += (this.camGoal.dist - this.cam.dist) * k;
      this.cam.yaw += this.camGoal.spin * dt;
      for (let i = 0; i < 3; i++) {
        this.cam.tgt[i] += (this.camGoal.tgt[i] - this.cam.tgt[i]) * k;
      }
      const asp = Math.max(0.2, this.W / this.H);
      const eye = add(this.cam.tgt, scl(this.camDir(), this.cam.dist));
      const V = lookAt(eye, this.cam.tgt, UP);
      const P = persp(FOV, asp, 1, 1200);
      const VP = m4mul(P, V);
      gl.clearColor(STAR_BG[0], STAR_BG[1], STAR_BG[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.drawParticles(VP);
      this.drawLinks(VP);
      this.drawStars(VP);
      this.updateLabels(VP);
      this.raf = requestAnimationFrame(this.frame);
    });
    this.root = root;
    this.tree = tree;
    this.focus = root;
    this.ev = ev;
    this.cv = document.createElement("canvas");
    this.cv.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
    host.appendChild(this.cv);
    this.labelHost = document.createElement("div");
    this.labelHost.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden";
    host.appendChild(this.labelHost);
    const gl = this.cv.getContext("webgl2", {
      alpha: false,
      antialias: true,
      premultipliedAlpha: false
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
  getTree() {
    return this.tree;
  }
  // ═══════════════════════ WebGL ═══════════════════════
  initGL() {
    const gl = this.gl;
    this.pStar = this.compile(VS_STAR, FS_STAR);
    this.pLink = this.compile(VS_LINK, FS_LINK);
    this.pParticle = this.compile(VS_PARTICLE, FS_PARTICLE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
  }
  compile(vs, fs) {
    const gl = this.gl;
    const mkShader = (src, type) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const err = gl.getShaderInfoLog(sh);
        gl.deleteShader(sh);
        throw new Error(err ?? "shader compile failed");
      }
      return sh;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mkShader(vs, gl.VERTEX_SHADER));
    gl.attachShader(p, mkShader(fs, gl.FRAGMENT_SHADER));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(p) ?? "program link failed");
    }
    return p;
  }
  // ═══════════════════════ 建星图 ═══════════════════════
  buildStars(root) {
    this.stars = [];
    const kingdoms = root.ch.filter((c) => c.lvl === 0);
    const kn = kingdoms.length;
    const collect = (nd, parentIdx) => {
      const idx = this.stars.length;
      const seed = this.hashId(nd.id);
      const u = this.hashId(nd.id + "#mag");
      const mag = Math.pow(u, 3);
      const lit = nd.got > 0 ? 0.28 : 0;
      const rankBoost = nd.lvl <= 0 ? 0.42 : Math.max(0, 0.22 - nd.lvl * 0.05);
      const bm = Math.min(1, mag + lit + rankBoost);
      const size = STAR_SIZE_DIM + bm * (STAR_SIZE_MAX - STAR_SIZE_DIM);
      const vis = kvis(nd.kingdom);
      const temp = STAR_TEMPS[Math.floor(this.hashId(nd.id + "#t") * STAR_TEMPS.length)];
      const col = [
        Math.min(1, vis.c[0] * temp[0] + (1 - bm) * 0.05),
        Math.min(1, vis.c[1] * temp[1] + (1 - bm) * 0.05),
        Math.min(1, vis.c[2] * temp[2] + (1 - bm) * 0.05)
      ];
      let p0;
      if (nd.lvl === 0) {
        const ki = kingdoms.indexOf(nd);
        const phi = Math.acos(1 - 2 * (ki + 0.5) / kn);
        const theta = Math.PI * (1 + Math.sqrt(5)) * ki;
        p0 = [
          GALAXY_RADIUS * Math.sin(phi) * Math.cos(theta),
          GALAXY_RADIUS * Math.sin(phi) * Math.sin(theta) + 15,
          GALAXY_RADIUS * Math.cos(phi)
        ];
      } else if (nd.lvl < 0) {
        p0 = [0, 0, 0];
      } else {
        const parent = this.stars[parentIdx];
        const spread = GALAXY_RADIUS * 0.12 * (1 + nd.lvl * 0.3);
        const a = seed * Math.PI * 2;
        const b = seed * 1.7 % 1 * Math.PI;
        p0 = add(parent.p0, [
          Math.cos(a) * Math.sin(b) * spread,
          Math.sin(a) * Math.sin(b) * spread,
          Math.cos(b) * spread
        ]);
      }
      let p1;
      if (nd.lvl <= 0) {
        p1 = p0;
      } else {
        const parent = this.stars[parentIdx];
        const fanR = FAN_RADIUS_BASE / (1 + nd.lvl * 0.5);
        const a = seed * Math.PI * 2;
        const spreadAngle = 0.6 + nd.lvl * 0.15;
        p1 = add(parent.p1, [
          Math.cos(a) * fanR * spreadAngle,
          Math.sin(a) * fanR * spreadAngle * 0.6,
          (seed - 0.5) * fanR * 0.8
        ]);
      }
      this.stars.push({
        p0,
        p1,
        col,
        size,
        mag: bm,
        seed,
        lvl: nd.lvl,
        parentIdx
      });
      for (const ch of nd.ch) {
        collect(ch, idx);
      }
      return idx;
    };
    collect(root, -1);
    this.starCount = this.stars.length;
  }
  hashId(s) {
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
  buildParticles() {
    const n = this.particleCount;
    this.particles = new Float32Array(n * 3);
    this.particleSeeds = new Float32Array(n);
    const R = GALAXY_RADIUS * 2.35;
    for (let i = 0; i < n; i++) {
      const h1 = h01(i, 11, 3, 7);
      const h2 = h01(i, 29, 5, 13);
      const h3 = h01(i, 47, 17, 23);
      const h4 = h01(i, 91, 31, 41);
      const rad = Math.sqrt(h1) * R;
      const ang = h2 * Math.PI * 2;
      const thick = (h3 + h3 + h3 + h4 - 2) * 0.5;
      const hgt = thick * GALAXY_RADIUS * 0.16 * (1 - rad / R * 0.45);
      this.particles[i * 3] = Math.cos(ang) * rad;
      this.particles[i * 3 + 1] = hgt;
      this.particles[i * 3 + 2] = Math.sin(ang) * rad;
      const core = 1 - Math.min(1, rad / R);
      const dust = Math.sin(ang * 2 + h4 * 1.2) * 0.5 + 0.5;
      const lane = Math.min(1, Math.max(0, dust * 1.35 - 0.28));
      this.particleSeeds[i] = 0.2 + core * 0.55 * lane;
    }
  }
  // ═══════════════════════ 上传 ═══════════════════════
  uploadAll() {
    const n = this.starCount;
    const p0 = new Float32Array(n * 3);
    const p1 = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const seed = new Float32Array(n);
    const mag = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const s = this.stars[i];
      p0[i * 3] = s.p0[0];
      p0[i * 3 + 1] = s.p0[1];
      p0[i * 3 + 2] = s.p0[2];
      p1[i * 3] = s.p1[0];
      p1[i * 3 + 1] = s.p1[1];
      p1[i * 3 + 2] = s.p1[2];
      col[i * 3] = s.col[0];
      col[i * 3 + 1] = s.col[1];
      col[i * 3 + 2] = s.col[2];
      size[i] = s.size;
      seed[i] = s.seed;
      mag[i] = s.mag;
    }
    const links = [];
    for (let i = 1; i < n; i++) {
      const s = this.stars[i];
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
      const pi = links[i * 2];
      const ci = links[i * 2 + 1];
      const ps = this.stars[pi];
      const cs = this.stars[ci];
      linkP0[i * 3] = ps.p0[0];
      linkP0[i * 3 + 1] = ps.p0[1];
      linkP0[i * 3 + 2] = ps.p0[2];
      linkP1[i * 3] = cs.p0[0];
      linkP1[i * 3 + 1] = cs.p0[1];
      linkP1[i * 3 + 2] = cs.p0[2];
      linkF0[i * 3] = ps.p1[0];
      linkF0[i * 3 + 1] = ps.p1[1];
      linkF0[i * 3 + 2] = ps.p1[2];
      linkF1[i * 3] = cs.p1[0];
      linkF1[i * 3 + 1] = cs.p1[1];
      linkF1[i * 3 + 2] = cs.p1[2];
      linkAlpha[i] = 0.3 + cs.seed * 0.4;
      linkLvl[i] = cs.lvl;
    }
    this.vaoStar = this.createVAO([
      { data: p0, loc: 0, size: 3 },
      { data: p1, loc: 1, size: 3 },
      { data: col, loc: 2, size: 3 },
      { data: size, loc: 3, size: 1 },
      { data: seed, loc: 4, size: 1 },
      { data: mag, loc: 5, size: 1 }
    ]);
    this.vaoLink = this.createVAO([
      { data: linkP0, loc: 0, size: 3 },
      { data: linkP1, loc: 1, size: 3 },
      { data: linkF0, loc: 2, size: 3 },
      { data: linkF1, loc: 3, size: 3 },
      { data: linkAlpha, loc: 4, size: 1 },
      { data: linkLvl, loc: 5, size: 1 }
    ]);
    this.vaoParticle = this.createVAO([
      { data: this.particles, loc: 0, size: 3 },
      { data: this.particleSeeds, loc: 1, size: 1 }
    ]);
  }
  createVAO(attrs) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    for (const a of attrs) {
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, a.data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(a.loc);
      gl.vertexAttribPointer(a.loc, a.size, gl.FLOAT, false, 0, 0);
    }
    gl.bindVertexArray(null);
    return vao;
  }
  // ═══════════════════════ 标签 ═══════════════════════
  buildLabels() {
    this.ftitle = document.createElement("div");
    this.ftitle.className = "tree3d-ftitle";
    this.ftitle.style.cssText = "position:absolute;pointer-events:none;color:#c8d6e5;font-size:0.9rem;text-align:center;transform:translate(-50%,0)";
    this.ftitleName = document.createElement("b");
    this.ftitleMeta = document.createElement("span");
    this.ftitleMeta.style.cssText = "display:block;font-size:0.7rem;opacity:0.6";
    this.ftitle.append(this.ftitleName, this.ftitleMeta);
    this.labelHost.appendChild(this.ftitle);
    for (let i = 0; i < this.POOLN; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tree3d-nb";
      b.style.cssText = "position:absolute;transform:translate(-50%,-50%);pointer-events:auto;background:rgba(10,15,30,0.75);border:1px solid rgba(100,140,200,0.3);border-radius:12px;color:#b0c8e0;font-size:0.72rem;padding:3px 10px;cursor:pointer;white-space:nowrap;backdrop-filter:blur(4px)";
      b.style.display = "none";
      b.innerHTML = '<span class="pill"></span>';
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const n = b._n;
        if (!n) return;
        const kids = this.kidsOf(n);
        this.ev.onPick(n, kids.length > 0 || n.ch.length > 0);
      });
      this.labelHost.appendChild(b);
      this.lab.push(b);
    }
  }
  kidsOf(nd) {
    return nd.ch.filter((c) => c.src !== "filler");
  }
  // ═══════════════════════ 输入 ═══════════════════════
  bindInput() {
    const cv = this.cv;
    cv.addEventListener("pointerdown", (e) => {
      this.cam.drag = true;
      this.cam.px = e.clientX;
      this.cam.py = e.clientY;
      this.cam.moved = false;
      try {
        cv.setPointerCapture(e.pointerId);
      } catch {
      }
    });
    cv.addEventListener("pointermove", (e) => {
      if (!this.cam.drag) return;
      const dx = e.clientX - this.cam.px;
      const dy = e.clientY - this.cam.py;
      this.cam.px = e.clientX;
      this.cam.py = e.clientY;
      if (Math.abs(dx) + Math.abs(dy) > 3) this.cam.moved = true;
      this.camGoal.yaw -= dx * 5e-3;
      this.camGoal.pitch = Math.max(
        -0.4,
        Math.min(0.9, this.camGoal.pitch + dy * 4e-3)
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
        Math.min(600, this.camGoal.dist * (1 + Math.sign(e.deltaY) * 0.1))
      );
    }, { passive: false });
  }
  // ═══════════════════════ 导航 ═══════════════════════
  goTo(nd) {
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
        const s = this.stars[idx];
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
  getFocus() {
    return this.focus;
  }
  findStarIndex(nd) {
    const targetSeed = this.hashId(nd.id);
    return this.stars.findIndex((s) => s.seed === targetSeed);
  }
  // ═══════════════════════ 渲染 ═══════════════════════
  onResize() {
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
  camDir() {
    const cp = Math.cos(this.cam.pitch);
    return nrm([
      Math.sin(this.cam.yaw) * cp,
      Math.sin(this.cam.pitch),
      Math.cos(this.cam.yaw) * cp
    ]);
  }
  drawStars(VP) {
    const gl = this.gl;
    gl.useProgram(this.pStar);
    gl.uniformMatrix4fv(
      gl.getUniformLocation(this.pStar, "uVP"),
      false,
      VP
    );
    gl.uniform1f(gl.getUniformLocation(this.pStar, "uMorph"), this.morph);
    gl.uniform1f(gl.getUniformLocation(this.pStar, "uPx"), this.PX);
    gl.uniform1f(
      gl.getUniformLocation(this.pStar, "uRefDist"),
      STAR_REF_DIST
    );
    gl.uniform1f(gl.getUniformLocation(this.pStar, "uTime"), this.time);
    gl.uniform1f(gl.getUniformLocation(this.pStar, "uAlpha"), 0.95);
    gl.bindVertexArray(this.vaoStar);
    gl.drawArrays(gl.POINTS, 0, this.starCount);
    gl.bindVertexArray(null);
  }
  drawLinks(VP) {
    if (!this.linkCount) return;
    const gl = this.gl;
    gl.useProgram(this.pLink);
    gl.uniformMatrix4fv(
      gl.getUniformLocation(this.pLink, "uVP"),
      false,
      VP
    );
    gl.uniform1f(gl.getUniformLocation(this.pLink, "uMorph"), this.morph);
    gl.uniform1f(
      gl.getUniformLocation(this.pLink, "uFocusLvl"),
      this.focus.lvl
    );
    gl.uniform1f(
      gl.getUniformLocation(this.pLink, "uLinkAlpha"),
      LINK_ALPHA
    );
    gl.bindVertexArray(this.vaoLink);
    gl.drawArrays(gl.LINES, 0, this.linkCount * 2);
    gl.bindVertexArray(null);
  }
  drawParticles(VP) {
    const gl = this.gl;
    gl.useProgram(this.pParticle);
    gl.uniformMatrix4fv(
      gl.getUniformLocation(this.pParticle, "uVP"),
      false,
      VP
    );
    gl.uniform1f(gl.getUniformLocation(this.pParticle, "uTime"), this.time);
    gl.uniform1f(gl.getUniformLocation(this.pParticle, "uPx"), this.PX);
    gl.uniform1f(
      gl.getUniformLocation(this.pParticle, "uRefDist"),
      STAR_REF_DIST
    );
    gl.uniform1f(
      gl.getUniformLocation(this.pParticle, "uAlpha"),
      HAZE_ALPHA
    );
    gl.bindVertexArray(this.vaoParticle);
    gl.drawArrays(gl.POINTS, 0, this.particleCount);
    gl.bindVertexArray(null);
  }
  // ═══════════════════════ 标签更新 ═══════════════════════
  project(p, VP) {
    const x = VP[0] * p[0] + VP[4] * p[1] + VP[8] * p[2] + VP[12];
    const y = VP[1] * p[0] + VP[5] * p[1] + VP[9] * p[2] + VP[13];
    const w = VP[3] * p[0] + VP[7] * p[1] + VP[11] * p[2] + VP[15];
    if (w <= 1e-3) return null;
    return [
      (x / w * 0.5 + 0.5) * this.W,
      (0.5 - y / w * 0.5) * this.H
    ];
  }
  updateLabels(VP) {
    if (this.focus !== this.root && this.morph > 0.3) {
      const idx = this.findStarIndex(this.focus);
      if (idx >= 0) {
        const s = this.stars[idx];
        const p = this.project(s.p1, VP);
        if (p) {
          this.ftitle.style.left = p[0] + "px";
          this.ftitle.style.top = p[1] - 30 + "px";
          this.ftitle.style.opacity = String(
            Math.max(0, (this.morph - 0.3) / 0.7)
          );
          this.ftitleName.textContent = labelOf(this.focus);
          this.ftitleMeta.textContent = this.focus.la;
        }
      }
    } else {
      this.ftitle.style.opacity = "0";
    }
    const kids = this.kidsOf(this.focus);
    const N = Math.min(this.POOLN, kids.length);
    for (let i = 0; i < this.POOLN; i++) {
      const el = this.lab[i];
      const nd = kids[i];
      if (!nd || i >= N) {
        el.style.display = "none";
        continue;
      }
      const idx = this.findStarIndex(nd);
      if (idx < 0) {
        el.style.display = "none";
        continue;
      }
      const s = this.stars[idx];
      const p = this.project(
        this.morph > 0.5 ? s.p1 : s.p0,
        VP
      );
      if (!p || p[0] < -100 || p[0] > this.W + 100 || p[1] < -50 || p[1] > this.H + 50) {
        el.style.display = "none";
        continue;
      }
      el.style.display = "block";
      el.style.left = p[0] + "px";
      el.style.top = p[1] + "px";
      el._n = nd;
      const pill = el.children[0];
      const name = labelOf(nd);
      if (pill.textContent !== name) pill.textContent = name;
    }
  }
  // ═══════════════════════ 生命周期 ═══════════════════════
  setCardOpen(_open) {
  }
  destroy() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.cv.remove();
    this.labelHost.remove();
  }
}
export {
  StarTreeScene
};
