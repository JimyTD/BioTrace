"""把风格示意和实现拼成一张并排图，用来做「实现有没有落地」的验收。

用法：
    python scripts/walkthrough/side.py 左图.png 右图.png 输出.png [--crop-left x,y,w,h]

为什么要有这个：示意页（apps/web/public/themes/*.html）是整页多栏的，
实现是单页截图，两者尺寸对不上，分开看只能确认「皮肤生效了」，
确认不了「示意里那个东西到底有没有做出来」。2026-08-25 灯箱那次就是栽在这儿——
示意里打在卡纸下沿的说明字，实现成了框外正文，分开看两张图都「像那么回事」。

两图按同高缩放后左右拼，中间留一道分隔。--crop-left 用来从多栏示意页里
先切出要比的那一栏（x,y,w,h 为像素）。
"""

import sys
from pathlib import Path

from PIL import Image

GAP = 24
BG = (32, 34, 38)
LINE = (90, 96, 104)


def parse_crop(value: str) -> tuple[int, int, int, int]:
    x, y, w, h = (int(v) for v in value.split(","))
    return x, y, x + w, y + h


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 3:
        print(__doc__)
        raise SystemExit(2)
    left_path, right_path, out_path = (Path(a) for a in args)

    crop = None
    for a in sys.argv[1:]:
        if a.startswith("--crop-left="):
            crop = parse_crop(a.split("=", 1)[1])

    left = Image.open(left_path).convert("RGB")
    if crop:
        left = left.crop(crop)
    right = Image.open(right_path).convert("RGB")

    height = max(left.height, right.height)
    for img_name in ("left", "right"):
        img = left if img_name == "left" else right
        if img.height != height:
            scaled = img.resize(
                (round(img.width * height / img.height), height), Image.LANCZOS
            )
            if img_name == "left":
                left = scaled
            else:
                right = scaled

    out = Image.new("RGB", (left.width + GAP + right.width, height), BG)
    out.paste(left, (0, 0))
    out.paste(right, (left.width + GAP, 0))
    for x in range(left.width + GAP // 2 - 1, left.width + GAP // 2 + 1):
        for y in range(height):
            out.putpixel((x, y), LINE)
    out.save(out_path)
    print(f"OK  {out_path}  {left.width}+{right.width} x {height}")


if __name__ == "__main__":
    main()
