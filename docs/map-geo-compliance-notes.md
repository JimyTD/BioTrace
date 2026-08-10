# 地图与国别判定：合规与选型笔记

> 临时工作文档。记录已确认的事实、待决方案、待核实项。  
> 起因：地图页台湾岛被标为国家级大字标注（字号与其他国家同级）。  
> 状态：**评估中，尚未动手改任何地图/国别相关代码。**

---

## 一、这是两个独立问题，不要混

| | 问题 | 数据来源 | 影响 |
|---|---|---|---|
| **P1** | 地图上台湾被标成国家级要素（大字、与他国同级字号） | OpenFreeMap 瓦片（OSM 数据），**第三方** | 显示层。用户可见的观感与合规问题 |
| **P2** | 后端把首尔/河内/新德里等判成 `CN` | `apps/api/src/settle/country.ts` 里 **手写的 23 个 bbox**，无任何数据源 | 计算层。稀有度与引入种告警在海外全错 |

**换底图只解决 P1，一行都碰不到 P2。**
P1 是第三方数据问题；P2 是我们自己从没做完的功能（原注释自称`Good enough for Cut 2 seed alerts`）。

---

## 二、P1 已确认事实

底图配置只有一处：

```
apps/web/src/pages/MapPage.tsx:8
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
```

- MapLibre GL 只是渲染引擎，不含地理数据，**换渲染库不解决任何问题**
- OpenFreeMap **只提供瓦片与 style，没有任何地理编码/逆地理编码接口**（已确认）。用它就必须自己解决 P2
- 其他 OSM 依赖：`model-bakeoff/run_bakeoff.py` 用 Nominatim 逆地理（本地研究脚本，不随产品分发，风险低，但产品里不要用）
- ~~`docs/assets/map-samples/openfreemap-look.html`（内部视觉样张）~~ —— **已于 2026-08-10 删除**：展示的是已被推翻的方案，且该页面本身即呈现着不合规的台湾标注

---

## 三、P2 已确认事实

```
apps/api/src/settle/country.ts
  第5 行注释：Rough boxes; first match wins — order more specific regions before large ones if needed.
  第 7 行：{ code: "CN", minLat: 18.0, maxLat: 53.6, minLng: 73.5, maxLng: 135.1 }   ← 排在第一位
  第 10 行：{ code: "TW", ... }   ← 我们自己手写的，不是任何数据集带来的
```

**CN 的 bbox 覆盖了大量邻国，而它排第一 + first-match-wins**，实测错误：

| 地点 | 现在返回 | 应为 |
|---|---|---|
| 首尔 37.57, 126.98 | CN | KR |
| 福冈 33.59, 130.40 | CN | JP |
| 河内 21.03, 105.85 | CN | VN |
| 清迈 18.79, 98.99 | CN | TH |
| 新德里 28.61, 77.21 | CN | IN |
| 新加坡 1.35, 103.82 | MY | SG |

- `KR` / `VN` / `TW` / `SG` 四条规则**永远命中不到，是死代码**
- 台北目前返回 `CN`，结果合规，但是**靠 bbox 遮挡这个 bug 兜住的**，不是正确实现。谁调整数组顺序就会当场暴露
- 为什么只有 23 个国家：引入种名录按国家组织（`introduced-index.json` 的 `byCountry`），这张表只需覆盖名录里有的国家，是配套的最小实现

### 影响链路

`countryFromLatLng` → `observations.country_code` → 同时喂给：
- `resolveRarity`（且`rarity_cache` 的缓存键含 countryCode）
- `resolveIntroducedAlert`（种级+ 国家，命中该国公开引入/关注名录）

后果：在河内拍的照片，拿**中国的**引入种名录去判定；稀有度也按错误国别计算。

### 存量数据也脏了 —— 但**已决定全清空，不做迁移**

数据库是单个 SQLite 文件（本地 `data/biotrace.db`，仅 110KB；服务器为 docker 卷 `./data:/data`），表由 `db/index.ts` 的 `migrate()` 在 API 启动时自动重建。

**项目所有者确认：服务器上无需保留的数据，可全部清空。**因此不写任何数据迁移脚本——删库重启即可，新逻辑从第一条记录起就是正确的。

---

## 四、服务商评估

### 硬约束：能否把瓦片喂给 MapLibre

| 服务 | 可直接接 MapLibre | 说明 |
|---|---|---|
| **天地图** | **可以** | 官方即 OGC WMTS 标准服务（官方文档确认） |
| 高德 | 通常不允许 | 条款要求走自家 JS SDK；改用它等于重写地图页 |
| 腾讯位置服务 | 同上，需核对条款 | 同上 |
| OpenFreeMap | 可以 | 但数据不合规 |

**若要保留 MapLibre，天地图基本是唯一合规且条款允许的选项。**

### 天地图（官方文档已确认部分）

- 瓦片：`https://t{0-7}.tianditu.gov.cn/vec_w/wmts?tk=KEY`（矢量底图）+ `cva_w`（中文注记），两层raster 叠加
- **必须用 `_w` 后缀**（球面墨卡托EPSG:3857，与 MapLibre 默认一致）；`_c` 是经纬度投影，接进去会错位
- Web 服务 API **包含逆地理编码查询与行政区划查询** → 可同时解决 P2，不必自建边界数据
- 坐标系为 CGCS2000，与 WGS-84 民用精度下差异可忽略 → **EXIF 坐标可直接用，无需 GCJ-02 转换**（高德/腾讯必须转）
- 对个人/企业开发者有调用配额，控制台可申请升级

### 待核实项（以下为第三方文章说法，**必须在控制台/官方条款核对**）

- 天地图「个人 Key 仅限非商用」；商用日调用超阈值（某文称 1000 次/Key）需向**省级自然资源主管部门书面申请**
- 天地图超 50 QPS 需单独申请
- 高德 Web 服务按开发者类型 5 千 ~ 300 万次/月；QPS 提升包约 400~1500 元/月/10QPS
- 腾讯逆地址解析免费配额说法互相矛盾（个人 7000/日 vs 300万/日），且社区提到商业授权费用较高

### BioTrace 实际用量测算（费用风险在瓦片，不在 API）

- **逆地理编码**：每张照片 1 次，在异步 identify job 里做，可按坐标网格缓存。日活 100 人 × 10 张 ≈ **1000 次/日**，远低于任何免费额度
- **地图瓦片**：打开地图页一次约加载几十~上百瓦片。日活 100 人 × 2 次 × 80 瓦片 ≈ **16000 次/日**，比 API 调用高 1~2 个数量级

结论：**逆地理编码几乎不可能超额；要盯的是瓦片调用量和 QPS。**

---

## 五、方案选项

> **前提已明确**：本项目在可预见的未来**绝不商用**，git 上开源，将来最多开捐赠。
> 因此天地图「个人 Key 仅限非商用」不构成限制，商用审批流程也无需承担。捐赠一般不构成商业运营。
>
> **客观风险提示**：法规上「向公众提供地图服务」不以营利为要件，故非商用≠免责。当前（个人开源、自部署、无公开注册入口）实际风险低；**需重新评估的节点是上应用商店或开放公网注册时**。

### 关于「开源所以不能用需key 的服务」——此论证已被否决

本项目**本来就是自带 key 才能运行的架构**：`GEMINI_API_KEY` 未配置则识别功能完全不工作（见 `error.geminiKeyMissing`、`me.geminiMissing`），`deploy/` 下已有 env 模板。fork 者本就需自行申请 Gemini key，再多一个天地图 tk 属同类动作，边际成本几乎为零。key 从不进仓库，只在服务器 env。

### 成本性质对比（决定性）

| 方案 | 成本性质 |
|---|---|
| 天地图 | **一次性**：申请 tk、配 env |
| OpenFreeMap + style 补丁 | **永久**：上游 style 每次更新都需重新 patch，且只是遮住问题、不构成合规 |

用一次性成本换掉永久技术债 → **底图推荐天地图**。

### 两个功能对「降级」的容忍度不同（P1 与 P2 应分别选型）

- **底图缺 key** → 仅视觉降级，功能仍可用 → 可以依赖 key，OpenFreeMap 作为 `STYLE_URL` 默认回落值
- **国别判定缺 key** → 稀有度与引入种告警**直接算错/算不出**，属核心计算 → **不应挂在外部 key 与网络请求上**

### 最终形态：底图用天地图（可回落 OpenFreeMap），国别判定用离线数据

### 方案A：底图转天地图（**推荐**）

- 瓦片 → 天地图 `vec_w` + `cva_w`（必须 `_w` 后缀，EPSG:3857）
- 底图本身即合规版本，**无需维护任何 style 补丁**
- 无坐标系转换（CGCS2000 ≈ WGS-84，EXIF 坐标直接用）
- 非商用免费，个人 key 条款符合本项目
- `STYLE_URL` 环境变量化，未配 tk 时回落 OpenFreeMap
- 代价：视觉朴素（中文 POI 密度不如高德）、需申请一次 tk、界面需标注来源与审图号
- **注意**：其逆地理编码 API 虽可用于P2，但本项目 P2 决定走离线（理由见上节降级容忍度）

### 方案 B：OpenFreeMap 作为回落底图（不再是主方案）

- 保留为 `STYLE_URL` 默认值：未配 tk 时地图仍可显示，属合理降级而非崩溃
- **不再投入维护 style 补丁**——那是永久技术债，且只改观感、不构成合规
- 若某天确实需要在不合规底图上缓解观感：下载 liberty style JSON 存仓库后修改（可 diff、可 review，优于运行时 patch 图层），动手前须先探查图层结构，确认台湾标注所在 label 图层与判定字段
- 数据许可（开源项目需注意）：**Natural Earth 为公有领域 CC0**，适合进开源仓库
- Natural Earth 把台湾单列 → **构建期归一化把 TW/HK/MO 合并进 CN 是必须步骤**；做成脚本后，换任何数据源都会自动过一遍，不依赖人工记得

**仓库义务**

- README 写清底图数据源，并注明「部署到公网者需自行确认所在地的地图合规要求」，划清责任边界

### 方案 C：按区域切换

国内合规源 + 海外 OpenFreeMap，`STYLE_URL` 进环境变量。最灵活，维护两套。

---

## 六、定稿方案与待办

> 已拍板，不再讨论。

### 第 0 步：可行性验证 —— **已完成**

注册路径（备查）：

- 统一认证：`https://passport.tianditu.gov.cn/` —— **个人注册即可，无需营业执照**，需手机号 + 实名
- 开发者控制台：`https://lbs.tianditu.gov.cn/` → 应用管理 → 创建应用
- 主办单位：自然资源部；承办：国家基础地理信息中心

**需要两个 key，不是一个：**

| 用途 | key 类型 | 白名单 |
|---|---|---|
| 地图瓦片（P1，前端） | 浏览器端 | 配域名白名单；本项目 dev server 为 `127.0.0.1:5173` |
| 逆地理编码（P2，后端） | 服务端 | 不需要 |

**浏览器端 key 实测结论**

- 只校验 User-Agent 像不像浏览器，**不强制 Referer**（无 Referer 只带浏览器 UA也返回 PNG）
- 直接 curl（无浏览器 UA）被拒：`{"code":301012,"resolve":"Key权限类型为:浏览器端，请使用浏览器访问！"}`
- 后果：**key泄露后伪造 UA 即可用，配额仅 10000/日→ 视为敏感信息，定期轮换**
- **瓦片响应头`Cache-Control: max-age=432000`（5 天）** → 浏览器本地缓存期内重复访问不消耗配额，配额压力远低于预估

**服务端 key 与逆地理接口**

- `https://api.tianditu.gov.cn/geocoder?postStr={'lon':X,'lat':Y,'ver':1}&type=geocode&tk=KEY`
- `postStr` **必须百分号编码**，否则 `{"msg":"参数格式错误","status":400}`
- 取值字段：`result.addressComponent.nation`

**逆地理实测（决定性）**

| 坐标 | nation | province | 备注 |
|---|---|---|---|
| 北京 | 中国 | 北京市 | 境内详到街道；`province_code` 前缀 156 = ISO 数字码 |
| 台北 | **中国** | **台湾省** | `province_code: 156710000`，**官方数据天然合规** |
| 柏林 | 德国 | 空 | |
| 曼谷 | 泰国 | 空 | |
| 首尔 | 韩国 | 空 | |
| 纽约 | 美国 | 空 | |
| 河内 | 越南 | 空 | |
| 伦敦 | 英国 | 空 | |
| 太平洋海上 | **空字符串** | 空 | **`status:"0"`、`msg:"ok"`** —— 成功但无国家 |

**由此确定：**

1. **境外覆盖足够** → 采用**全局 API 优先**，不需要「国内 API、海外离线」的分区设计
2. 返回**中文常用简称**（美国/英国/韩国，非全称）→ 需建「中文国名 → ISO alpha-2」映射表；miss 时回落离线 PIP
3. 海上 = 成功但 `nation` 空 → **代码必须判空值，不能只看 status**；空值语义等同现有 `country_code = null` 降级路径
4. 台北 `nation` 即「中国」→ **API 路径无需归一化**；归一化只针对离线数据（Natural Earth 把台湾单列）

### P2 国别判定

- [x] 引入 Natural Earth **1:10m** 国界（CC0）。该精度陆地国界为百米级，边境城市市中心不会误判
- [x] ~~构建期归一化脚本~~ —— 改为**判定后归一化**：保留原多边形，判出 TW/HK/MO 由 `iso3166.ts`收敛为 CN，效果一致且省掉整套几何布尔运算
- [x] `countryFromLatLng` 改为点在多边形，删除手写的 23 个 bbox
- [x] **不做弃权逻辑**。数据精度足够，为百米级边界误差写弃权不值得；真出问题再议
- [x] **归一化单一出口**：API 与离线结果都经 `iso3166.ts` 转 ISO 码，`TW/HK/MO → CN` 只写这一处
- [x] `observations.country_source` 记来源，用于将来只重跑该重跑的记录
- [x] 单测：首尔、福冈、河内、清迈、新德里、新加坡、台北（`country:smoke`，22 例全绿）
- [x] ~~存量迁移~~ —— **已作废**：所有者确认数据可全清空，删库重启即可
- [x] ~~重跑 `alertIntroduced`~~ —— 同上，无存量需修

**P2 线上优先**

- [x] 天地图逆地理：**2 秒超时、失败立刻走离线、不重试**，同坐标网格缓存
- [x] 境外坐标返回质量已验证（柏林/曼谷/首尔/纽约/河内/伦敦均正常返回 nation）
- [x] 显式直连绕开 `setGlobalDispatcher` 装的出境代理

**P1 底图**

- [x] `STYLE_URL` 环境变量化（`VITE_TIANDITU_KEY`），未配置时回落 OpenFreeMap
- [x] 天地图 `vec_w` + `cva_w` 双 raster source（必须 `_w` = EPSG:3857）
- [x] **运行时失败回落**：瓦片累计失败 6 次即切OpenFreeMap，`console.warn` 留痕。对应 `docs/04f` §10.1「不能灰屏」这条硬约束——配额是硬墙，构建时判断救不了运行时失效
- [ ] **界面标注地图来源与审图号**（法规展示义务）—— **已确认延后处理**（2026-08-10）。审图号原文只能从天地图官方获取（官网页底/控制台使用规范），**不可自行编写**（伪造官方审核编号比不标更严重）。当前 attribution 只有平台名。
      对未上架、无公开注册入口的个人项目风险低；**上应用商店或开放公网注册前必须补齐**。落地时连同 `MapPage.tsx:13` 的硬编码一并搬进 `zh.ts` 走 `t()`（见下方「已知违规」）
- [x] README 注明底图数据源（两种 key 的区别、降级行为）与公网部署者的合规责任
- [x] ~~决定 `docs/assets/map-samples/openfreemap-look.html` 去留~~ —— **已删除**
- [x] **浏览器实测瓦片请求数**：首屏 18（vec 9 + cva 9），一轮典型浏览累计 64（各32）→ 约 300 次完整会话/日，余量充足，**不引入双底图**（见 `docs/04f` §12）
- [x] **运行时回落已实测通过**（2026-08-10，故意填无效 key）：403 出现后约 0.7 秒打出 warn、0.8 秒切到 OpenFreeMap出图，**无灰屏**；attribution 自动变为 `MapLibre | OpenFreeMap © OpenMapTiles Data from OpenStreetMap`。
      共观察到 18 次 403 —— 阈值 6 触发切换时，首屏另外 12 个请求已在飞行中，属预期而非缺陷

### 已知违规（待与审图号一并修）

`apps/web/src/pages/MapPage.tsx:13` 的 `TIANDITU_ATTRIBUTION` 是**用户可见文案**（地图右下角署名），却硬编码在业务代码里，违反 `.cursor/rules/messages-glossary.mdc`。同文件 `console.warn` 里的中文属规则明确的例外（开发者日志），无需处理。

**执行顺序**

1. ~~P2 离线路径 + 单测~~✅
2. ~~叠加天地图逆地理（线上优先）~~ ✅
3. ~~换底图~~ ✅（代码完成，待浏览器实测与审图号）
4. 清空数据库与 uploads（随下次部署一起做）
5. 收尾：审图号、README、瓦片请求数实测

**明确不做**

- ~~弃权逻辑~~ —— 换更准的数据而非调大阈值
- ~~为弃权新增文案~~ —— 不弃权就不存在
- ~~存省市粒度~~ —— 以后要做再说
- ~~维护 OpenFreeMap style 补丁~~ —— 永久技术债，OpenFreeMap 仅作回落值

---

## 七、本会话其他已完成/已知事项（防上下文丢失）

### 已完成：P1 底图切换（`apps/web`）

- `MapPage.tsx`：底图按 `VITE_TIANDITU_KEY` 切换（天地图 `vec_w`+`cva_w` 双层 raster，t0~t7 多子域），未配 key 回落 OpenFreeMap
- 省配额：`fitBounds` 的 `duration` 600 → **0**（原先飞行动画途经十来级 zoom，每级都拉一批瓦片）；缩放上限拆两档—— 自动定位 10/ 用户主动 14
- 新增 `src/vite-env.d.ts`（项目首次使用 `import.meta.env`）、`apps/web/.env.example`
- **未做**：延迟到数据加载后再用 `bounds` 初始化地图。初始 z=2 全球视图双层不到 20 个请求，收益不抵重构一个正常工作组件的风险
- **待办**：`TIANDITU_ATTRIBUTION` 里的审图号原文需从官方获取后填入

### 已完成：P2 离线国别判定（`apps/api`）

- 数据：`data/geo/countries-10m.topo.json`（3.5MB，world-atlas 10m TopoJSON，源自 Natural Earth，公有领域）。量化网格约 400m×190m
- 新增 `src/settle/geo/`：`iso3166.ts`（归一化单一出口）、`topojson.ts`（自写极小解码器，不引运行时依赖）、`pointInPolygon.ts`（射线法）、`offlineCountry.ts`（**懒加载**，线上路径健康时 3.5MB 不进内存）
- `settle/country.ts` 重写：23 个手写 bbox 全删，签名不变，`rules.ts` 无需改动
- **未做几何 union 合并台港澳**：保留原多边形，判出TW/HK/MO 后由归一化函数收敛为 CN，效果一致且省掉整套几何布尔运算
- 验证：`pnpm --filter @biotrace/api country:smoke` —— **22 个用例全绿，解码出 238 个国家**，含旧实现全错的六城+ 台港澳 +丹东/瑞丽边境 + 海上 null

### 已完成：P2 线上优先（天地图逆地理）

- 新增 `src/settle/geo/tiandituGeocode.ts`：2 秒超时、**失败不重试**、约 1.1km 网格缓存（上限 5000 条，超限整体清空）
- **必须显式直连**：`identify/gemini.ts` 用 `setGlobalDispatcher` 装了出境代理，若沿用全局 dispatcher，对天地图（国内服务）的请求会被绕去境外代理再回来。故本模块自建 `undici.Agent` 并显式传 `dispatcher`
- `settle/country.ts` 新增 `resolveCountry()`（线上优先 → 离线兜底，返回 `{ code, source }`）；同步的 `countryFromLatLng()` 保留为纯离线，供测试使用
- **「成功但无国家」与「调用失败」严格区分**：海上返回 `status:"0"` + nation 空字符串，属前者，直接采信 `null`而**不**触发离线兜底
- 落库来源：`observations.country_source`（`tianditu | offline | none`），schema + `ensureColumn` + `jobs/identify.ts` 三处写入均已接上
- 配置：`TIANDITU_SERVER_KEY`（**服务端** key，与前端瓦片的浏览器端 key 不可混用）；留空则只走离线，功能不受影响
- 验证：`pnpm --filter @biotrace/api geocode:smoke`（无 key 时自动只跑离线兜底那半段，不消耗配额）
  - 无 key：`no_key` → 首尔经离线兜底得 KR / source=offline ✅
  - 有 key：台北=CN、首尔=KR、柏林=DE、太平洋=null且 source 均为 tianditu、邻近点命中网格缓存不新增调用 ✅

### 存量数据：不迁移，直接清空（所有者已确认）

数据库就是一个 SQLite 文件，表由 `db/index.ts` 的 `migrate()` 在 API 启动时自动重建：

| 环境 | 位置 |
|---|---|
| 本地 | `data/biotrace.db`（默认值见 `apps/api/src/env.ts:14`），另有 `data/uploads/` |
| 服务器 | docker 卷 `./data:/data`，`DATABASE_URL=file:/data/biotrace.db` |

清空步骤：停API → 删 `biotrace.db` 与 `uploads/*` → 重启（表自动重建）。

`scripts/migrate-country-codes.mjs` 已删除，`country:migrate` 命令已从 `package.json` 移除。

**排查中曾给错、现已作废的两条方案**（留档避免重犯）：

1. ~~`UPDATE ... WHERE country_code IN ('TW','HK','MO')`~~ —— 这条 SQL 一行都影响不到：旧 BOXES 表里没有 HK/MO，TW 那条是死代码永不命中，库里不可能存在这三个值
2. ~~`DELETE FROM rarity_cache`~~ —— 缓存键是 `enc2|<countryCode>|<taxonKey>`，内容本身正确；country 变了只是去查另一个键，清掉等于白扔已花 GLM 调用算出的结果

### 新发现的 bug（未处理）

**`rarity/encounter.ts:140`**：`const country = input.countryCode?.trim() || "CN"` —— `countryCode` 为 null 时**默认按 CN 评稀有度**，而界面文案是「无定位时应用全球稀有度」。说的和做的不一致。

**已落地的文案改动**（`packages/messages/src/zh.ts`）：清除「开包/抽卡/揭开/分析中」等内部概念词；状态链路改为 `专家鉴定中 / 鉴定完成 / 已收录 / 未能认定 / 结论偏粗 / 不可收集`；结算页改为「鉴定证书 / 请过目 / 请稍候… / 收下 / 收录中…」；删除 `trips.metaTodo`、`album.analyzingHint` 两个 key 及其渲染；修 `identify_quota` 死 key（`apps/api/src/errors.ts` + `apps/web/src/identifyErrors.ts`）。

**已撤回的错误结论**：曾断言 `apps/api/scripts/smoke-volumes.mjs` 因 fixture `enabled:false` 必然在断言前退出、`slotMatches` 零测试覆盖。**这是误读**——该脚本第 12–18 行断言的是 `urban_wild / intertidal / woodland_edge` 三个正式册子，与 `fixture_pipeline` 无关。实测 `volumes:smoke` 退出码 0、六条用例全绿，一直是好的。

**文案分层重构**（terms 中性术语 / voice 人格文案 两层，支持主题替换与多版本）—— 已讨论，**暂缓**。
