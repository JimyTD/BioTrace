const t = (k) => ({ "tree3d.rootLife": "\u751F\u547D" })[k] ?? k;
import { BACKBONE_ZH } from "./backboneZh.js";
import backboneRaw from "./backboneData.js";
const RANKS = ["kingdom", "phylum", "class", "order", "family", "genus", "species"];
function toTreeCollectible(e, track) {
  return {
    id: e.id,
    track,
    taxonKey: e.taxonKey,
    commonName: e.commonName,
    scientificName: e.scientificName,
    coverDisplayUrl: e.coverDisplayUrl,
    taxonomy: e.taxonomy ?? null
  };
}
const DOC = backboneRaw;
function nodeId(lvl, la) {
  return `${lvl}:${la}`;
}
function labelOf(n) {
  return n.zh ?? n.la;
}
const FAN_BATCH = 8;
function orderKids(kids) {
  return kids.slice().sort((a, b) => {
    const az = a.zh ? 0 : 1;
    const bz = b.zh ? 0 : 1;
    if (az !== bz) return az - bz;
    if (a.sib !== b.sib) return a.sib - b.sib;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
function batchKids(kids, page) {
  const ordered = orderKids(kids);
  const pages = Math.max(1, Math.ceil(ordered.length / FAN_BATCH));
  const p = Math.max(0, Math.min(pages - 1, page | 0));
  const start = p * FAN_BATCH;
  return {
    ordered,
    shown: ordered.slice(start, start + FAN_BATCH),
    pages,
    page: p
  };
}
function mkNode(o) {
  return {
    zh: null,
    kingdom: "",
    zone: "crown",
    src: "backbone",
    parent: null,
    ch: [],
    got: 0,
    own: [],
    coverUrl: null,
    term: false,
    sib: 0,
    fillLeaves: 0,
    ...o
  };
}
function h01(a, b) {
  let x = Math.imul(a, 374761393) + Math.imul(b, 668265263) | 0;
  x = Math.imul(x ^ x >>> 15, 2246822519);
  x = Math.imul(x ^ x >>> 13, 3266489917);
  return ((x ^ x >>> 16) >>> 0) / 4294967296;
}
function strHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function buildSpeciesTree(entries) {
  const F = {};
  DOC.fields.forEach((f, i) => F[f] = i);
  const byId = /* @__PURE__ */ new Map();
  const root = mkNode({ id: "root", lvl: -1, la: "Vita", zh: t("tree3d.rootLife"), src: "backbone" });
  for (const row of DOC.nodes) {
    const id = row[F.id];
    const la = row[F.la];
    const lvl = row[F.rank];
    const kingdom = row[F.kingdom];
    const n = mkNode({
      id,
      lvl,
      la,
      zh: BACKBONE_ZH[id] ?? row[F.zh] ?? null,
      kingdom,
      zone: DOC.zones[kingdom] ?? "crown",
      src: "backbone"
    });
    byId.set(id, n);
  }
  for (const row of DOC.nodes) {
    const n = byId.get(row[F.id]);
    const pid = row[F.parentId];
    const p = pid ? byId.get(pid) : null;
    n.parent = p ?? root;
    (p ?? root).ch.push(n);
  }
  const ROOT_ORDER = [
    "Animalia",
    "Chromista",
    "Fungi",
    "Plantae",
    "Protozoa",
    "Bacteria",
    "Archaea",
    "Viruses"
  ];
  root.ch.sort((a, b) => {
    const ai = ROOT_ORDER.indexOf(a.la), bi = ROOT_ORDER.indexOf(b.la);
    return (ai < 0 ? ROOT_ORDER.length : ai) - (bi < 0 ? ROOT_ORDER.length : bi);
  });
  const realCount = byId.size;
  for (const e of entries) {
    if (!e.taxonomy) continue;
    attachEntry(root, byId, { ...e, track: e.track ?? "wild" }, e.taxonomy);
  }
  applyCollectedSpeciesZh(root);
  rollup(root);
  finalize(root, 0);
  equalizeCrownFoliage(root);
  return { root, byId, totalGot: root.got, realCount };
}
const FILL_LEAF_BY_LVL = [0, 30, 40, 58, 26, 14, 0];
function finalize(n, sib) {
  n.sib = sib;
  if (n.ch.length === 0 && n.lvl >= 0 && n.lvl < 6) {
    const seed = strHash(n.id);
    const base = FILL_LEAF_BY_LVL[n.lvl] ?? 12;
    n.fillLeaves = Math.max(6, Math.round(base * (0.55 + 0.9 * h01(seed, 17))));
  }
  n.ch.forEach((c, i) => finalize(c, i));
}
const CROWN_FILL_BUDGET = 12e3;
function countFillLeaves(n) {
  let s = n.fillLeaves;
  for (const c of n.ch) s += countFillLeaves(c);
  return s;
}
function scaleFillLeaves(n, k) {
  if (n.fillLeaves > 0) n.fillLeaves = Math.max(6, Math.round(n.fillLeaves * k));
  for (const c of n.ch) scaleFillLeaves(c, k);
}
function equalizeCrownFoliage(root) {
  for (const k of root.ch) {
    if (k.zone !== "crown") continue;
    const t2 = countFillLeaves(k);
    if (t2 < 1) continue;
    scaleFillLeaves(k, CROWN_FILL_BUDGET / t2);
  }
}
const TAX_RANKS = [
  "kingdom",
  "phylum",
  "class",
  "order",
  "family",
  "genus",
  "species"
];
function homeLvl(tax) {
  for (let i = TAX_RANKS.length - 1; i >= 0; i--) {
    if (tax[TAX_RANKS[i]]?.name_la?.trim()) return i;
  }
  return -1;
}
function attachEntry(root, byId, e, tax) {
  const home = homeLvl(tax);
  if (home < 0) return;
  let cur = root;
  let lastMatched = -1;
  for (let lvl = 0; lvl <= home; lvl++) {
    const la = tax[TAX_RANKS[lvl]]?.name_la?.trim();
    if (!la) continue;
    const id = nodeId(lvl, la);
    let n = byId.get(id);
    if (n) {
      cur = n;
      lastMatched = lvl;
      continue;
    }
    n = mkNode({
      id,
      lvl,
      la,
      zh: tax[TAX_RANKS[lvl]]?.name_zh?.trim() || BACKBONE_ZH[id] || null,
      kingdom: cur.kingdom || la,
      zone: cur.zone,
      src: "grown",
      parent: cur
    });
    byId.set(id, n);
    cur.ch.push(n);
    cur = n;
    lastMatched = lvl;
  }
  if (lastMatched < 0) return;
  cur.own.push(e);
}
function applyCollectedSpeciesZh(n) {
  for (const c of n.ch) applyCollectedSpeciesZh(c);
  if (n.lvl !== 6 || n.own.length === 0) return;
  const wild = n.own.find((e) => e.track !== "pet");
  const pet = n.own.find((e) => e.track === "pet");
  if (wild) {
    const name2 = wild.commonName?.trim();
    if (name2) n.zh = name2;
    return;
  }
  const name = pet?.commonName?.trim();
  if (name) n.zh = name;
}
function rollup(n) {
  let got = n.own.length;
  for (const c of n.ch) got += rollup(c);
  n.got = got;
  if (!n.coverUrl) {
    const mine = n.own.find((e) => e.coverDisplayUrl);
    n.coverUrl = mine?.coverDisplayUrl ?? null;
  }
  if (!n.coverUrl) {
    for (const c of n.ch) {
      if (c.coverUrl) {
        n.coverUrl = c.coverUrl;
        break;
      }
    }
  }
  return got;
}
function chainOf(n) {
  const out = [];
  let c = n;
  while (c && c.lvl >= 0) {
    out.unshift(c);
    c = c.parent;
  }
  return out;
}
function collectEntries(n, cap = 400) {
  const out = [];
  const walk = (x) => {
    if (out.length >= cap) return;
    for (const e of x.own) {
      out.push(e);
      if (out.length >= cap) return;
    }
    for (const c of x.ch) walk(c);
  };
  walk(n);
  return out;
}
export {
  FAN_BATCH,
  RANKS,
  batchKids,
  buildSpeciesTree,
  chainOf,
  collectEntries,
  labelOf,
  nodeId,
  orderKids,
  toTreeCollectible
};
