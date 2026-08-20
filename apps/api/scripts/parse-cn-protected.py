"""Parse the 2021 list from the Anhui association HTML reprint. Do not invent rows."""
from __future__ import annotations

import hashlib
import json
import re
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "data" / "cn-protected"
HTML = ROOT / "ahwca-2021.html"
PDF = ROOT / "govcn.pdf"
OUT = ROOT / "list.json"

LEVEL = {"一级": "class_i", "二级": "class_ii"}
SCI_RE = re.compile(
    r"\b((?:[A-Z][a-z]+|[A-Z]{3,})\s+(?:[a-z]+|spp\.))\b"
)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


def cell_text(td: str) -> str:
    t = re.sub(r"<[^>]+>", " ", td)
    t = unescape(t)
    t = t.replace("\xa0", " ").replace("&emsp;", " ").replace("&nbsp;", " ")
    return re.sub(r"\s+", " ", t).strip()


def parse() -> list[dict]:
    html = HTML.read_text(encoding="utf-8", errors="ignore")
    rows: list[dict] = []
    seen: set[str] = set()
    for tr in re.findall(r"<tr\b[^>]*>[\s\S]*?</tr>", html, flags=re.I):
        cells = [cell_text(td) for td in re.findall(r"<td\b[^>]*>[\s\S]*?</td>", tr, flags=re.I)]
        cells = [c for c in cells if c]
        if not cells:
            continue
        level = next((LEVEL[c] for c in cells if c in LEVEL), None)
        if not level:
            continue
        blob = " ".join(cells)
        sci_m = SCI_RE.search(blob)
        if not sci_m:
            continue
        sci = re.sub(r"\s+", " ", sci_m.group(1)).strip()
        sci = re.sub(r"\bspp\.?$", "spp.", sci, flags=re.I)
        zh = cells[0]
        zh = re.sub(r"^[\s*#]+", "", zh).strip()
        notes = ""
        for c in cells[1:]:
            if c in LEVEL or SCI_RE.fullmatch(c) or c == sci:
                continue
            if re.fullmatch(r"[IVⅠⅡ\s]+", c):
                continue
            notes = c
        key = sci.lower()
        if key in seen:
            continue
        seen.add(key)
        rows.append(
            {
                "zh": zh,
                "scientificName": sci,
                "level": level,
                "kind": "taxon" if re.search(r"\bspp\.?$", sci, flags=re.I) else "species",
                "notes": notes,
            }
        )
    return rows


def main() -> None:
    entries = parse()
    i = sum(1 for e in entries if e["level"] == "class_i")
    ii = sum(1 for e in entries if e["level"] == "class_ii")
    payload = {
        "legal": {
            "title": "国家重点保护野生动物名录",
            "instrument": "国家林业和草原局 农业农村部公告2021年第3号",
            "effective": "2021-02-01",
            "announcedTotals": {
                "speciesAndTaxa": "980种和8类",
                "classI": "234种和1类",
                "classII": "746种和7类",
            },
        },
        "officialPdf": {
            "url": "https://www.gov.cn/zhengce/2021-02/05/5727412/files/7bf5c0b21f554df497f370068f027ddb.pdf",
            "also": "https://www.forestry.gov.cn/html/main/main_5461/20210205122418860831352/file/20210205151950336764982.pdf",
            "file": "govcn.pdf",
            "sha256": sha256(PDF),
            "bytes": PDF.stat().st_size,
            "note": "中国政府网与林草局同一扫描件（哈希一致）。Ricoh 复印件，无内嵌文字。",
        },
        "machineReadable": {
            "url": "http://ahwca.org.cn/News/detial.aspx?category_id=120&id=220",
            "file": "ahwca-2021.html",
            "publisher": "安徽省野生动植物保护协会（转载2021年名录表格）",
            "note": "官方 PDF 无法抽字，结构化行从此转载页解析，不是模型记忆生成。",
        },
        "parsed": {"n": len(entries), "class_i": i, "class_ii": ii},
        "entries": entries,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {OUT} n={len(entries)} I={i} II={ii}")


if __name__ == "__main__":
    main()
