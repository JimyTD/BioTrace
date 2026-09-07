"""校验文案分区机制：voice 覆盖表 ⊆ 可文案区，成套组要换全换。

四道闸门里的校验闸。结构闸（zhCore/zhFlavor）与类型闸（ThemedMessageKey）
已在源码层拦住大多数越界，本脚本拦剩下两种：
1. 动态拼 key、js 侧绕过 —— 与 zhFlavor 键全集比对（以 zhFlavor 为准，
   不是以某张覆盖表为准）。
2. 成套覆盖组换了半个 —— nav 四词、点亮词族，写一个就必须写全组。

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

# ── 1. 可文案区键全集（以 zhFlavor 为准）──────────────────────────
zh_text = ZH.read_text("utf-8")
m = re.search(r"const zhFlavor = \{(.*?)\n\} as const;", zh_text, re.S)
if not m:
    sys.exit("[x] zh.ts 里找不到 zhFlavor 区块——结构闸没了？")
flavor_keys = set(re.findall(r'^\s*"([a-zA-Z0-9_.]+)"\s*:', m.group(1), re.M))
if not flavor_keys:
    sys.exit("[x] zhFlavor 是空的——分区被清空了？")
print(f"可文案区 key：{len(flavor_keys)} 个")

# ── 2. 成套覆盖组（换一个就必须换全组）──────────────────────────
GROUPS = {
    "nav 四词": {"nav.trips", "nav.map", "nav.collection", "nav.me"},
    "点亮词族": {
        "collection.volumeStampEmpty", "collection.volumeDone",
        "settle.volumeCompleted", "settle.volumeCompletedMore",
        "settle.volumeSlotLit", "settle.volumeSlotLitMore",
    },
}

# ── 3. 逐张 voice 覆盖表检查 ─────────────────────────────────────
idx_text = INDEX.read_text("utf-8")
# voices 是 Record<VoiceId, Partial<...>>，覆盖表都在这个对象字面量里
vm = re.search(r"const voices[^=]*= \{(.*?)\n\};", idx_text, re.S)
if not vm:
    sys.exit("[x] index.ts 里找不到 voices 覆盖表声明")
# 每张表形如  voiceId: { "key": "值", ... },
tables = re.findall(r'(\w+)\s*:\s*\{(.*?)\}\s*,?\s*\n', vm.group(1), re.S)

fail = 0
for vid, body in tables:
    keys = set(re.findall(r'"([a-zA-Z0-9_.]+)"\s*:', body))
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
    if not out_of_zone and all(
        (keys & gset) in (set(), gset) for gset in GROUPS.values()
    ):
        print("  ✓ 全部落在可文案区，成套组完整")

# ── 4. 运行时闸自检：t() 必须引用 themedKeys ────────────────────
if "themedKeys.has(" not in idx_text:
    fail += 1
    print("\n[!] t() 里没找到 themedKeys.has()——运行时闸没了？")

print()
if fail:
    sys.exit(f"[x] 未通过：{fail} 处问题")
print("文案分区校验全部通过 ✓（覆盖表 ⊆ 可文案区；成套组完整；运行时闸在位）")
