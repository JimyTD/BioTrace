"""校验中文名表：键必须真实存在于骨架里，并统计覆盖率。

拼错的键是死键 —— 永远不会命中，界面上会静默显示拉丁名，
不校验根本发现不了。

门级全覆盖要求只针对树冠五界（当初上手填满的口径）；
根系三界（细菌/古菌/病毒）的真数据 2026-09-08 入库，
中文名走离线管线能配多少配多少，代号门（UBA10199 类）没有
通行中译就 null 显示拉丁名 —— 不编造（设计方案 2.7）。
所以三界缺额只报告清单，不算失败。
"""
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[1]
DOC = json.loads((ROOT / "apps/web/src/data/backbone.json").read_text("utf-8"))
TS = (ROOT / "apps/web/src/data/backboneZh.ts").read_text("utf-8")

F = {name: i for i, name in enumerate(DOC["fields"])}
RANKS = DOC["ranks"]
ROOT_KINGDOMS = {"Bacteria", "Archaea", "Viruses"}
ids = {n[F["id"]] for n in DOC["nodes"]}
node_kingdom = {n[F["id"]]: n[F["kingdom"]] for n in DOC["nodes"]}
by_rank = defaultdict(set)
for n in DOC["nodes"]:
    by_rank[n[F["rank"]]].add(n[F["id"]])

pairs = re.findall(r'"(\d+:[A-Za-z]+)"\s*:\s*"([^"]+)"', TS)
print(f"中文名表条目数: {len(pairs)}")

dead = [(k, v) for k, v in pairs if k not in ids]
if dead:
    print(f"\n[!] 死键 {len(dead)} 个（骨架里没有，永远不会命中）:")
    for k, v in dead:
        rank_no = int(k.split(":")[0])
        name = k.split(":", 1)[1]
        # 找找是不是 rank 写错了
        alt = [r for r in range(4) if f"{r}:{name}" in ids]
        hint = f"  ← 实际在 rank {alt} ({[RANKS[a] for a in alt]})" if alt else "  ← 骨架里完全没有这个名字"
        print(f"    {k:<34}{v:<14}{hint}")
else:
    print("\n所有键都命中骨架 ✓")

seen = defaultdict(int)
for k, _ in pairs:
    seen[int(k.split(":")[0])] += 1

print(f"\n{'阶元':<10}{'骨架':>7}{'有中文名':>10}{'覆盖率':>9}")
print("─" * 40)
for r, name in enumerate(RANKS):
    tot = len(by_rank[r])
    got = len([k for k, _ in pairs if k in by_rank[r]])
    pct = f"{got * 100 // tot}%" if tot else "—"
    print(f"{name:<10}{tot:>7}{got:>10}{pct:>9}")

# 门级：树冠五界必须全覆盖；三界报告缺额清单（真数据 2026-09-08 入库，
# 能配多少配多少，代号门没有通行中译不编造）
have = {k for k, _ in pairs}
miss_ph = sorted(by_rank[1] - have)
miss_crown = [i for i in miss_ph if node_kingdom[i] not in ROOT_KINGDOMS]
miss_root = [i for i in miss_ph if node_kingdom[i] in ROOT_KINGDOMS]
if miss_crown:
    print(f"\n[!] 树冠五界门级缺中文名 {len(miss_crown)} 个（门要求全覆盖）:")
    for i in miss_crown:
        print(f"    {i:<32}{node_kingdom[i]}")
if miss_root:
    print(f"\n[i] 根系三界门级缺中文名 {len(miss_root)} 个（代号门无通行中译，显示拉丁名）:")
    by_k: dict[str, list[str]] = defaultdict(list)
    for i in miss_root:
        by_k[node_kingdom[i]].append(i.split(":", 1)[1])
    for k, names in sorted(by_k.items()):
        print(f"    {k}（{len(names)}）: {', '.join(names[:12])}{' …' if len(names) > 12 else ''}")
if not miss_crown and not miss_root:
    print("\n界与门 100% 覆盖 ✓")
elif not miss_crown:
    print("\n树冠五界界门 100% 覆盖 ✓")

dupv = defaultdict(list)
for k, v in pairs:
    dupv[v].append(k)
same = {v: ks for v, ks in dupv.items() if len(ks) > 1}
if same:
    print(f"\n[i] 同一中文名对应多个键（可能是笔误）:")
    for v, ks in same:
        print(f"    {v}: {ks}")
