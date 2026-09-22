# Agent 须知

本仓库的强制约束写在 [`.cursor/rules/`](.cursor/rules/)。

你不是 Cursor、或 Cursor 没有自动挂上这些 rule 时：先读完该目录下每一份 `.mdc`，再按你所用工具的格式建立等价规则（本文件、`CLAUDE.md`、`.github/copilot-instructions.md`、CodeBuddy rules 等）。不要只读 README 就开工。

当前条目：

| 文件 | 管什么 |
|------|--------|
| `web-themes.mdc` | 皮肤与加功能清单 |
| `messages-glossary.mdc` | 用户可见文案进术语表 |
| `design-proposals.mdc` | 设计方案先过再动手 |
| `commit-messages-zh.mdc` | 提交说明用中文 |
| `deploy-golden-rules.mdc` | 动服务器时的铁律 |

细则仍以 [`docs/SPEC.md`](docs/SPEC.md)、[`docs/OPS.md`](docs/OPS.md)、[`docs/features/`](docs/features/) 为准。

## Codex 等价规则

以下约束对应上表五份 `.mdc`；每次开工仍须读完原文，原规则更新时同步此节。

- **设计先审批**：皮肤、图标、品牌叙事、视觉改版先提交能明确描述观感的方案，注明新皮肤或修改哪套皮肤，以仓库实物资源或真实图像传统为参照，列出 1–5 项优点。获准前不写实现 CSS、不生成资源、不改页面；不盲试穷举或凑方案。
- **表现层五分离**：文案归 `packages/messages`，配色归 `themes/`，结构归 `styles.css`，物件与演法归 `themes/slots.ts`，流程与数据归 `pages/`。默认 `clear`，备选 `daylight`；不复制页面或分叉业务，不借换皮改状态码、请求、路由、埋点或功能。
- **逐项检查皮肤**：新增色、字、圆角、阴影均用 token，同轮给所有已登记皮肤赋值；结构零件一次渲全，由主题 CSS 控制摆放和显隐；主题图片放 `public/<域>/<themeId>/` 且只经资源 helper 访问；新动作或概念表现先判断是否需要槽位。不需要补的项目须说明为何对所有皮肤一致。禁止业务页面硬编码品牌色、主题资源路径，禁止登记无人消费的资源域或槽位。
- **主题登记与验收**：切换用 `applyTheme`，登录后以账号 `users.theme` 为准；新皮肤须同步 CSS、资源、`ThemeId` / `THEME_IDS` / `THEME_META`、API 校验、入口 import 与术语表。有风格示意页必须对照；纯结构迁移不能改变默认皮肤观感；共享结构不得假定浅色。`/admin`、在线地图瓦片不换皮，引导插页尚未主题化。
- **文案只进术语表**：用户可见文案先加改 `packages/messages/src/zh.ts`，通过 `t()` / `formatRank()` 使用；主题改说法用 voice，不改含义。API 可读错误优先返回稳定 code。禁止业务代码硬编码或复制同义中文。模型 Prompt、开发日志、技术原文、用户输入按原规则例外处理；主表或 voice 改动必须跑 `pnpm check:copy`。
- **提交用中文**：Git 提交标题及正文使用简体中文，说明原因与改动；可保留惯用前缀和技术标识，不写空洞提交说明。
- **部署只走 Git**：仅动服务器或部署链路时生效。遵循 `docs/OPS.md` §7：本地修改并 push，服务器代理 `git pull --ff-only` 后重建，优先 SSH，TAT / OrcaTerm 用于接入救援。通过规定的后台部署器启动并轮询有限状态日志，禁止 `tail -f` 或并行部署；必须等待 `result=success` 并校验出口。保留 CN Dockerfile 与 host-gateway override。原生壳、Manifest、权限、插件或 server-url 相对侧载包有变时，同轮按 §7.2 发布新 APK；仅 Web/API 改动不打包。
- **服务器与密钥边界**：服务器只作运行态，禁止直接修改受 Git 跟踪文件，禁止用 `git reset --hard` / `git checkout -- <file>` 丢弃服务器改动。真实密钥、出口 IP、节点参数不入库、不进注释或提交；生产密钥只放服务器本地受忽略的 `deploy/.env.production`，不把它或 `*.pem` 同步、还原到 Git。
