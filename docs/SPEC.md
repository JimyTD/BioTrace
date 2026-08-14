# BioTrace 实现与功能规格

> **本文件是功能真源**：已做 / 本期要做 / 明确后置。查「某能力做没做」以此为准。  
> 部署与线上现状看 [`OPS.md`](./OPS.md)；专题手册在 [`features/`](./features/)；当初的取舍理由在 [`planning/`](./planning/)。  
> 变更历史看 git log，本文不留手抄变更记录。  
> 更新日期：2026-08-13

## 0. 当前阶段

| 阶段 | 状态 | 说明 |
|------|------|------|
| Cut 1 / 1.1 | 已完成 | 旅途、识图、相册、地图、删除、详情、术语表（当时登录是临时假登录，见 Cut 5） |
| Cut 2 | 已完成 | 待开包 → 抽卡结算、图鉴、引入警示 UI |
| Cut 3 | 已收口 | 引入名录/识图韧性；稀有度 = encounter 分桶+否决（§3.1），已接结算 |
| Cut 4 | 已上线 | 腾讯云轻量；手册 [`OPS.md`](./OPS.md) |
| Cut 5 | 已上线 | 邮箱+密码主路径（取代魔法链接）；Resend 仅用于找回码；持久会话；见 §5 |
| Cut 6 | 制品就绪 | Capacitor Android 侧载壳；手册 [`features/Android套壳.md`](./features/Android套壳.md) |
| 套册成就 | 引擎+三本内容已通 | 配置驱动；拓展手册 [`features/旅行套册.md`](./features/旅行套册.md) |
| 皮肤主题 | 已落地 | 默认 `daylight`；第二皮肤 `tide`（token + 资源槽）；手册 [`features/皮肤主题.md`](./features/皮肤主题.md) |
| 管理后台 | 已落地 | 独立登录；总览/用户/观察/平台密钥/存储/审计；手册 [`features/管理后台.md`](./features/管理后台.md) |
| 地图补标 | 已完成 | 详情准星补标；`PATCH …/location` 重算国别/引入/稀有度（见 §1.3） |
| 旅途元数据 | 已完成 | 列表/相册时间·地点摘要；自动聚合 + 可选手填覆盖（见 §1.5） |
| 后置 | 未做 | 全量灌库、iOS/上架；更多套册策展 |

本机：`pnpm.cmd dev` → Web `http://127.0.0.1:5173/` · API `http://127.0.0.1:8787`

---

## 1. 仓库与栈（已落地）

```text
apps/api     Hono + Drizzle + libsql(SQLite) + Gemini/GLM + sharp/exifr
apps/web     Vite + React + MapLibre
  src/themes/   皮肤主题（配色/字体/圆角；与流程页分离，见 §10）
  src/styles.css  结构与组件样式（只用语义 var(--*)）
apps/mobile  Capacitor Android 薄壳（WebView → 线上站点）
packages/messages   统一 UI/术语文案（默认 zh）
apps/api/data/      rarity-* / introduced-index（GRIIS）/ introduced-seed（补丁）
apps/api/src/rarity/  稀有度主路径（encounter_frequency + 硬闸 → resolveFromEncounter）
apps/api/src/identify/  识图编排（健康状态 / Gemini / 智谱回退）
data/        本地 DB 与 uploads（gitignore）
docs/        筹划 + 本实现规格
```

数据对象：`User` / `Trip` / `Observation` / `CollectionEntry` / `rarity_cache`。

**表现层三分离（加功能时勿搅在一起）：**

| 层 | 职责 | 位置 |
|----|------|------|
| 文案 | 用户可见句子 / 术语 | `packages/messages` |
| 皮肤 | 色、字、圆角、氛围底、稀有度徽章色 | `apps/web/src/themes/` |
| 流程 UI | 路由、状态、上传/开包等交互结构 | `apps/web/src/pages/` + `styles.css` 的 class |

---

## 1.1 识图韧性

- **串行队列**（默认 concurrency=1），避免免费层被并行打爆。
- **Gemini 健康态**（进程内）：短限流 → 保持 `analyzing` 等待（≤90s）再试；瞬时 5xx/503 → 冷却约 20s 再试 **1 次**；日额耗尽/长冷却 → **切智谱 GLM**。
- 两侧都不可用才 `failed`，文案温和（不提配额/账单）。
- Me / `/api/health` 可看 Gemini、智谱配置与冷却状态。

## 1.2 识图合格性闸门

在开包 / 稀有度 / 图鉴之前拦截「不是现场活体生物」的结果（书、人、玩具、卡通等）。

- Prompt 要求模型声明 `subject_kind` / `subject_living` / `eligibility`；代码：[`eligibility.ts`](../apps/api/src/identify/eligibility.ts)。
- **可收集**：`living_organism` 且活体（含饲养/动物园）。
- **不可收集**：人、玩具/模型、影像/印刷形象、无生物、不明；写 `failed` + 分型码，**清空**俗名/学名/taxonomy/稀有度/`taxonKey`，不开包、不进图鉴。
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
| 禁止物种硬编码 | 不靠科/属/种黑白名单刷分；靠普适判定键 |
| 难拍可助升 | `hard_to_photograph` 进偏移分；单轴打满可 Δ=+1，但不能跨多档 |

已否决：GBIF occurrence 主路径、`ax+by+cz` 加权、常见种封顶表（§3.6）。

### 3.2 评分方式（遇见频次 + 偏移分，非纯连续定档）

**模型不直接输出 N/R/SR…**，也不再从近义桶名里单选（`scarce`/`hard`/`legend` 靠形容词区分，模型分不开，会偏心某一个）。它只答**一个 0–5 的频次**加两个前置判断；本地：频次→基础档，再算偏移 Δ∈{-1,0,+1}。

1. **GLM 文本**（[`encounter-rubric.ts`](../apps/api/src/rarity/encounter-rubric.ts)，标定与生产同一份）输出（`reason` 必须在最前，让模型先说理再打分）：
   - `reason`：一句话
   - **不问灭绝**：XR 的硬闸保留在 `formula.ts`，但**不由模型供给**。模型两个方向都错——
     对活着的稀有物种张口就说「功能性灭绝」（把黄喉貂判成 XR），对真灭绝的白鲟又答不出依据
     （不记得 2022 年 IUCN 宣布）。待接 GBIF 的 IUCN 红色名录等级（EX / EW → XR）。
     优先级低：灭绝物种拍不到，XR 在生产里几乎不出现
   - `pest_or_weed`：布尔，命中即锁 N
   - `encounter_frequency`：0–5 必填整数（主信号）。rubric 要求**先在 reason 里落一个次数**
     （「这十年大约能遇到几次」）再据此挑档——只给形容词档名时模型会把大批物种堆到中间档
   - `iconic_appeal`：0–3（想不想拍，与稀有度无关）
   - `protection_level`：`none|uncertain|you|class_ii|class_i`（**仅作先验，本地不加分**）
   - `swarm_or_habituated`：0–3
   - `hard_to_photograph`：0–3（可助升档）
2. **本地** [`resolveFromEncounter`](../apps/api/src/rarity/formula.ts)（[`rarity-score-config.json`](../apps/api/data/rarity-score-config.json)）：

| encounter_frequency | 含义（普通旅行者十年内遇到几次） | 基础档 |
|---------------------|----------------------------------|--------|
| 0 | 数不清，几乎每次出门都见得到 | R |
| 1 | 几十次，走到它的生境基本都在 | R |
| 2 | 五到二十次 | SR |
| 3 | 一到三次 | SSR |
| 4 | 十年零次，得专门蹲守或进保护区 | UR |
| 5 | 专程去也基本无缘 | LR |

频次最低端落 `R` 而非 `N`：`N` 由害虫闸专管，普通常见物种落 `N` 是误伤（实测击中同型巴蜗牛、纹藤壶）。

硬闸优先于频次：`extinct_or_unobtainable` → XR（忽略偏移）；`pest_or_weed` → 锁 N；频次 5 且高成群先盖成 UR 再偏移。

**害虫闸是全系统唯一能一次错 4 档的地方**（一票否决，判错直接从 UR 掉到 N），其余任何一处判错最多影响一两档。
闸口判据用行为提问（「人们会不会主动花钱花力气清除它」）+ 两条例外（中大型野生脊椎动物、会让人想拍一张的）。
**已知缺陷未修**：这套判据压不住野猪——「会不会有人清除它」对野猪的答案是「会」，例外条款不生效，实测被锁进 N。
写成物种清单能修好它（实测 6/6 害虫锚点全中），但那是把答案写进 rubric，违反本节「勿写成物种名单」。

偏移分（权可调）：\(S = 1.2×向往 − 0.7×成群 + 0.5×难拍\)。  
\(S\ge 2.0\Rightarrow +1\)；\(S\le -2.0\Rightarrow -1\)；否则 0。偏移造不出 XR。缓存键前缀 `enc4`。

权重不靠拟合命中率定，按**每根轴允许做什么**反解——因为同一套配置重跑，命中数浮动大于参数差异，
拿命中率给参数排名在统计上无意义（[`rarity-tune.mjs`](../apps/api/scripts/rarity-tune.mjs) 可离线穷举，不必跑模型）：

| 约束 | 算式 |
|------|------|
| 向往 2「会专门停下来拍」单独够抬一档 | 2×1.2 = 2.4 ≥ 2.0 |
| 向往 1「顺手拍一张」单独不够 | 1×1.2 = 1.2 < 2.0 |
| 难拍满格单独不够 | 3×0.5 = 1.5 < 2.0 |
| 但「顺手拍 + 极难拍到」够 | 1.2 + 1.5 = 2.7 ≥ 2.0 |
| 成群满格（景区投喂半驯化）单独够降一档 | 3×(−0.7) = −2.1 ≤ −2.0 |
| 成群 2（常成群但不躲人）不够 | 2×(−0.7) = −1.4 > −2.0 |

**膨胀上限就是这 ±1 档**——差两档以上不按膨胀处理，按错误查根因
（详见 [`docs/wip/稀有度评分-改进.md`](wip/稀有度评分-改进.md) §3.2）。

保护级权重置 0：它高不代表更难遇，之前 `class_i` 单轴就够 +1，等于所有国家一级自动升档，与「保护级高 ≠ 自动 legend」冲突。`protectionScore` 表保留以便日后调权。

**判定键（写在 rubric，勿写成物种名单）**：按「多久碰上一次」判断，不按名气与保护级；一律按野外自然种群评，
笼养养殖栽培个体不算；夜行/隐蔽/深山类群落 3–5；两道自查题——「当地人一辈子见过它的野生个体吗」（基本没有 → 4–5）、
「走到对的生境翻开石头就能找到吗」（能 → 0–1，但分布狭窄 / 成虫期极短 / 受保护的无脊椎不适用此条）。

档位全序：`N → R → SR → SSR → UR → LR → XR`（文案见 `packages/messages` `rarity.*`）。

### 3.3 结算流程（正式主路径）

```text
识图成功且合格性通过
  → computeSettle（settle/rules.ts）
      → 国家码 / settleTier / taxonKey / 引入警示
      → resolveRarity（rarity/index.ts）
          → resolveEncounterRarity（rarity/encounter.ts）
              → 有效国家 = countryCode || CN（无国家按中国常见度）
              → 读缓存 enc4|有效国家|taxon（source=encounter；不过期）
              → 未命中：ZHIPU 文本模型 + ENCOUNTER_RUBRIC（Prompt 同有效国家）
              → resolveFromEncounter → 写缓存
              → 失败：seed → 默认 R（默认不缓存）
              → 改档：管理后台删缓存或重判；规则语义变了则升 `enc4` 前缀
  → 观测写入 rarity，状态 pending_settle → 开包
```

| 文件 | 职责 |
|------|------|
| [`encounter-rubric.ts`](../apps/api/src/rarity/encounter-rubric.ts) | 频次判定键（生产=标定） |
| [`encounter.ts`](../apps/api/src/rarity/encounter.ts) | 调 GLM、缓存、回退 |
| [`formula.ts`](../apps/api/src/rarity/formula.ts) | 硬闸、频次映射与 ±1 |
| [`settle/rules.ts`](../apps/api/src/settle/rules.ts) | 结算编排 |
| [`jobs/identify.ts`](../apps/api/src/jobs/identify.ts) | 识图后触发 settle |
| [`rarity-score-config.json`](../apps/api/data/rarity-score-config.json) | 基础档与修正参数 |
| [`rarity-thresholds.json`](../apps/api/data/rarity-thresholds.json) | 覆盖 `config.ts` 内置阈值（缺文件则用内置值） |
| [`rarity-seed.json`](../apps/api/data/rarity-seed.json) | **仅模型失败时的兜底**：12 条 `国家|taxon → 档位`，命中记 `source:"seed"` |

`rarity-seed.json` 是一份物种名单，但**只在 GLM 调用失败后才查**，不参与主路径评分——「禁止物种名单」那条约束针对的是判定键与主路径，不是这个兜底表。别往里加种来「调档」，要调就改 rubric 或 `rarity-score-config.json`。

标定（不进用户请求）：`apps/api` 下
`pnpm exec tsx scripts/rarity-calibrate.ts --model=<id> --thinking=off --samples=3 --delay-ms=1200`；
锚点 [`rarity-calibrate-taxa.json`](../apps/api/scripts/rarity-calibrate-taxa.json)（39 项，`user` / `agent` 双参考列）。  
智谱免费档并发 1、约 1 req/s：`glm-4.7-flash` 开 thinking 必撞 `1302` 限流，标定一律关 thinking。

每项**采样三次取中位数**（各轴独立取中位数，布尔轴取多数），并记录三次之间的分歧度：
稀有度每物种只判一次且永久缓存，承担得起；分歧 ≥2 级说明模型对该物种没谱，进复核队列。
缓存不设 TTL。纠错走管理后台（删单条 / 重判并回写观察与图鉴）；判定规则语义变化时把键前缀从 `enc4` 升一档。

验收看四个量，不看单一命中率——命中率把「高一档」「低一档」算同一种错，也把「排序全乱」与「排序全对但整体偏移」
算同一种错，看不出该调哪里：

| 指标 | 回答什么 | 该动什么 |
|------|---------|---------|
| 排序相关 ρ | 排序对不对 | 低 → 改 rubric 或换模型 |
| 平均偏移 | 整体偏没偏、偏哪边 | 大 → 改映射表或阈值 |
| 各频次档计数 | 分布有没有塌 | 塌 → 改档位判据（形容词换可数次数） |
| 采样分歧 | 是噪声还是系统偏差 | 大 → 提高采样次数 |

2026-08-13 · 39 锚点 · `glm-4-flash-250414` · 采样 3 次（对 `user` 列 20 项）：

| rubric 版本 | 排序 ρ | 偏移 | 命中 | ≤1 档 | 最差 |
|-------------|--------|------|------|-------|------|
| 害虫闸带物种清单 | 0.956 | −0.40 | 12/20 | 20/20 | 1 档 |
| 清掉全部硬编码（当前） | 0.788 | −0.45 | 13/20 | 18/20 | **4 档**（仅野猪） |

去掉硬编码后除野猪外其余 38 项仍不超过 2 档，退化几乎全部来自那一项被锁进 N。
同一天七轮的演进与每一处改动的因果见 [`docs/wip/稀有度评分-改进.md`](wip/稀有度评分-改进.md) §3.7。

### 3.4 环境变量

| 变量 | 默认 | 含义 |
|------|------|------|
| `ZHIPU_API_KEY` | — | encounter 文本 + 识图回退 |
| `ZHIPU_TEXT_MODEL` | `glm-4-flash-250414` | 稀有度频次判定模型（另一免费可选 `glm-4.7-flash`）。旧默认 `glm-4-flash` 守不住「只输出 JSON」，会回 Python 代码 |
| `GBIF_ENABLED` | `1` | 遗留；结算主路径不读 |

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

已验收：分桶+否决主路径接线、新锚点 vs 用户 exact 15/20（±1 全中）、GRIIS 全球主索引 + seed overlay 种级匹配与稀有度分通道、图鉴「曾警示」轻标。

仍未定：

- [ ] 灭绝级 XR（白鲟等）偶发标成 legend；中档继续靠判定键拧，不加物种名单

已定（无国家稀有度）：

- [x] **无国家 → 按 CN 评**：Prompt / 缓存键 / seed 查找同一回落；结算文案 `settle.locationImprecise`（「无定位时按中国常见度评定」）。不强制地图补标；不改全球口径。旧 `GLOBAL|…` / `enc2|…` 缓存行可忽略，新键为 `enc3|CN|…`。

~~GBIF 稀有度主路径 / 常见种封顶表 / novelty 加权~~：已否决。  
~~引入种靠手写名单当主路径 / 属名模糊匹配~~：已否决。

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
- **「我的」**：昵称、改密、退出；外观切换皮肤（`daylight` / `tide`）；平台识图日额度与自备密钥已落地（后台可查看/清除，见 [`features/管理后台.md`](./features/管理后台.md)）。
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
- 稀有度：灭绝级 XR 稳定性；中档继续靠判定键微调（禁止物种名单）
- ~~旅途元数据增强（时间 / 地点摘要）~~：已做——自动聚合 + 可选手填覆盖（见旅途列表 / 管理旅途）
- 完整分类树动态够格（现为固定阶元门槛）；对象存储
- iOS / Play 上架 / 备案后 HTTPS 域名 + App Links

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
