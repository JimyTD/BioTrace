"""本地走查用假数据：一条共享旅途 + 覆盖全部格子状态的观察。

用法：python scripts/walkthrough/seed.py

只写本地 data/biotrace.db，不上线。跑之前先访问一次 /dev-login.html 建出 dev 用户。
API 开着也能跑，sqlite 会等写锁。重复跑会多出几条旅途，不会互相覆盖。
"""

import shutil
import sqlite3
import time
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB = ROOT / "data" / "biotrace.db"
UPLOADS = ROOT / "data" / "uploads"
DEMO = ROOT / "apps" / "web" / "public" / "themes" / "_demo"

PHOTOS = [
    "demo-photo-bird.jpg",
    "demo-photo-dragonfly.jpg",
    "demo-photo-mushroom.jpg",
    "demo-photo-squirrel.jpg",
    "demo-photo-butterfly.jpg",
    "demo-photo-trail.jpg",
]

# 覆盖相册格的全部状态，改结构时才看得出哪一种漏了
# (status, common, sci, rank, error, tier, rarity, introduced, 是不是别人传的)
ROWS = [
    ("settled", "橙翅噪鹛", "Trochalopteron elliotii", "species", None, "full", "R", 0, 0),
    ("settled", "红蜻", "Crocothemis servilia", "species", None, "full", "N", 0, 1),
    ("failed", None, None, None, "identify_too_coarse", "none", None, 0, 0),
    ("settled", "香格里拉柳", "Salix shangrilaensis", "species", None, "full", "SR", 0, 1),
    ("failed", None, None, None, "identify_not_organism", None, None, 0, 0),
    ("pending_settle", None, None, None, None, None, None, 0, 0),
    ("settled", "加拿大一枝黄花", "Solidago canadensis", "species", None, "full", "N", 1, 0),
    ("analyzing", None, None, None, None, None, None, 0, 1),
    ("settled", "柏木", "Cupressus funebris", "genus", None, "partial", "N", 0, 0),
]

TAXONOMY = (
    '{"kingdom":"Animalia","phylum":"Chordata","class":"Aves",'
    '"order":"Passeriformes","family":"Leiothrichidae","genus":"Trochalopteron",'
    '"species":"Trochalopteron elliotii"}'
)


def main() -> None:
    c = sqlite3.connect(DB)
    c.execute("PRAGMA foreign_keys=ON")
    owner = c.execute("select id from users where email='dev@local'").fetchone()
    if not owner:
        raise SystemExit("先访问一次 /dev-login.html 建出 dev 用户")
    owner_id = owner[0]

    mate = c.execute("select id from users where email='mate@local'").fetchone()
    if mate:
        mate_id = mate[0]
    else:
        mate_id = str(uuid.uuid4())
        c.execute(
            "insert into users (id, email, password_hash, display_name, created_at)"
            " values (?,?,?,?,?)",
            (mate_id, "mate@local", "x", "Neatelyle", int(time.time() * 1000)),
        )

    now = int(time.time() * 1000)
    trip_id = str(uuid.uuid4())
    c.execute(
        "insert into trips (id, user_id, title, created_at, invite_code, allow_join)"
        " values (?,?,?,?,?,?)",
        (trip_id, owner_id, "九寨", now - 9 * 86400_000, "SEED" + str(now)[-6:], 1),
    )
    for uid in (owner_id, mate_id):
        c.execute(
            "insert or ignore into trip_members (trip_id, user_id, joined_at) values (?,?,?)",
            (trip_id, uid, now),
        )

    for i, (status, common, sci, rank, err, tier, rarity, intro, by_mate) in enumerate(ROWS):
        obs_id = str(uuid.uuid4())
        src = DEMO / PHOTOS[i % len(PHOTOS)]
        dst_dir = UPLOADS / obs_id
        dst_dir.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dst_dir / "display.jpg")
        stamp = now - (len(ROWS) - i) * 3600_000
        c.execute(
            """insert into observations
               (id, trip_id, user_id, status, description, captured_at, lat, lng,
                display_path, common_name, scientific_name, finest_reliable_rank,
                confidence, taxonomy_json, blurb, notes, error, created_at, updated_at,
                settle_tier, rarity, country_code, location_precise, alert_introduced,
                taxon_key, identify_provider, settled_at, location_label)
               values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                obs_id,
                trip_id,
                mate_id if by_mate else owner_id,
                status,
                None,
                stamp,
                33.25 + i * 0.01,
                103.9 + i * 0.01,
                f"{obs_id}/display.jpg",
                common,
                sci,
                rank,
                0.86 if status == "settled" else None,
                TAXONOMY if status == "settled" else None,
                None,
                None,
                err,
                stamp,
                stamp,
                tier,
                rarity,
                "CN",
                1,
                intro,
                f"seed-{i}" if status == "settled" else None,
                "seed" if status in ("settled", "failed") else None,
                stamp if status == "settled" else None,
                "四川",
            ),
        )

    c.commit()
    print("trip", trip_id)


if __name__ == "__main__":
    main()
