"""Process overlay assets: HSV chromakey greenscreen PNGs.

Seal SVGs live in public/ and are edited directly (stamp-die motifs).
Do NOT use rembg for hard-edged UI shells.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from chroma_key_green import chroma_key_green

ROOT = Path(__file__).resolve().parents[1] / "apps" / "web" / "public"
ASSETS = Path.home() / ".cursor" / "projects" / "d-Fun-BioTrace" / "assets"


def main() -> None:
    pack_src = ASSETS / "settle-pack-sealed-greenscreen-v4.png"
    for fallback in (
        "settle-pack-sealed-greenscreen-v3.png",
        "settle-pack-sealed-greenscreen-v2.png",
        "settle-pack-sealed-greenscreen.png",
    ):
        if pack_src.exists():
            break
        pack_src = ASSETS / fallback

    pack_dst = ROOT / "settle" / "daylight" / "pack-sealed.png"
    if pack_src.exists():
        chroma_key_green(pack_src, pack_dst)
    else:
        print("skip pack-sealed: no greenscreen source in", ASSETS)

    for stale in (
        ROOT / "settle" / "daylight" / "rarity-seal.png",
        ROOT / "volumes" / "daylight" / "seal-complete.png",
    ):
        if stale.exists():
            stale.unlink()
            print("removed", stale.relative_to(ROOT))


if __name__ == "__main__":
    main()
