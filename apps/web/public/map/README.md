# 内置简图（天地图失败时的最终回落）

- `ne_50m_countries_chn_pov.geojson`：基于 Natural Earth 1:50m Admin-0 Countries（公有领域，约 2.2MB），已将台湾并入中国几何（China POV），**无国名注记层**。
- 样式见 `apps/web/src/map/style.ts` 的 `SIMPLE_STYLE`：陆地填色 + 国界线。
- 质量刻意降级：无街道、无 POI、无文字标签；观察点与补标功能仍完整。
