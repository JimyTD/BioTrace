"""HSV chromakey (#00FF00 greenscreen) → RGBA PNG.

Aligned with nobg / Nano Banana sticker pipelines: generate on solid chromakey
green, strip by hue+saturation+value. Prefer this over rembg for hard-edged overlays.
"""
from __future__ import annotations

import colorsys
import sys
from pathlib import Path

from PIL import Image, ImageFilter


def _is_key_green(r: int, g: int, b: int) -> bool:
    h, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
    hue_deg = h * 360.0
    in_hue = 85.0 <= hue_deg <= 155.0
    return in_hue and s >= 0.32 and v >= 0.25 and g >= r + 18 and g >= b + 18


def _despill(r: int, g: int, b: int) -> tuple[int, int, int]:
    max_rb = max(r, b)
    if g > max_rb + 8:
        g = max_rb + (g - max_rb) // 3
    return r, g, b


def chroma_key_green(src: Path, dst: Path) -> None:
    img = Image.open(src).convert("RGBA")
    w, h = img.size
    px = img.load()
    assert px is not None

    alpha = Image.new("L", (w, h), 255)
    ap = alpha.load()
    assert ap is not None

    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            if _is_key_green(r, g, b):
                ap[x, y] = 0
                px[x, y] = (0, 0, 0, 0)
            else:
                r2, g2, b2 = _despill(r, g, b)
                px[x, y] = (r2, g2, b2, 255)

    alpha = alpha.filter(ImageFilter.GaussianBlur(radius=0.6))
    ap = alpha.load()
    assert ap is not None
    out = Image.new("RGBA", (w, h))
    op = out.load()
    assert op is not None
    for y in range(h):
        for x in range(w):
            a = ap[x, y]
            if a < 28:
                op[x, y] = (0, 0, 0, 0)
                continue
            if a > 230:
                a = 255
            r, g, b, _ = px[x, y]
            op[x, y] = (r, g, b, a)

    out.save(dst, "PNG")
    hist = out.getchannel("A").histogram()
    zero = hist[0]
    total = w * h
    print(f"{dst.name}: transparent={zero}/{total} ({100 * zero / total:.1f}%)")


if __name__ == "__main__":
    src = Path(sys.argv[1])
    dst = Path(sys.argv[2]) if len(sys.argv) > 2 else src
    chroma_key_green(src, dst)
