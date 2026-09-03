"""探查 GBIF backbone 骨架的三个关键事实（一次性调研工具，非生产代码）。

跑法：python scripts/probe-backbone.py

2026-09-03 实测结论（写在这里免得重复调研）：

  节点总数：3795（门 257 + 纲 748 + 目 2790）—— 与文档估算的 ~3500 吻合

  ① 中文名覆盖率 = 0%
     门/纲/目 各抽 25 个，一个中文名都没有。
     知名类群逐个验证：Aves / Mammalia / Insecta / Passeriformes /
     Carnivora / Chordata / Agaricales 全部没有中文名；
     只有 Felidae→「貓科」、Rosaceae→「薔薇科」有，且是繁体。
     → 骨架的中文名 GBIF 给不了，必须另找来源。

  ② 骨架里存在大扇出（文档断言「目级以上扇出 ≤40」是错的）
     Bacteria → 171 门、Gammaproteobacteria → 132 目、
     Alphaproteobacteria → 93 目、Chordata → 62 纲。
     扇出 > 40 的节点共 11 个。

  ③ 细菌界骨架比整个树冠还大
     根系（细菌 1605 + 古菌 185 + 病毒 96 = 1886）
     ＞ 树冠（动物 782 + 植物 307 + 真菌 340 = 1429）
     且细菌/古菌大量节点是宏基因组代号（UBA10199 / JACPQU01 / DTIG01），
     不是可读的分类名。

  ④ 病毒界 0 门却有 38 纲 —— 深度不齐在真实数据里确实存在。
"""
import json
import urllib.request
import urllib.parse
from collections import Counter

BASE = "https://api.gbif.org/v1"
BACKBONE = "d7dddbf4-2cf0-4f39-9b2a-bb099caae36c"

KINGDOMS = [
    (1, "Animalia", "动物界"), (6, "Plantae", "植物界"),
    (5, "Fungi", "真菌界"), (4, "Chromista", "色藻界"),
    (7, "Protozoa", "原生动物界"), (3, "Bacteria", "细菌界"),
    (2, "Archaea", "古菌界"), (8, "Viruses", "病毒界"),
]


def get(path, **params):
    qs = urllib.parse.urlencode(params)
    req = urllib.request.Request(
        f"{BASE}/{path}?{qs}",
        headers={"Accept": "application/json",
                 "User-Agent": "BioTrace/0.1 (personal non-profit)"},
    )
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.load(r)


def fetch_rank(kingdom_key, rank, limit=1000):
    """取某界某 rank 的全部条目（分页）。"""
    out, offset = [], 0
    while True:
        d = get("species/search", highertaxonKey=kingdom_key, rank=rank,
                status="ACCEPTED", datasetKey=BACKBONE,
                limit=limit, offset=offset)
        out.extend(d.get("results", []))
        if d.get("endOfRecords", True) or len(out) >= d.get("count", 0):
            break
        offset += limit
    return out


print("═" * 62)
print("① 父子关系与扇出（用 parentKey 还原真实树形）")
print("═" * 62)

all_nodes = {}
for key, la, zh in KINGDOMS:
    for rank in ("PHYLUM", "CLASS", "ORDER"):
        for it in fetch_rank(key, rank):
            all_nodes[it["key"]] = {
                "rank": rank, "kingdom": la,
                "parent": it.get("parentKey"),
                "name": it.get("canonicalName") or it.get("scientificName"),
            }

kids = Counter()
for nk, n in all_nodes.items():
    if n["parent"]:
        kids[n["parent"]] += 1
# 界本身的子级
for key, la, zh in KINGDOMS:
    kids[key] = sum(1 for n in all_nodes.values()
                    if n["parent"] == key)

print(f"\n骨架节点总数（门+纲+目）: {len(all_nodes)}")
top = kids.most_common(12)
print("\n扇出最大的 12 个节点:")
for k, c in top:
    n = all_nodes.get(k)
    if n:
        print(f"  {c:>5} 个子级   {n['name']:<28}({n['rank']:<6} · {n['kingdom']})")
    else:
        km = next((x for x in KINGDOMS if x[0] == k), None)
        if km:
            print(f"  {c:>5} 个子级   {km[1]:<28}(KINGDOM)")

over = [(k, c) for k, c in kids.items() if c > 40]
print(f"\n扇出 > 40 的节点数: {len(over)}   （文档断言应为 0）")

print("\n" + "═" * 62)
print("② 中文名覆盖率（抽样 vernacularNames）")
print("═" * 62)


def zh_name(usage_key):
    try:
        d = get(f"species/{usage_key}/vernacularNames", limit=100)
    except Exception:
        return None
    for v in d.get("results", []):
        lang = (v.get("language") or "").lower()
        if lang in ("zho", "zh", "cmn"):
            return v.get("vernacularName")
    return None


import random
random.seed(7)
for rank in ("PHYLUM", "CLASS", "ORDER"):
    pool = [k for k, n in all_nodes.items() if n["rank"] == rank]
    sample = random.sample(pool, min(25, len(pool)))
    hits = [(all_nodes[k]["name"], zh_name(k)) for k in sample]
    got = [h for h in hits if h[1]]
    print(f"\n{rank:<7} 抽样 {len(sample)} 个 → 有中文名 {len(got)} 个"
          f"  ({len(got) * 100 // len(sample)}%)")
    for name, zh in hits[:6]:
        print(f"    {name:<26}{zh or '—'}")

print("\n" + "═" * 62)
print("③ 深度不齐：门/纲/目 是否层层齐全")
print("═" * 62)
for key, la, zh in KINGDOMS:
    ph = sum(1 for n in all_nodes.values()
             if n["kingdom"] == la and n["rank"] == "PHYLUM")
    cl = sum(1 for n in all_nodes.values()
             if n["kingdom"] == la and n["rank"] == "CLASS")
    orphan_cl = sum(1 for n in all_nodes.values()
                    if n["kingdom"] == la and n["rank"] == "CLASS"
                    and n["parent"] not in all_nodes and n["parent"] != key)
    orphan_or = sum(1 for n in all_nodes.values()
                    if n["kingdom"] == la and n["rank"] == "ORDER"
                    and n["parent"] not in all_nodes and n["parent"] != key)
    flag = "  ← 门缺失" if ph == 0 and cl > 0 else ""
    print(f"{zh:<10} 门 {ph:>4}  纲 {cl:>4}   "
          f"父不在骨架内: 纲 {orphan_cl:>3} / 目 {orphan_or:>4}{flag}")
