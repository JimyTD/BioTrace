# BioTrace 实现与功能规格

> **本文件是功能真源**：已做 / 本期要做 / 明确后置。查「某能力做没做」以此为准。  
> 部署与线上现状看 [`OPS.md`](./OPS.md)；专题手册在 [`features/`](./features/)；当初的取舍理由在 [`planning/`](./planning/)。  
> 变更历史看 git log，本文不留手抄变更记录。  
> 更新日期：2026-08-20

## 0. 当前阶段

| 阶段 | 状态 | 说明 |
|------|------|------|
| Cut 1 / 1.1 | 已完成 | 旅途、识图、相册、地图、删除、详情、术语表（当时登录是临时假登录，见 Cut 5） |
| Cut 2 | 已完成 | 待开包 → 抽卡结算、图鉴、引入警示 UI |
| Cut 3 | 已收口 | 引入名录/识图韧性；稀有度 = 12 题原子量表 + 名录（§3.2），已接结算 |
| Cut 4 | 已上线 | 腾讯云轻量；手册 [`OPS.md`](./OPS.md) |
| Cut 5 | 已上线 | 邮箱+密码主路径（取代魔法链接）；Resend 仅用于找回码；持久会话；见 §5 |
| Cut 6 | 制品就绪 | Capacitor Android 侧载壳；手册 [`features/Android套壳.md`](./features/Android套壳.md) |
| 套册成就 | 引擎+三本内容已通 | 配置驱动；拓展手册 [`features/旅行套册.md`](./features/旅行套册.md) |
| 皮肤主题 | 已落地 | 默认 `daylight`；第二皮肤 `tide`（token + 资源槽）；手册 [`features/皮肤主题.md`](./features/皮肤主题.md) |
| 管理后台 | 已落地 | 独立登录；总览/用户/观察/平台密钥/存储/审计；手册 [`features/管理后台.md`](./features/管理后台.md) |
| 地图补标 | 已完成 | 详情准星补标；`PATCH …/location` 重算国别/引入/稀有度（见 §1.3） |
| 旅途元数据 | 已完成 | 列表/相册时间·地点摘要；自动聚合 + 可选手填覆盖（见 §1.5） |
| 识图护栏 | 已收口 | 账号日额度 + 自备 OpenAI 兼容 Key；手册 [`features/识图护栏.md`](./features/识图护栏.md) |
| 共享旅途 | 已收口 | 邀请码共享相册（≤10）；手册 [`features/共享旅途.md`](./features/共享旅途.md) |
| 后置 | 未做 | 全量灌库、iOS/上架；更多套册策展；好友/Feed |

本机：`pnpm.cmd dev` → Web `http://127.0.0.1:5173/` · API `http://127.0.0.1:8787`

---

## 1. 仓库与栈（已落地）

```text
apps/api     Hono + Drizzle + libsql(SQLite) + Gemini/TokenHub + sharp/exifr
apps/web     Vite + React + MapLibre
  src/themes/   皮肤主题（配色/字体/圆角；与流程页分离，见 §10）
  src/styles.css  结构与组件样式（只用语义 var(--*)）
apps/mobile  Capacitor Android 薄壳（WebView → 线上站点）
packages/messages   统一 UI/术语文案（默认 zh）
apps/api/data/      cn-protected / cn-sanyou / cn-extinct 名录 + introduced-index（GRIIS）/ introduced-seed（补丁）
apps/api/src/rarity/  稀有度主路径（12 题原子量表 + 名录 → scoreFromScale）
apps/api/src/identify/  识图编排（健康状态 / Gemini / TokenHub 视觉链回退）
data/        本地 DB 与 uploads（gitignore）
docs/        筹划 + 本实现规格
```

数据对象：`User` / `Trip` / `TripMember` / `Observation` / `CollectionEntry` / `SharedCollectionCredit` / `rarity_cache`。

**表现层三分离（加功能时勿搅在一起）：**

| 层 | 职责 | 位置 |
|----|------|------|
| 文案 | 用户可见句子 / 术语 | `packages/messages` |
| 皮肤 | 色、字、圆角、氛围底、稀有度徽章色 | `apps/web/src/themes/` |
| 流程 UI | 路由、状态、上传/开包等交互结构 | `apps/web/src/pages/` + `styles.css` 的 class |

---

## 1.1 识图韧性

- **串行队列**（默认 concurrency=1），避免免费层被并行打爆。
- **Gemini 健康态**（进程内）：短限流 → 保持 `analyzing` 等待（≤90s）再试；瞬时 5xx/503 → 冷却约 20s 再试 **1 次**；日额耗尽/长冷却 → **切 TokenHub 视觉链**（同一把 `TOKENHUB_API_KEY`，只换模型名：`glm-5v-turbo` → `kimi-k2.6` → `hy-vision-2.0-instruct`）。编排：[`orchestrator.ts`](../apps/api/src/identify/orchestrator.ts)；链：[`vl-chain.ts`](../apps/api/src/identify/vl-chain.ts)。
- 观察记下 `identify_provider`（`gemini` / `tokenhub`）和真正出货的 `identify_model`。
- 两侧都不可用才 `failed`，文案温和（不提配额/账单）。
- `/api/health` 可看 Gemini、TokenHub 配置与冷却状态。平台识图**不再走智谱**。

## 1.2 识图合格性闸门

在开包 / 稀有度 / 图鉴之前拦截「不是现场活体生物」的结果（书、人、玩具、卡通等）。

- Prompt 要求模型声明 `subject_kind` / `subject_living` / `eligibility`；代码：[`eligibility.ts`](../apps/api/src/identify/eligibility.ts)。
- **可收集**：`living_organism` 且活体（含饲养/动物园）。
- **不可收集**：人、玩具/模型、影像/印刷形象、无生物、不明；写 `failed` + 分型码，**清空**俗名/学名/taxonomy/稀有度/`taxonKey`/`accepted_taxonomy_json`，不开包、不进图鉴。
- 用户主文案（术语表）：**「东西是真的，但没用。」**（`error.identifyNotCollectible`）+ 副句换活体照片；徽章「不可收集」。
- 过粗（真生物但粗于科）仍用 `identify_too_coarse`。
- 详情可点进：不合格不渲染分类链，不因脏字段报错。

验收：书 / 卡通人 / 玩具熊 → 不可收集 + 梗句 + 无分类；真鸟可开包；过粗仍「未理想识别」。

## 1.3 无 GPS 地图补标（已收口）

照片无 EXIF GPS 时，事后在地图补点；**不挡上传/识图**（维持 planning/05 B.6）；**不重跑识图**。

- **API**：`PATCH /api/observations/:id/location`，body `{ lat, lng }`（有限、纬 ±90、经 ±180）。写坐标后，若已有 `finestReliableRank` 则复用 `computeSettle` 重算 `countryCode` / `countrySource` / `locationPrecise` / `alertIntroduced` / `rarity`（及 settle 同类字段）；**不改** `status`、不开包、不 `enqueueIdentify`。已 `settled` 时 `upsertCollectionFromObservation` 刷新图鉴档位。
- **analyzing 竞态**：允许补标只写坐标；[`jobs/identify.ts`](../apps/api/src/jobs/identify.ts) 在 `computeSettle` 前再读库内最新 lat/lng（Prompt 仍可用上传闭包坐标）。
- **UI**：观察详情大图在上；名字 / 学名 / 稀有度徽章（色底）/ 简介 / 分类 / 记录（时间、位置、鉴定、坐标）均展开；重识别与删除沉底。「设位置 / 改位置」→ `/observations/:id/pin`；**挪地图 + 中心准星 +「确认此处」**（不手打地址）。足迹图 `/map` 底图铺满主区，选中为底部条（图+名，点进详情），不在地图上弹卡。天地图审图号与 attribution 留在图面右下角。底图与足迹图共用 [`map/style.ts`](../apps/web/src/map/style.ts)（缩放上限；瓦片失败：备用天地图 key → 内置简图）。
- **文案**：`detail.setLocation` 等，均在 `packages/messages`。

验收：无 GPS 可识图开包；补标后上地图；海外点国别正确（如福冈→JP）；俗名/分类不变。

## 1.4 原图上传 / 可读地名 / 同图去重（已收口）

- **Android 相册**：默认传**原图**（`@capawesome/capacitor-file-picker` + `ACCESS_MEDIA_LOCATION`），不再走会把 GPS 涂成 `0,0` 的 Photo Picker 重编码。服务端 `readExif` 将近 Null Island 视为无定位；历史 `0,0` 启动时清洗。落盘 **原图 + display.jpg**（列表/识图用 display；详情优先原图若浏览器可显示）。单张上限默认 25MB（`UPLOAD_MAX_BYTES`）。
- **可读地名**：天地图逆地理同一调用取 `province/city/county`，写入 `location_label`（国内省市区连写；海外「国家 · 城市」）。详情/地图优先展示；失败不挡主路径。
- **同图去重**：上传原字节 SHA-256 → `content_hash`，按用户唯一；重复 `409 duplicate_photo`。删观察后可再传。不做感知哈希。

## 1.5 旅途时间 / 地点摘要（已收口）

列表与相册展示「张数 · 时间 · 地点」；封面仍用最新观察图。

- **自动**：时间 = 观察 `capturedAt`（缺则 `createdAt`）首末日；地点从 `locationLabel` / `countryCode` 抽层级（最细到市），段内 `·`、多处 `-`（如 `江西·井冈山-湖南·湘潭`）。实现：[`trips/summary.ts`](../apps/api/src/trips/summary.ts)。
- **手填覆盖**：旅途字段 `meta_manual_enabled` + `manual_date_text` / `manual_place_text`。开关开且该项非空才覆盖；关开关仍保留手填、展示回落自动。`PATCH /api/trips/:id` 可改。
- **UI**：旅途列表副行；相册标题下同行；「管理旅途」二级页里开关与输入框。

## 1.6 Android 壳应用内更新（已收口）

- **范围**：仅侧载 APK；Web/API 仍按服务器部署静默更新，用户无感。
- **真源**：服务器 `/opt/biotrace/data/android-release/`（`BioTrace.apk` + `latest.json`，只留最新）；`GET /api/app/android` / `.../apk`。
- **行为**：「我的」检查更新；下载后唤起系统安装。minor/major 落后 → 进 App 强提示不可跳过；仅 patch 落后不挡用。
- **运维**：发版后必须把包覆盖到上述目录，见 [`OPS.md`](./OPS.md) §7.2。

## 1.7 识图护栏（已收口）

挡住刷平台 Key。**手册：[`features/识图护栏.md`](./features/识图护栏.md)**。

- 账号日额度：默认 100 / UTC 日；`IDENTIFY_DAILY_LIMIT`（`0`=关）；只计平台 Key 实际调用。
- 超限可上传、不识图（`identify_daily_limit`）；自备 OpenAI 兼容 Key + 开关，开则硬失败不回落平台。
- 「我的」展示今日已用；后台可查看/改配额/清自备 Key。

## 1.8 共享旅途相册（已收口）

共同出行共享相册（不做好友/Feed）。**手册：[`features/共享旅途.md`](./features/共享旅途.md)**。

- 邀请码 +「允许加入」；上限 10；创建者为管理员（退出顺位继承）。
- 谁传谁额度；只能删自己的；团员共看、可代开包；开包全员图鉴/套册加点；入伙补算、离团收回。
- 解散：各自同名私有旅途承接自己的观察。

---

## 2. Cut 2（已收口）

主路径：上传 → `analyzing` → `pending_settle` → 开包 → `settled` → 图鉴。  
待开包 redact；弱结算不降稀有度；引入警示 UI 已有（名录命中才显示）。

**重识别与删除（易踩）**：重识别**必须**填修正文本（`POST /:id/reidentify`，前端 `ReidentifyDialog` 强制），结果**覆盖同一条观察、不另存**；重识别开始与删除都要先 `detachFromCollection`，否则图鉴留残档。

**纠正口径（已定 · 对应 early W3）**：认错只走「修正线索 → 重识别」。文字是辅助，**以照片为准、模型再判**。**不做**用户直接改学名 / 阶元 / taxonomy 并落库（那会砸识图与抽卡根基；见 `planning/03` Out `X8`）。早期「手改分类」措辞已废止，勿再当成待办。

---

## 3. Cut 3：稀有度与名录

### 3.1 理念

稀有度 = **旅行抽卡遇见价值**（收获感 / 好不好遇见），不是科研丰度，也不是公民科学上传量。

| 原则 | 含义 |
|------|------|
| 无随机 | 同 taxon×国家条件同档，可解释 |
| 相对当地 | 以观察点国家为尺度（无 GPS 时仍打分，country 回退 CN/提示） |
| 不叠首次 | 不挂钩「旅途/个人首次收集」 |
| 弱结算不降档 | 按可靠阶元对应类群查；full/weak 不打折稀有度 |
| 禁止物种硬编码 | 不靠科/属/种黑白名单刷分；靠普适判定键。物种不稀有一定有切实原因，找那个原因，别写死名字 |
| 保护级只查表 | 一级 / 二级 / 三有 / 灭绝一律查官方名录，不问模型 |
| 难拍可助升 | 夜行 / 短窗口 / 常空手三题同权，任一题错只损失 0.3 分 |

已否决：GBIF occurrence 主路径、常见种封顶表、频次分桶 + ±1 偏移（§3.6）。

### 3.2 评分方式（原子量表：12 道是非题 + 名录，本地线性加权）

**模型不输出档位，也不输出任何连续量。** 它只对 12 件互不重叠的具体事实各答一次
「是 / 否 / 不确定」，切档全在本地做。判定键与权重是同一份文件
[`scale-rubric.ts`](../apps/api/src/rarity/scale-rubric.ts)，生产与标定引的都是它，不可能漂移。

放弃「0–5 频次 + 偏移分」的原因：频次本身就是要判的结论，让模型直接估它等于把整个判断交给一次含糊的自我评估；
而害虫闸那种一票否决**一次能错 4 档**。改成十几根细轴之后，任何单题答错最多影响 0.3–1.0 分，
不会再有一处判错就崩盘的地方。

**三态是关键**：每题都能答 `null`。答不上来就跳过这条的加减，而不是被迫瞎猜一个 true/false。
12 题全 `null` 时 S=0，正好落 SR——「不认识这个物种」自然得到中位占位档，
所以生产**不再单独问「你认不认识它」**（标定脚本仍留 0 题作参考，见 `KNOW_RUBRIC`）。

分 3 批问（`gate` / `city` / `attitude`），批与批之间题面互不可见：同一批里题目挨着放会互相染色，
模型看到「保护级」类的线索就会把后面几题一起往稀有的方向拉。

#### 12 题与权重

保护级四项（一级 / 二级 / 三有 / 灭绝）**只查名录不问模型**，见 [`cn-status.ts`](../apps/api/src/rarity/cn-status.ts)。

| 键 | 问的是 | 权重 |
|----|--------|------|
| `indoor` | 跟着人的房屋 / 家具 / 仓储生活（床铺、墙缝、粮仓） | −1.0 |
| `domesticated` | 驯化家畜或宠物种 | −1.0 |
| `disliked` | 多数人看见觉得讨厌或脏 | −0.8 |
| `near_home` | 平常就住在市区（住宅区、街道、公园绿地） | −0.5 |
| `habitat_common` | 遇见时经常一次能看到很多，不是东一只西一只 | −0.5 |
| `swarm` | 经常成群出现 | −0.4 |
| `nocturnal` | 主要夜里活动 | +0.3 |
| `short_window` | 一年只有很短一段时间能看见 | +0.3 |
| `often_absent` | 到了它的生境也常常空手，得靠运气 | +0.3 |
| `narrow_range` | 分布只限少数特定地区，不是跨国广布 | +0.4 |
| `large` | 成体体重能到成年人量级（50 kg 以上） | +0.5 |
| `liked` | 普通人喜欢它、觉得亲近或高兴 | +0.8 |
| `sanyou` | 三有名录（查表） | +0.8 |
| `class_ii` | 国家二级（查表） | +1.8 |
| `class_i` | 国家一级（查表） | +2.5 |

权重不靠拟合命中率定——同一套配置重跑，命中数的浮动大于参数差异，拿命中率给参数排名在统计上无意义。
权重按**这件事对「好不好遇见」本来有多大意义**来定：`liked` 与 `disliked` 必须对称（±0.8），
因为它们是同一根轴的两头；「难拍到」象限的三题同权 0.3，是让它们分担风险而不是各自都能单独抬档。

#### 结算与闸门

四条本地规则，按顺序生效：

| 闸门 | 规则 | 为什么 |
|------|------|--------|
| 灭绝闸 | 在灭绝名录 → 直接 XR（S=99），**0 次模型调用** | 名录说了就是了，不需要模型 |
| 保护级互斥 | 一级 > 二级 > 三有，只算最高一级 | 三档是同一件事的不同强度 |
| 离人阶梯 | `indoor` 与 `near_home` 只扣最重的一级；港口 / 农田 / 郊野第三级不扣 | 都是「离人多近」，重复扣是双罚 |
| 遍地折扣 | `habitat_common` 只在无保护级且非短窗口时才扣；生效时 `swarm` 不再扣，`nocturnal` 与 `often_absent` 也不再抬分 | 有保护级或只在短窗口出现的，成群不代表好遇见；到处都是的东西夜里照样碰得到，也谈不上难找 |

档位界每档宽 1，比整数尺上移 0.5，**一律取严格小于**（正好落界上算高一档）：

\[ S < -1.5 \Rightarrow N;\ < -0.5 \Rightarrow R;\ < 0.5 \Rightarrow SR;\ < 1.5 \Rightarrow SSR;\ < 2.5 \Rightarrow UR;\ 否则\ LR \]

档位全序：`N → R → SR → SSR → UR → LR → XR`（[`RARITY_TIERS`](../apps/api/src/rarity/scale-rubric.ts)，
全仓库只认这一张表，文案见 `packages/messages` `rarity.*`）。

#### 采样与调用预算

| 情形 | 调用次数 |
|------|---------|
| 灭绝名录内 | 0 |
| 一般物种 | 3（1 次采样 × 3 批） |
| 得分贴着档位界（距界 ≤ `RARITY_EDGE_MARGIN`） | 补到 9（3 次采样，逐题取多数） |

贴界才补采样，是因为只有那时一道噪声题才可能改变结论；离界远的分数多采样也不会换档，白花钱。
逐题取多数时平票或全跳过记 `null`。

### 3.3 结算流程（正式主路径）

```text
识图成功且合格性通过
  → computeSettle（settle/rules.ts）
      → 国家码 / settleTier / taxonKey / 引入警示
      → taxonKey：GBIF `/species/match` 收到 Backbone accepted canonical（种级二项名）；
        关、失败或 HIGHERRANK 粗于可靠阶元时回退 Gemini 拉丁名。不把 AI 上级分类当 match context。
        属级与种级键分开。旧观察不回填，后台「重算开包结算」可单条对齐。
        种卡 / 已收录 / 收集树叶子学名与 taxonKey 同一套；收集树分类链优先 `accepted_taxonomy_json`
        （GBIF 拉丁叠识图中文）。观察页学名仍为识图原文，不同则标「现用」。观察 `scientificName` /
        `taxonomyJson` 不改写。
      → resolveRarity（rarity/index.ts）
          → resolveScaleRarity（rarity/scale.ts）
              → 有效国家 = countryCode || CN（无国家按中国常见度）
              → 读缓存 scale1|有效国家|taxon（不过期）
              → 名录查表：灭绝 → XR，0 次模型调用
              → 3 批题走模型链（llm/text-chain.ts）→ 逐题取多数
              → scoreFromScale 本地切档 → 贴界则补采样到 3 次
              → 写缓存（连 score / 12 题答案 / 生效模型 / 采样次数一起留痕）
              → 全链不可用：占位 SR 且**不写缓存**，下次仍会重算
              → 改档：管理后台删缓存或重判；规则语义变了则升 `scale1` 前缀
  → 观测写入 rarity，状态 pending_settle → 开包
```

| 文件 | 职责 |
|------|------|
| [`scale-rubric.ts`](../apps/api/src/rarity/scale-rubric.ts) | **唯一真源**：12 题题面、权重、闸门、档位界、`RARITY_TIERS` |
| [`scale.ts`](../apps/api/src/rarity/scale.ts) | 调度：名录先行、分批采样、贴界升采样、缓存 |
| [`cn-status.ts`](../apps/api/src/rarity/cn-status.ts) | 一级 / 二级 / 三有 / 灭绝名录查表（精确学名、官方异名、`Genus spp.`、中文名去括号；不做编辑距离） |
| [`llm/text-chain.ts`](../apps/api/src/llm/text-chain.ts) | TokenHub 模型链降级、按模型的请求差异、直连绕开出境代理 |
| [`settle/rules.ts`](../apps/api/src/settle/rules.ts) | 结算编排 |
| [`settle/taxon.ts`](../apps/api/src/settle/taxon.ts) | `taxonKey` + `accepted_taxonomy_json`：Gemini 名 + GBIF accepted canonical |
| [`jobs/identify.ts`](../apps/api/src/jobs/identify.ts) | 识图后触发 settle |

冒烟（需网络）：`pnpm --filter @biotrace/api taxonkey:smoke`（错拼/同物异名合并、属与种分开）。

#### 模型链

单一 TokenHub Key，只换模型名，按 `RARITY_TEXT_MODELS` 顺序试；某档配额耗尽或鉴权失败就打冷却降到下一档。
**生效模型名写进缓存**——只存一个档位字母的话，某条档位不合意时查不出它是哪档模型判的。
后台 `GET /api/admin/rarity-models` 看每档当前的冷却与最后一次错误。

必须**显式直连**：`identify/gemini.ts` 用 `setGlobalDispatcher` 装了出境代理，
沿用全局 dispatcher 会把对 TokenHub（国内服务）的请求绕去境外再回来。

各档模型的请求差异是实测出来的，写在 `MODEL_QUIRKS`，不迁就就是整档 400 白白降级：

| 模型 | 差异 |
|------|------|
| `glm-5.3` | 始终思考，带 `thinking` 字段一律 400（连它自己提示的 low/high/max 也不认），只能不发 |
| `kimi-k3` | 只接受 `temperature: 0.6`，发 0 会 400 |
| TokenHub 网关 | `401006`（endpoint is inactive）是瞬态，码里带 "401" 会被通用分类器误判成鉴权失败，已单独归为可重试 |

**跨模型答案不完全一致是预期的,不必管**：实测同一只乌鸫，`glm-5.1` 答「众多=是、喜爱=是」得 SSR，
`glm-5.3` 答两个否得 SR。缓存留了模型名，是为了某一条档位不合意时查得出它是哪档模型判的、能在后台单独重判，
不是为了追平各档模型的口径。

#### 标定与回归

标定（不进用户请求）：`apps/api` 下
`pnpm exec tsx scripts/rarity-calibrate.ts --model=<id> --thinking=off --samples=3 --delay-ms=1200`；
锚点 [`rarity-calibrate-taxa.json`](../apps/api/scripts/rarity-calibrate-taxa.json)（62 项，`user` / `agent` 双参考列）。
免费档并发 1、约 1 req/s，标定一律关 thinking。

改了权重、闸门或名录之后跑**零成本回归**（回放已记录的答案，0 次调用）：

```bash
node node_modules/tsx/dist/cli.mjs scripts/smoke-rarity-scale.ts
```

断言两条：每个锚点与用户标注相差不超过一档；灭绝名录内的物种必须落 XR。
基准是入库的固件 [`scripts/fixtures/rarity-anchors-glm-5.1.json`](../apps/api/scripts/fixtures/rarity-anchors-glm-5.1.json)
（2026-08-19 那轮验收的原始记录）。**固件必须入库**：`scripts/out/` 被 gitignore，
拿「out/ 里最新一份」当基准的话换台机器就跑不起来，而且不同算法版本的记录回放必然失败，选错文件会得到假的 FAIL。

只改了**题面**则回归看不出来（它回放的是已记录的模型答案）——题面改动用 `scripts/rarity-probe-axis.ts` 单题核。

2026-08-19 · 62 锚点 · `glm-5.1` · 采样 3 次：**命中 38 / 62，≤1 档 62 / 62，无差两档以上**。

验收看的不是单一命中率——命中率把「高一档」「低一档」算同一种错，也把「排序全乱」与「排序全对但整体偏移」
算同一种错，看不出该调哪里。中间档位天然模糊：按这套打分制，落在界附近的物种要求预先确定它一定是 SR 还是 SSR
是不可能的，所以 ≤1 档才是验收线。用户对 `N` / `R` / `SR` 下侧的要求更严（住家蟑螂无论如何不能进 R），
`SR` 上侧 / `SSR` / `UR` 与 `UR` 上侧 / `LR` 之间本就是模糊带。

缓存不设 TTL，每物种只判一次。纠错走管理后台（删单条 / 重判并回写观察与图鉴）；
判定规则语义变化时把键前缀从 `scale1` 升一档。

#### 已知缺口

**海外物种拿不到保护级加分。** `cn-status` 查的是中国名录，国外物种查不到就等于系统性少了
`class_i` / `class_ii` / `sanyou` 这 0.8–2.5 分。当前接受这个偏差；
**TODO**：接 IUCN 红色名录或等价的全球源作为非中国境内的保护级来源。
Prompt 里的 `country` 已按观察点国家传，没有写死中国。

### 3.4 环境变量

| 变量 | 默认 | 含义 |
|------|------|------|
| `TOKENHUB_API_KEY` | — | 稀有度量表、识图回退与标定共用；不能填 Coding Plan 的 `sk-sp-` Key。也可在管理后台「平台密钥」填，后台值覆盖 env |
| `IDENTIFY_VL_MODELS` | `glm-5v-turbo,kimi-k2.6,hy-vision-2.0-instruct` | 识图回退视觉链，按序降级 |
| `RARITY_TEXT_MODELS` | `glm-5.3,glm-5.2,kimi-k3,glm-5.1` | 模型优先级链，按序降级 |
| `RARITY_SAMPLES` | `1` | 每物种采样次数（1 次采样 = 3 次调用） |
| `RARITY_EDGE_MARGIN` | `0.2` | 离档位界不超过这个距离就补采样 |
| `RARITY_EDGE_SAMPLES` | `3` | 补到几次采样 |
| `RARITY_THINKING` | `0` | 量表题只要判断不要推理链；开了在免费档极易撞限流 |
| `RARITY_CALL_DELAY_MS` | `1200` | 同物种相邻两批的间隔，避开约 1 req/s |
| `GBIF_ENABLED` | `1` | 套册临时锚定 taxonomy + 结算 `taxonKey` 学名锚定。**不**把 occurrence 计数接入稀有度 |

### 3.5 引入/关注种警示（与稀有度分通道）

产品原则（见 [`planning/05-技术方案.md`](./planning/05-技术方案.md) C.4）：结算揭示；文案「当地引入/关注种」；国家级；无国家不警示；**仅种/亚种可靠鉴定**才警示；**不**折进稀有度。  
（相对 05 旧表述「弱结算能对上名录仍可警示」：已废止，以本节与代码种级闸门为准。）

```text
computeSettle
  → resolveIntroducedAlert（introduced/）
      → 无国家 / 非种级可靠鉴定 → false
      → 查 introduced-index ∪ introduced-seed overlay
      → 二项名精确匹配（禁止属名模糊）
  → 写 alertIntroduced → 结算/详情横幅；图鉴按种聚合「曾警示」轻标
```

| 文件 | 职责 |
|------|------|
| [`introduced/`](../apps/api/src/introduced/) | 匹配与加载 |
| [`introduced-index.json`](../apps/api/data/introduced-index.json) | 公开主索引：GRIIS Country Compendium（全球）+ GBIF GRIIS-China 覆盖 CN |
| [`introduced-seed.json`](../apps/api/data/introduced-seed.json) | 手写补丁（漏种/别名，如清道夫） |
| `scripts/build-introduced-index.ts` | 重建索引：`pnpm --filter @biotrace/api introduced:build`（可缓存 Compendium CSV） |
| `scripts/smoke-introduced.mjs` | 命中/不命中冒烟（含 JP/US 样例） |

名录口径：保留 Compendium 全部引入/外来记录（**不**仅 `isInvasive`）。TW/HK/MO 源行（若有）并入 `CN`，与结算 `iso3166` 一致。  
图鉴：`GET /api/collection` 对每种聚合「任意已结算观察曾 `alertIntroduced`」→ 卡片轻标（同文案，非整条横幅）。  
相册：已结算且本条 `alertIntroduced` → 格内更小一档轻标（字段已有，不改 API）。

验收锚点（种级 + 有国家）：CN 红耳龟 / 福寿螺 / 非洲大蜗牛类 → 警示；JP 牛蛙、US 斑马贻贝 → 警示；无 GPS、仅科/属、麻雀等本土常见 → 不警示。

### 3.6 未决 / 已否决

已验收：12 题量表主路径接线、62 锚点 vs 用户标注 命中 38/62 且 ≤1 档 62/62、灭绝闸走名录 0 调用、
GRIIS 全球主索引 + seed overlay 种级匹配与稀有度分通道、图鉴「曾警示」轻标。

仍未定：

- [ ] 海外物种保护级：待接 IUCN 或等价全球源（见 §3.3 已知缺口）

已定：

- [x] **无国家 → 按 CN 评**：Prompt 与缓存键同一回落；结算文案 `settle.locationImprecise`（「无定位时按中国常见度评定」）。不强制地图补标；不改全球口径。
- [x] **灭绝级只查名录**：不问模型。模型两个方向都错——对活着的稀有种张口就说「功能性灭绝」（把黄喉貂判成 XR），对真灭绝的白鲟又答不出依据。
- [x] **不为换模型重新标定**：生产是模型链，逐档验收在成本与口径上都不成立（以谁为准？）。**跨模型不一致就不一致，不必管**；只记录生效模型名，某一条档位不合意时在后台单独重判那一行。

~~GBIF 稀有度主路径 / 常见种封顶表 / novelty 加权~~：已否决。  
~~频次分桶 + ±1 偏移 / 害虫一票否决闸~~：已否决——频次本身就是要判的结论，害虫闸一次能错 4 档。  
~~主观题（想发 / 专程）~~：已否决——模型答案与 `liked` 高度重叠且不稳定。  
~~引入种靠手写名单当主路径 / 属名模糊匹配~~：已否决。

### 3.7 代际演化（简史）

三代都推翻过一次。留着是为了别再走回头路——每一代的死因都是**下一代的设计约束**。

| 代 | 做法 | 死因 |
|----|------|------|
| 一代 · GBIF 计数 | occurrence 数量分档 | 量的是公民科学上传量，不是好不好遇见。城市常见种上传多，冷门无脊椎上传少，方向常常反 |
| 二代 · 模型选桶 | 模型从 8 个近义桶名（`scarce`/`hard`/`legend`…）里单选 | 靠形容词区分，模型分不开，会偏心某一个桶 |
| 三代 · 频次 + 偏移 | 模型答 0–5 频次定基础档，再用 `1.2×向往 − 0.7×成群 + 0.5×难拍` 偏移 ±1，另加害虫/灭绝两道硬闸 | 两条致命：**频次本身就是要判的结论**，让模型直接估等于把整个判断交给一次含糊的自我评估；**害虫闸一票否决一次能错 4 档**（判错直接 UR→N，实测锁死野猪），而修好它的唯一办法是往 rubric 里写物种清单，违反「禁止物种硬编码」 |
| 四代 · 原子量表（当前） | 12 道互不重叠的是非题 + 名录查表，本地线性加权 | — |

四代的设计约束正是从三代的死因反推出来的：**不问结论只问事实**（每题都是可核查的具体事实，不是「有多稀有」）；
**任何单题答错最多影响 0.3–1.0 分**，不留一票否决的位置；**保护级与灭绝改为查表**，不让模型碰它答不好的东西。

还有一条踩过的坑值得单独记：**不拿命中率给参数排名。** 同一套配置重跑，命中数的浮动大于参数差异
（三代实测在 10–16 / 20 之间抖），拿它比两组权重的优劣在统计上无意义。权重按「这根轴本来该有多大意义」定，
验收看 ≤1 档占比（口径见 §3.3）。

---

## 4. Cut 4：腾讯云部署

- **操作手册（唯一入口）**：[`OPS.md`](./OPS.md)（架构背景见其附录 A）
- 仓库已含：`Dockerfile`、`docker-compose.yml`、`deploy/*`；生产项 `CORS_ORIGIN` / `COOKIE_SECURE`
- 规格：2C2G40G、Ubuntu 22.04/24.04；SQLite + 本地盘；不上 COS
- **主线不再代劳上机**；购机/DNS/证书/compose 按 [`OPS.md`](./OPS.md) 由部署侧完成并跑冒烟清单（现网 `DEV_AUTH=0`，假登录只在本机可用）

## 5. Cut 5：账号登录（邮箱+密码）

- **主路径**：`POST /api/auth/register` / `POST /api/auth/login`（邮箱+密码）→ 设 `bt_session`；`/me` 滑动续期（约 90 天）。
- **不强制验邮**：假邮箱可注册；收不到信则无法找回。
- **找回**：`POST /api/auth/request-reset` → Resend 发 **6 位码** → `POST /api/auth/reset-password`（App 内填码，利 Android）。
- **「我的」**：昵称、改密、退出；外观切换皮肤（`daylight` / `tide`）；**平台识图日额度与自备 OpenAI 兼容 Key**（见 §1.7 / [`features/识图护栏.md`](./features/识图护栏.md)；后台可查看/清除，见 [`features/管理后台.md`](./features/管理后台.md)）。
- **UI**：登录页默认只露登录；注册与找回切卡，不并排抢主按钮。
- 本机可 `DEV_AUTH=1` 开发登录；生产 `DEV_AUTH=0`。测试库可清（密码模型不迁移旧魔法链接用户）。
- 发信仍用 Resend（`RESEND_API_KEY` + `MAIL_FROM`）；日常登录不发信。

## 6. Cut 6：Android 薄壳（侧载）

- **手册**：[`features/Android套壳.md`](./features/Android套壳.md)
- 形态：Capacitor WebView，`apps/mobile`；`server-url.txt` / `BIOTRACE_SERVER_URL` 指向线上站点（当前 `http://公网IP`）
- cleartext + 相机/相册权限已配；**不上架**；与后端部署不冲突（只读站点）
- 服务器侧 HTTP 阶段保持 `COOKIE_SECURE=0`，`APP_ORIGIN`/`CORS_ORIGIN` 与壳内地址一致（见 [`OPS.md`](./OPS.md)）

## 7. 旅行套册成就

与稀有度 / 引入分通道。叙事：主题套册、规则槽点亮、**整册灰→彩**；不做凑数里程碑。

**完整手册（策展原则 / 当前目录 / 加册步骤）：[`features/旅行套册.md`](./features/旅行套册.md)**

| 原则 | 含义 |
|------|------|
| 配置驱动 | 加册 = `apps/api/data/volumes/*.json` + messages；**不改引擎代码** |
| 反硬编码 | 槽用 `taxonomy_in` 等规则；业务册名不进 TS 分支 |

- 模块：[`apps/api/src/volumes/`](../apps/api/src/volumes/)
- 进度表：`volume_progress`
- 开包后：`evaluateVolumesOnObservation`（先 GBIF 临时锚定 taxonomy，再 `taxonomy_in`）
- API：`GET /api/volumes`；settle 响应带 `volumes.newlyLit / newlyCompleted*`；收下后有反馈则弹出仪式层（成册优先于点亮槽，无则静默回相册）
- 进度 `lit_slot_ids_json`：兼容旧 `string[]`；新写 `Record<slotId,{observationId}>`，供邮票封面
- UI：图鉴第一屏为套册架；点开 `/collection/volumes/:id` 整页邮票内页；已收录 `/collection/species` 为可搜索目录（种多时不默认铺开）
- 主题资源：`public/volumes/<themeId>/` + `themes/volumeAssets`；见 [`套册美术分层.md`](./features/套册美术分层.md)
- 已配三本：`intertidal` / `urban_wild` / `woodland_edge`；`fixture-pipeline` 默认关闭
- DSL 摘要：[`data/volumes/README.md`](../apps/api/data/volumes/README.md)

## 8. 后置

- 套册：更多主题册策展（内容 only）；手绘级替换生成图
- 稀有度：海外保护级接 IUCN
- ~~旅途元数据增强（时间 / 地点摘要）~~：已做——自动聚合 + 可选手填覆盖（见旅途列表 / 管理旅途）
- ~~识图账号日额度 / 自备 Key~~：已做——见 §1.7
- ~~共享旅途相册~~：已做——见 §1.8；好友 / Feed / 广场仍后置
- 完整分类树动态够格（现为固定阶元门槛）；对象存储
- iOS / Play 上架 / 备案后 HTTPS 域名 + App Links
- IP / 全局限流、识图用量看板（护栏明确不做项）

---

## 9. 文案与术语

- [`packages/messages`](../packages/messages) 为**唯一**用户可见文案表；禁止在 `apps/web` / `apps/api` 业务代码写死中文句子（见 `.cursor/rules/messages-glossary.mdc`）
- 删除观察用应用内确认弹层（不用 `window.confirm`）
- 删除旅途确认语：key `trips.deleteConfirmPhrase`（文案在术语表）

---

## 10. Web 皮肤主题

已拆为独立专题：**[`features/皮肤主题.md`](./features/皮肤主题.md)**（token 表、加皮肤清单、明确不做）。

要点只留一句：色/字/圆角写在 `apps/web/src/themes/<id>.css`，结构样式只用语义 `var(--*)`，**流程页不写死品牌色**。

## 11. 管理后台

独立产品面，与用户登录、共享旅途「管理员」都分开。

**手册：[`features/管理后台.md`](./features/管理后台.md)**（页面、识图线路、密钥、存储、明确不做）。

运维入口与引导账号只在 [`OPS.md` §8.1](./OPS.md)。
