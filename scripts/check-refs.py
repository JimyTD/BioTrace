"""扫描全仓「指向不存在的文件」的引用。

为什么要有：文件被删 / 路径写错之后，引用没跟着改——这种隐患肉眼扫不出来，
读到的人照着找会扑空，属于典型的「早晚出问题」。判据落进代码，不靠记性
（同 check-dead-keys.py 的思路）。

两种写法都查：
· 仓库根起算，如 docs/features/物种树.md
· 相对当前文件，如 ../features/物种树.md、../../docs/SPEC.md

三道豁免，否则误报一片（每一条都要写清理由，别把真问题塞进来）：
1. 命令要在子包目录里敲，那里的 scripts/ 是相对那个包算的。
2. 文档里的占位符示例（xxx.md 这种）。
3. 未落地的设计目标路径（表还没建，不是失效）。

用法：仓库根 `pnpm check:copy` 会连跑；或单独 python scripts/check-refs.py
"""
import re
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[1]

# 扫描范围：全仓，只排掉不该看的
SKIP_PARTS = {".git", "node_modules", ".shot", "dist", "build", ".venv", "_cache"}
SKIP_PREFIXES = ("apps/api/scripts/out/",)
SCAN_EXT = {".md", ".mdc", ".html", ".ts", ".tsx", ".py", ".css", ".json", ".sh", ".yml", ".yaml"}

# 扩展名必须「长优先」，否则 js 会抢先匹配 .json、ts 抢先匹配 .tsx、md 抢先匹配 .mdc。
# 结尾的 (?![.\w]) 保证是完整 token：否则 deploy/x.json.example 会被截成 deploy/x.json。
EXTS = "jpeg|json|tsx|html|yaml|toml|mjs|svg|jpg|png|yml|css|mdc|md|ts|js|py|sh"
PREFIX = r"(?:docs|apps|packages|scripts|prototypes|model-bakeoff|deploy|\.cursor|\.codebuddy)"
BOUND = r"(?![.\w])"

ABS_RE = re.compile(rf"(?<![\w./-])((?:{PREFIX})/[\w./\-]*\.(?:{EXTS})){BOUND}")
REL_RE = re.compile(rf"\]\((\.{{1,2}}/[\w./\-]*\.(?:{EXTS}))\)")
TEXT_RE = re.compile(rf"`((?:{PREFIX})/[\w./\-]*\.(?:{EXTS}))`{BOUND}")

# ── 豁免清单 ────────────────────────────────────────────────────
# 键是（引用所在文件, 被引用的写法）。改动这里必须写清理由。
ALLOW: list[tuple[str, str]] = [
    # 1. 命令在 apps/api 目录里敲，scripts/ 是相对那个包算的。
    #    补成 apps/api/scripts/... 反而会让命令跑不起来。
    ("docs/SPEC.md", "scripts/rarity-calibrate.ts"),
    ("docs/SPEC.md", "scripts/smoke-rarity-scale.ts"),
    # 2. 元文档里的占位符示例，本来就不是真路径。
    ("docs/wip/README.md", "docs/features/xxx.md"),
    # 3. 未落地的设计目标路径：表还没建，不是「失效」。
    ("docs/wip/宠物图鉴-玩法脑暴.md", "apps/api/data/domesticated/pairs.json"),
    ("docs/wip/宠物图鉴-玩法脑暴.md", "apps/api/data/domesticated/list.json"),
    ("docs/wip/待办.md", "apps/api/data/domesticated/pairs.json"),
]
ALLOW_SET = set(ALLOW)

SELF = Path(__file__).resolve()


def walk() -> list[Path]:
    out = []
    for p in ROOT.rglob("*"):
        if not p.is_file() or p.suffix.lower() not in SCAN_EXT:
            continue
        if any(part in SKIP_PARTS for part in p.parts):
            continue
        rel = p.relative_to(ROOT).as_posix()
        if rel.startswith(SKIP_PREFIXES):
            continue
        # 本文件自己带着豁免清单和路径示例，扫自己没有意义
        if p.resolve() == SELF:
            continue
        out.append(p)
    return out


def bases(path: Path) -> list[Path]:
    """该文件里的相对路径可能以哪些目录为基准。"""
    out = [path.parent]
    for parent in path.parents:
        if (parent / "package.json").exists():
            out.append(parent)
        if parent == ROOT:
            break
    out.append(ROOT)
    seen, uniq = set(), []
    for b in out:
        if b not in seen:
            seen.add(b)
            uniq.append(b)
    return uniq


def main() -> int:
    checked = 0
    dead: list[tuple[str, int, str]] = []
    for path in walk():
        try:
            text = path.read_text("utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        rel_file = path.relative_to(ROOT).as_posix()
        for lineno, line in enumerate(text.splitlines(), 1):
            found = set()
            for rx in (ABS_RE, REL_RE, TEXT_RE):
                for m in rx.finditer(line):
                    found.add(m.group(1))
            for ref in found:
                checked += 1
                if (rel_file, ref) in ALLOW_SET:
                    continue
                candidates = [] if ref.startswith(".") else [ROOT / ref]
                candidates += [b / ref for b in bases(path)]
                if not any(c.exists() for c in candidates):
                    dead.append((rel_file, lineno, ref))

    print(f"检查引用 {checked} 处")
    print(f"\n=== 指向不存在的文件：{len(dead)} 处 ===")
    for rel_file, lineno, ref in dead:
        print(f"  {rel_file}:{lineno}  ->  {ref}")

    if dead:
        print("\n改法：把引用改成真实存在的路径，或把「不改变意思」的写法改掉。")
        print("确实是「有意为之」的，加进本脚本的 ALLOW 并写清理由。")

    print(f"\n合计：失效引用 {len(dead)} 处")
    return 1 if dead else 0


if __name__ == "__main__":
    raise SystemExit(main())
