"""把 Natural Earth 简图烤成墨卡托世界图，供引导插页使用（避免运行时 parse 2.2MB）。"""

from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image, ImageDraw

SIZE = 1024
FILL = {
    1: "#e7dfd2",
    2: "#e2d7c4",
    3: "#ebe3d6",
    4: "#ddd2c0",
    5: "#e9e0d0",
    6: "#e0d5c2",
    7: "#efe6da",
}
OCEAN = "#c5d6e8"
BORDER = (143, 127, 104, 217)
DEFAULT_LAND = "#e8e0d4"

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "map" / "ne_50m_countries_chn_pov.geojson"
OUT = ROOT / "public" / "onboard" / "world.png"


def merc_x(lng: float) -> float:
    return (lng + 180.0) / 360.0


def merc_y(lat: float) -> float:
    lat = max(-85.05112878, min(85.05112878, lat))
    s = math.sin(math.radians(lat))
    y = 0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)
    return min(1.0, max(0.0, y))


def project(lng: float, lat: float) -> tuple[float, float]:
    return merc_x(lng) * SIZE, merc_y(lat) * SIZE


def split_ring(ring: list) -> list[list[tuple[float, float]]]:
    parts: list[list[tuple[float, float]]] = []
    cur: list[tuple[float, float]] = []
    prev: float | None = None
    for pt in ring:
        lng, lat = pt[0], pt[1]
        if prev is not None and abs(lng - prev) > 180:
            if len(cur) >= 3:
                parts.append(cur)
            cur = []
        cur.append(project(lng, lat))
        prev = lng
    if len(cur) >= 3:
        parts.append(cur)
    return parts


def walk_polys(geom: dict, visit) -> None:
    kind = geom.get("type")
    if kind == "Polygon":
        visit(geom["coordinates"])
    elif kind == "MultiPolygon":
        for poly in geom["coordinates"]:
            visit(poly)


def main() -> None:
    data = json.loads(SRC.read_text(encoding="utf-8"))
    img = Image.new("RGB", (SIZE, SIZE), OCEAN)
    draw = ImageDraw.Draw(img)

    for feat in data["features"]:
        color = FILL.get((feat.get("properties") or {}).get("c"), DEFAULT_LAND)

        def fill_poly(poly: list, land: str = color) -> None:
            for i, ring in enumerate(poly):
                paint = OCEAN if i else land
                for part in split_ring(ring):
                    draw.polygon(part, fill=paint)

        walk_polys(feat["geometry"], fill_poly)

    for feat in data["features"]:

        def stroke_poly(poly: list) -> None:
            if not poly:
                return
            for part in split_ring(poly[0]):
                draw.line(part + [part[0]], fill=BORDER, width=1)

        walk_polys(feat["geometry"], stroke_poly)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, "PNG", optimize=True)
    print(f"{OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
