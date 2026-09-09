"""扫描文案主表的死 key（定义但无人引用）与幽灵引用（引用但不存在的 key）。

死 key 判定要过三道豁免，否则误报一片：
1. 动态拼 key —— formatScaleItemKey / formatScaleBatch / formatScaleListLevel
   这类 `prefix.${x}` 拼接，静态扫不到，整段前缀视为已引用。
2. 合法例外 —— 模型 Prompt、日志、注释、纯技术原文（messages-glossary.mdc）。
3. 配置文件声明型引用 —— volumes/*.json 的槽条件文案 key 由数据驱动，
   不在 ts/tsx 里出现也算被用。

用法：python scripts/check-dead-keys.py
"""
import re
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[1]
ZH = ROOT / "packages/messages/src/zh.ts"

# 扫描范围：业务代码 + 配置 + 文档（文档引用也算"被用到"，至少不是死 key）
SCAN_DIRS = ["apps/web/src", "apps/api/src", "apps/api/data", "packages/messages", "scripts"]
SCAN_EXT = {".ts", ".tsx", ".js", ".jsx", ".json", ".html", ".md", ".mdc"}

# ── 1. 解析主表全部 key（zhCore + zhFlavor 已合并导出，直接扫 zh 对象）──
zh_text = ZH.read_text("utf-8")
# zh.ts 末尾合并导出：export const zh = { ...zhCore, ...zhFlavor } as const;
# 但 key 全集应以两个区块为准（合并区无新 key）
core_m = re.search(r"const zhCore = \{(.*?)\n\} as const;", zh_text, re.S)
flavor_m = re.search(r"const zhFlavor = \{(.*?)\n\} as const;", zh_text, re.S)
if not core_m or not flavor_m:
    sys.exit("[x] zh.ts 里找不到 zhCore / zhFlavor 区块")

core_keys = set(re.findall(r'^\s*"([a-zA-Z0-9_.]+)"\s*:', core_m.group(1), re.M))
flavor_keys = set(re.findall(r'^\s*"([a-zA-Z0-9_.]+)"\s*:', flavor_m.group(1), re.M))
all_keys = core_keys | flavor_keys
print(f"主表 key 总数：{len(all_keys)}（固定区 {len(core_keys)} / 可文案区 {len(flavor_keys)}）")

# ── 2. 收齐所有源文件里的字符串字面量，作为"引用池" ──────────────
refs: set[str] = set()
ref_files: dict[str, set[str]] = {}

for d in SCAN_DIRS:
    base = ROOT / d
    if not base.exists():
        continue
    for p in base.rglob("*"):
        if not p.is_file() or p.suffix not in SCAN_EXT:
            continue
        # 主表自身不算引用源（定义 ≠ 引用），但 index.ts 的动态拼前缀要单独处理
        if p.resolve() == ZH.resolve():
            continue
        try:
            text = p.read_text("utf-8", errors="ignore")
        except Exception:
            continue
        # 所有双引号/单引号/反引号里的点号 key 形态
        for lit in re.findall(r'["\'`]([a-zA-Z0-9_]*\.[a-zA-Z0-9_.]+)["\'`]', text):
            refs.add(lit)
            ref_files.setdefault(lit, set()).add(str(p.relative_to(ROOT)))

# index.ts 的动态拼 key 前缀：这些前缀下的任何 key 都算被引用
DYNAMIC_PREFIXES = [
    "admin.rarityCache.item.",
    "admin.rarityCache.batch.",
    "admin.rarityCache.adj.",
    "listTag.",
    "rarity.",
    "theme.",
    "rank.",
    "identify.provider.",
    "admin.secrets.slot.",
    "admin.secrets.group.",
]

# ── 3. 判死 key ────────────────────────────────────────────────
dead: list[str] = []
for k in sorted(all_keys):
    if k in refs:
        continue
    # 动态前缀命中
    if any(k.startswith(pre) for pre in DYNAMIC_PREFIXES):
        continue
    dead.append(k)

# ── 4. 判幽灵引用（引用了主表没有的 key，且不是动态拼出来的）────
ghost: list[str] = []
for lit in sorted(refs):
    if lit in all_keys:
        continue
    if any(lit.startswith(pre) for pre in DYNAMIC_PREFIXES):
        continue
    # 只关心"看起来像我们文案 key"的形态：首字母段是已知分区名
    seg0 = lit.split(".")[0]
    known_prefix = {
        "app", "nav", "auth", "download", "onboard", "trips", "share", "album",
        "status", "settle", "rarity", "listTag", "identify", "collection",
        "tree3d", "volume", "map", "me", "detail", "rank", "common", "error",
        "admin", "theme",
    }
    if seg0 in known_prefix:
        ghost.append(lit)

print(f"\n引用池字面量：{len(refs)} 个")

print(f"\n=== 死 key（定义但无人引用）：{len(dead)} 个 ===")
for k in dead:
    zone = "flavor" if k in flavor_keys else "core"
    print(f"  [{zone}] {k}")

print(f"\n=== 幽灵引用（引用了主表没有的 key）：{len(ghost)} 个 ===")
for k in ghost:
    where = sorted(ref_files.get(k, []))[:3]
    print(f"  {k}   ← {', '.join(where)}")

print(f"\n合计：死 key {len(dead)}，幽灵引用 {len(ghost)}")
