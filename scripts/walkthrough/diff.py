"""逐像素比对两张走查截图。

用法：python scripts/walkthrough/diff.py .shot/before.png .shot/after.png

改造类改动的验收标准就是这个：默认皮肤下改造前后应当为 0 差异。
有差异时会在第一张图旁边写一张 *-diff.png，把差异点涂红方便定位。
"""

import sys
from pathlib import Path

from PIL import Image, ImageChops


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    a = Image.open(sys.argv[1]).convert("RGB")
    b = Image.open(sys.argv[2]).convert("RGB")
    if a.size != b.size:
        print(f"尺寸不同：{a.size} vs {b.size}，没法逐像素比")
        return 1

    d = ImageChops.difference(a, b)
    hist = d.convert("L").histogram()
    total = a.size[0] * a.size[1]
    nonzero = total - hist[0]
    worst = max(i for i, n in enumerate(hist) if n)
    print(f"不同像素 {nonzero} / {total} ({nonzero / total:.4%})，最大通道差 {worst}")
    print("差异范围", d.getbbox())

    if nonzero:
        out = Path(sys.argv[1]).with_name(Path(sys.argv[1]).stem + "-diff.png")
        mask = d.convert("L").point(lambda v: 255 if v > 8 else 0)
        over = a.copy()
        over.paste(Image.new("RGB", a.size, (255, 0, 0)), mask=mask)
        over.save(out)
        print("叠图", out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
