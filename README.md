# BioTrace

个人向「旅行自然观察」：选图识别 → 落入旅途相册与地图。

**当前 Android 侧载包版本：`0.1.0`**（[Release](https://github.com/JimyTD/BioTrace/releases/tag/android-v0.1.0) · 发版见 [`docs/08` §7.2](docs/08-部署实操手册.md)）

> Cut 1–3 已收口。Cut 4（上云）制品在仓库内；**上机步骤见 [`docs/07`](docs/07-部署-腾讯云轻量.md)**。  
> 筹划 [`docs/00`](docs/00-讨论进程与决策.md) · 规格 [`docs/06`](docs/06-实现与功能规格.md)。

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

登录：邮箱魔法链接（需 `RESEND_API_KEY`）；本机无 Key 时可开 `DEV_AUTH=1` 用「开发登录」，链接也会打到 API 日志。  
`APP_ORIGIN` 本机请设为 `http://127.0.0.1:5173`（与 Vite 同源，便于验链设 cookie）。

若本机访问 Gemini 需要代理，在 `apps/api/.env` 加：

```env
HTTPS_PROXY=http://127.0.0.1:7890
```

## 地图数据源

引擎是 MapLibre GL（本身不含地理数据）。数据分两条独立链路，各自需要一个**不同类型**的天地图 key：

| 链路 | 用途 |变量 | key 类型 |
|---|---|---|---|
| 底图瓦片 | 地图页显示 | `VITE_TIANDITU_KEY`（放`apps/web/.env.local`） | **浏览器端**，需配域名白名单 |
| 逆地理编码 | 坐标 → 国家，喂给稀有度与引入种判定 | `TIANDITU_SERVER_KEY`（放 `apps/api/.env`） | **服务端** |

两者**不可混用**（服务端 key 调瓦片、浏览器端 key 调 API 都会被拒）。申请：<https://console.tianditu.gov.cn/> → 应用管理 → 创建应用，个人实名即可，无需营业执照。

**都留空也能跑**，只是降级：

- 底图回落 OpenFreeMap（OSM 数据）
- 国别判定走内置离线国界数据（`apps/api/data/geo/countries-10m.topo.json`，源自 Natural Earth，公有领域 CC0）

> ⚠️ **合规提示**：OpenFreeMap 使用 OSM 数据，其国界与地名表达在中国大陆法规下**不合规**（例如台湾被标为国家级要素），仅作开发与兜底用途。
> 天地图由自然资源部主管，为官方审核版本；`VITE_TIANDITU_KEY` 是构建时内联的，**改后必须重新 build**。
> **将本项目部署到公网者，需自行确认所在地对地图服务的合规要求**（在中国大陆公开提供地图服务通常需使用具备审图号的服务并在界面标注）。
> 选型经过见 [`docs/04f` §12](docs/04f-世界地图选型.md)。

## 仓库结构

```text
apps/api             Node + Hono + SQLite(libsql) + Gemini/GLM
apps/web             Vite + React + MapLibre
  src/themes/        皮肤主题（配色/字体；默认 daylight）
packages/messages    统一界面/术语文案（默认 zh）
deploy/              生产 env / Nginx 模板
Dockerfile           API 镜像
docker-compose.yml   本机环回 8787
data/                本地库与上传图（gitignore）
docs/                筹划 + 实现规格 + 07 部署
model-bakeoff/       多模型对照脚本（独立）
```

表现层：文案 → `packages/messages`；皮肤 → `apps/web/src/themes/`；流程页不写死品牌色。  
加皮肤步骤见 [`docs/06` §10](docs/06-实现与功能规格.md)。

## 云部署

见 [`docs/07-部署-腾讯云轻量.md`](docs/07-部署-腾讯云轻量.md)。

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
