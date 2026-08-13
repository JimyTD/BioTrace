# 壳静态美术

按皮肤：`daylight/`、（未来）`tide/`。

顶栏 / 底栏的骨架在 `styles.css`（固定高、四项文字、主区单独滚动）。**没有图也能用**：纯 `--nav-bg`。

| 文件 | 类型 | 职责 |
|------|------|------|
| `nav-texture.png` | 可选平铺 | 顶栏与底栏纸纹。未放文件时皮肤 token `--nav-texture: none` |

约束：

- 不要把邮戳、Tab 图标、文案画进这张图；点击热区与四项路由不变
- 有文件后再把对应皮肤的 `--nav-texture` 设为 `url(...)`（经 `themes/shellAssets` 的路径约定，禁止页面写死 `/shell/daylight/`）
