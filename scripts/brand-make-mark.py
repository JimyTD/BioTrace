"""生成品牌标记（蜗牛）的矢量文件。

为什么要重画：草稿 hue-2-album-green.png 是位图，换色可以，笔画粗细改不了。
而 brand-measure-draft.py 量出来的三个毛病全是粗细与构图的事：

  形只占画布 53.3%（自适应图标只显示中间 66.7%，等于又小一圈）
  壳上奶油带最窄处 0.080 × 壳直径 → 48dp 下 1.7px，糊
  触角笔画 0.005–0.018 × 壳直径 → 48dp 下不到 0.4px，直接没了

构图比例照抄草稿（壳心、壳径、身子与头的位置都按量出来的相对值换算），
只把上面三项拉到能活下来的量。所以这不是另画一只，是同一只修过粗细。

画布用 108×108，对齐安卓自适应图标的 dp 画布；主体收在中间 72dp 的安全区内。
"""

import math
from pathlib import Path

OUT_DIR = Path(r"D:\Fun\BioTrace\apps\web\public\brand")

# —— 画布与主体框 ——
CANVAS = 108.0
# 主体铺满安全区（72dp）的 92%：草稿只有 53%，这是最大的一处修
MARK_W, MARK_H = 66.0, 60.0
MARK_X = (CANVAS - MARK_W) / 2
MARK_Y = (CANVAS - MARK_H) / 2

# —— 照草稿量出来的相对比例（bbox 273×247，壳心 (243,244)，壳半径 112）——
SHELL_CX = MARK_X + 0.418 * MARK_W
SHELL_CY = MARK_Y + 0.453 * MARK_H
SHELL_R = 0.410 * MARK_W          # ≈27.1，壳直径 ≈54.2

# —— 螺旋带 ——
TURNS = 2.0
R_INNER = 3.6                      # 螺心留一点，不然内圈挤成一点
# 带与缝的比例照抄草稿：量出来带 29–35、缝 16–20，约 1.78:1。
# 这个比例正是壳看着像壳的原因——配成 1:1 就成风车了，试过一次。
# 小尺寸能活下来靠的是整体放大 1.74 倍，不是靠改这个比例
BAND = 6.6
PHI_END = 150.0                    # 带子外端（壳口）落在左下，身子从右下出来
# 身子：贴着壳的下缘走的一弯，厚度照草稿 0.103 × 壳直径
FOOT_FROM, FOOT_TO = 152.0, 8.0
FOOT_T = 0.103 * SHELL_R * 2
# 头与触角
HEAD = (79.0, 63.0, 6.6, 5.6)      # cx, cy, rx, ry
ANTENNAE = [((78.0, 60.0), (85.2, 50.4)), ((75.6, 60.6), (79.6, 49.2))]
ANT_W = 3.0                        # 0.055 × 壳直径（草稿 0.005–0.018，等于头发丝）
ANT_TIP = 2.0

FIELD = "#2F4A3C"                  # 书布绿
CREAM = "#EFE9D8"


def pt(r: float, deg: float) -> tuple[float, float]:
    a = math.radians(deg)
    return SHELL_CX + r * math.cos(a), SHELL_CY + r * math.sin(a)


def fmt(points: list[tuple[float, float]]) -> str:
    return " ".join(f"{x:.2f},{y:.2f}" for x, y in points)


def spiral_ribbon() -> str:
    """阿基米德螺线加粗成带子，两端各扣一个半圆帽。

    带子本身就是形，turn 之间的缝天然是透明的——不靠遮罩、不靠底色补，
    所以这个 path 原样能进安卓 VectorDrawable，也能直接当 favicon。
    """
    span = 360.0 * TURNS
    r_out_center = SHELL_R - BAND / 2
    k = (r_out_center - R_INNER) / span

    steps = int(span / 2)
    outer, inner = [], []
    for i in range(steps + 1):
        deg = PHI_END - span + span * i / steps
        r = R_INNER + k * (deg - (PHI_END - span))
        outer.append(pt(r + BAND / 2, deg))
        inner.append(pt(r - BAND / 2, deg))

    d = [f"M {fmt([outer[0]])}", f"L {fmt(outer[1:])}"]
    d.append(f"A {BAND / 2:.2f} {BAND / 2:.2f} 0 0 1 {inner[-1][0]:.2f},{inner[-1][1]:.2f}")
    d.append(f"L {fmt(list(reversed(inner[:-1])))}")
    d.append(f"A {BAND / 2:.2f} {BAND / 2:.2f} 0 0 1 {outer[0][0]:.2f},{outer[0][1]:.2f}")
    d.append("Z")
    return " ".join(d)


def foot() -> str:
    """身子：贴着壳下缘的一弯，两端收尖。

    上缘就是壳的外圆，所以身子永远压不进螺旋缝里——不然缝里会露出身子，
    整只就脏了。草稿也是这么处理的。
    """
    steps = 60
    top, bottom = [], []
    for i in range(steps + 1):
        u = i / steps
        deg = FOOT_FROM + (FOOT_TO - FOOT_FROM) * u
        top.append(pt(SHELL_R - 0.6, deg))
        bottom.append(pt(SHELL_R + FOOT_T * math.sin(math.pi * u) ** 0.55, deg))
    pts = top + list(reversed(bottom))
    return f"M {fmt([pts[0]])} L {fmt(pts[1:])} Z"


# —— 大档：把蜗牛装进一只片框 ——
# 只取相册那只 film-frame.svg 的风气，不照搬它的做法：那只是四边各九个圆齿孔，
# 在格子里当纹理没问题，单独当标记就成了一圈铆钉。这里回到真片子的样子——
# 齿孔是圆角长方、只在上下两条边上，上下片边加厚，内窗放大到能装下蜗牛。
FRAME = (11.0, 10.0, 86.0, 88.0)   # x, y, w, h
RAIL_TB, RAIL_LR = 13.0, 5.0       # 上下片边厚，左右只留一道窄边
PERF = (7.0, 7.0, 1.8)             # 齿孔 宽 / 高 / 圆角。真片子的孔接近方形，扁了像票根
PERF_N = 6
SNAIL_IN_FRAME = 0.939             # 蜗牛缩到内窗里，四周留一点


def rrect(x: float, y: float, w: float, h: float, r: float) -> str:
    return (
        f"M{x + r:.2f} {y:.2f} H{x + w - r:.2f} A{r} {r} 0 0 1 {x + w:.2f} {y + r:.2f} "
        f"V{y + h - r:.2f} A{r} {r} 0 0 1 {x + w - r:.2f} {y + h:.2f} "
        f"H{x + r:.2f} A{r} {r} 0 0 1 {x:.2f} {y + h - r:.2f} "
        f"V{y + r:.2f} A{r} {r} 0 0 1 {x + r:.2f} {y:.2f} Z"
    )


def framed() -> str:
    """片框：外框减内窗减齿孔，全靠 evenodd 挖，不用 mask。

    内窗是空的，露出底色——所以窗里的蜗牛是奶油色落在底色上，
    和小档同色，两档看着才是同一只。
    """
    fx, fy, fw, fh = FRAME
    wx, wy = fx + RAIL_LR, fy + RAIL_TB
    ww, wh = fw - 2 * RAIL_LR, fh - 2 * RAIL_TB
    subs = [
        f"M{fx} {fy} H{fx + fw} V{fy + fh} H{fx} Z",
        f"M{wx} {wy} H{wx + ww} V{wy + wh} H{wx} Z",
    ]

    pw, ph, pr = PERF
    for i in range(PERF_N):
        cx = fx + fw * (i + 0.5) / PERF_N
        for rail_y in (fy, fy + fh - RAIL_TB):
            subs.append(rrect(cx - pw / 2, rail_y + (RAIL_TB - ph) / 2, pw, ph, pr))

    return f'<path fill-rule="evenodd" d="{" ".join(subs)}"/>'


# —— 桌面图标用的片框：横向出血 ——
# 带框当桌面图标的唯一真问题是遮罩不一致：圆形把左右竖边切了，方圆没切，
# 同一枚图标在不同桌面上是不同的形。解法是干脆不要竖边——
# 上下两条齿孔带横着铺满、主动溢出画布，那么圆形也好方圆也好，
# 看见的都是「一条胶片穿过去」，形状一致。
# 齿孔按真胶片那样密排，缩到 56px 桌面尺寸就成一串噪点了。这里只留 5 个大孔
STRIP_RAIL = 12.0                  # 齿孔带厚
STRIP_GAP = 60.0                   # 两带之间留给蜗牛的高度
STRIP_PERF = (8.6, 7.2, 2.1)
STRIP_PERF_N = 5


def strip() -> str:
    top = (CANVAS - STRIP_GAP) / 2 - STRIP_RAIL
    bottom = top + STRIP_RAIL + STRIP_GAP
    subs = []
    for rail_y in (top, bottom):
        # 左右各多铺 6，确保任何遮罩下都是切断而不是露头
        subs.append(f"M-6 {rail_y} H{CANVAS + 6} V{rail_y + STRIP_RAIL} H-6 Z")
    pw, ph, pr = STRIP_PERF
    for i in range(STRIP_PERF_N):
        cx = CANVAS * (i + 0.5) / STRIP_PERF_N
        for rail_y in (top, bottom):
            subs.append(rrect(cx - pw / 2, rail_y + (STRIP_RAIL - ph) / 2, pw, ph, pr))
    return f'<path fill-rule="evenodd" d="{" ".join(subs)}"/>'


def build() -> str:
    cx, cy, rx, ry = HEAD
    parts = [
        f'<path d="{foot()}"/>',
        f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}"/>',
        f'<path d="{spiral_ribbon()}"/>',
    ]
    for (x0, y0), (x1, y1) in ANTENNAE:
        parts.append(
            f'<path d="M {x0},{y0} L {x1},{y1}" fill="none" stroke="currentColor" '
            f'stroke-width="{ANT_W}" stroke-linecap="round"/>'
        )
        parts.append(f'<circle cx="{x1}" cy="{y1}" r="{ANT_TIP}"/>')
    body = "\n  ".join(parts)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {CANVAS:.0f} {CANVAS:.0f}" '
        f'fill="currentColor" role="img" aria-label="BioTrace">\n  {body}\n</svg>\n'
    )


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    mark = build()
    (OUT_DIR / "snail.svg").write_text(mark, encoding="utf-8")
    print(f"ok {OUT_DIR / 'snail.svg'}  {len(mark)} bytes")

    # 带底色的整块，给 favicon 与 legacy 方图用；主体在方图里可以铺得更满
    tile = mark.replace(
        ">\n  <path",
        f'>\n  <rect width="{CANVAS:.0f}" height="{CANVAS:.0f}" fill="{FIELD}"/>\n'
        f'  <g fill="{CREAM}" color="{CREAM}" transform="translate({CANVAS / 2:.1f} {CANVAS / 2:.1f}) '
        f'scale(1.28) translate({-CANVAS / 2:.1f} {-CANVAS / 2:.1f})">\n  <path',
        1,
    ).replace("</svg>", "</g>\n</svg>")
    (OUT_DIR / "icon-tile.svg").write_text(tile, encoding="utf-8")
    print(f"ok {OUT_DIR / 'icon-tile.svg'}")

    # 大档：片框 + 装在窗里的蜗牛。给启动图、侧载页 hero、分享图用，不下放到桌面
    c = CANVAS / 2
    inner = "\n  ".join(
        line for line in build().splitlines() if line.strip().startswith(("<path", "<ellipse", "<circle"))
    )
    big = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {CANVAS:.0f} {CANVAS:.0f}" '
        f'fill="currentColor" role="img" aria-label="BioTrace">\n'
        f"  {framed()}\n"
        f'  <g transform="translate({c} {c}) scale({SNAIL_IN_FRAME}) translate({-c} {-c})">\n'
        f"  {inner}\n  </g>\n</svg>\n"
    )
    (OUT_DIR / "snail-framed.svg").write_text(big, encoding="utf-8")
    print(f"ok {OUT_DIR / 'snail-framed.svg'}")

    # 同一枚大档，自带底色和圆角，给页面里当 <img> 用——
    # currentColor 在 <img> 里取不到值，页面上要么内联 SVG 要么用这份
    framed_tile = big.replace(
        ">\n  <path",
        f'>\n  <rect width="{CANVAS:.0f}" height="{CANVAS:.0f}" rx="24" fill="{FIELD}"/>\n'
        f'  <g fill="{CREAM}" color="{CREAM}">\n  <path',
        1,
    ).replace("</svg>", "</g>\n</svg>")
    (OUT_DIR / "icon-tile-framed.svg").write_text(framed_tile, encoding="utf-8")
    print(f"ok {OUT_DIR / 'icon-tile-framed.svg'}")

    # 桌面图标候选：横向出血的胶片条。蜗牛缩到两带之间
    fit = (STRIP_GAP - 6) / MARK_H
    band = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {CANVAS:.0f} {CANVAS:.0f}" '
        f'fill="currentColor" role="img" aria-label="BioTrace">\n'
        f"  {strip()}\n"
        f'  <g transform="translate({c} {c}) scale({fit:.3f}) translate({-c} {-c})">\n'
        f"  {inner}\n  </g>\n</svg>\n"
    )
    (OUT_DIR / "snail-strip.svg").write_text(band, encoding="utf-8")
    print(f"ok {OUT_DIR / 'snail-strip.svg'}  蜗牛缩到 {fit:.0%}")

    print(f"\n48dp 下（安全区 72dp → 48px，1 单位 = {48 / 72:.3f}px）：")
    print(f"  奶油带 {BAND * 48 / 72:.1f}px   缝 {(SHELL_R - BAND / 2 - R_INNER) / TURNS * 48 / 72 - BAND * 48 / 72 + BAND * 48 / 72:.1f}px 见下")
    pitch = (SHELL_R - BAND / 2 - R_INNER) / TURNS
    print(f"  螺距 {pitch:.2f} 单位 → 带 {BAND * 48 / 72:.1f}px / 缝 {(pitch - BAND) * 48 / 72:.1f}px")
    print(f"  触角 {ANT_W * 48 / 72:.1f}px（草稿约 0.3px）")


if __name__ == "__main__":
    main()
