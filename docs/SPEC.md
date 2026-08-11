# BioTrace 实现与功能规格

> **本文件是功能真源**：已做 / 本期要做 / 明确后置。查「某能力做没做」以此为准。  
> 部署与线上现状看 [`OPS.md`](./OPS.md)；专题手册在 [`features/`](./features/)；当初的取舍理由在 [`planning/`](./planning/)。  
> 变更历史看 git log，本文不留手抄变更记录。  
> 更新日期：2026-08-10

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
| 皮肤主题 | 已落地 | 默认 `daylight`；手册 [`features/皮肤主题.md`](./features/皮肤主题.md) |
| 地图补标 | 已完成 | 详情准星补标；`PATCH …/location` 重算国别/引入/稀有度（见 §1.3） |
| 后置 | 未做 | 旅途元数据、全量灌库、iOS/上架；更多套册策展 |

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
apps/api/src/rarity/  稀有度主路径（encounter_class → resolveFromEncounter）
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
- **Gemini 健康态**（进程内）：短限流 → 保持 `analyzing` 等待（≤90s）再试；日额耗尽/长冷却 → **切智谱 GLM**。
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
- **UI**：观察详情「设位置 / 改位置」→ `/observations/:id/pin`；**挪地图 + 中心准星 +「确认此处」**（不手打地址）。底图与足迹图共用 [`map/style.ts`](../apps/web/src/map/style.ts)（缩放上限、瓦片失败回落 OpenFreeMap）。
- **文案**：`detail.setLocation` 等，均在 `packages/messages`。

验收：无 GPS 可识图开包；补标后上地图；海外点国别正确（如福冈→JP）；俗名/分类不变。

---

## 2. Cut 2（已收口）

主路径：上传 → `analyzing` → `pending_settle` → 开包 → `settled` → 图鉴。  
待开包 redact；弱结算不降稀有度；引入警示 UI 已有（名录命中才显示）。

**重识别与删除（易踩）**：重识别**必须**填修正文本（`POST /:id/reidentify`，前端 `ReidentifyDialog` 强制），结果**覆盖同一条观察、不另存**；重识别开始与删除都要先 `detachFromCollection`，否则图鉴留残档。

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
| 难拍不升档 | `hard_to_photograph` 仅备注，本地公式不因难拍抬档 |

已否决：GBIF occurrence 主路径、`ax+by+cz` 加权、常见种封顶表（§3.6）。

### 3.2 评分方式（分桶 + 否决，非连续打分）

**模型不直接输出 N/R/SR…**。它输出遇见类别 + 修正字段；本地映射定档。

1. **GLM 文本**（[`encounter-rubric.ts`](../apps/api/src/rarity/encounter-rubric.ts)，标定与生产同一份）输出：
   - `encounter_class`：必填枚举
   - `swarm_or_habituated`：0–3
   - `protection_level`：`none|uncertain|you|class_ii|class_i`（`you` = 三有等）
   - `hard_to_photograph`：boolean（不升档）
   - `reason`：一句话
2. **本地** [`resolveFromEncounter`](../apps/api/src/rarity/formula.ts)（配置 [`rarity-score-config.json`](../apps/api/data/rarity-score-config.json)）：

| encounter_class | 基础档 | 否决/备注 |
|-----------------|--------|-----------|
| `pest_weed` | N | 强制 N；难拍无效 |
| `everyday` | N | 强制 N；若 `you/class_*` → 抬到 **R**（薄安全网） |
| `place_common` | R | |
| `noteworthy` | SR | |
| `scarce` | SSR | |
| `hard` | UR | |
| `legend` | LR | 成群/半驯化高 → 封顶 **UR** |
| `unobtainable` | XR | 强制 XR |

小修正（最多约 ±1，且有门槛）：

- 成群/半驯化：仅基础档 ≥ SSR 时降 1 档；`legend`+高成群直接盖成 UR
- 保护 `class_ii` / `class_i`：仅基础档为 SR/SSR 时可升 1 档（不把 hard 抬成 LR）
- 修正不能造出 XR

**判定键（写在 rubric，勿写成物种名单）**：旅行收获感优先于「城乡多不多」；会想拍的野鸟/脊椎即使常见也 ≥ `noteworthy`；隐蔽/夜行/回避人类勿停在 `noteworthy`；保护级高 ≠ 自动 legend。

档位全序：`N → R → SR → SSR → UR → LR → XR`（文案见 `packages/messages` `rarity.*`）。

### 3.3 结算流程（正式主路径）

```text
识图成功且合格性通过
  → computeSettle（settle/rules.ts）
      → 国家码 / settleTier / taxonKey / 引入警示
      → resolveRarity（rarity/index.ts）
          → resolveEncounterRarity（rarity/encounter.ts）
              → 读缓存 enc2|国家|taxon（source=encounter）
              → 未命中：ZHIPU 文本模型 + ENCOUNTER_RUBRIC
              → resolveFromEncounter → 写缓存
              → 失败：seed → 默认 R（默认不缓存）
  → 观测写入 rarity，状态 pending_settle → 开包
```

| 文件 | 职责 |
|------|------|
| [`encounter-rubric.ts`](../apps/api/src/rarity/encounter-rubric.ts) | 分桶判定键（生产=标定） |
| [`encounter.ts`](../apps/api/src/rarity/encounter.ts) | 调 GLM、缓存、回退 |
| [`formula.ts`](../apps/api/src/rarity/formula.ts) | 否决与 ±1 |
| [`settle/rules.ts`](../apps/api/src/settle/rules.ts) | 结算编排 |
| [`jobs/identify.ts`](../apps/api/src/jobs/identify.ts) | 识图后触发 settle |
| [`rarity-score-config.json`](../apps/api/data/rarity-score-config.json) | 基础档与修正参数 |
| [`rarity-thresholds.json`](../apps/api/data/rarity-thresholds.json) | 覆盖 `config.ts` 内置阈值（缺文件则用内置值） |
| [`rarity-seed.json`](../apps/api/data/rarity-seed.json) | **仅模型失败时的兜底**：12 条 `国家|taxon → 档位`，命中记 `source:"seed"` |

`rarity-seed.json` 是一份物种名单，但**只在 GLM 调用失败后才查**，不参与主路径评分——「禁止物种名单」那条约束针对的是判定键与主路径，不是这个兜底表。别往里加种来「调档」，要调就改 rubric 或 `rarity-score-config.json`。

标定（不进用户请求）：`apps/api` 下 `pnpm exec tsx scripts/rarity-calibrate.ts`；锚点 [`rarity-calibrate-taxa.json`](../apps/api/scripts/rarity-calibrate-taxa.json)。  
2026-08-07 新 20 锚点（相对用户档）：exact **15/20**，≤1 档 **20/20**。

### 3.4 环境变量

| 变量 | 默认 | 含义 |
|------|------|------|
| `ZHIPU_API_KEY` | — | encounter 文本 + 识图回退 |
| `ZHIPU_TEXT_MODEL` | `glm-4-flash` | encounter_class 模型 |
| `RARITY_CACHE_TTL_DAYS` | `30` | encounter 缓存 TTL |
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
- [ ] **无国家时稀有度按 CN 评**：`rarity/encounter.ts` 的 `input.countryCode?.trim() || "CN"` 与界面「无定位」文案不一致（说的和做的两样）。地图补标上线后此路径变少，但仍需定：回落 CN 还是走全球口径

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
- **「我的」**：昵称、改密、退出；自备 Key / 日额度后置。
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
- UI：图鉴页紧凑册卡 → **弹层邮票墙**；开包点亮/成册用独立弹层（非页内挤排）
- 已配三本：`intertidal` / `urban_wild` / `woodland_edge`；`fixture-pipeline` 默认关闭
- DSL 摘要：[`data/volumes/README.md`](../apps/api/data/volumes/README.md)

## 8. 后置

- 套册：更多主题册策展（内容 only）；可选独立路由详情 / 手绘册皮
- 皮肤：潜水/潮间带主题 `tide`；「我的」里主题切换 UI（见 [`features/皮肤主题.md`](./features/皮肤主题.md) §5）
- 稀有度：灭绝级 XR 稳定性；中档继续靠判定键微调（禁止物种名单）
- 旅途元数据增强（时间 / 地点摘要；**封面已实现**，列表 API 附 `coverDisplayUrl`）
- 完整分类树动态够格（现为固定阶元门槛）；对象存储
- 逆地理更细粒度（省市级；**国家级已由天地图 + 离线国界落地**）
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
