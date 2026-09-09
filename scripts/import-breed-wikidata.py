"""从 Wikidata 扩充宠物品种对照表。

品种库只做纠偏（把已知写法收到同一格），不是许可清单。
本脚本可重复跑：保留已有 id / 别名 / 普及度，只合并新的中英名。

来源：
- Wikidata（犬 Q39367、猫 Q43577、牛品种 Q12045585、鸡 Q15304943、马 Q1160573）
- 农业农村部《国家级畜禽遗传资源保护名录》里旅行里常见的牛、鸡（手抄一小份 listed）
"""
from __future__ import annotations

import json
import os
import re
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "apps" / "api" / "data" / "breeds"
UA = "BioTrace/1.0 (https://github.com/JimyTD/BioTrace; breed catalog)"

QUERIES = {
    "dog": "Q39367",
    "cat": "Q43577",
    "cattle": "Q12045585",
    "chicken": "Q15304943",
    "horse": "Q1160573",
}

GENERIC = {
    "dog", "dogs", "dog breed", "breed", "犬", "狗", "犬种", "犬品种",
    "cat", "cats", "猫", "猫咪", "猫品种",
    "cattle", "cow", "cows", "牛", "黄牛", "奶牛",
    "chicken", "chickens", "鸡", "家鸡",
}


def sparql(q: str) -> list[dict]:
    data = urllib.parse.urlencode({"query": q}).encode()
    req = urllib.request.Request(
        "https://query.wikidata.org/sparql",
        data=data,
        headers={
            "Accept": "application/sparql-results+json",
            "User-Agent": UA,
            "Content-Type": "application/x-www-form-urlencoded",
        },
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        payload = json.loads(r.read().decode("utf-8"))
    return payload["results"]["bindings"]


def fetch_class(qid: str) -> list[tuple[str, str | None, str | None]]:
    q = f"""
    SELECT ?item ?zh ?en WHERE {{
      ?item wdt:P31/wdt:P279* wd:{qid} .
      OPTIONAL {{ ?item rdfs:label ?zh FILTER(LANG(?zh) = "zh" || LANG(?zh) = "zh-hans" || LANG(?zh) = "zh-cn") }}
      OPTIONAL {{ ?item rdfs:label ?en FILTER(LANG(?en) = "en") }}
    }}
    """
    rows: dict[str, dict[str, str]] = {}
    for b in sparql(q):
        uri = b["item"]["value"]
        rec = rows.setdefault(uri, {})
        if "zh" in b:
            rec["zh"] = b["zh"]["value"].strip()
        if "en" in b:
            rec["en"] = b["en"]["value"].strip()
    out = []
    for uri, rec in rows.items():
        qid_local = uri.rsplit("/", 1)[-1].lower()
        zh = rec.get("zh") or None
        en = rec.get("en") or None
        if zh and zh.lower() in GENERIC:
            zh = None
        if en and en.lower() in GENERIC:
            en = None
        if not zh and not en:
            continue
        out.append((qid_local, zh, en))
    return out


def slug(en: str | None, zh: str | None, qid: str) -> str:
    raw = (en or zh or qid).lower()
    s = re.sub(r"[^a-z0-9]+", "-", raw).strip("-")
    return s[:48] or qid


def load_existing(name: str) -> dict:
    path = OUT / f"{name}.json"
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def norm(s: str) -> str:
    return re.sub(r"\s+", "", s).strip().lower()


def index_existing(breeds: list[dict]) -> dict[str, dict]:
    by: dict[str, dict] = {}
    for b in breeds:
        keys = [b.get("zh"), b.get("en"), *(b.get("aliases") or [])]
        for k in keys:
            if k:
                by[norm(k)] = b
    return by


def merge_wd(existing: list[dict], wd: list[tuple[str, str | None, str | None]]) -> list[dict]:
    by = index_existing(existing)
    seen_ids = {b["id"] for b in existing}
    for qid, zh, en in wd:
        hit = None
        for k in (zh, en):
            if k and norm(k) in by:
                hit = by[norm(k)]
                break
        if hit:
            aliases = list(hit.get("aliases") or [])
            for extra in (zh, en):
                if not extra:
                    continue
                if extra == hit.get("zh") or extra == hit.get("en"):
                    continue
                if extra not in aliases:
                    aliases.append(extra)
            if aliases:
                hit["aliases"] = aliases
            if en and not hit.get("en"):
                hit["en"] = en
            continue
        bid = slug(en, zh, qid)
        if bid in seen_ids:
            bid = qid
        seen_ids.add(bid)
        rec: dict = {
            "id": bid,
            "zh": zh or en,
            "prevalence": "uncommon",
        }
        if en:
            rec["en"] = en
        aliases = []
        if zh and en and zh != en:
            aliases.append(zh if rec["zh"] == en else en)
        if aliases:
            rec["aliases"] = [a for a in aliases if a != rec["zh"] and a != rec.get("en")]
            if not rec["aliases"]:
                rec.pop("aliases", None)
        existing.append(rec)
        by[norm(rec["zh"])] = rec
        if rec.get("en"):
            by[norm(rec["en"])] = rec
    return existing


def add_listed(existing: list[dict], extras: list[dict]) -> list[dict]:
    by = index_existing(existing)
    seen_ids = {b["id"] for b in existing}
    for extra in extras:
        hit = None
        for k in (extra["zh"], extra.get("en"), *(extra.get("aliases") or [])):
            if k and norm(k) in by:
                hit = by[norm(k)]
                break
        if hit:
            aliases = list(hit.get("aliases") or [])
            for a in extra.get("aliases") or []:
                if a not in aliases and a != hit.get("zh") and a != hit.get("en"):
                    aliases.append(a)
            if aliases:
                hit["aliases"] = aliases
            if extra.get("en") and not hit.get("en"):
                hit["en"] = extra["en"]
            continue
        bid = extra["id"]
        if bid in seen_ids:
            bid = bid + "-cn"
        rec = {**extra, "prevalence": extra.get("prevalence", "common")}
        existing.append(rec)
        seen_ids.add(rec["id"])
        by[norm(rec["zh"])] = rec
    return existing


CATTLE_LISTED = [
    {"id": "holstein", "zh": "荷斯坦", "en": "Holstein", "aliases": ["荷斯坦牛", "黑白花", "黑白花牛", "Holstein Friesian"], "prevalence": "common"},
    {"id": "jersey", "zh": "娟姗牛", "en": "Jersey", "aliases": ["娟姗", "泽西牛"], "prevalence": "uncommon"},
    {"id": "simmental", "zh": "西门塔尔", "en": "Simmental", "aliases": ["西门塔尔牛"], "prevalence": "common"},
    {"id": "angus", "zh": "安格斯", "en": "Angus", "aliases": ["安格斯牛", "Aberdeen Angus"], "prevalence": "uncommon"},
    {"id": "hereford", "zh": "海福特", "en": "Hereford", "aliases": ["海福特牛"], "prevalence": "uncommon"},
    {"id": "charolais", "zh": "夏洛来", "en": "Charolais", "aliases": ["夏洛来牛"], "prevalence": "uncommon"},
    {"id": "qinchuan", "zh": "秦川牛", "aliases": ["秦川"], "prevalence": "common"},
    {"id": "nanyang", "zh": "南阳牛", "aliases": ["南阳"], "prevalence": "common"},
    {"id": "luxi", "zh": "鲁西牛", "aliases": ["鲁西"], "prevalence": "uncommon"},
    {"id": "jinnan", "zh": "晋南牛", "aliases": ["晋南"], "prevalence": "uncommon"},
    {"id": "mongolian-cattle", "zh": "蒙古牛", "aliases": ["蒙古"], "prevalence": "common"},
    {"id": "yanbian", "zh": "延边牛", "aliases": ["延边"], "prevalence": "uncommon"},
    {"id": "bohai-black", "zh": "渤海黑牛", "prevalence": "uncommon"},
    {"id": "fuzhou", "zh": "复州牛", "prevalence": "uncommon"},
    {"id": "wenling", "zh": "温岭高峰牛", "prevalence": "rare"},
]

CHICKEN_LISTED = [
    {"id": "beijing-you", "zh": "北京油鸡", "prevalence": "uncommon"},
    {"id": "wenchang", "zh": "文昌鸡", "prevalence": "common"},
    {"id": "qingyuan", "zh": "清远麻鸡", "aliases": ["清远麻"], "prevalence": "common"},
    {"id": "langshan", "zh": "狼山鸡", "en": "Langshan", "prevalence": "uncommon"},
    {"id": "xianju", "zh": "仙居鸡", "prevalence": "uncommon"},
    {"id": "chahua", "zh": "茶花鸡", "prevalence": "uncommon"},
    {"id": "tibetan-chicken", "zh": "藏鸡", "prevalence": "uncommon"},
    {"id": "pudong", "zh": "浦东鸡", "prevalence": "uncommon"},
    {"id": "huiyang", "zh": "惠阳胡须鸡", "aliases": ["胡须鸡"], "prevalence": "uncommon"},
    {"id": "guangxi-sanhuang", "zh": "广西三黄鸡", "prevalence": "common"},
    {"id": "wenshang-barred", "zh": "汶上芦花鸡", "prevalence": "uncommon"},
    {"id": "damaigu", "zh": "大骨鸡", "prevalence": "uncommon"},
    {"id": "baierhuang", "zh": "白耳黄鸡", "prevalence": "uncommon"},
]


def dump(catalog: dict, filename: str) -> None:
    path = OUT / filename
    text = json.dumps(catalog, ensure_ascii=False, indent=2)
    path.write_text(text + "\n", encoding="utf-8")
    print(f"wrote {path.relative_to(ROOT)} ({len(catalog['breeds'])} breeds)")


def main() -> None:
    print("fetching Wikidata…")
    wd_dog = fetch_class(QUERIES["dog"])
    wd_cat = fetch_class(QUERIES["cat"])
    wd_cattle = fetch_class(QUERIES["cattle"])
    wd_chicken = fetch_class(QUERIES["chicken"])
    wd_horse = fetch_class(QUERIES["horse"])
    print(
        f"wd dog={len(wd_dog)} cat={len(wd_cat)} cattle={len(wd_cattle)} "
        f"chicken={len(wd_chicken)} horse={len(wd_horse)}"
    )

    dog = load_existing("dog")
    dog["breeds"] = merge_wd(dog.get("breeds") or [], wd_dog)
    dump(dog, "dog.json")

    cat = load_existing("cat")
    cat["breeds"] = merge_wd(cat.get("breeds") or [], wd_cat)
    dump(cat, "cat.json")

    chicken = load_existing("chicken")
    chicken["breeds"] = merge_wd(chicken.get("breeds") or [], wd_chicken)
    chicken["breeds"] = add_listed(chicken["breeds"], CHICKEN_LISTED)
    dump(chicken, "chicken.json")

    cow_path = OUT / "cow.json"
    if cow_path.exists():
        cow = json.loads(cow_path.read_text(encoding="utf-8"))
    else:
        cow = {
            "id": "cow",
            "taxonKey": "Bos taurus",
            "taxonKeys": ["Bos taurus", "Bos indicus"],
            "commonNameZh": "家牛",
            "source": "wikidata + 国家级畜禽遗传资源保护名录（牛，摘录常见）",
            "breeds": [],
        }
    cow["taxonKeys"] = ["Bos taurus", "Bos indicus"]
    cow["commonNameZh"] = "家牛"
    cow["breeds"] = merge_wd(cow.get("breeds") or [], wd_cattle)
    cow["breeds"] = add_listed(cow["breeds"], CATTLE_LISTED)
    dump(cow, "cow.json")

    horse_path = OUT / "horse.json"
    if horse_path.exists():
        horse = json.loads(horse_path.read_text(encoding="utf-8"))
    else:
        horse = {
            "id": "horse",
            "taxonKey": "Equus caballus",
            "commonNameZh": "家马",
            "source": "wikidata horse breed (Q1160573)",
            "breeds": [],
        }
    horse["breeds"] = merge_wd(horse.get("breeds") or [], wd_horse)
    dump(horse, "horse.json")


if __name__ == "__main__":
    os.chdir(ROOT)
    main()
