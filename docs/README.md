# BioTrace 文档导航

> 只留四类东西：**来时路**（`planning/`，当初为什么这样定）、**功能真源**（`SPEC.md`）、**运维真源**（`OPS.md`）、**专题手册**（`features/`）。  
> 编号只属于当初的思考步骤；实现侧文档一律用名字。  
> 更新日期：2026-09-29

## 我该读哪一篇

| 你要做的事 | 读这里 |
|------------|--------|
| 改功能 / 查某能力做没做 | **[`SPEC.md`](./SPEC.md)** ← 功能真源 |
| 上线、部署、运维、发包 | **[`OPS.md`](./OPS.md)** ← 运维真源 |
| 加皮肤 / 出安卓包 / 管后台 / 护栏 / 共享旅途 / 宠物图鉴 | [`features/`](./features/) |
| 搞清「当初为什么这样定 / 为什么不那样做」 | [`planning/`](./planning/) |

**一件事只认一个真源**：功能状态以 `SPEC.md` 为准，线上现状以 `OPS.md` 为准。`planning/` 已冻结，**不要**当实现清单。**变更历史看 git log**，文档里不再手抄一份。

## 目录

### 真源（持续维护）

| 文件 | 内容 |
|------|------|
| [`SPEC.md`](./SPEC.md) | 实现与功能规格：已做 / 后置 / 未决；数据对象；识图与稀有度流程 |
| [`OPS.md`](./OPS.md) | 部署实操唯一手册：环境、更新、代理、发包、冒烟清单；附录含架构约定与天地图坑 |

### 专题（features · 正式手册）

| 文件 | 内容 |
|------|------|
| [`features/皮肤主题.md`](./features/皮肤主题.md) | 两套皮肤 `daylight` / `clear`；token、摆放、槽位与加皮肤清单 |
| [`features/Android套壳.md`](./features/Android套壳.md) | Capacitor 侧载壳与签名发布 |
| [`features/管理后台.md`](./features/管理后台.md) | 独立管理端：页面、识图线路、密钥与存储；与运维入口分离 |
| [`features/识图护栏.md`](./features/识图护栏.md) | 账号日额度 + 自备 OpenAI 兼容 Key |
| [`features/共享旅途.md`](./features/共享旅途.md) | 邀请码共享相册（成员、开包加点、离团收回） |
| [`features/宠物图鉴.md`](./features/宠物图鉴.md) | 驯养分轨、品种纠偏、名录豁免与引入按种 |
| [`features/物种树.md`](./features/物种树.md) | 3D 物种树的拍板铁律、结构、渲染与基线 |
| [`features/品牌叙事.md`](./features/品牌叙事.md) | 品牌色、应用图标规格与叙事口径 |
| [`features/文案撰写规范.md`](./features/文案撰写规范.md) | 功能性文本与创作类文本的写法 |
| [`features/文案工程规范.md`](./features/文案工程规范.md) | 术语表、主题 voice 与校验流程 |

### 来时路（planning · 按当初思考步骤编号 · 已冻结）

| 文件 | 内容 |
|------|------|
| [`planning/00-讨论进程与决策.md`](./planning/00-讨论进程与决策.md) | 讨论顺序、项目定位、三项关键约束、各步结案状态 |
| [`planning/01-竞品对照.md`](./planning/01-竞品对照.md) | iNaturalist / Biotracks / 生物记 / Seek 实测与淘汰理由（**为什么要自研**） |
| [`planning/03-需求辨明.md`](./planning/03-需求辨明.md) | P0/P1/P2/Out 需求清单与「怎样算满意」 |
| [`planning/04-识别选型.md`](./planning/04-识别选型.md) | 走云多模态 API 的理由；iNat 识图不可接入；**为什么不自托管 BioCLIP**（生产回退见 SPEC §1.1，已改为 TokenHub 视觉链） |
| [`planning/04f-世界地图选型.md`](./planning/04f-世界地图选型.md) | 地图引擎与底图选型（含天地图定稿）；手写 bbox 判国事故 |
| [`planning/05-技术方案.md`](./planning/05-技术方案.md) | 产品原则 A–D（主路径以结算为高潮等）；细则以 `SPEC.md` 为准 |

## 施工中（临时 · 非真源）

| 文件 | 内容 |
|------|------|
| [`wip/宠物图鉴-玩法脑暴.md`](./wip/宠物图鉴-玩法脑暴.md) | 宠物图鉴玩法重设计与待拍板项；**讨论中，非 SPEC** |
| [`wip/待办.md`](./wip/待办.md) | 宠物图鉴相关已否、已降级、待拍板与最小一步；**施工记录，非 SPEC** |
| [`wip/交接-宠物图鉴.md`](./wip/交接-宠物图鉴.md) | 宠物图鉴玩法设计交接；**WIP，非 SPEC** |
| [`wip/settle-rarity-spotlight-demo.html`](./wip/settle-rarity-spotlight-demo.html) | 开包稀有度演出视觉基准；**长期参照物，非 SPEC** |

## 仓库里其它文档

| 位置 | 内容 |
|------|------|
| [`../README.md`](../README.md) | 本机启动、地图 key、仓库结构 |
| [`../AGENTS.md`](../AGENTS.md) | 给协作 Agent：先扫 `.cursor/rules/`，再落到自己这边 |
| [`../model-bakeoff/README.md`](../model-bakeoff/README.md) | 多模型同图对照脚本（独立） |
