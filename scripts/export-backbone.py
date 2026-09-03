"""导出物种树的全景骨架（界 → 门 → 纲 → 目）。

跑法：python scripts/export-backbone.py
产物：apps/web/src/data/backbone.json

── 只导「用户会去的地方」 ──────────────────────────────────
树冠（动物/植物/真菌）+ 近地（色藻/原生动物）导真骨架。
根系（细菌/古菌/病毒）**不导** —— 由渲染层生成装饰性假枝丛：
  · 用户永远不会点进去
  · 真实名字是 UBA10199 / JACPQU01 这类宏基因组代号，没有可读性
  · 真实骨架有 1886 个节点，比整个树冠（1429）还大，会压倒主角；
    假枝丛的茂密度可以由美术自由定
详见 scripts/probe-backbone.py 顶部的实测结论。

── 为什么节点 id 是「界:rank:拉丁名」而不是拉丁名 ─────────
拉丁名在同一界内会重复，这是真实的生物学现象而非数据错误：
单型分类单元（monotypic taxon）—— 纲下只有一个目时两者同名。

    Diplura  纲(11374670) ← Arthropoda        「双尾纲」
    Diplura  目(240)      ← Diplura(纲)       「双尾目」，父是同名的纲

同类还有 Protura、Micrognathozoa、Dothideales。
所以 id 必须带 rank，否则这些节点会自己当自己的父级 → 建树时成环。
── 条目怎么挂到骨架上 ──────────────────────────────────────
条目的 taxonomy_json 只有 name_la（见 apps/api/src/identify/types.ts），
没有 usageKey。所以匹配靠「界 + rank + 拉丁名」三元组，
这三个值条目侧都有，天然对齐。
"""
import gzip
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

# Windows 控制台默认 GBK，打印中文/符号会炸
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE = "https://api.gbif.org/v1"
BACKBONE = "d7dddbf4-2cf0-4f39-9b2a-bb099caae36c"
UA = {"Accept": "application/json",
      "User-Agent": "BioTrace/0.1 (personal non-profit)"}

# (usageKey, 拉丁名, 中文名, 三段式分区)
CROWN = [
    (1, "Animalia", "动物界", "crown"),
    (6, "Plantae", "植物界", "crown"),
    (5, "Fungi", "真菌界", "crown"),
    (4, "Chromista", "色藻界", "basal"),
    (7, "Protozoa", "原生动物界", "basal"),
]
RANKS = ["kingdom", "phylum", "class", "order"]
OUT = Path(__file__).resolve().parents[1] / "apps/web/src/data/backbone.json"


def get(path, **params):
    qs = urllib.parse.urlencode(params)
    req = urllib.request.Request(f"{BASE}/{path}?{qs}", headers=UA)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=45) as r:
                return json.load(r)
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt == 3:
                raise
            time.sleep(1.5 * (attempt + 1))
            print(f"    retry {attempt + 1}: {e}")
    return {}


def fetch_rank(kingdom_key, rank):
    """取某界某 rank 的全部 ACCEPTED 条目（分页到底）。"""
    out, offset, page = [], 0, 1000
    while True:
        d = get("species/search", highertaxonKey=kingdom_key, rank=rank,
                status="ACCEPTED", datasetKey=BACKBONE, limit=page, offset=offset)
        out.extend(d.get("results", []))
        total = d.get("count", 0)
        if d.get("endOfRecords", True) or len(out) >= total:
            break
        offset += page
    return out


def main():
    # key(usageKey) → 节点，先按 usageKey 建索引，最后再转成拉丁名引用
    by_key = {}
    for kkey, kla, kzh, zone in CROWN:
        by_key[kkey] = {"la": kla, "zh": kzh, "rank": 0,
                        "parent_key": None, "kingdom": kla, "zone": zone}

    for kkey, kla, kzh, zone in CROWN:
        print(f"{kla} ...", end="", flush=True)
        for ri, rank in enumerate(RANKS[1:], start=1):
            got = fetch_rank(kkey, rank.upper())
            for it in got:
                la = (it.get("canonicalName") or it.get("scientificName") or "").strip()
                if not la:
                    continue
                by_key[it["key"]] = {
                    "la": la, "zh": None, "rank": ri,
                    "parent_key": it.get("parentKey"),
                    "kingdom": kla, "zone": zone,
                }
            print(f" {rank[:2]}={len(got)}", end="", flush=True)
        print()

    # ── 校验拉丁名唯一性（骨架靠拉丁名连接条目，重名会导致挂错枝）──
    seen = {}
    dup = []
    for k, n in by_key.items():
        low = n["la"].lower()
        if low in seen:
            dup.append((n["la"], seen[low], n["kingdom"]))
        else:
            seen[low] = n["kingdom"]
    if dup:
        print(f"\n[i] 同名节点 {len(dup)} 处（单型分类单元，纲与目同名）:")
        for la, a, b in dup[:12]:
            print(f"    {la}  ({a})")
        print("    → 已用 rank 参与 id 区分，见文件头说明")

    # ── 父引用用「rank:拉丁名」（界内唯一）；父不在骨架内的上挂到界 ──
    def nid(node):
        """界内唯一 id。rank 必须参与：单型分类单元里纲与目同名。"""
        return f"{node['rank']}:{node['la']}"

    nodes, orphan, self_ref = [], 0, 0
    for k, n in by_key.items():
        if n["rank"] == 0:
            parent = None
        else:
            p = by_key.get(n["parent_key"])
            if p and p["kingdom"] == n["kingdom"]:
                parent = nid(p)
            else:
                # 中间阶元缺失 → 上挂到界（真实数据里确实有，如病毒界 0 门）
                parent = "0:" + n["kingdom"]
                orphan += 1
        me = nid(n)
        if parent == me:      # 不该发生：带 rank 后同名父子也能区分
            parent = "0:" + n["kingdom"]
            self_ref += 1
        nodes.append([me, parent, n["rank"], n["la"], n["zh"], n["kingdom"]])

    # ── 自检：id 唯一 + 无环 + 每个节点都能走到界 ──
    ids = {r[0] for r in nodes}
    assert len(ids) == len(nodes), f"id 不唯一：{len(nodes) - len(ids)} 处重复"
    byid = {r[0]: r for r in nodes}
    for r in nodes:
        seen_path, cur, depth = set(), r, 0
        while cur[1] is not None:
            assert cur[0] not in seen_path, f"成环：{cur[0]}"
            seen_path.add(cur[0])
            cur = byid.get(cur[1])
            assert cur is not None, f"父级悬空：{r[0]} → {r[1]}"
            depth += 1
            assert depth <= 8, f"链路过深：{r[0]}"

    nodes.sort(key=lambda r: (r[2], r[0]))
    per_rank = {}
    for r in nodes:
        per_rank[RANKS[r[2]]] = per_rank.get(RANKS[r[2]], 0) + 1

    doc = {
        "v": 1,
        "source": "GBIF Backbone Taxonomy",
        "datasetKey": BACKBONE,
        "generatedAt": time.strftime("%Y-%m-%d"),
        "ranks": RANKS,
        "note": ("根系三界（Bacteria/Archaea/Viruses）不在此表内，"
                 "由渲染层生成装饰性枝丛；见 scripts/export-backbone.py 顶部说明"),
        "zones": {la: zone for _, la, _, zone in CROWN},
        "fields": ["id", "parentId", "rank", "la", "zh", "kingdom"],
        # id 形如 "2:Aves"（rank 序号:拉丁名），界内唯一
        "nodes": nodes,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")),
                   encoding="utf-8")

    raw = OUT.stat().st_size
    gz = len(gzip.compress(OUT.read_bytes(), 9))
    print(f"\n写入 apps/web/src/data/backbone.json")
    print(f"  节点 {len(nodes)}  " +
          "  ".join(f"{k} {v}" for k, v in per_rank.items()))
    print(f"  父级缺失上挂到界: {orphan}   自引用修正: {self_ref}")
    print(f"  体积 {raw / 1024:.1f} KB  → gzip {gz / 1024:.1f} KB")
    print("  自检通过：id 唯一 / 无环 / 父级不悬空")


if __name__ == "__main__":
    main()
