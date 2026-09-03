"""查 Chordata 的子级到底混了哪些 rank —— 用来确认「深度不齐」的实际影响面。"""
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
d = json.loads((Path(__file__).resolve().parents[1]
                / "apps/web/src/data/backbone.json").read_text("utf-8"))
F = {n: i for i, n in enumerate(d["fields"])}
RANKS = d["ranks"]

kids = defaultdict(list)
for n in d["nodes"]:
    if n[F["parentId"]]:
        kids[n[F["parentId"]]].append(n)

print("父节点的子级 rank 不统一的情况（前 12 个）")
print("─" * 62)
mixed = []
for pid, cs in kids.items():
    rs = Counter(RANKS[c[F["rank"]]] for c in cs)
    if len(rs) > 1:
        mixed.append((pid, len(cs), rs))
mixed.sort(key=lambda x: -x[1])
for pid, total, rs in mixed[:12]:
    detail = " + ".join(f"{v} {k}" for k, v in rs.most_common())
    print(f"  {pid:<26}{total:>4} 个子级 = {detail}")

print(f"\n子级 rank 不统一的父节点共 {len(mixed)} 个"
      f"（占有子级的节点 {len(kids)} 个中的 {len(mixed) * 100 // len(kids)}%）")

# Chordata 细看
print("\nChordata 的 62 个子级：")
cs = kids["1:Chordata"]
for r in ("class", "order"):
    names = sorted(c[F["la"]] for c in cs if RANKS[c[F["rank"]]] == r)
    print(f"  {r} ({len(names)}): {', '.join(names[:8])} …")
