"""校验文案分区机制。

四道闸门里的校验闸。结构闸（zhCore/zhFlavor）与类型闸（ThemedMessageKey）
已在源码层拦住大多数越界，本脚本拦剩下的：
1. 动态拼 key、js 侧绕过 —— 与 zhFlavor 键全集比对（以 zhFlavor 为准，
   不是以某张覆盖表为准）。
2. 占位符丢失 —— voice 覆盖值丢了 {count} 这类占位符会静默渲染错，
   与基础表比对占位符集合。

覆盖表有两种放法，两种都要查到（漏查一种 = 这张表没人管）：
· index.ts 里 `const voices = { … }` 的内联表（default 空表就在这）；
· voices/*.ts 里一个皮肤一张的表（clear.ts / daylight.ts）。

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
VOICES_DIR = ROOT / "packages/messages/src/voices"

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


def check_table(label, body):
    """查一张覆盖表：键必须落在可文案区，占位符必须与基础表一致。"""
    global fail
    pairs = dict(
        re.findall(r'"([a-zA-Z0-9_.]+)"\s*:\s*"((?:[^"\\]|\\.)*)"', body)
    )
    keys = set(pairs)
    if not keys:
        print(f"\n{label}：空表（跳过）")
        return
    print(f"\n{label} 覆盖 {len(keys)} key：")
    out_of_zone = keys - flavor_keys
    if out_of_zone:
        fail += 1
        print("  [!] 越界（固定区 key，皮肤不可覆盖）：")
        for k in sorted(out_of_zone):
            print(f"      {k}")
    for k, v in pairs.items():
        if k not in flavor_pairs:
            continue
        want = set(re.findall(r"\{(\w+)\}", flavor_pairs[k]))
        got = set(re.findall(r"\{(\w+)\}", v))
        if want != got:
            fail += 1
            print(f"  [!] {k} 占位符不齐：缺 {sorted(want - got)} 多 {sorted(got - want)}")
    if not out_of_zone:
        print("  ✓ 全部落在可文案区，占位符保全")


# ── 2. index.ts 里的内联覆盖表 ───────────────────────────────────
idx_text = INDEX.read_text("utf-8")
vm = re.search(r"const voices[^=]*= \{(.*?)\n\};", idx_text, re.S)
if not vm:
    sys.exit("[x] index.ts 里找不到 voices 覆盖表声明")
for vid, body in re.findall(r'(\w+)\s*:\s*\{(.*?)\}\s*,?\s*\n', vm.group(1), re.S):
    check_table(f"voice「{vid}」（index.ts 内联）", body)

# ── 3. voices/*.ts 里一个皮肤一张的表 ────────────────────────────
if not VOICES_DIR.is_dir():
    fail += 1
    print("\n[x] 找不到 voices/ 目录——覆盖表本该放这里")
else:
    files = [f for f in sorted(VOICES_DIR.glob("*.ts")) if f.name != "index.ts"]
    if not files:
        print("\nvoices/ 里没有覆盖表（只有 default 空表）")
    for f in files:
        check_table(f"voice「{f.stem}」（voices/{f.name}）", f.read_text("utf-8"))

print()
if fail:
    sys.exit(f"[x] 未通过：{fail} 处问题")
print("文案分区校验全部通过 ✓（覆盖表 ⊆ 可文案区；占位符保全；运行时闸在位）")
