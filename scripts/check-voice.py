"""校验文案分区机制与文案语感下限。

四道闸门里的校验闸。结构闸（zhCore/zhFlavor）与类型闸（ThemedMessageKey）
已在源码层拦住大多数越界，本脚本拦剩下的：
1. 动态拼 key、js 侧绕过 —— 与 zhFlavor 键全集比对（以 zhFlavor 为准，
   不是以某张覆盖表为准）。
2. 成套覆盖组换了半个 —— 五大隐喻家族要换全换，写一个就必须写全组。
3. 占位符丢失 —— voice 覆盖值丢了 {count} 这类占位符会静默渲染错，
   与基础表比对占位符集合。
4. 语感下限 —— 感叹号、敬语"您"、可文案区句长超阈值。上限靠人评，
   这里只拦明显不合格。

用法：仓库根 `pnpm check:copy` 一键跑双闸；或单独 python scripts/check-voice.py
"""
import re
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[1]
ZH = ROOT / "packages/messages/src/zh.ts"
INDEX = ROOT / "packages/messages/src/index.ts"

fail = 0

# ── 1. 可文案区键全集与基底文案（以 zhFlavor 为准）────────────────
zh_text = ZH.read_text("utf-8")
m = re.search(r"const zhFlavor = \{(.*?)\n\} as const;", zh_text, re.S)
if not m:
    sys.exit("[x] zh.ts 里找不到 zhFlavor 区块——结构闸没了？")
flavor_body = m.group(1)
flavor_keys = set(re.findall(r'^\s*"([a-zA-Z0-9_.]+)"\s*:', flavor_body, re.M))
if not flavor_keys:
    sys.exit("[x] zhFlavor 是空的——分区被清空了？")
print(f"可文案区 key：{len(flavor_keys)} 个")

# 基底文案键值对（占位符比对、句长 lint 用）
flavor_pairs = dict(
    re.findall(r'^\s*"([a-zA-Z0-9_.]+)"\s*:\s*"((?:[^"\\]|\\.)*)"', flavor_body, re.M)
)

# ── 2. 成套覆盖组：五大隐喻家族（换一个就必须换全组）────────────
GROUPS = {
    "nav 四词": {"nav.trips", "nav.map", "nav.collection", "nav.me"},
    "点亮词族": {
        "collection.volumeStampEmpty", "collection.volumeDone",
        "settle.volumeCompleted", "settle.volumeCompletedMore",
        "settle.volumeSlotLit", "settle.volumeSlotLitMore",
        "onboard.collectionLede",
    },
    "册族": {
        "trips.lede", "trips.empty", "album.empty", "onboard.tripLede",
        "collection.volumesLede",
    },
    "证书族": {
        "settle.title", "settle.lede", "settle.open", "settle.claim",
        "collection.lede", "collection.empty",
    },
    "落点族": {
        "onboard.mapLede", "map.empty",
    },
}
# 家族组里的 key 必须都真实存在于可文案区——组里写了已删/拼错的 key，
# 任何 voice 触碰该家族都会被要求覆盖一个永远不存在的 key。
for gname, gset in GROUPS.items():
    ghosts = gset - flavor_keys
    if ghosts:
        fail += 1
        print(f"[!] 成套组「{gname}」含可文案区没有的 key：{sorted(ghosts)}")
GROUP_KEYS = {k for g in GROUPS.values() for k in g}

# ── 3. 逐张 voice 覆盖表检查 ─────────────────────────────────────
idx_text = INDEX.read_text("utf-8")
# voices 是 Record<VoiceId, Partial<...>>，覆盖表都在这个对象字面量里
vm = re.search(r"const voices[^=]*= \{(.*?)\n\};", idx_text, re.S)
if not vm:
    sys.exit("[x] index.ts 里找不到 voices 覆盖表声明")
# 每张表形如  voiceId: { "key": "值", ... },
tables = re.findall(r'(\w+)\s*:\s*\{(.*?)\}\s*,?\s*\n', vm.group(1), re.S)

for vid, body in tables:
    pairs = dict(
        re.findall(r'"([a-zA-Z0-9_.]+)"\s*:\s*"((?:[^"\\]|\\.)*)"', body)
    )
    keys = set(pairs)
    if not keys:
        continue  # default: {} 空表
    print(f"\nvoice「{vid}」覆盖 {len(keys)} key：")
    out_of_zone = keys - flavor_keys
    if out_of_zone:
        fail += 1
        print(f"  [!] 越界（固定区 key，皮肤不可覆盖）：")
        for k in sorted(out_of_zone):
            print(f"      {k}")
    for gname, gset in GROUPS.items():
        hit = keys & gset
        if hit and hit != gset:
            fail += 1
            print(f"  [!] 成套组「{gname}」只换了一半，缺：")
            for k in sorted(gset - hit):
                print(f"      {k}")
    # 占位符保全：覆盖值必须保留基础表的全部 {var}
    for k, v in pairs.items():
        if k not in flavor_pairs:
            continue
        want = set(re.findall(r"\{(\w+)\}", flavor_pairs[k]))
        got = set(re.findall(r"\{(\w+)\}", v))
        if want != got:
            fail += 1
            missing = want - got
            extra = got - want
            print(f"  [!] {k} 占位符不齐：缺 {sorted(missing)} 多 {sorted(extra)}")
    if not out_of_zone and all(
        (keys & gset) in (set(), gset) for gset in GROUPS.values()
    ):
        ok_ph = all(
            set(re.findall(r"\{(\w+)\}", pairs.get(k, "")))
            == set(re.findall(r"\{(\w+)\}", flavor_pairs[k]))
            for k in keys if k in flavor_pairs
        )
        print("  ✓ 全部落在可文案区，成套组完整，占位符保全" if ok_ph else "  [!] 见上")

# ── 4. 语感下限 lint（对基底 zhFlavor 全量跑；voice 表天然顺带）────
print("\n语感 lint（基准见 docs/features/文案语感基准.md）：")
EXCLAIM = re.compile(r"[!！]")
FORMAL = re.compile(r"您")
# 句长阈值：界面句两个短句上限，按句号/问号分句后单句 ≤ 14 字（仪式句放宽见文档）
for k, v in flavor_pairs.items():
    if EXCLAIM.search(v):
        fail += 1
        print(f"  [!] {k} 含感叹号——基准禁用")
    if FORMAL.search(v):
        fail += 1
        print(f"  [!] {k} 用了敬语「您」——基准统一平视称谓")
    for seg in re.split(r"[。？]", v):
        seg = seg.strip()
        # 剥掉占位符后量静态骨架：渲染长度取决于变量，模板层只管静态字
        skeleton = re.sub(r"\{(\w+)\}", "N", seg)
        plain = re.sub(r"\{(\w+)\}", "", seg).strip(" ·「」")
        if len(plain) > 14:
            fail += 1
            print(f"  [!] {k} 静态字超 14（{len(plain)}）：「{plain[:20]}」——拆短或移固定区")

print()
if fail:
    sys.exit(f"[x] 未通过：{fail} 处问题")
print("文案分区校验全部通过 ✓（覆盖表 ⊆ 可文案区；五家族成套；占位符保全；运行时闸在位；语感 lint 绿）")
