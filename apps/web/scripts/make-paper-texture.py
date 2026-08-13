"""Seamless paper tiles — must read as paper at phone size, not 2% noise."""
from __future__ import annotations

import math
import random
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[3]
SHELL = ROOT / "apps" / "web" / "public" / "shell"


def _wrap_line(
    draw: ImageDraw.ImageDraw,
    s: int,
    x1: float,
    y1: float,
    x2: float,
    y2: float,
    fill: tuple[int, int, int],
    w: int,
) -> None:
    for dx in (-s, 0, s):
        for dy in (-s, 0, s):
            draw.line((x1 + dx, y1 + dy, x2 + dx, y2 + dy), fill=fill, width=w)


def make_paper(path: Path, rgb: tuple[int, int, int], *, seed: int, cool: bool) -> None:
    random.seed(seed)
    s = 512
    r0, g0, b0 = rgb
    img = Image.new("RGB", (s, s), rgb)
    px = img.load()
    assert px is not None

    # Wove grid (both axes) + low-freq foxing. Seamless via 2π periods.
    for y in range(s):
        for x in range(s):
            laid_y = 15 * math.sin(2 * math.pi * y / 12)
            laid_x = 9 * math.sin(2 * math.pi * x / 14)
            fox = 22 * math.sin(2 * math.pi * x / s + 0.4) * math.cos(2 * math.pi * y / s)
            fox += 14 * math.sin(4 * math.pi * x / s + 1.3) * math.sin(2 * math.pi * y / s + 0.7)
            n = random.randint(-16, 16)
            delta = laid_y + laid_x + fox + n
            if cool:
                dr, dg, db = delta * 0.45, delta * 0.65, delta * 0.95
            else:
                dr, dg, db = delta * 1.05, delta * 0.78, delta * 0.42
            px[x, y] = (
                max(0, min(255, int(r0 + dr))),
                max(0, min(255, int(g0 + dg))),
                max(0, min(255, int(b0 + db))),
            )

    # Darker pulp inclusions (not light scratches).
    draw = ImageDraw.Draw(img)
    for _ in range(140):
        x1 = random.random() * s
        y1 = random.random() * s
        ang = random.random() * math.pi
        length = random.uniform(28, 90)
        x2 = x1 + math.cos(ang) * length
        y2 = y1 + math.sin(ang) * length
        shade = random.randint(-48, -22)
        fill = (
            max(0, min(255, r0 + shade + (0 if cool else 8))),
            max(0, min(255, g0 + shade)),
            max(0, min(255, b0 + shade + (10 if cool else -10))),
        )
        _wrap_line(draw, s, x1, y1, x2, y2, fill, 1)

    for _ in range(420):
        x = random.randrange(s)
        y = random.randrange(s)
        speck = random.randint(-40, -14)
        px[x, y] = (
            max(0, min(255, r0 + speck)),
            max(0, min(255, g0 + speck)),
            max(0, min(255, b0 + speck)),
        )

    # Soften 1px noise so it reads as fiber, keep seam by not blurring across... 
    # a tiny blur is OK statistically; skip to keep laid lines crisp.

    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG", optimize=True)


def main() -> None:
    make_paper(SHELL / "daylight" / "page-texture.png", (236, 228, 214), seed=11, cool=False)
    make_paper(SHELL / "tide" / "page-texture.png", (220, 230, 232), seed=23, cool=True)
    from PIL import Image as _I
    import statistics

    for p in (SHELL / "daylight" / "page-texture.png", SHELL / "tide" / "page-texture.png"):
        xs = list(_I.open(p).convert("L").getdata())
        print(f"{p.name} min={min(xs)} max={max(xs)} mean={statistics.mean(xs):.1f} stdev={statistics.pstdev(xs):.1f} {p.stat().st_size // 1024}KB")


if __name__ == "__main__":
    main()
