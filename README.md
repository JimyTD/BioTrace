# BioTrace

个人向「旅行自然观察」：选图识别 → 落入旅途相册与地图。

**当前 Android 侧载包版本：`0.1.2`**（[Release](https://github.com/JimyTD/BioTrace/releases/tag/android-v0.1.2) · 发版见 [`docs/OPS.md` §7.2](docs/OPS.md)）  
> 薄壳远程加载站点：日常只更新服务器即可，不必随每次 Web/API 提交重打 APK。

> 文档导航 [`docs/README.md`](docs/README.md)：功能真源 [`docs/SPEC.md`](docs/SPEC.md) · 运维真源 [`docs/OPS.md`](docs/OPS.md) · 专题 [`docs/features/`](docs/features/) · 来时路 [`docs/planning/`](docs/planning/)。

## 给协作 Agent

强制约束的真源是 [`.cursor/rules/`](.cursor/rules/)，不是某家工具的默认人格。换了 Cursor / Claude / Codex / Copilot 或其他 Agent 进仓库时，先扫完这个目录，再把各条落到**自己这边**的 rule / 指令文件，不要假设已经读过 Cursor 的 alwaysApply。入口见根目录 [`AGENTS.md`](AGENTS.md)。

## 本机启动

需要 Node 20+、pnpm。

```powershell
cd D:\Fun\BioTrace
Copy-Item .env.example apps\api\.env   # 若尚无创建
# 编辑 apps\api\.env，填入 GEMINI_API_KEY（可选；没有也能测上传/失败态）

pnpm install
pnpm dev
```

- Web：http://127.0.0.1:5173/
- API：http://127.0.0.1:8787/api/health

登录：**邮箱 + 密码**（注册即用，不强制验邮）。忘记密码走「找回」→ 邮件收 6 位码 → App 内填码重置，只有这一步需要 `RESEND_API_KEY`；本机没配 Key 时验证码会打到 API 日志。也可开 `DEV_AUTH=1` 用「开发登录」跳过。  
`APP_ORIGIN` 本机请设为 `http://127.0.0.1:5173`（与 Vite 同源，便于设 cookie）。

若本机访问 Gemini 需要代理，在 `apps/api/.env` 加：

```env
HTTPS_PROXY=http://127.0.0.1:7890
```

## 地图数据源

引擎是 MapLibre GL（本身不含地理数据）。数据分两条独立链路，各自需要一个**不同类型**的天地图 key：

| 链路 | 用途 |变量 | key 类型 |
|---|---|---|---|
| 底图瓦片 | 地图页显示 | `VITE_TIANDITU_KEY`（放`apps/web/.env.local`） | **浏览器端**，需配域名白名单 |
| 底图备用（可选） | 主 key 瓦片失败时切换 | `VITE_TIANDITU_KEY_FALLBACK` / `VITE_TIANDITU_KEY_FALLBACK_2`（也可在前者逗号分隔多把） | **浏览器端** |
| 逆地理编码 | 坐标 → 国家，喂给稀有度与引入种判定 | `TIANDITU_SERVER_KEY`（放 `apps/api/.env`） | **服务端** |

浏览器端与服务端**不可混用**。申请：<https://console.tianditu.gov.cn/> → 应用管理 → 创建应用，个人实名即可；备用底图同账号再开浏览器端应用即可，不必新账号。

**都留空也能跑**，只是降级：

- 底图回落内置简图（`public/map/ne_50m_countries_chn_pov.geojson`，Natural Earth 1:50m 国界 / China POV，**无国名注记**）
- 国别判定走内置离线国界数据（`apps/api/data/geo/countries-10m.topo.json`，源自 Natural Earth，公有领域 CC0）

运行时回落链：**主浏览器端 key → 备用 key → 内置简图**（已移除 OpenFreeMap）。

> ⚠️ **合规提示**：天地图由自然资源部主管，为官方审核版本；`VITE_*` 天地图变量是构建时内联的，**改后必须重新 build**。
> **将本项目部署到公网者，需自行确认所在地对地图服务的合规要求**（在中国大陆公开提供地图服务通常需使用具备审图号的服务并在界面标注）。
> 选型经过见 [`docs/planning/04f-世界地图选型.md`](docs/planning/04f-世界地图选型.md) §12。

## 仓库结构

```text
apps/api             Node + Hono + SQLite(libsql) + Gemini/GLM
apps/web             Vite + React + MapLibre
  src/themes/        皮肤主题（默认 clear，备选 daylight）
packages/messages    统一界面/术语文案（默认 zh）
deploy/              生产 env / Nginx 模板
Dockerfile           API 镜像
docker-compose.yml   本机环回 8787
data/                本地库与上传图（gitignore）
docs/                SPEC 功能真源 / OPS 运维真源 / features 专题 / planning 来时路
model-bakeoff/       多模型对照脚本（独立）
```

表现层：文案 → `packages/messages`；皮肤 → `apps/web/src/themes/`；流程页不写死品牌色。  
加皮肤步骤见 [`docs/features/皮肤主题.md`](docs/features/皮肤主题.md)。

## 云部署

见 [`docs/OPS.md`](docs/OPS.md)（架构背景在其附录 A）。

## model-bakeoff

同图对照各家视觉 API 的本地脚本。复制 `model-bakeoff/.env.example` 为 `.env` 并填入自己的 Key（**不要提交 `.env`**）。

```powershell
cd model-bakeoff
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python run_bakeoff.py --inspect-only
```

## 许可

文档与脚本仅供个人非营利探索；第三方模型与地图服务条款以各厂商为准。
