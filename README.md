# BioTrace

个人向「旅行自然观察」：选图识别 → 落入旅途相册与地图。

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
