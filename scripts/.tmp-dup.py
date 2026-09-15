import re, collections

src = open(r"packages/messages/src/zh.ts", encoding="utf-8").read()
pairs = re.findall(r'"([a-zA-Z][a-zA-Z0-9]*\.[a-zA-Z0-9]+)":\s*"((?:[^"\\]|\\.)*)"', src)

by_val = collections.defaultdict(list)
for k, v in pairs:
    by_val[v].append(k)

print("=== auth 与其他模块同值")
auth = {k: v for k, v in pairs if k.startswith("auth.")}
others = {k: v for k, v in pairs if not k.startswith("auth.")}
for k, v in auth.items():
    same = [o for o, ov in others.items() if ov == v]
    if same:
        print(f"  {k:32} 「{v}」  ==  {same}")

print()
print("=== common 区现有（可复用候选）")
for k, v in pairs:
    if k.startswith("common."):
        print(f"  {k:28} 「{v}」")

print()
print("=== auth 内部同值")
inv = collections.defaultdict(list)
for k, v in auth.items():
    inv[v].append(k)
for v, ks in inv.items():
    if len(ks) > 1:
        print(f"  「{v}」 {ks}")
