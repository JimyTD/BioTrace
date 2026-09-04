"""给骨架缺中文的纲/目离线配中文名。

主源 Wikidata，补洞 iNaturalist。对齐：学名 + 阶元 + 界，对不上就空着。
已有 backboneZh.ts 条目不覆盖。

跑法：python scripts/fill-backbone-zh.py
  --wd-only    只跑 Wikidata
  --inat-only  只跑 iNat（读缓存里 Wikidata 没填上的）
  --merge      查完后写回 backboneZh.ts

中间结果：scripts/_cache/backbone-zh-fill.json（可续跑，不入库）
"""
from __future__ import annotations

import argparse
import json
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[1]
DOC_PATH = ROOT / "apps/web/src/data/backbone.json"
TS_PATH = ROOT / "apps/web/src/data/backboneZh.ts"
CACHE_PATH = ROOT / "scripts/_cache/backbone-zh-fill.json"

UA = "BioTrace/1.0 (offline taxonomy zh fill; non-profit)"
CTX = ssl.create_default_context()

INAT_KINGDOM = {
    "Animalia": 1,
    "Plantae": 47126,
    "Fungi": 47170,
    "Chromista": 48222,
    "Protozoa": 47686,
}
RANK_WD = {2: "class", 3: "order"}
RANK_INAT = {2: "class", 3: "order"}

try:
    from zhconv import convert as _zhconv

    def to_hans(s: str) -> str:
        return _zhconv(s, "zh-cn").strip()
except ImportError:
    _FALLBACK = str.maketrans({
        "綱": "纲", "亞": "亚", "類": "类", "種": "种", "屬": "属",
        "魚": "鱼", "鳥": "鸟", "蟲": "虫", "貝": "贝", "龜": "龟", "龍": "龙",
        "頭": "头", "齒": "齿", "鰓": "鳃", "鰭": "鳍", "鱗": "鳞", "殼": "壳",
        "葉": "叶", "莖": "茎", "華": "华", "蘭": "兰", "蘚": "藓",
        "蝦": "虾", "蟻": "蚁", "蠅": "蝇", "蠍": "蝎", "蝟": "猬",
        "貓": "猫", "萬": "万", "無": "无", "為": "为", "與": "与",
        "絲": "丝", "經": "经", "線": "线", "網": "网", "見": "见",
        "親": "亲", "語": "语", "說": "说", "貝": "贝", "長": "长",
        "門": "门", "開": "开", "間": "间", "關": "关", "陽": "阳", "陰": "阴",
        "隻": "只", "雞": "鸡", "鳴": "鸣", "鹽": "盐", "麥": "麦", "黃": "黄",
        "點": "点", "齒": "齿", "齡": "龄", "齊": "齐", "龜": "龟",
        "鯛": "鲷", "鯉": "鲤", "鯨": "鲸", "鯊": "鲨", "鰻": "鳗", "鯰": "鲇",
        "鱒": "鳟", "鱸": "鲈", "鱷": "鳄", "鷹": "鹰", "鷺": "鹭", "鷗": "鸥",
        "鶴": "鹤", "鸛": "鹳", "鸕": "鸬", "鶿": "鹚", "鵡": "鹉", "鸚": "鹦",
        "鴕": "鸵", "鴯": "鸸", "鶓": "鹋", "鶲": "鹟", "鶯": "莺", "鸝": "鹂",
        "鴷": "䴕", "䴕": "䴕",
    })

    def to_hans(s: str) -> str:
        return s.translate(_FALLBACK).strip()


def has_cjk(s: str) -> bool:
    return any("\u4e00" <= c <= "\u9fff" for c in s)


def get_json(url: str, timeout: int = 40, retries: int = 6) -> dict | list | None:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    wait = 2.0
    for i in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=timeout, context=CTX) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code in (429, 403) and i < retries - 1:
                print(f"    HTTP {e.code}，等 {wait:.0f}s", flush=True)
                time.sleep(wait)
                wait = min(90, wait * 2)
                continue
            print(f"    HTTP {e.code}: {url[:90]}", flush=True)
            return None
        except Exception as e:
            if i < retries - 1:
                time.sleep(wait)
                wait = min(30, wait * 1.5)
                continue
            print(f"    {type(e).__name__}: {e}", flush=True)
            return None
    return None


def load_existing() -> dict[str, str]:
    ts = TS_PATH.read_text("utf-8")
    return dict(re.findall(r'"(\d+:[A-Za-z]+)"\s*:\s*"([^"]+)"', ts))


def load_missing() -> list[dict]:
    doc = json.loads(DOC_PATH.read_text("utf-8"))
    F = {n: i for i, n in enumerate(doc["fields"])}
    have = load_existing()
    out = []
    for n in doc["nodes"]:
        rid = n[F["id"]]
        r = n[F["rank"]]
        if r not in (2, 3):
            continue
        if rid in have:
            continue
        out.append({
            "id": rid,
            "rank": r,
            "la": n[F["la"]],
            "kingdom": n[F["kingdom"]],
        })
    return out


def load_cache() -> dict:
    if CACHE_PATH.exists():
        return json.loads(CACHE_PATH.read_text("utf-8"))
    return {"wd": {}, "inat": {}, "skip": {}}


def save_cache(cache: dict) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=1), "utf-8")


def wd_sparql(names: list[str]) -> list[dict] | None:
    values = " ".join(f'"{n}"' for n in names)
    q = f"""
    SELECT ?sci ?zh ?rankEn ?kingdomSci ?item WHERE {{
      VALUES ?sci {{ {values} }}
      ?item wdt:P225 ?sci .
      ?item wdt:P105 ?rank .
      ?rank rdfs:label ?rankEn .
      FILTER(LANG(?rankEn) = "en")
      OPTIONAL {{ ?item rdfs:label ?zhHans . FILTER(LANG(?zhHans) = "zh-hans") }}
      OPTIONAL {{ ?item rdfs:label ?zhZh . FILTER(LANG(?zhZh) = "zh") }}
      BIND(COALESCE(?zhHans, ?zhZh) AS ?zh)
      OPTIONAL {{
        ?item wdt:P171 ?k .
        ?k wdt:P225 ?kingdomSci .
        VALUES ?kingdomSci {{ "Animalia" "Plantae" "Fungi" "Chromista" "Protozoa" }}
      }}
    }}
    """
    url = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode(
        {"query": q, "format": "json"}
    )
    d = get_json(url, timeout=60, retries=8)
    if not isinstance(d, dict) or "results" not in d:
        return None
    rows = []
    for b in d.get("results", {}).get("bindings", []):
        rows.append({
            "sci": b["sci"]["value"],
            "zh": b.get("zh", {}).get("value") or "",
            "rank": (b.get("rankEn", {}).get("value") or "").lower(),
            "kingdom": b.get("kingdomSci", {}).get("value") or "",
            "item": b.get("item", {}).get("value") or "",
        })
    return rows


def pick_wd(node: dict, rows: list[dict]) -> str | None:
    """同一条骨架节点：学名已由 SPARQL VALUES 限定。这里再卡阶元和界。"""
    want_rank = RANK_WD[node["rank"]]
    want_k = node["kingdom"]
    cands = [r for r in rows if r["sci"] == node["la"] and r["rank"] == want_rank]
    # 去重（SPARQL 因多个 kingdom 路径会重复）
    uniq: dict[str, dict] = {}
    for r in cands:
        key = r["item"] or (r["zh"] + r["kingdom"])
        prev = uniq.get(key)
        if not prev:
            uniq[key] = r
            continue
        # 合并 kingdom：有匹配界的优先留下
        if r["kingdom"] == want_k:
            uniq[key] = r
    cands = list(uniq.values())
    if not cands:
        return None
    with_k = [r for r in cands if r["kingdom"] == want_k]
    pool = with_k if with_k else cands
    zhs = []
    for r in pool:
        zh = to_hans(r["zh"])
        if zh and has_cjk(zh) and zh.lower() != node["la"].lower():
            zhs.append(zh)
    zhs = list(dict.fromkeys(zhs))
    if len(zhs) == 1:
        return zhs[0]
    return None


def fill_wikidata(missing: list[dict], cache: dict) -> None:
    pending = [n for n in missing if n["id"] not in cache["wd"] and n["id"] not in cache["skip"]]
    print(f"Wikidata 待查 {len(pending)} / 缺名 {len(missing)}", flush=True)
    batch = 28
    for i in range(0, len(pending), batch):
        chunk = pending[i : i + batch]
        names = [n["la"] for n in chunk]
        print(f"  SPARQL {i+1}-{i+len(chunk)}/{len(pending)}", flush=True)
        rows = wd_sparql(names)
        if rows is None:
            time.sleep(4)
            rows = []
            failed = False
            for n in chunk:
                one = wd_sparql([n["la"]])
                if one is None:
                    failed = True
                    break
                rows.extend(one)
                time.sleep(1.2)
            if failed:
                print("  本批请求失败，留下下次续跑", flush=True)
                save_cache(cache)
                time.sleep(8)
                continue
        by_la = defaultdict(list)
        for r in rows:
            by_la[r["sci"]].append(r)
        for n in chunk:
            zh = pick_wd(n, by_la.get(n["la"], []))
            if zh:
                cache["wd"][n["id"]] = {
                    "zh": zh, "la": n["la"], "rank": n["rank"], "kingdom": n["kingdom"], "src": "wikidata",
                }
            else:
                cache["skip"][n["id"]] = {"la": n["la"], "reason": "wd-miss"}
        save_cache(cache)
        time.sleep(1.2)
    hit = sum(1 for n in missing if n["id"] in cache["wd"])
    print(f"Wikidata 命中 {hit}/{len(missing)}", flush=True)


def inat_lookup(la: str) -> list[dict]:
    q = urllib.parse.urlencode({"q": la, "locale": "zh-CN", "per_page": 8})
    d = get_json(f"https://api.inaturalist.org/v1/taxa?{q}", timeout=25, retries=4)
    if not isinstance(d, dict):
        return []
    return d.get("results") or []


def pick_inat(node: dict, results: list[dict]) -> str | None:
    want_rank = RANK_INAT[node["rank"]]
    kid = INAT_KINGDOM.get(node["kingdom"])
    hits = []
    for it in results:
        if (it.get("name") or "").lower() != node["la"].lower():
            continue
        if (it.get("rank") or "").lower() != want_rank:
            continue
        anc = it.get("ancestor_ids") or []
        if kid is not None and kid not in anc and it.get("id") != kid:
            continue
        name = to_hans(str(it.get("preferred_common_name") or ""))
        if name and has_cjk(name) and name.lower() != node["la"].lower():
            hits.append(name)
    hits = list(dict.fromkeys(hits))
    if len(hits) != 1:
        return None
    return hits[0]


def fill_inat(missing: list[dict], cache: dict) -> None:
    pending = [
        n for n in missing
        if n["id"] not in cache["wd"] and n["id"] not in cache["inat"]
    ]
    print(f"iNat 补洞待查 {len(pending)}", flush=True)
    for i, n in enumerate(pending):
        if i % 20 == 0:
            print(f"  iNat {i+1}/{len(pending)}", flush=True)
        try:
            rows = inat_lookup(n["la"])
        except Exception as e:
            print(f"    {n['la']} {e}", flush=True)
            rows = []
        zh = pick_inat(n, rows)
        if zh:
            cache["inat"][n["id"]] = {
                "zh": zh, "la": n["la"], "rank": n["rank"], "kingdom": n["kingdom"], "src": "inat",
            }
        time.sleep(0.18)
        if i % 40 == 39:
            save_cache(cache)
    save_cache(cache)
    print(f"iNat 补上 {len(cache['inat'])}", flush=True)


def merge_ts(cache: dict) -> int:
    existing = load_existing()
    added: list[tuple[str, str, str]] = []
    for src in ("wd", "inat"):
        for nid, rec in cache.get(src, {}).items():
            if nid in existing:
                continue
            zh = rec["zh"]
            if not zh or not has_cjk(zh):
                continue
            if zh in existing.values():
                continue
            existing[nid] = zh
            added.append((nid, zh, rec["src"]))
    if not added:
        print("没有新条目可写", flush=True)
        return 0

    text = TS_PATH.read_text("utf-8")
    text = re.sub(
        r"\n  // ── 离线配表开始[\s\S]*?// ── 离线配表结束 ──\n",
        "\n",
        text,
        count=1,
    )
    added.sort(key=lambda x: (int(x[0].split(":")[0]), x[0]))
    lines = ["  // ── 离线配表开始（Wikidata 主源，iNat 补洞；不覆盖上手填）──"]
    last_rank = None
    for nid, zh, src in added:
        r = int(nid.split(":")[0])
        if r != last_rank:
            lines.append(f"  // rank {r} · {'纲' if r == 2 else '目'}")
            last_rank = r
        note = "" if src == "wikidata" else "  // iNat"
        lines.append(f'  "{nid}": {json.dumps(zh, ensure_ascii=False)},{note}')
    lines.append("  // ── 离线配表结束 ──")
    block = "\n".join(lines) + "\n"
    m = re.search(r"\};\r?\n\r?\n/\*\* 取骨架节点的显示名", text)
    if not m:
        raise SystemExit("找不到 BACKBONE_ZH 结束位置，拒绝改写")
    new = text[: m.start()] + block + text[m.start() :]
    TS_PATH.write_text(new, "utf-8")
    print(f"写入 {len(added)} 条（Wikidata {sum(1 for x in added if x[2]=='wikidata')}，iNat {sum(1 for x in added if x[2]=='inat')}）", flush=True)
    return len(added)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--wd-only", action="store_true")
    ap.add_argument("--inat-only", action="store_true")
    ap.add_argument("--merge-only", action="store_true", help="只把缓存写进 backboneZh.ts")
    ap.add_argument("--limit", type=int, default=0, help="只查前 N 个缺名，试跑用")
    args = ap.parse_args()

    missing = load_missing()
    if args.limit:
        missing = missing[: args.limit]
    print(f"缺中文 纲/目 {len(missing)}（已有表不重查）", flush=True)
    cache = load_cache()
    cache.setdefault("wd", {})
    cache.setdefault("inat", {})
    cache.setdefault("skip", {})

    if args.merge_only:
        merge_ts(cache)
        return

    if not args.inat_only:
        fill_wikidata(missing, cache)
    if not args.wd_only:
        fill_inat(missing, cache)


if __name__ == "__main__":
    main()
