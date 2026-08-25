"""图标配色对比：保持构图不变，只替换底色与形色。

从双色源图（底色 + 形色）中解出每像素的「形色占比」，再用新配色重建，
antialiasing 与压印暗环都能保留，因此各版差异纯粹来自颜色本身。
"""

from pathlib import Path

from PIL import Image

SRC = Path(r"D:\Fun\BioTrace\apps\web\public\brand\drafts\icon-d2-solid.png")
OUT_DIR = Path(r"D:\Fun\BioTrace\apps\web\public\brand\drafts")

# (文件名, 底色, 形色)
VARIANTS = [
    ("hue-1-oxblood", "#8C2F23", "#F2E3D0"),
    ("hue-2-album-green", "#2F4A3C", "#EFE9D8"),
    ("hue-3-sepia", "#4A3524", "#F0E4CE"),
    ("hue-4-indigo", "#2B3A55", "#ECE6D8"),
]


def hex_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def luma(rgb: tuple[float, float, float]) -> float:
    return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]


def main() -> None:
    img = Image.open(SRC).convert("RGB")
    px = list(img.getdata())

    src_bg = px[0]
    src_fg = max(px, key=luma)
    delta = tuple(src_fg[i] - src_bg[i] for i in range(3))
    denom = sum(c * c for c in delta) or 1

    for name, bg_hex, fg_hex in VARIANTS:
        new_bg = hex_rgb(bg_hex)
        new_fg = hex_rgb(fg_hex)
        out = []
        for p in px:
            t = sum((p[i] - src_bg[i]) * delta[i] for i in range(3)) / denom
            t = min(1.0, max(0.0, t))
            expected = tuple(src_bg[i] + delta[i] * t for i in range(3))
            # 压印暗环等细节体现为实际亮度低于插值预期，按比例带到新配色上
            scale = min(1.12, max(0.86, luma(p) / max(luma(expected), 1.0)))
            base = tuple(new_bg[i] + (new_fg[i] - new_bg[i]) * t for i in range(3))
            out.append(tuple(min(255, max(0, round(base[i] * scale))) for i in range(3)))

        dst = OUT_DIR / f"{name}.png"
        result = Image.new("RGB", img.size)
        result.putdata(out)
        result.save(dst)
        print(f"ok {dst.name}")


if __name__ == "__main__":
    main()
