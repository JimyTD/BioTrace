"""把 public/brand/ 的矢量稿导出成正式环境要的位图。

矢量是唯一源，这里只做栅格化和遮罩，不做造型——要改形状去改
brand-make-mark.py，再跑这个脚本重导一遍。

栅格化走无头 Edge 而不是 cairosvg：本机装不上 cairo 的 DLL，而 Edge
本来就为走查截图装着，渲染结果和浏览器里看到的一致。

产物：
  安卓 mipmap-*   自适应图标前景（透明底）+ 旧版方图 / 圆图
  安卓 drawable-* 启动图（书布绿满铺 + 大档标记）
  Web public/     favicon 16/32/svg、apple-touch-icon、PWA 192/512、分享图
"""

import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path

from PIL import Image, ImageDraw

REPO = Path(__file__).resolve().parents[1]
BRAND = REPO / "apps" / "web" / "public" / "brand"
WEB = REPO / "apps" / "web" / "public"
RES = REPO / "apps" / "mobile" / "android" / "app" / "src" / "main" / "res"

FIELD = "#2F4A3C"
CREAM = "#EFE9D8"

# 各档标记：桌面用出血胶片条，大档用完整片框，极小档只留蜗牛
STRIP = BRAND / "snail-strip.svg"
FRAMED = BRAND / "snail-framed.svg"
TILE = BRAND / "icon-tile.svg"     # 极小档：带底色的方图，蜗牛铺得更满

DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}

EDGE_CANDIDATES = [
    Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
    Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
]


def edge() -> Path:
    for p in EDGE_CANDIDATES:
        if p.exists():
            return p
    raise SystemExit("没找到 Edge，改 EDGE_CANDIDATES 指到本机浏览器")


def shot(html: str, w: int, h: int, out: Path, transparent: bool = False) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    if out.exists():
        out.unlink()
    with tempfile.TemporaryDirectory() as tmp:
        page = Path(tmp) / "page.html"
        page.write_text(html, encoding="utf-8")
        prof = Path(tempfile.gettempdir()) / f"bt-export-{uuid.uuid4().hex[:8]}"
        cmd = [
            str(edge()), "--headless=new", "--disable-gpu", "--hide-scrollbars",
            "--no-first-run", "--no-default-browser-check",
            f"--user-data-dir={prof}", f"--window-size={w},{h}",
            "--force-device-scale-factor=1", "--virtual-time-budget=4000",
            f"--screenshot={out}", page.as_uri(),
        ]
        if transparent:
            cmd.insert(3, "--default-background-color=00000000")
        subprocess.run(cmd, capture_output=True)
        shutil.rmtree(prof, ignore_errors=True)
    if not out.exists():
        raise SystemExit(f"没出图：{out}")


def page(body: str, bg: str, w: int, h: int) -> str:
    return (
        "<!doctype html><meta charset='utf-8'>"
        f"<style>html,body{{margin:0;padding:0;background:{bg};"
        f"width:{w}px;height:{h}px;overflow:hidden}}"
        ".box{display:flex;align-items:center;justify-content:center;"
        f"width:{w}px;height:{h}px;color:{CREAM}}}"
        "svg{display:block}</style>"
        f"<div class='box'>{body}</div>"
    )


def mark(src: Path, px: int) -> str:
    svg = src.read_text(encoding="utf-8")
    return svg.replace("<svg ", f"<svg width='{px}' height='{px}' ", 1)


def render_mark(src: Path, px: int, out: Path, bg: str = "transparent") -> Image.Image:
    """把某一档标记单独渲染成 px 见方。bg 给 transparent 就是透明底。"""
    shot(page(mark(src, px), bg, px, px), px, px, out, transparent=(bg == "transparent"))
    return Image.open(out).convert("RGBA")


def mask(size: int, kind: str) -> Image.Image:
    """4 倍超采样再缩，省得圆边出锯齿。"""
    s = size * 4
    m = Image.new("L", (s, s), 0)
    d = ImageDraw.Draw(m)
    if kind == "circle":
        d.ellipse((0, 0, s - 1, s - 1), fill=255)
    else:
        d.rounded_rectangle((0, 0, s - 1, s - 1), radius=int(s * 0.2), fill=255)
    return m.resize((size, size), Image.LANCZOS)


def compose(fg: Image.Image, size: int, kind: str | None) -> Image.Image:
    """前景压到书布绿底上，再按需要切形。"""
    tile = Image.new("RGBA", fg.size, FIELD)
    tile.alpha_composite(fg)
    tile = tile.resize((size, size), Image.LANCZOS)
    if kind:
        tile.putalpha(mask(size, kind))
    return tile


# ————————————————————————————— 安卓 —————————————————————————————

def android_icons() -> None:
    # 自适应图标前景：108dp 画布原样，透明底。齿孔带主动出血，遮罩由系统切
    base = None
    for name, k in DENSITIES.items():
        px = int(108 * k)
        out = RES / f"mipmap-{name}" / "ic_launcher_foreground.png"
        img = render_mark(STRIP, px, out)
        print(f"ok {out.relative_to(REPO)}  {px}px")
        if name == "xxxhdpi":
            base = img

    # 旧版（API < 26）方图与圆图：自己带底色、自己切形
    assert base is not None
    for name, k in DENSITIES.items():
        px = int(48 * k)
        for fname, kind in (("ic_launcher.png", "rounded"), ("ic_launcher_round.png", "circle")):
            out = RES / f"mipmap-{name}" / fname
            compose(base, px, kind).save(out)
        print(f"ok mipmap-{name}/ic_launcher(_round).png  {px}px")

    (RES / "values" / "ic_launcher_background.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<resources>\n"
        f'    <color name="ic_launcher_background">{FIELD}</color>\n'
        "</resources>\n",
        encoding="utf-8",
    )
    print("ok values/ic_launcher_background.xml")


def android_splash() -> None:
    """启动图：书布绿满铺，中间一枚大档标记。横竖各五档，尺寸沿用原文件。"""
    sizes = {}
    for d in RES.iterdir():
        f = d / "splash.png"
        if f.exists():
            with Image.open(f) as im:
                sizes[d.name] = im.size

    for folder, (w, h) in sorted(sizes.items()):
        px = int(min(w, h) * 0.26)
        out = RES / folder / "splash.png"
        shot(page(mark(FRAMED, px), FIELD, w, h), w, h, out)
        Image.open(out).convert("RGB").save(out)
        print(f"ok {folder}/splash.png  {w}x{h}  标记 {px}px")


# ————————————————————————————— Web —————————————————————————————

def web_icons() -> None:
    big = render_mark(STRIP, 512, WEB / "icon-512.png")
    Image.alpha_composite(Image.new("RGBA", big.size, FIELD), big).save(WEB / "icon-512.png")
    print("ok icon-512.png")

    for px, name in ((192, "icon-192.png"), (180, "apple-touch-icon.png")):
        compose(big, px, None).save(WEB / name)
        print(f"ok {name}  {px}px")

    # favicon 走极小档。标签页那个槽位是 16 CSS px，32 只是它的 2 倍图——
    # 齿孔在这个尺寸上一定糊成灰点，只留蜗牛反而认得出
    tiny = render_mark(TILE, 256, WEB / "favicon-32.png")
    for px in (32, 16):
        tiny.resize((px, px), Image.LANCZOS).save(WEB / f"favicon-{px}.png")
        print(f"ok favicon-{px}.png  {px}px（极小档：裸蜗牛）")

    shutil.copyfile(TILE, WEB / "favicon.svg")
    print("ok favicon.svg")


def web_share() -> None:
    """分享图：绿底、大档标记、字号按 1200×630 排。"""
    w, h = 1200, 630
    html = (
        "<!doctype html><meta charset='utf-8'>"
        "<link rel='preconnect' href='https://fonts.googleapis.com'>"
        "<link href='https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap' rel='stylesheet'>"
        f"<style>html,body{{margin:0;background:{FIELD};width:{w}px;height:{h}px;overflow:hidden}}"
        f".box{{width:{w}px;height:{h}px;display:grid;place-content:center;justify-items:center;"
        f"color:{CREAM};font-family:'Outfit',system-ui,'PingFang SC','Microsoft YaHei',sans-serif}}"
        "svg{display:block}"
        "b{font-size:82px;font-weight:700;letter-spacing:-.03em;margin-top:34px}"
        "em{font-style:normal;font-size:34px;opacity:.75;margin-top:10px;letter-spacing:.04em}"
        "</style>"
        f"<div class='box'>{mark(FRAMED, 190)}<b>BioTrace</b><em>路上遇见的，都有名字</em></div>"
    )
    out = WEB / "og.png"
    shot(html, w, h, out)
    Image.open(out).convert("RGB").save(out)
    print(f"ok og.png  {w}x{h}")


def main() -> None:
    android_icons()
    android_splash()
    web_icons()
    web_share()


if __name__ == "__main__":
    main()
