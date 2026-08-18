# 套册配置（与引擎分离）

> 产品 / 策展 / 当前目录总表：[`docs/features/旅行套册.md`](../../../../docs/features/旅行套册.md)

- 每个 `*.json`（非 `_` 前缀）= 一本套册；热加册只需加文件 + `packages/messages` 文案，**不必改 TypeScript**。
- 正式册：`intertidal`（潮间带）/ `urban_wild`（城市野趣）/ `woodland_edge`（林缘遇见）。
- `fixture-pipeline.json` 默认 `enabled: false`，仅开发验收用。
- 槽条件用拉丁科/目/纲名单（见各 JSON）；文案在 `packages/messages`。

## 槽规则（当前 DSL）

```json
{
  "type": "taxonomy_in",
  "rank": "order",
  "names": ["Passeriformes"],
  "minReliableRank": "order"
}
```

- `rank`：在观察 taxonomy 的该阶元上匹配 `names`（拉丁名，大小写不敏感）。
- `minReliableRank`：`finest_reliable_rank` 至少要细到这一级才判定（防过粗误点亮）。

## 匹配前 GBIF 锚定

开包推进套册前，会把 AI taxonomy **临时**锚定到 GBIF Backbone（不改写观察的 taxonomy 字段；结算写入的 `taxonKey` 是另一条路径，见 [`SPEC.md`](../../../../docs/SPEC.md) §3.3）：

1. 按可靠阶元从细到粗尝试：`species → genus → family → order`
2. 走 `/species/match`（只传 name+rank；**不**传 AI 高阶分类，避免错科否决模糊命中）；接受 `EXACT` / `FUZZY` / `HIGHERRANK`，`confidence ≥ 80`
3. 命中后用返回的标准科/目/属/种对槽；失败或 `GBIF_ENABLED=0` 时回退 AI 原文

种名差 1～2 字母通常能纠；**仅**科/目写错且无可用种/属时，GBIF 往往救不了。
