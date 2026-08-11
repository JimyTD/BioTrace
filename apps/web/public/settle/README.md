# 单开包静态美术

按皮肤：`daylight/`、（未来）`tide/`。

| 文件 | 类型 | 职责 |
|------|------|------|
| `pack-sealed.png` | RGBA 色键 | 封缄外壳叠层（外缘+卡心窗透明） |
| `pack-bg.png` | 不透明整幅 | 揭示/展出纸感底 |
| `photo-frame.svg` | 透明矢量 | 几何相框 |
| `rarity-seal.svg` | 透明矢量 mask | 常规稀有度火漆引子 |
| `rarity-seal-xr.svg` | 透明矢量 mask | XR 六角异形章 |

叠层禁止带纸色底垫。位图：绿幕 `#00FF00` → `python scripts/chroma_key_green.py`（勿对硬边壳用 rembg）。  
**预览**：打开同目录 [`preview.html`](./preview.html)（静态页，见手册 §7.2）。  
规范：`docs/features/套册美术分层.md` §7。
