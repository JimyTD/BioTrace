# BioTrace 文档导航

> 编号只属于**当初的思考步骤**（`planning/00`–`05`）。实现侧文档一律用名字，不再往编号后面接。  
> 更新日期：2026-08-10

## 我该读哪一篇

| 你要做的事 | 读这里 |
|------------|--------|
| 改功能 / 查某能力做没做 | **[`SPEC.md`](./SPEC.md)** ← 功能真源 |
| 上线、部署、运维、发包 | **[`OPS.md`](./OPS.md)** ← 运维真源 |
| 加套册 / 加皮肤 / 做补标 | [`features/`](./features/) |
| 搞清「当初为什么这样定」 | [`planning/03-需求辨明.md`](./planning/03-需求辨明.md)、[`planning/05-技术方案.md`](./planning/05-技术方案.md) |
| 翻历史调研与实测记录 | [`archive/`](./archive/) |

**一件事只认一个真源**：功能状态以 `SPEC.md` 为准，线上现状以 `OPS.md` 为准；`planning/` 与 `archive/` 是已冻结的过程记录，**不要**当实现清单。

## 目录

### 真源（持续维护）

| 文件 | 内容 |
|------|------|
| [`SPEC.md`](./SPEC.md) | 实现与功能规格：已做 / 后置 / 验收；数据对象；识图与稀有度流程 |
| [`OPS.md`](./OPS.md) | 部署实操唯一手册：环境、更新、代理、发包、验收清单 |

### 专题（features）

| 文件 | 内容 | 状态 |
|------|------|------|
| [`features/旅行套册.md`](./features/旅行套册.md) | 套册成就：策展原则、当前目录、加册步骤 | 已落地 |
| [`features/皮肤主题.md`](./features/皮肤主题.md) | 皮肤 token 与新增皮肤清单 | 已落地（默认 `daylight`） |
| [`features/Android套壳.md`](./features/Android套壳.md) | Capacitor 侧载壳与签名发布 | 已落地 |
| [`features/地图补标.md`](./features/地图补标.md) | 无 GPS 事后准星补标 | 已落地（真源 SPEC §1.3） |

### 规划（planning，按当初思考步骤编号 · 已冻结）

| 文件 | 内容 |
|------|------|
| [`planning/00-讨论进程与决策.md`](./planning/00-讨论进程与决策.md) | 阶段、关键约束、拍板记录、实测记录 |
| [`planning/03-需求辨明.md`](./planning/03-需求辨明.md) | P0/P1/P2/Out 需求清单与验收标准 |
| [`planning/04-组件与成本.md`](./planning/04-组件与成本.md) | 组件与成本总览 |
| [`planning/04b-识别路径-云API.md`](./planning/04b-识别路径-云API.md) | 云识别路径分析 |
| [`planning/04e-识别选型-倾向记录.md`](./planning/04e-识别选型-倾向记录.md) | 识别选型结论（Gemini 默认 / 智谱备选） |
| [`planning/04f-世界地图选型.md`](./planning/04f-世界地图选型.md) | 地图组件与底图选型（含天地图定稿） |
| [`planning/05-技术方案.md`](./planning/05-技术方案.md) | 产品原则 A–D；细则以 `SPEC.md` 为准 |

第 1 步的竞品对照与第 3 步的模型调研已归档，见下。

### 归档（archive · 只读留档）

| 文件 | 内容 |
|------|------|
| [`archive/竞品对照.md`](./archive/竞品对照.md) | iNaturalist / Biotracks / 生物记 / Seek 实测与淘汰理由 |
| [`archive/识别引擎证据包.md`](./archive/识别引擎证据包.md) | BioCLIP 等本地模型证据；**最终未采用** |
| [`archive/地图国别实测.md`](./archive/地图国别实测.md) | 天地图 key/配额/逆地理实测；旧 bbox 误判事故记录 |

## 仓库里其它文档

| 位置 | 内容 |
|------|------|
| [`../README.md`](../README.md) | 本机启动、地图 key、仓库结构 |
| [`../apps/api/data/volumes/README.md`](../apps/api/data/volumes/README.md) | 套册配置 DSL |
| [`../model-bakeoff/README.md`](../model-bakeoff/README.md) | 多模型同图对照脚本（独立） |

## 改名对照（2026-08-10 整理）

| 原 | 现 |
|----|----|
| `docs/06-实现与功能规格.md` | `docs/SPEC.md` |
| `docs/08-部署实操手册.md` | `docs/OPS.md` |
| `docs/09` / `10` / `11` | `docs/features/` 下同名专题 |
| `docs/00` / `03` / `04*` / `05` | `docs/planning/` |
| `docs/01` / `02` / `02b` | 合并为 `archive/竞品对照.md` |
| `docs/04a` | `archive/识别引擎证据包.md` |
| `docs/map-geo-compliance-notes.md` | 压缩为 `archive/地图国别实测.md` |
| `docs/07-部署-腾讯云轻量.md` | 已删除；架构背景并入 `OPS.md` 附录 |
| `docs/04c` / `04d` | 已删除（免费额度与榜单链接会腐烂；结论留在 `planning/04e`） |
