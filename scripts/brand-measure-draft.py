"""量草稿的构图，给矢量重画当依据。

草稿是双色图，把奶油色那部分二值化出来就是形。要的几个数：
整体外接框、壳的圆心与半径、螺旋缝的宽度、触角的粗细。
凭印象照着画会跑偏，量一遍再画。
"""

from pathlib import Path

from PIL import Image

SRC = Path(r"D:\Fun\BioTrace\docs\brand\drafts\hue-2-album-green.png")


def main() -> None:
    img = Image.open(SRC).convert("RGB")
    n = img.size[0]
    px = img.load()

    bg = px[0, 0]
    # 形色取全图最亮的那个色
    fg = max(img.getdata(), key=lambda p: 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2])
    print(f"画布 {img.size}  底色 {bg}  形色 {fg}")

    def is_fg(x: int, y: int) -> bool:
        p = px[x, y]
        d_bg = sum((p[i] - bg[i]) ** 2 for i in range(3))
        d_fg = sum((p[i] - fg[i]) ** 2 for i in range(3))
        return d_fg < d_bg

    mask = [[is_fg(x, y) for x in range(n)] for y in range(n)]

    xs = [x for y in range(n) for x in range(n) if mask[y][x]]
    ys = [y for y in range(n) for x in range(n) if mask[y][x]]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    print(f"形的外接框 x {x0}..{x1} ({x1 - x0})  y {y0}..{y1} ({y1 - y0})")
    print(f"占画布  宽 {(x1 - x0) / n:.1%}  高 {(y1 - y0) / n:.1%}")

    # 壳：取上半部分最宽的那一行当直径，圆心横坐标取该行中点
    best = max(
        (
            (sum(mask[y]), y)
            for y in range(y0, y0 + (y1 - y0) // 2)
        ),
        default=(0, 0),
    )
    width_at, y_widest = best
    row = [x for x in range(n) if mask[y_widest][x]]
    print(f"上半最宽行 y={y_widest} 宽 {width_at} x {row[0]}..{row[-1]}")

    # 壳顶
    top_row = [x for x in range(n) if mask[y0][x]]
    print(f"壳顶 y={y0} 中点 x≈{(top_row[0] + top_row[-1]) // 2}")

    cx = (row[0] + row[-1]) // 2
    r = (row[-1] - row[0]) // 2
    cy = y0 + r
    print(f"壳  圆心≈({cx},{cy}) 半径≈{r}  归一化 圆心({cx / n:.3f},{cy / n:.3f}) r={r / n:.3f}")

    # 螺旋缝：穿过圆心画一条水平线，数交替段
    def runs(seq: list[bool]) -> list[tuple[bool, int, int]]:
        out, start = [], 0
        for i in range(1, len(seq) + 1):
            if i == len(seq) or seq[i] != seq[start]:
                out.append((seq[start], start, i - 1))
                start = i
        return out

    for label, yy in (("through center", cy), ("above center r/2", cy - r // 2)):
        seq = [mask[yy][x] for x in range(x0, x1 + 1)]
        segs = [(v, a + x0, b + x0, b - a + 1) for v, a, b in runs(seq)]
        print(f"\n{label} y={yy} (cx={cx}, shell r={r}):")
        for v, a, b, w in segs:
            side = "L" if b < cx else ("R" if a > cx else "-")
            kind = "CREAM" if v else "gap  "
            print(f"  {kind} {side} x {a}..{b} w={w}  {w / (2 * r):.3f} of shell dia")

    # 触角：壳右缘之外、身子之上的那一小片
    print(f"\nantennae (right of shell x>{cx + r}, above body):")
    for y in range(y0, y1 + 1, 6):
        seq = [mask[y][x] for x in range(cx + r, x1 + 1)]
        if not any(seq):
            continue
        widths = [b - a + 1 for v, a, b in runs(seq) if v]
        print(f"  y={y} strokes {widths}  thinnest {min(widths) / (2 * r):.4f} of shell dia")


if __name__ == "__main__":
    main()
