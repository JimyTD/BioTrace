# BioTrace 文档导航

> 只留四类东西：**来时路**（`planning/`，当初为什么这样定）、**功能真源**（`SPEC.md`）、**运维真源**（`OPS.md`）、**专题手册**（`features/`）。  
> 编号只属于当初的思考步骤；实现侧文档一律用名字。  
> 更新日期：2026-08-17

## 我该读哪一篇

| 你要做的事 | 读这里 |
|------------|--------|
| 改功能 / 查某能力做没做 | **[`SPEC.md`](./SPEC.md)** ← 功能真源 |
| 上线、部署、运维、发包 | **[`OPS.md`](./OPS.md)** ← 运维真源 |
| 加套册 / 加皮肤 / 出安卓包 / 管后台 / 护栏 / 共享旅途 | [`features/`](./features/) |
| 搞清「当初为什么这样定 / 为什么不那样做」 | [`planning/`](./planning/) |

**一件事只认一个真源**：功能状态以 `SPEC.md` 为准，线上现状以 `OPS.md` 为准。`planning/` 已冻结，**不要**当实现清单。**变更历史看 git log**，文档里不再手抄一份。

## 目录

### 真源（持续维护）

| 文件 | 内容 |
|------|------|
| [`SPEC.md`](./SPEC.md) | 实现与功能规格：已做 / 后置 / 未决；数据对象；识图与稀有度流程 |
| [`OPS.md`](./OPS.md) | 部署实操唯一手册：环境、更新、代理、发包、冒烟清单；附录含架构约定与天地图坑 |

### 专题（features · 都已落地，写的是「以后怎么加」）

| 文件 | 内容 |
|------|------|
| [`features/旅行套册.md`](./features/旅行套册.md) | 套册成就：策展原则、当前目录、加册步骤 |
| [`features/套册美术分层.md`](./features/套册美术分层.md) | 套册美术：一图一职责、相框 SVG、禁止复合图；§7.2 静态 HTML 叠层预览 |
| [`features/皮肤主题.md`](./features/皮肤主题.md) | 皮肤 token 与新增皮肤清单 |
| [`features/Android套壳.md`](./features/Android套壳.md) | Capacitor 侧载壳与签名发布 |
| [`features/管理后台.md`](./features/管理后台.md) | 独立管理端：页面、识图线路、密钥与存储；与运维入口分离 |
| [`features/识图护栏.md`](./features/识图护栏.md) | 账号日额度 + 自备 OpenAI 兼容 Key |
| [`features/共享旅途.md`](./features/共享旅途.md) | 邀请码共享相册（成员、开包加点、离团收回） |

### 来时路（planning · 按当初思考步骤编号 · 已冻结）

| 文件 | 内容 |
|------|------|
| [`planning/00-讨论进程与决策.md`](./planning/00-讨论进程与决策.md) | 讨论顺序、项目定位、三项关键约束、各步结案状态 |
| [`planning/01-竞品对照.md`](./planning/01-竞品对照.md) | iNaturalist / Biotracks / 生物记 / Seek 实测与淘汰理由（**为什么要自研**） |
| [`planning/03-需求辨明.md`](./planning/03-需求辨明.md) | P0/P1/P2/Out 需求清单与「怎样算满意」 |
| [`planning/04-识别选型.md`](./planning/04-识别选型.md) | 走云多模态 API 的理由；iNat 识图不可接入；**为什么不自托管 BioCLIP** |
| [`planning/04f-世界地图选型.md`](./planning/04f-世界地图选型.md) | 地图引擎与底图选型（含天地图定稿）；手写 bbox 判国事故 |
| [`planning/05-技术方案.md`](./planning/05-技术方案.md) | 产品原则 A–D（主路径以结算为高潮等）；细则以 `SPEC.md` 为准 |

## 施工中（临时 · 非真源）

| 文件 | 内容 |
|------|------|
| [`wip/0.2-施工备注.md`](./wip/0.2-施工备注.md) | 0.2 分段施工备注；收口后写回 `SPEC` / `features`，勿当长期手册 |

## 仓库里其它文档

| 位置 | 内容 |
|------|------|
| [`../README.md`](../README.md) | 本机启动、地图 key、仓库结构 |
| [`../apps/api/data/volumes/README.md`](../apps/api/data/volumes/README.md) | 套册配置 DSL |
| [`../model-bakeoff/README.md`](../model-bakeoff/README.md) | 多模型同图对照脚本（独立） |
