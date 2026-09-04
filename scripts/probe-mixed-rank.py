"""统计骨架里混阶元 / 跳级有多普遍。这是分类树常态，不是某个类群的特例。"""
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
d = json.loads((Path(__file__).resolve().parents[1]
                / "apps/web/src/data/backbone.json").read_text("utf-8"))
F = {n: i for i, n in enumerate(d["fields"])}
RANKS = d["ranks"]
by_id = {n[F["id"]]: n for n in d["nodes"]}

kids = defaultdict(list)
for n in d["nodes"]:
    pid = n[F["parentId"]]
    if pid:
        kids[pid].append(n)

skip = []
plus1 = 0
for n in d["nodes"]:
    pid = n[F["parentId"]]
    if not pid:
        continue
    pr, cr = by_id[pid][F["rank"]], n[F["rank"]]
    gap = cr - pr
    if gap == 1:
        plus1 += 1
    elif gap > 1:
        skip.append((pr, cr, n[F["kingdom"]]))

print(f"节点 {len(d['nodes'])}；有父级的边 {plus1 + len(skip)}")
print(f"父子阶元相连 {plus1}；跳过至少一阶 {len(skip)}"
      f"（占节点 {len(skip) * 100 / len(d['nodes']):.1f}%）")
print("跳级类型：",
      ", ".join(f"{RANKS[p]}→{RANKS[c]}×{v}"
                for (p, c), v in Counter((a, b) for a, b, _ in skip).most_common()))
print("跳级所在界：",
      ", ".join(f"{k} {v}" for k, v in Counter(x[2] for x in skip).most_common()))

mixed = []
for pid, cs in kids.items():
    rs = Counter(RANKS[c[F["rank"]]] for c in cs)
    if len(rs) > 1:
        mixed.append((pid, by_id[pid][F["kingdom"]], len(cs), rs))
mixed.sort(key=lambda x: -x[2])

print(f"\n子级阶元不统一的父节点 {len(mixed)} 个"
      f"（占有子级的 {len(kids)} 个中的 {len(mixed) * 100 // len(kids)}%）")
print("混阶元所在界：",
      ", ".join(f"{k} {v}" for k, v in Counter(x[1] for x in mixed).most_common()))
print("─" * 62)
for pid, _kingdom, total, rs in mixed[:12]:
    detail = " + ".join(f"{v} {k}" for k, v in rs.most_common())
    print(f"  {pid:<26}{total:>4} 个子级 = {detail}")
