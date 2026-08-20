"""Parse the 2023 三有名录 from the Zhongshan text-PDF reprint. Do not invent rows."""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1] / "data" / "cn-sanyou"
PDF_OFFICIAL = ROOT / "govcn-2023.pdf"
PDF_TEXT = ROOT / "zs-reprint.pdf"
OUT = ROOT / "list.json"

ANNOUNCED = {
    "total": 1924,
    "mammal": 91,
    "bird": 1028,
    "reptile": 450,
    "amphibian": 253,
    "insect": 96,
    "arachnid": 2,
    "oligochaete": 4,
}

CLASS_RE = re.compile(
    r"(哺乳纲|兽纲|鸟纲|爬行纲|两栖纲|昆虫纲|蛛形纲|寡毛纲)",
)
# Ext A（䗛 等）必须算进中文名，否则昆虫会少 9 种、鸟类会少约 20 种。
HAN = r"[\u3400-\u9fff（）()·\-]"
ENTRY_RE = re.compile(
    rf"(?<![A-Za-z0-9])(\d{{1,4}})\s+"
    rf"({HAN}+?)\s+"
    rf"([A-Z][a-z]+(?:\s+[a-z]+){{1,3}})"
)
SYN_RE = re.compile(
    r"原拉丁学名\s+([A-Z][a-z]+(?:\s+[a-z]+){1,2})|"
    r"原拉丁名\s+([A-Z][a-z]+(?:\s+[a-z]+){1,2})|"
    r"原名\s+([A-Z][a-z]+(?:\s+[a-z]+){1,2})"
)
CLASS_MAP = {
    "哺乳纲": "mammal",
    "兽纲": "mammal",
    "鸟纲": "bird",
    "爬行纲": "reptile",
    "两栖纲": "amphibian",
    "昆虫纲": "insect",
    "蛛形纲": "arachnid",
    "寡毛纲": "oligochaete",
}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


def extract_text(path: Path) -> str:
    reader = PdfReader(str(path))
    return "\n".join((page.extract_text() or "") for page in reader.pages)


def parse(text: str) -> list[dict]:
    # Flatten hyphenated line breaks in Latin names: "Hemiechinus \ndauuricus"
    flat = re.sub(r"([A-Za-z])\s*\n\s*([a-z])", r"\1 \2", text)
    flat = re.sub(r"[ \t]+", " ", flat)

    rows: list[dict] = []
    seen: set[str] = set()
    current = "mammal"
    tokens = []
    for m in CLASS_RE.finditer(flat):
        tokens.append(("class", m.start(), m.group(1)))
    for m in ENTRY_RE.finditer(flat):
        tokens.append(("entry", m.start(), m))
    tokens.sort(key=lambda t: t[1])

    for kind, _, payload in tokens:
        if kind == "class":
            current = CLASS_MAP[payload]
            continue
        m = payload
        zh = re.sub(r"\s+", "", m.group(2))
        sci = re.sub(r"\s+", " ", m.group(3)).strip()
        if zh in {"目", "科", "种", "纲"}:
            continue
        key = f"{current}|{sci.lower()}"
        if key in seen:
            continue
        seen.add(key)
        row = {
            "zh": zh,
            "scientificName": sci,
            "kind": "taxon" if re.search(r"\bspp\.?$", sci, flags=re.I) else "species",
            "group": current,
            "aliases": [],
            "notes": "",
        }
        rows.append(row)

    for i, row in enumerate(rows):
        start = flat.lower().find(row["scientificName"].lower())
        if start < 0:
            continue
        start += len(row["scientificName"])
        if i + 1 < len(rows):
            nxt = flat.lower().find(rows[i + 1]["scientificName"].lower(), start)
            chunk = flat[start:nxt] if nxt > 0 else flat[start : start + 200]
        else:
            chunk = flat[start : start + 240]
        aliases: list[str] = []
        for sm in SYN_RE.finditer(chunk):
            alias = next(g for g in sm.groups() if g)
            alias = re.sub(r"\s+", " ", alias).strip()
            if alias.lower() != row["scientificName"].lower() and alias not in aliases:
                aliases.append(alias)
        flags = []
        if "仅限野外种群" in chunk:
            flags.append("仅限野外种群")
        row["aliases"] = aliases
        row["notes"] = "；".join(flags)

    return rows


def main() -> None:
    text = extract_text(PDF_TEXT)
    entries = parse(text)
    by_group = {k: 0 for k in ANNOUNCED if k != "total"}
    for e in entries:
        by_group[e["group"]] = by_group.get(e["group"], 0) + 1

    payload = {
        "legal": {
            "title": "有重要生态、科学、社会价值的陆生野生动物名录",
            "instrument": "国家林业和草原局公告2023年第17号",
            "effective": "2023-06-26",
            "announcedTotals": ANNOUNCED,
        },
        "officialPdf": {
            "url": "https://www.gov.cn/zhengce/zhengceku/202307/P020230701333096616886.pdf",
            "page": "https://www.gov.cn/zhengce/zhengceku/202307/content_6889361.htm",
            "file": "govcn-2023.pdf",
            "sha256": sha256(PDF_OFFICIAL) if PDF_OFFICIAL.exists() else "",
            "bytes": PDF_OFFICIAL.stat().st_size if PDF_OFFICIAL.exists() else 0,
            "note": "中国政府网公告附件。扫描件，无内嵌文字。",
        },
        "machineReadable": {
            "url": "https://www.zs.gov.cn/zslyj/attachment/0/471/471942/2298649.pdf",
            "file": "zs-reprint.pdf",
            "publisher": "中山市林业局（转载2023年名录，可抽字）",
            "sha256": sha256(PDF_TEXT),
            "bytes": PDF_TEXT.stat().st_size,
            "note": "官方扫描件无法抽字，结构化行从此转载 PDF 解析，不是模型记忆生成。",
        },
        "parsed": {"n": len(entries), "byGroup": by_group},
        "entries": entries,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {OUT} n={len(entries)} byGroup={by_group}")
    if len(entries) != ANNOUNCED["total"]:
        print(f"WARNING expected {ANNOUNCED['total']}")
    for k, v in ANNOUNCED.items():
        if k == "total":
            continue
        if by_group.get(k) != v:
            print(f"WARNING {k} {by_group.get(k)} != {v}")


if __name__ == "__main__":
    main()
