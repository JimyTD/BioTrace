"""校验文案分区机制。

四道闸门里的校验闸。结构闸（zhCore/zhFlavor）与类型闸（ThemedMessageKey）
已在源码层拦住大多数越界，本脚本拦剩下的：
1. 动态拼 key、js 侧绕过 —— 与 zhFlavor 键全集比对（以 zhFlavor 为准，
   不是以某张覆盖表为准）。
2. 占位符丢失 —— voice 覆盖值丢了 {count} 这类占位符会静默渲染错，
   与基础表比对占位符集合。

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

# 基底文案键值对（占位符比对用）
flavor_pairs = dict(
    re.findall(r'^\s*"([a-zA-Z0-9_.]+)"\s*:\s*"((?:[^"\\]|\\.)*)"', flavor_body, re.M)
)

# ── 2. 逐张 voice 覆盖表检查 ─────────────────────────────────────
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
    if not out_of_zone:
        ok_ph = all(
            set(re.findall(r"\{(\w+)\}", pairs.get(k, "")))
            == set(re.findall(r"\{(\w+)\}", flavor_pairs[k]))
            for k in keys if k in flavor_pairs
        )
        print("  ✓ 全部落在可文案区，占位符保全" if ok_ph else "  [!] 见上")

print()
if fail:
    sys.exit(f"[x] 未通过：{fail} 处问题")
print("文案分区校验全部通过 ✓（覆盖表 ⊆ 可文案区；占位符保全；运行时闸在位）")
