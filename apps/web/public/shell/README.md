# 壳静态美术

按皮肤：目前只有 `daylight/`（文件已备，`--page-texture` 仍是 `none`）。`clear` 故意不铺纸纹，不声明 `shell` 域。

顶栏 / 底栏的骨架在 `styles.css`（固定高、四项文字、主区单独滚动）。日常页氛围走 `--bg-atmosphere`，不是页面里的纯色 hex。

| 文件 | 类型 | 职责 |
|------|------|------|
| `page-texture.jpg` | 可选整幅衬纸 | 默认不用。日常页用 `--bg-atmosphere`，避免整页贴纸照片 |

约束：

- 不要把邮戳、Tab 图标、文案画进这张图；点击热区与四项路由不变
- 路径写在对应 `themes/<id>.css`，禁止页面写死 `/shell/daylight/`
