#!/usr/bin/env python3
"""同图多模型生物识别对照测评。"""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
IMAGES = ROOT / "images"
PROMPTS = ROOT / "prompts"
RESULTS = ROOT / "results"
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".tif", ".tiff"}


def _dms_to_deg(values: Any, ref: str | None) -> float | None:
    """EXIF GPS DMS → 十进制度。"""
    try:
        deg, minutes, seconds = [float(x) for x in values]
    except (TypeError, ValueError):
        return None
    out = deg + minutes / 60.0 + seconds / 3600.0
    if ref in ("S", "W"):
        out = -out
    return out


def read_exif_meta(path: Path) -> dict[str, Any]:
    """从图片 EXIF 读取拍摄时间与 GPS（地名需另做逆地理，见 reverse_geocode）。"""
    from PIL import Image
    from PIL.ExifTags import GPSTAGS, TAGS

    meta: dict[str, Any] = {
        "lat": None,
        "lon": None,
        "date": None,
        "exif_datetime_raw": None,
        "has_gps": False,
    }
    try:
        with Image.open(path) as im:
            raw = im.getexif()
    except Exception as e:  # noqa: BLE001
        meta["exif_error"] = f"{type(e).__name__}: {e}"
        return meta

    if not raw:
        return meta

    # 扁平化主 IFD + GPS IFD
    tagged: dict[str, Any] = {}
    gps_tagged: dict[str, Any] = {}
    for tag_id, value in raw.items():
        name = TAGS.get(tag_id, str(tag_id))
        tagged[name] = value
    gps_ifd = raw.get_ifd(0x8825)  # GPSInfo
    if gps_ifd:
        for tag_id, value in gps_ifd.items():
            gps_tagged[GPSTAGS.get(tag_id, str(tag_id))] = value

    for key in ("DateTimeOriginal", "DateTimeDigitized", "DateTime"):
        if tagged.get(key):
            raw_dt = str(tagged[key])
            meta["exif_datetime_raw"] = raw_dt
            # EXIF 常见: "2024:08:01 12:34:56"
            try:
                dt = datetime.strptime(raw_dt, "%Y:%m:%d %H:%M:%S")
                meta["date"] = dt.strftime("%Y-%m-%d")
            except ValueError:
                meta["date"] = raw_dt
            break

    lat = _dms_to_deg(gps_tagged.get("GPSLatitude"), gps_tagged.get("GPSLatitudeRef"))
    lon = _dms_to_deg(gps_tagged.get("GPSLongitude"), gps_tagged.get("GPSLongitudeRef"))
    if lat is not None and lon is not None:
        meta["lat"] = round(lat, 6)
        meta["lon"] = round(lon, 6)
        meta["has_gps"] = True
    return meta


def reverse_geocode(lat: float, lon: float, timeout: float = 10.0) -> str | None:
    """用 OpenStreetMap Nominatim 把坐标变成可读地名（可选，需外网）。"""
    import httpx

    url = "https://nominatim.openstreetmap.org/reverse"
    headers = {"User-Agent": "BioTrace-model-bakeoff/0.1 (personal research)"}
    params = {
        "lat": lat,
        "lon": lon,
        "format": "jsonv2",
        "accept-language": "zh-CN,zh,en",
        "zoom": 12,
    }
    try:
        with httpx.Client(timeout=timeout, headers=headers) as client:
            r = client.get(url, params=params)
            r.raise_for_status()
            data = r.json()
        # 优先短展示名；没有则拼 address
        name = data.get("display_name")
        if isinstance(name, str) and name.strip():
            return name.strip()
        addr = data.get("address") or {}
        parts = [
            addr.get(k)
            for k in (
                "country",
                "state",
                "province",
                "city",
                "town",
                "village",
                "county",
                "suburb",
            )
            if addr.get(k)
        ]
        return " · ".join(parts) if parts else None
    except Exception as e:  # noqa: BLE001
        print(f"  [geocode fail] {type(e).__name__}: {e}")
        return None


def enrich_sample_from_exif(
    sample: dict[str, Any],
    image_path: Path,
    *,
    geocode: bool,
) -> dict[str, Any]:
    """
    地点/日期默认来自 EXIF。
    manifest 里若手写 lat/lon/date/place_name，仅作覆盖（一般不必填）。
    """
    s = dict(sample)
    exif = read_exif_meta(image_path)
    s["exif"] = exif

    if s.get("lat") is None and exif.get("lat") is not None:
        s["lat"] = exif["lat"]
    if s.get("lon") is None and exif.get("lon") is not None:
        s["lon"] = exif["lon"]
    if not s.get("date") and exif.get("date"):
        s["date"] = exif["date"]

    if not s.get("place_name") and geocode and s.get("lat") is not None and s.get("lon") is not None:
        place = reverse_geocode(float(s["lat"]), float(s["lon"]))
        if place:
            s["place_name"] = place
            s["place_name_source"] = "nominatim"
        time.sleep(1.1)  # Nominatim 礼貌限速
    elif s.get("place_name"):
        s["place_name_source"] = "manifest_override"
    else:
        s["place_name_source"] = "none"

    return s


def load_prompt(sample: dict[str, Any]) -> str:
    template = (PROMPTS / "identify.txt").read_text(encoding="utf-8")
    return template.format(
        place_name=sample.get("place_name") or "（未提供；仅用坐标若有）",
        lat=sample.get("lat") if sample.get("lat") is not None else "（未提供）",
        lon=sample.get("lon") if sample.get("lon") is not None else "（未提供）",
        date=sample.get("date") or "（未提供）",
    )


def image_bytes(path: Path) -> tuple[bytes, str]:
    data = path.read_bytes()
    mime, _ = mimetypes.guess_type(str(path))
    return data, mime or "image/jpeg"


def image_data_url(path: Path) -> str:
    data, mime = image_bytes(path)
    b64 = base64.standard_b64encode(data).decode("ascii")
    return f"data:{mime};base64,{b64}"


def extract_json(text: str) -> Any:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", text)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                pass
    return {"raw_text": text, "parse_error": True}


def configured_providers() -> list[str]:
    out: list[str] = []
    if os.getenv("GEMINI_API_KEY"):
        out.append("gemini")
    if os.getenv("ZHIPU_API_KEY"):
        out.append("zhipu")
    if os.getenv("ARK_API_KEY") and os.getenv("DOUBAO_MODEL"):
        out.append("doubao")
    if os.getenv("DASHSCOPE_API_KEY"):
        out.append("qwen")
    if os.getenv("OPENAI_API_KEY"):
        out.append("openai")
    if os.getenv("ANTHROPIC_API_KEY"):
        out.append("claude")
    return out


def call_openai_compatible(
    *,
    base_url: str,
    api_key: str,
    model: str,
    prompt: str,
    image_path: Path,
) -> str:
    from openai import OpenAI

    client = OpenAI(api_key=api_key, base_url=base_url)
    resp = client.chat.completions.create(
        model=model,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {"url": image_data_url(image_path)},
                    },
                ],
            }
        ],
        temperature=0.1,
    )
    return resp.choices[0].message.content or ""


def call_gemini(prompt: str, image_path: Path) -> str:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    model = os.getenv("GEMINI_MODEL", "gemini-flash-latest")
    data, mime = image_bytes(image_path)
    resp = client.models.generate_content(
        model=model,
        contents=[
            types.Content(
                role="user",
                parts=[
                    types.Part.from_text(text=prompt),
                    types.Part.from_bytes(data=data, mime_type=mime),
                ],
            )
        ],
        config=types.GenerateContentConfig(temperature=0.1),
    )
    return resp.text or ""


def call_claude(prompt: str, image_path: Path) -> str:
    import anthropic

    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    model = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-5")
    data, mime = image_bytes(image_path)
    media = {
        "image/jpeg": "image/jpeg",
        "image/png": "image/png",
        "image/gif": "image/gif",
        "image/webp": "image/webp",
    }.get(mime, "image/jpeg")
    msg = client.messages.create(
        model=model,
        max_tokens=2048,
        temperature=0.1,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media,
                            "data": base64.standard_b64encode(data).decode("ascii"),
                        },
                    },
                    {"type": "text", "text": prompt},
                ],
            }
        ],
    )
    parts = [b.text for b in msg.content if getattr(b, "type", None) == "text"]
    return "\n".join(parts)


def run_provider(name: str, prompt: str, image_path: Path) -> dict[str, Any]:
    t0 = time.perf_counter()
    try:
        if name == "gemini":
            text = call_gemini(prompt, image_path)
            model = os.getenv("GEMINI_MODEL", "gemini-flash-latest")
        elif name == "zhipu":
            # 与 QQBotForFun 同源：OpenAI 兼容；海龟汤用文本 flash，识图用视觉 Flash
            text = call_openai_compatible(
                base_url=os.getenv(
                    "ZHIPU_BASE_URL", "https://open.bigmodel.cn/api/paas/v4"
                ),
                api_key=os.environ["ZHIPU_API_KEY"],
                model=os.getenv("ZHIPU_VL_MODEL", "glm-4v-flash"),
                prompt=prompt,
                image_path=image_path,
            )
            model = os.getenv("ZHIPU_VL_MODEL", "glm-4v-flash")
        elif name == "doubao":
            text = call_openai_compatible(
                base_url=os.getenv(
                    "ARK_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3"
                ),
                api_key=os.environ["ARK_API_KEY"],
                model=os.environ["DOUBAO_MODEL"],
                prompt=prompt,
                image_path=image_path,
            )
            model = os.environ["DOUBAO_MODEL"]
        elif name == "qwen":
            text = call_openai_compatible(
                base_url=os.getenv(
                    "DASHSCOPE_BASE_URL",
                    "https://dashscope.aliyuncs.com/compatible-mode/v1",
                ),
                api_key=os.environ["DASHSCOPE_API_KEY"],
                model=os.getenv("QWEN_VL_MODEL", "qwen-vl-plus"),
                prompt=prompt,
                image_path=image_path,
            )
            model = os.getenv("QWEN_VL_MODEL", "qwen-vl-plus")
        elif name == "openai":
            text = call_openai_compatible(
                base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
                api_key=os.environ["OPENAI_API_KEY"],
                model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
                prompt=prompt,
                image_path=image_path,
            )
            model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        elif name == "claude":
            text = call_claude(prompt, image_path)
            model = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-5")
        else:
            raise ValueError(f"unknown provider: {name}")
        elapsed = time.perf_counter() - t0
        return {
            "provider": name,
            "model": model,
            "ok": True,
            "latency_s": round(elapsed, 3),
            "raw_text": text,
            "parsed": extract_json(text),
        }
    except Exception as e:  # noqa: BLE001 — 测评要记下失败原因
        return {
            "provider": name,
            "model": None,
            "ok": False,
            "latency_s": round(time.perf_counter() - t0, 3),
            "error": f"{type(e).__name__}: {e}",
        }


def strip_place(sample: dict[str, Any]) -> dict[str, Any]:
    s = dict(sample)
    s["place_name"] = ""
    s["lat"] = None
    s["lon"] = None
    s["date"] = ""
    s["place_name_source"] = "stripped"
    return s


def discover_images() -> list[dict[str, Any]]:
    samples: list[dict[str, Any]] = []
    for p in sorted(IMAGES.rglob("*")):
        if not p.is_file() or p.suffix.lower() not in IMAGE_SUFFIXES:
            continue
        if p.name.lower().startswith("manifest"):
            continue
        rel = p.relative_to(IMAGES).as_posix()
        sid = p.stem
        samples.append({"id": sid, "path": rel})
    return samples


def load_manifest(path: Path | None) -> list[dict[str, Any]]:
    if path is None or not path.exists():
        samples = discover_images()
        if not samples:
            raise SystemExit(
                f"没有 manifest，且 {IMAGES} 下也没有图片。"
                "请把样张放进 images/。"
            )
        print(f"[auto] 未找到 manifest，按目录扫描到 {len(samples)} 张图")
        return samples
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    samples = data.get("samples") or []
    if not samples:
        raise SystemExit(f"manifest 无 samples: {path}")
    return samples


def main() -> None:
    parser = argparse.ArgumentParser(description="BioTrace 多模型识物对照")
    parser.add_argument(
        "--manifest",
        type=Path,
        default=IMAGES / "manifest.yaml",
        help="样张清单 YAML；不存在则扫描 images/",
    )
    parser.add_argument(
        "--providers",
        default="",
        help="逗号分隔，默认=已配置的全部。例: gemini,doubao,qwen",
    )
    parser.add_argument(
        "--modes",
        default="with_place,no_place",
        help="with_place,no_place 或其一",
    )
    parser.add_argument("--sample", default="", help="只跑某个 sample id")
    parser.add_argument(
        "--geocode",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="有 GPS 时用 Nominatim 逆地理得到地名（默认开，需外网）",
    )
    parser.add_argument(
        "--inspect-only",
        action="store_true",
        help="只读取并打印 EXIF/地名，不调用模型",
    )
    args = parser.parse_args()

    load_dotenv(ROOT / ".env")

    modes = [m.strip() for m in args.modes.split(",") if m.strip()]
    samples = load_manifest(args.manifest if args.manifest.exists() else None)
    if args.sample:
        samples = [s for s in samples if s.get("id") == args.sample]
        if not samples:
            raise SystemExit(f"找不到 sample id={args.sample}")

    # 先从 EXIF 补齐地点/日期
    enriched: list[dict[str, Any]] = []
    for sample in samples:
        img = IMAGES / sample["path"]
        if not img.exists():
            print(f"[skip] 图片不存在: {img}")
            continue
        s = enrich_sample_from_exif(sample, img, geocode=args.geocode)
        enriched.append(s)
        print(
            f"[exif] {s['id']}: date={s.get('date')} "
            f"lat={s.get('lat')} lon={s.get('lon')} "
            f"place={s.get('place_name') or '-'} "
            f"(source={s.get('place_name_source')})"
        )

    if args.inspect_only:
        out = ROOT / "results" / "exif_inspect.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(
            json.dumps(enriched, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"已写入 {out}")
        return

    providers = (
        [p.strip() for p in args.providers.split(",") if p.strip()]
        if args.providers
        else configured_providers()
    )
    if not providers:
        raise SystemExit(
            "未检测到任何 API Key。请复制 .env.example 为 .env 并填写。"
        )

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_dir = RESULTS / stamp
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "samples_enriched.json").write_text(
        json.dumps(enriched, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(f"providers: {providers}")
    print(f"modes: {modes}")
    print(f"samples: {[s.get('id') for s in enriched]}")
    print(f"output: {out_dir}")

    rows: list[dict[str, Any]] = []
    for sample in enriched:
        sid = sample["id"]
        img = IMAGES / sample["path"]
        for mode in modes:
            s = sample if mode == "with_place" else strip_place(sample)
            if mode == "with_place" and s.get("lat") is None and not s.get("place_name"):
                print(f"[note] {sid}: EXIF 无 GPS/地名，with_place 与无地点等价")
            prompt = load_prompt(s)
            for provider in providers:
                print(f"→ {sid} | {mode} | {provider} ...", flush=True)
                result = run_provider(provider, prompt, img)
                record = {
                    "sample_id": sid,
                    "mode": mode,
                    "image": sample["path"],
                    "expected_hint": sample.get("expected_hint") or "",
                    "exif": sample.get("exif"),
                    "place_used": {
                        "place_name": s.get("place_name") or None,
                        "place_name_source": s.get("place_name_source"),
                        "lat": s.get("lat"),
                        "lon": s.get("lon"),
                        "date": s.get("date") or None,
                    },
                    **result,
                }
                rows.append(record)
                status = "ok" if result.get("ok") else f"FAIL {result.get('error')}"
                print(f"  {status} ({result.get('latency_s')}s)")

    full_path = out_dir / "results.json"
    full_path.write_text(
        json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # 简表：便于肉眼扫
    summary = []
    for r in rows:
        p = r.get("parsed") or {}
        tax = p.get("taxonomy") or {}
        summary.append(
            {
                "sample_id": r["sample_id"],
                "mode": r["mode"],
                "provider": r["provider"],
                "model": r.get("model"),
                "ok": r.get("ok"),
                "latency_s": r.get("latency_s"),
                "common_name_zh": p.get("common_name_zh"),
                "scientific_name": p.get("scientific_name"),
                "genus": tax.get("genus") if isinstance(tax, dict) else None,
                "species": tax.get("species") if isinstance(tax, dict) else None,
                "finest_reliable_rank": p.get("finest_reliable_rank"),
                "confidence_0_to_1": p.get("confidence_0_to_1"),
                "error": r.get("error"),
            }
        )
    (out_dir / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # Markdown 表
    md = [
        "# Bakeoff summary",
        "",
        f"- time: `{stamp}`",
        f"- providers: `{', '.join(providers)}`",
        "",
        "| sample | mode | provider | genus/species | finest | conf | latency | ok |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for s in summary:
        gs = f"{s.get('genus') or '-'}/{s.get('species') or '-'}"
        md.append(
            f"| {s['sample_id']} | {s['mode']} | {s['provider']} | {gs} | "
            f"{s.get('finest_reliable_rank') or '-'} | {s.get('confidence_0_to_1')} | "
            f"{s.get('latency_s')} | {s.get('ok')} |"
        )
    (out_dir / "summary.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print(f"\n写完: {full_path}")
    print(f"摘要: {out_dir / 'summary.md'}")


if __name__ == "__main__":
    main()
