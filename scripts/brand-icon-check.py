"""把候选图标按 Android 自适应图标的方式验一遍：圆形遮罩 + 真实 launcher 尺寸。

草稿都是 512 的方图，看着都挺好；桌面上它是 48dp 的圆。这个脚本只做一件事——
把候选缩到真实尺寸、切成圆，排成一条给人眼判断，免得又在 512 上自我感觉良好。

自适应图标的规矩：前景 108dp 画布，只有中间 72dp（66.7%）保证不被裁。
所以还顺手画一圈安全区，看主体是不是缩在里面（缩太狠会比邻居图标小一圈）。
"""

from pathlib import Path

from PIL import Image, ImageDraw

DRAFTS = Path(r"D:\Fun\BioTrace\docs\brand\drafts")
OUT = Path(r"D:\Fun\BioTrace\.shot")

CANDIDATES = [
    "hue-2-album-green",
    "hue-1-oxblood",
    "hue-4-indigo",
    "icon-d2-solid",
    "icon-d-hybrid",
]

# 桌面上真实会出现的几档；48 是最小的那档，站不住就是站不住
SIZES = [192, 96, 48]
PAD = 16
BACKDROP = (232, 234, 236)


def circle_mask(size: int) -> Image.Image:
    """4 倍超采样再缩，避免圆边锯齿干扰判断。"""
    big = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(big).ellipse((0, 0, size * 4 - 1, size * 4 - 1), fill=255)
    return big.resize((size, size), Image.LANCZOS)


def masked(src: Image.Image, size: int, adaptive: bool = False) -> Image.Image:
    """adaptive=True 时按自适应图标的真实规则来：只有画布中间 66.7% 会显示，
    外圈 18% 是给视差和异形遮罩留的余量，一定会被切掉。草稿是满幅方图，
    直接拿去当前景层就会掉触角和身子——这一档就是用来看它掉多少的。"""
    if adaptive:
        n = src.size[0]
        inset = round(n * (1 - 0.667) / 2)
        src = src.crop((inset, inset, n - inset, n - inset))
    tile = src.resize((size, size), Image.LANCZOS).convert("RGBA")
    tile.putalpha(circle_mask(size))
    return tile


def main() -> None:
    OUT.mkdir(exist_ok=True)
    row_h = max(SIZES) + PAD * 2
    strip_w = PAD + sum(s + PAD for s in SIZES) + SIZES[0] + PAD + 220
    sheet = Image.new("RGB", (strip_w, row_h * len(CANDIDATES)), BACKDROP)
    draw = ImageDraw.Draw(sheet)

    for row, name in enumerate(CANDIDATES):
        src = Image.open(DRAFTS / f"{name}.png").convert("RGB")
        y0 = row * row_h
        x = PAD
        for size in SIZES:
            tile = masked(src, size)
            y = y0 + PAD + (max(SIZES) - size) // 2
            sheet.paste(tile, (x, y), tile)
            x += size + PAD
        # 最后一列：草稿原样丢进自适应前景层会被切成什么样
        crop = masked(src, SIZES[0], adaptive=True)
        sheet.paste(crop, (x, y0 + PAD), crop)
        x += SIZES[0] + PAD
        draw.text((x + 8, y0 + row_h // 2 - 6), name, fill=(60, 66, 70))

    sheet.save(OUT / "icon-check.png")
    print(f"ok {OUT / 'icon-check.png'} {sheet.size}")

    # 安全区：主体是不是缩在中间 66.7% 里，缩太狠会显得比邻居小一圈
    for name in ("hue-2-album-green",):
        src = Image.open(DRAFTS / f"{name}.png").convert("RGB")
        n = src.size[0]
        guide = src.copy()
        g = ImageDraw.Draw(guide)
        inset = n * (1 - 0.667) / 2
        g.ellipse((inset, inset, n - inset, n - inset), outline=(255, 90, 60), width=3)
        guide.save(OUT / f"{name}-safezone.png")
        print(f"ok {name}-safezone.png")


if __name__ == "__main__":
    main()
