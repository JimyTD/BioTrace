"""把生成好的灯箱皮肤素材压进 apps/web/public/<域>/lightbox/。

约定见 docs/features/套册美术分层.md：
- 线稿 / 剪影类走 PNG 量化，连续调走 JPEG
- 开包封缄壳的窗口必须对齐 styles.css 里 .settle-stage.is-sealed .settle-photo-mat
  的 top 23.9% / right 36.1% / bottom 24.6% / left 16.3%，否则照片会错位
"""

from __future__ import annotations

import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

SRC = Path.home() / ".cursor" / "projects" / "d-Fun-BioTrace" / "assets"
PUB = Path(__file__).resolve().parents[1] / "apps" / "web" / "public"

VOLUMES = PUB / "volumes" / "lightbox"
TRIPS = PUB / "trips" / "lightbox"
SETTLE = PUB / "settle" / "lightbox"
SHELL = PUB / "shell" / "lightbox"


def fit(im: Image.Image, w: int, h: int) -> Image.Image:
    """先按目标比例中心裁切再缩放，避免生成图比例不一致时被拉变形。"""
    target = w / h
    sw, sh = im.size
    if sw / sh > target:
        nw = round(sh * target)
        box = ((sw - nw) // 2, 0, (sw - nw) // 2 + nw, sh)
    else:
        nh = round(sw / target)
        box = (0, (sh - nh) // 2, sw, (sh - nh) // 2 + nh)
    return im.crop(box).resize((w, h), Image.LANCZOS)


def save_jpeg(
    src: Path,
    dst: Path,
    size: tuple[int, int],
    quality: int = 82,
    inset: float = 0.0,
) -> None:
    im = Image.open(src).convert("RGB")
    if inset:
        w, h = im.size
        im = im.crop((round(w * inset), round(h * inset), round(w * (1 - inset)), round(h * (1 - inset))))
    im = fit(im, *size)
    dst.parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, "JPEG", quality=quality, optimize=True, progressive=True)
    print(f"{dst.relative_to(PUB)}  {dst.stat().st_size // 1024}KB")


def save_png(src: Path, dst: Path, size: tuple[int, int], colors: int, dither: bool = True) -> None:
    im = fit(Image.open(src).convert("RGB"), *size)
    im = im.quantize(
        colors=colors,
        method=Image.MEDIANCUT,
        dither=Image.FLOYDSTEINBERG if dither else Image.NONE,
    )
    dst.parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, "PNG", optimize=True)
    print(f"{dst.relative_to(PUB)}  {dst.stat().st_size // 1024}KB")


def make_page_texture() -> None:
    """灯箱面的磨砂扩散层。极淡、无大结构，所以平铺不会露接缝。"""
    w = h = 600
    rnd = random.Random(7)
    noise = Image.new("L", (w, h))
    noise.putdata([rnd.randint(238, 255) for _ in range(w * h)])
    noise = noise.filter(ImageFilter.GaussianBlur(0.6))
    tile = Image.merge(
        "RGB",
        (
            noise.point(lambda v: min(255, v)),
            noise.point(lambda v: min(255, v + 1)),
            noise.point(lambda v: min(255, v + 3)),
        ),
    )
    dst = SHELL / "page-texture.jpg"
    dst.parent.mkdir(parents=True, exist_ok=True)
    tile.save(dst, "JPEG", quality=88, optimize=True)
    print(f"{dst.relative_to(PUB)}  {dst.stat().st_size // 1024}KB")


def make_pack_bg() -> None:
    """开包底：亮着的灯箱面，中心亮四角落。"""
    w, h = 1200, 900
    base = Image.new("RGB", (w, h), (222, 232, 238))
    glow = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(glow)
    cx, cy = w / 2, h * 0.42
    for i in range(64):
        k = 1 - i / 64
        rx, ry = w * 0.78 * k, h * 0.82 * k
        d.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=int(255 * (1 - k) ** 0.6))
    glow = glow.filter(ImageFilter.GaussianBlur(40))
    lit = Image.composite(Image.new("RGB", (w, h), (255, 255, 255)), base, glow)
    dst = SETTLE / "pack-bg.png"
    dst.parent.mkdir(parents=True, exist_ok=True)
    lit.quantize(colors=64, dither=Image.FLOYDSTEINBERG).save(dst, "PNG", optimize=True)
    print(f"{dst.relative_to(PUB)}  {dst.stat().st_size // 1024}KB")


def make_pack_sealed() -> None:
    """未上灯：灯管没开，只有一块暗着的片框压在面板上。窗口留透明。"""
    w, h = 1200, 900
    win = (
        round(w * 0.163),
        round(h * 0.239),
        round(w * (1 - 0.361)),
        round(h * (1 - 0.246)),
    )
    shell = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(shell)
    # 熄灯的面板
    d.rectangle((0, 0, w, h), fill=(38, 46, 53, 255))
    for y in range(h):
        k = y / h
        d.line((0, y, w, y), fill=(38 + int(10 * k), 46 + int(10 * k), 53 + int(11 * k), 255))
    # 压在上面的片框：比窗口四边各外扩一圈
    pad = round(w * 0.052)
    mount = (win[0] - pad, win[1] - pad, win[2] + pad, win[3] + pad)
    d.rectangle(mount, fill=(96, 104, 111, 255))
    d.rectangle(mount, outline=(126, 135, 142, 255), width=3)
    d.rectangle(
        (mount[0] + 10, mount[1] + 10, mount[2] - 10, mount[3] - 10),
        outline=(70, 78, 85, 255),
        width=2,
    )
    # 片框上的打字条
    d.rectangle(
        (mount[0] + 26, mount[3] - pad + 14, mount[0] + 26 + round(pad * 2.4), mount[3] - pad + 20),
        fill=(58, 65, 71, 255),
    )
    # 挖窗
    d.rectangle(win, fill=(0, 0, 0, 0))
    dst = SETTLE / "pack-sealed.png"
    dst.parent.mkdir(parents=True, exist_ok=True)
    shell.save(dst, "PNG", optimize=True)
    print(f"{dst.relative_to(PUB)}  {dst.stat().st_size // 1024}KB")


def main() -> None:
    for vid in ("woodland_edge", "intertidal", "urban_wild"):
        save_png(SRC / f"lb-cover-{vid}.png", VOLUMES / f"cover-{vid}.png", (720, 540), 128)
        save_jpeg(
            SRC / f"lb-cover-{vid}-colored.png",
            VOLUMES / f"cover-{vid}-colored.jpg",
            (900, 675),
        )

    for slot in (
        "forest_bird",
        "lepidoptera",
        "odonata",
        "squirrel",
        "cicada",
        "small_carnivoran",
    ):
        # 剪影是平涂的，抖动只会把干净的大色块打成噪点、还撑大体积
        save_png(
            SRC / f"lb-plate-{slot}.png",
            VOLUMES / f"plate-woodland_edge-{slot}.png",
            (480, 480),
            12,
            dither=False,
        )

    save_jpeg(SRC / "lb-ceremony-slot.png", VOLUMES / "ceremony-slot.jpg", (1000, 750))
    save_jpeg(SRC / "lb-ceremony-complete.png", VOLUMES / "ceremony-complete.jpg", (1000, 750))
    # 生成图带着灯箱的黑色外框，铺成空态底会在圆角边上留一条硬黑边，裁掉
    save_jpeg(
        SRC / "lb-frontispiece.png",
        TRIPS / "frontispiece.jpg",
        (1000, 750),
        quality=84,
        inset=0.045,
    )

    make_page_texture()
    make_pack_bg()
    make_pack_sealed()


if __name__ == "__main__":
    main()
