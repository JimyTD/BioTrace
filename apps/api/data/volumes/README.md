# 套册配置（与引擎分离）

- 每个 `*.json`（非 `_` 前缀）= 一本套册；热加册只需加文件 + `packages/messages` 文案，**不必改 TypeScript**。
- 正式册：`intertidal` / `urban_wild` / `woodland_edge`（可继续追加 JSON）。
- `fixture-pipeline.json` 默认 `enabled: false`，仅开发验收用。

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
