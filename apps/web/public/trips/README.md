# 旅途静态美术

按皮肤：`daylight/`、`clear/`。

| 文件 | 类型 | 职责 |
|------|------|------|
| `cover-frame.svg` | 透明几何 | 列表封面外框（**仅中心透明**，边垫须可见） |
| `film-frame.svg` | 透明几何 | 相册格齿孔相框（内窗 8% inset） |

氛围整幅空态图（`*-empty.jpg`）已不再接入页面——空态用文案 + 纸色垫底即可。  
代码经 `themes/tripAssets` helper 引用；禁止页面写死 `/trips/daylight/`。
