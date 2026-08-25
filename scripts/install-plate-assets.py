"""把生成的图版原图压到上线尺寸，装进 daylight 资源域。

原图在 .cursor 的 assets 目录里，2-4 MB 一张，直接上线太重。
线刻是少色图，量化成 PNG 更省；上了色的封面/卷首图/仪式底是连续调，走 JPEG。

用法：python scripts/install-plate-assets.py
"""

from __future__ import annotations

import pathlib
import sys

from PIL import Image

SRC = pathlib.Path.home() / ".cursor" / "projects" / "d-Fun-BioTrace" / "assets"
WEB = pathlib.Path(__file__).resolve().parent.parent / "apps" / "web" / "public"
VOLUMES = WEB / "volumes" / "daylight"
TRIPS = WEB / "trips" / "daylight"

VOLUME_ID = "woodland_edge"

# 线刻图版：槽位 id -> 原图名。渲染尺寸约 110 px，512 够三倍屏。
PLATES = {
    "forest_bird": "plate-forest_bird.png",
    "lepidoptera": "plate-lepidoptera.png",
    "odonata": "plate-odonata.png",
    "squirrel": "plate-squirrel.png",
    "cicada": "plate-cicada.png",
    "small_carnivoran": "plate-small_carnivoran.png",
}

# 连续调：原图名 -> (目标路径, 宽)
TONED = {
    "cover-woodland_edge-colored.png": (VOLUMES / f"cover-{VOLUME_ID}-colored.jpg", 1024),
    "ceremony-slot-coloring.png": (VOLUMES / "ceremony-slot.jpg", 1024),
    "ceremony-complete-volume.png": (VOLUMES / "ceremony-complete.jpg", 1024),
    "trips-frontispiece.png": (TRIPS / "frontispiece.jpg", 1024),
}

PLATE_EDGE = 512
JPEG_QUALITY = 86


def kb(path: pathlib.Path) -> int:
    return round(path.stat().st_size / 1024)


def fit(img: Image.Image, width: int) -> Image.Image:
    if img.width <= width:
        return img
    height = round(img.height * width / img.width)
    return img.resize((width, height), Image.LANCZOS)


def install_plate(slot_id: str, filename: str) -> None:
    src = SRC / filename
    dst = VOLUMES / f"plate-{VOLUME_ID}-{slot_id}.png"
    img = Image.open(src).convert("RGB")
    img = fit(img, PLATE_EDGE)
    # 线刻只有纸色和墨色的过渡，128 色足够，肉眼看不出断层
    img = img.quantize(colors=128, method=Image.MEDIANCUT, dither=Image.FLOYDSTEINBERG)
    img.save(dst, format="PNG", optimize=True)
    print(f"  {dst.name:44s} {kb(src):5d} KB -> {kb(dst):4d} KB")


def install_toned(filename: str, dst: pathlib.Path, width: int) -> None:
    src = SRC / filename
    img = Image.open(src).convert("RGB")
    img = fit(img, width)
    img.save(dst, format="JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
    print(f"  {dst.name:44s} {kb(src):5d} KB -> {kb(dst):4d} KB")


def main() -> int:
    missing = [
        name
        for name in [*PLATES.values(), *TONED.keys()]
        if not (SRC / name).exists()
    ]
    if missing:
        print("缺原图：", ", ".join(missing), file=sys.stderr)
        return 1

    VOLUMES.mkdir(parents=True, exist_ok=True)
    TRIPS.mkdir(parents=True, exist_ok=True)

    print("图版（PNG 量化）：")
    for slot_id, filename in PLATES.items():
        install_plate(slot_id, filename)

    print("连续调（JPEG）：")
    for filename, (dst, width) in TONED.items():
        install_toned(filename, dst, width)

    # 旧的空白纸仪式底被 .jpg 顶掉，留着只会占体积
    for stale in ("ceremony-slot.png", "ceremony-complete.png"):
        path = VOLUMES / stale
        if path.exists():
            size = kb(path)
            path.unlink()
            print(f"删除空白底 {stale}（{size} KB）")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
