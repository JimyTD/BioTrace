# BioTrace 部署运维铁律（AI agent 必须遵守 / MUST FOLLOW）

> 适用范围：任何操作 BioTrace 服务器（腾讯云广州机 `lhins-a3h64ndx` / `106.53.188.20`）或其代码仓库的 agent。
> 违反下列任一条都可能造成**密钥泄露、改动永久丢失、或线上服务中断**。这是铁律，不是建议。
> 详细操作步骤见 `docs/OPS.md` §7。

## 1. 数据来源单一性（git 是唯一工程来源）

- 服务器 `/opt/biotrace` 是 GitHub `https://github.com/JimyTD/BioTrace.git` 的 clone，**只作运行态**。
- 所有工程内容（代码、资源、非密钥的运维配置）的**唯一来源是 git**。
- 修改流程**只有一条**：改本地 → push 到 GitHub → 服务器 `git pull` → 重建。
- **禁止**在服务器上直接修改任何被 git 跟踪的文件（会造成两边分叉、下次 pull 冲突或被覆盖）。
- 若确需在服务器紧急热修，事后**必须把改动回填到本地仓库并提交**，不得留在"服务器本地未提交"状态。

## 2. 隐私信息彻底抽离 git（永不入库）

- 真实密钥**只存在于服务器本地** `deploy/.env.production`（已 gitignore，历史从未入库）。
  - 含：`RESEND_API_KEY` / `GEMINI_API_KEY` / `ZHIPU_API_KEY` / `SESSION_SECRET` / `HTTPS_PROXY` 等。
- git 里只放 `deploy/.env.production.example`（全占位符模板）。
- **绝对禁止**把真实密钥写进任何入库文件——包括代码、文档、注释、commit message。
- `*.pem` 等证书私钥同样 gitignore，永不入库。
- 因`.env.production` 未被 git 跟踪，`git pull` 不会碰它，密钥安全——**不要试图"同步"或"还原"它到 git**。

## 3. 🚫 禁止 `git reset --hard` / `git checkout -- <file>` 丢弃服务器改动

- 这类命令会**无差别永久删除**服务器上未提交的改动，无法恢复。
- 服务器更新一律用 `git pull --ff-only`（只快进；有分叉会报错而非静默覆盖，逼你先查清）。
- 仅当**已100% 确认**被丢内容都已在 GitHub 且已备份到 `/root/biotrace-preupdate-bak/` 时，才可例外。

## 4. 运维配置（非密钥）必须入库

- `docker-compose.override.yml` 必须包含并保留：
  - `build.dockerfile: deploy/Dockerfile.cn`（国内镜像加速构建）
  - `extra_hosts: ["host.docker.internal:host-gateway"]`（容器走宿主机 Xray 代理 :10809，出境访问 Gemini/Resend 的关键）
- 该文件**已入库**，`git pull` 后代理链路仍在。若发现它缺 `extra_hosts`，属回归缺陷，须修复并提交。

## 5. 服务器直连 GitHub 不通→ git操作必须走代理

- 国内网络直连 GitHub 会超时。`git pull/fetch` 必须加：`git -c http.proxy=http://127.0.0.1:10809 pull --ff-only`。
- 构建/拉取属长任务，**必须 `nohup ... &` 后台运行**再轮询日志，否则 Lighthouse 单命令超时会被中断。

## 6. 每次更新后验证代理链路

```bash
docker compose exec -T api sh -c 'echo $HTTPS_PROXY; getent hosts host.docker.internal'
curl -s -m 12 -x http://127.0.0.1:10809 https://api.ipify.org   # 应为 SG1 出口IP
```
