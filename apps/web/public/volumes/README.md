# 套册静态美术

按皮肤分目录：`daylight/`、`clear/`。`clear` 这批册皮是灯箱时期画的，改名沿用，见手册 §6.0。

**分层规范：** [`docs/features/套册美术分层.md`](../../../docs/features/套册美术分层.md)

- 册皮 / 仪式底：可为不透明整幅
- `stamp-frame.svg` / `seal-complete.svg`：透明叠层（章是引子，中心留白叠字，无纸垫）
- 叠层位图：绿幕 HSV 色键（`scripts/chroma_key_green.py`），勿对硬边壳用 rembg
