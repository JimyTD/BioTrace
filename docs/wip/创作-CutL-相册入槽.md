# Cut L · 相册入槽（已接到正式页）

> **性质：施工备注，不是功能真源。** 通线与铁律见 [`创作-方案.md`](./创作-方案.md)。  
> 开始：2026-08-14。

## 这一刀

格子先在。新照片是**推进齿孔窗**，不是在格里 pop。待开包的格盖一层**纸封**，开包才是揭开。不是第二枚火漆。

## 观感

1. 进相册、刷新、轮询：已有格子不动。
2. 上传后新出现的 `observation.id`：照片从窗下 `translateY` 推进窗里（约 640ms）。窗 `overflow: hidden`，框不动。
3. `pending_settle`：窗上盖纸封（`--trip-pending-veil` + 纸纹），下沿留一条缝能看见照片。文案仍是「结论已经落笔。」
4. 安卓 / 网页同一套。减动时入槽收成直接到位，两端一样。

独立演示（须 **http 完整地址**）：[`apps/web/public/trips/slot-in-preview.html`](../../apps/web/public/trips/slot-in-preview.html)

## 不改

识图、稀有度、开包 inset、上传/删除逻辑。不为入槽给安卓做弱一档。
