# BioTrace 部署实操手册（持续维护）

> **这是 BioTrace 上线与运维的唯一操作手册**，反映真实落地方案，随版本更新持续维护。
> **本文件是运维真源。** 架构背景、设计约定与天地图接入坑见文末[附录 A](#附录-a架构背景与设计约定)；业务功能见 [`SPEC.md`](./SPEC.md)。
>
> 最后更新：2026-08-13 · 当前阶段：**第二阶段（IP + HTTP + Resend 真实邮箱登录）已上线**；`DEV_AUTH=0`、Resend 走自有验证域名 `jettechdog.icu` 发信；已接入**境外出网代理（广州→新加坡 Xray）**保障 Resend/Gemini 出境；运维通道改为 Cursor MCP `tencent-lighthouse`（见 §2.1）；Android APK 为按需制品（见 §7.2）
>
> 🔒 **更新前必读**：[§7.0 数据来源单一性铁律](#70-铁律数据来源单一性错一次后果严重务必遵守)——git 为唯一工程来源、隐私靠服务器本地 `.env`、禁止 `reset --hard`。

---

## 1. 目标与分阶段策略

BioTrace 是个人向「旅行自然观察」Web 应用（上传照片 → 云识图 → 抽卡开包 → 图鉴/地图）。
考虑到域名备案成本，采用**分阶段上线**：

| 阶段 | 访问方式 | 登录 | Cookie | 说明 | 状态 |
|------|---------|------|--------|------|------|
| **一** | `http://106.53.188.20` | `DEV_AUTH=1` 过渡 | `COOKIE_SECURE=0` | IP 直连，免备案，先跑通功能 | ✅ 已完成（已进入二） |
| **二（当前）** | 同上 | 邮箱+密码（Resend 仅用于找回） | 同上 | Resend 域名已验证；日常登录不发信；社交能力后置 | ✅ 已上线 |
| **三（远期）** | `https://bio.jettechdog.icu` | 邮箱+密码 | `COOKIE_SECURE=1` | 迁境外机 / 或大陆机备案后上域名 + HTTPS | ⏳ 规划 |

**为什么这么分**：大陆服务器上，未备案域名的 80/443 会被腾讯云拦截（合规硬性要求）；用 IP 直连不受限。套安卓壳后 API 地址内置、用户不可见，IP 直连体验无损。故先用 IP 跑起来，域名/HTTPS 放到迁移或备案后处理。

**Android 壳（Cut 6）**：见 [`features/Android套壳.md`](./features/Android套壳.md)。壳内 `server.url` 必须等于本表「访问方式」同源（当前 `http://106.53.188.20`）。HTTP 阶段服务器侧保持 `COOKIE_SECURE=0`，否则 WebView 会话会掉。改壳地址：`apps/mobile/server-url.txt` → `pnpm mobile:sync`。侧载包发布见 [§7.2](#72-发布-android-侧载包github-actions)。**日常只更新服务器即可**——壳是远程 WebView，不必随每次 Web/API 提交重打 APK。

---

## 2. 环境信息

| 项 | 值 |
|----|----|
| 云商|腾讯云轻量应用服务器（Lighthouse） |
| 地域/实例 | 广州 `ap-guangzhou` / `lhins-a3h64ndx`（名"BioTrack"） |
| 公网 IP | `106.53.188.20` |
| 系统 | Ubuntu 24.04.4 LTS x86_64，2C / 2G RAM / 40G |
| swap | 自带 2G（无需再建） |
| **出境代理机SG1** | 新加坡 `ap-singapore`，跑 Xray VLESS+Reality(TCP:443) + Hysteria2(UDP:8443)。**节点地址与全部密钥参数见其机上 `/root/proxy-setup.md`（保密，不入本仓库）**。BioTrace 仅复用其 Reality 节点做出境，SG1 零改动、零感知（详见 §6.5） |
| 操作方式 | **Cursor MCP `tencent-lighthouse`**（TAT 免 SSH 执行；当前无 SSH 密钥；命令默认以 root 执行）。MCP 源码在仓库外 `D:/Fun/tencent-lighthouse-mcp/`，本仓只留接入配置，见下方 §2.1 |
| 代码目录 | `/opt/biotrace`（GitHub `https://github.com/JimyTD/BioTrace.git`，公开可clone） |
| 数据目录 | `/opt/biotrace/data`（`biotrace.db` + `uploads/`），Docker 卷 `./data:/data` |
| 前端产物 | `/var/www/biotrace`（由 Nginx 提供静态） |
| Nginx 站点 | `/etc/nginx/sites-available/biotrace`（80 端口，静态 + `/api` 反代8787） |
| 防火墙 | 云侧已放行 22/80/ICMP（**443 待上HTTPS 时再放行**）；系统 ufw inactive |

> ⚠️ 原生 TAT `Timeout` 默认仅 60 秒；本 MCP 已默认拉到 **3600 秒**。超长构建仍建议写日志文件再 `tail`，客户端等待预算耗尽时用返回的 `InvocationId` 调 `get_command_result` 继续轮询。

### 2.1 Cursor MCP 运维通道（tencent-lighthouse）

MCP **刻意不进本仓库**，放在 `D:/Fun/tencent-lighthouse-mcp/`。本仓只提供项目级接入模板。

| 文件 | 是否提交 | 作用 |
|------|---------|------|
| `.cursor/mcp.json.example` | ✅ | 模板：Node 绝对路径、MCP 入口、地域/实例白名单 |
| `.cursor/mcp.json` | ❌（gitignore） | 本地副本，填入子账号密钥后生效 |

**一次性接入：**

1. 腾讯云 CAM 建**子账号**（勿用主账号密钥），授予 `QcloudTATFullAccess` + `QcloudLighthouseReadOnlyAccess`，策略尽量限定到实例 `lhins-a3h64ndx`。
2. 复制模板并填密钥：
   ```powershell
   Copy-Item .cursor\mcp.json.example .cursor\mcp.json
   # 编辑 .cursor/mcp.json：填入 TENCENTCLOUD_SECRET_ID / SECRET_KEY
   ```
3. 本机 PATH 无 `node` 时，模板已指向 CodeBuddy 托管的 Node；长期建议安装官方 Node LTS，再把 `command` 改成 `"node"`。
4. 重启 Cursor → Settings → MCP，应看到 `tencent-lighthouse` 的 6 个工具。
5. 连通性（在 MCP 目录）：
   ```powershell
   & "C:\Users\jimygong\.workbuddy\binaries\node\versions\22.22.2\node.exe" D:\Fun\tencent-lighthouse-mcp\scripts\smoke.mjs --live
   ```

**安全约定：** 保持 `TCMCP_ALLOWED_REGIONS` / `TCMCP_ALLOWED_INSTANCES`；Cursor 里不要给 `run_command` 自动批准。

---

## 3. 组件与端口

```text
Browser ──HTTP──► Nginx :80（宿主机）
                ├── 静态 /var/www/biotrace       ← apps/web/dist
                    └── /api/* ──► 127.0.0.1:8787← Docker biotrace-api
                                     volume ./data → /data
                                       ├── biotrace.db（启动自动迁移）
                                       └── uploads/
Browser ──直连──► 天地图瓦片（失败则备用浏览器端 key → 内置简图；勿在服务器反代）

出境流量（Resend 发信 / Gemini 识图）：
  容器 ──HTTPS_PROXY──► 宿主机 Xray :10809──Reality──► SG1(新加坡, 地址见 /root/proxy-setup.md) ──► 境外 API
  识图：Gemini（走上面的代理）/ 智谱 GLM（国内直连兜底）── 当前均未配 Key
```

- API **只**监听 `127.0.0.1:8787`（compose 端口映射写死），公网不可直达，只经 Nginx。
- 前端全部走相对路径 `/api/...`，与站点同源，**换 IP / 换域名都无需改前端代码**。
- 广州机直连境外（Resend/Gemini）不稳（握手抖动/超时），故所有出境流量统一经宿主机 Xray → 新加坡出网，详见 **§6.5**。

---

## 4. 从零部署（全新机器复现）

> 已上线机器无需重跑本节。换机 / 重装时按序执行。命令通过 Cursor MCP `tencent-lighthouse` 的 `run_command` 下发（见 §2.1）。

### 4.1 安装系统依赖 + Docker（国内镜像源）

```bash
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -y
sudo apt-get install -y --no-install-recommends nginx ca-certificates curl rsync git

# Docker：官方源 download.docker.com 在国内握手常失败，改用腾讯云镜像源
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://mirrors.tencentyun.com/docker-ce/linux/ubuntu/gpg | sudo gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] https://mirrors.tencentyun.com/docker-ce/linux/ubuntu noble stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin docker-buildx-plugin
sudo systemctl enable --now docker

# Docker 拉镜像加速（腾讯云内网）
echo '{"registry-mirrors":["https://mirror.ccs.tencentyun.com"]}' | sudo tee /etc/docker/daemon.json
sudo systemctl restart docker
```

> Ubuntu 版本非 24.04(noble) 时，把 URL 里的 `noble` 换成对应代号（jammy=22.04）。

### 4.2 拉取代码

```bash
sudo rm -rf /opt/biotrace
sudo git clone https://github.com/JimyTD/BioTrace.git /opt/biotrace
sudo mkdir -p /opt/biotrace/data
```

仓库内已含国内加速构建文件 `deploy/Dockerfile.cn` 与 `docker-compose.override.yml`，`git clone` 后自动生效。

### 4.3 写生产环境变量（第一阶段 IP + HTTP）

```bash
SECRET=$(openssl rand -hex 32)
sudo tee /opt/biotrace/deploy/.env.production > /dev/null <<EOF
SESSION_SECRET=$SECRET
DEV_AUTH=1
APP_ORIGIN=http://106.53.188.20
CORS_ORIGIN=http://106.53.188.20
COOKIE_SECURE=0
NODE_ENV=production
RESEND_API_KEY=
MAIL_FROM=BioTrace <onboarding@resend.dev>
GEMINI_API_KEY=
GEMINI_MODEL=gemini-flash-latest
HTTPS_PROXY=
#↑ 大陆机需出境（Resend/Gemini）时填宿主机代理：http://host.docker.internal:10809，先按 §6.5 搭好Xray→SG1
ZHIPU_API_KEY=
ZHIPU_VL_MODEL=glm-4v-flash
ZHIPU_BASE_URL=https://open.bigmodel.cn/api/paas/v4
GBIF_ENABLED=1
IDENTIFY_CONCURRENCY=1
DISPLAY_MAX_EDGE=1600
EOF
```

> 关键点：`APP_ORIGIN`/`CORS_ORIGIN` **必须**与浏览器地址栏完全一致（含协议、无尾斜杠），否则登录后掉会话 / CORS 报错。

### 4.4 构建并启动 API（后台构建，避免超时）

```bash
cd /opt/biotrace
sudo bash -c 'nohup docker compose build > /opt/biotrace/build.log 2>&1 & echo $! > /opt/biotrace/build.pid'
# 轮询：直到出现 "Built" / 生成镜像
tail -20 /opt/biotrace/build.log
sudo docker images | grep biotrace-api

# 启动
sudo docker compose up -d
sudo docker compose ps
curl -s http://127.0.0.1:8787/api/health    # 期望 {"ok":true,...}
```

API 启动时自动执行数据库迁移（生成 `data/biotrace.db` 与 `data/uploads/`），**无需手动 db:push**。

### 4.5 构建前端并部署（用 Node22 容器，宿主机免装 Node）

```bash
sudo mkdir -p /var/www/biotrace
cd /opt/biotrace
sudo bash -c 'nohup docker run --rm -v /opt/biotrace:/app -w /app \
  -e npm_config_registry=https://registry.npmmirror.com node:22-bookworm-slim \
  bash -lc "corepack enable && pnpm install --frozen-lockfile --filter @biotrace/web... && pnpm --filter @biotrace/web build" \
  > /opt/biotrace/webbuild.log 2>&1 & echo $! > /opt/biotrace/webbuild.pid'
# 轮询直到 "built in"，产物在 apps/web/dist
tail -20 /opt/biotrace/webbuild.log

sudo rsync -a --delete /opt/biotrace/apps/web/dist/ /var/www/biotrace/
sudo chown -R www-data:www-data /var/www/biotrace
```

### 4.6 配置 Nginx（IP + HTTP）

```bash
sudo tee /etc/nginx/sites-available/biotrace > /dev/null <<'NGINX'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name 106.53.188.20 _;

    client_max_body_size 20m;
    root /var/www/biotrace;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
    location / { try_files $uri $uri/ /index.html; }
}
NGINX
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/biotrace /etc/nginx/sites-enabled/biotrace
sudo nginx -t && sudo systemctl reload nginx
```

云防火墙需放行 80（本机已放行）。验证：`curl http://106.53.188.20/api/health`。

---

## 5. 第二阶段：接入 Resend 真实邮箱 ✅ 已完成（2026-08-07）

目标：关闭 `DEV_AUTH`，让**任何人**都能注册登录，且忘记密码时收得到验证码。**已落地**：Resend 自有发信域名 `jettechdog.icu` 已验证、`RESEND_API_KEY` 已配置、`DEV_AUTH=0`、`MAIL_FROM=BioTrace <noreply@jettechdog.icu>`，服务器实际生效。以下记录为落地过程与复现步骤。

**注意登录不发信**：主路径是邮箱+密码（见 [`SPEC.md`](./SPEC.md) §5），Resend **只用于找回密码的 6 位码**。本节最初是为已下线的邮箱魔法链接搭的，但发信域名这套配置对找回码同样必需，故保留。

**为什么需要自有域名**：用默认 `onboarding@resend.dev` 只能发到你本人注册 Resend 的邮箱；要发给别人，须在 Resend 验证一个自有发信域名。**验证发信域名只改 DNS，与网站备案无关，不需要备案。**

**步骤（用户侧）**
1. 注册 [Resend](https://resend.com)（免费额度：100 封/天、3000 封/月，个人自用足够），拿到 `RESEND_API_KEY`。
2. Resend 后台 → Domains → 添加 `jettechdog.icu`（或子域）→ 得到几条 DNS 记录（SPF/DKIM）。
3. 在 **DNSPod** 控制台给该域名加上这些记录，等待 Resend 显示 Verified。

**步骤（服务器侧，我来做）**
```bash
# 编辑 /opt/biotrace/deploy/.env.production
RESEND_API_KEY=re_xxx
MAIL_FROM=BioTrace <noreply@jettechdog.icu>   # 用已验证域名（实际落地值）
DEV_AUTH=0
# 重启使配置生效
cd /opt/biotrace && sudo docker compose up -d --force-recreate
curl -s http://127.0.0.1:8787/api/health   # devAuth 应为 false
```

> ✅ **已验证并上线**：域名 `jettechdog.icu` 已在 Resend 验证通过，`DEV_AUTH=0` 已生效，任何人都能注册并收到找回码。（历史提示：域名验证通过前只有你本人 Resend 注册邮箱能收信，其他人须暂用 `DEV_AUTH=1`——现已不适用。）
>
> ⚠️ **发信出境走代理**：广州机直连 `api.resend.com` 不稳（间歇 `ConnectTimeoutError`），已通过 `HTTPS_PROXY`（宿主机 Xray→新加坡）让发信出境。代码 `apps/api/src/mail/resend.ts` 用 undici `ProxyAgent(HTTPS_PROXY)` 自动生效，无需改代码。代理搭建/维护见 **§6.5**。

---

## 6. 接入识图 Key（Gemini / 智谱 GLM）

编辑 `deploy/.env.production` 后 `docker compose up -d --force-recreate`。

- **智谱 GLM（推荐先配，国内直连免代理）**：`ZHIPU_API_KEY=...`
- **Gemini（国内需境外代理）**：`GEMINI_API_KEY=...`。`HTTPS_PROXY` 已就位（§6.5），**只填 Key 重启即可**，Gemini 自动走新加坡出境，无需再动网络配置。
- 两者都配时：Gemini 为主，限流/日额尽自动切 GLM。
- 验证：`curl -s http://127.0.0.1:8787/api/health` 看 `geminiConfigured`/`zhipuConfigured`；实际识图时日志出现 `[identify] ok provider=gemini|zhipu`。

---

## 6.5 境外出网代理（广州机 → 新加坡 SG1）

**为什么需要**：广州机直连境外 API（Resend 发信、Gemini 识图）握手抖动严重、间歇超时。复用用户已有的新加坡机 SG1 的 Reality 节点，让广州机出境流量经新加坡转发。**SG1 只是被当普通翻墙节点连接，无任何逻辑/负载改动、零感知。**

架构：
```text
广州机容器 ──HTTPS_PROXY=http://host.docker.internal:10809──►
  宿主机 Xray(HTTP 入口 10809 / SOCKS 10808) ──VLESS+Reality──►
    SG1(新加坡, 地址见 /root/proxy-setup.md):443 ──► Resend / Gemini
```

### 关键点（务必理解，避免踩坑）
1. SG1 上暴露的是 **VLESS+Reality(443) / Hysteria2(8443)**翻墙**节点**协议，**不是**标准 HTTP/SOCKS 代理，广州机不能直接 `HTTPS_PROXY` 指向它。必须在**广州机本地**跑 Xray 客户端，把节点转成本地正向代理入口。
2. Xray HTTP 入口须监听 `0.0.0.0`（而非 `127.0.0.1`），否则 Docker 容器经 `host.docker.internal`(host-gateway，通常 `172.17.0.1`) 访问不到。监听 `0.0.0.0` 后**必须**用 iptables 只放行 docker 网段+本机、DROP 其余，防止 10809 被公网利用（Lighthouse 安全组默认不放 10809，属双保险）。
3. Reality 节点的**地址、UUID、publicKey、shortId、serverName 等全部参数属机密，只存于 SG1 机上 `/root/proxy-setup.md`，切勿写入本（开源）仓库**。下面配置里这些值均用 `<占位符>` 表示，落地时从该文档取真实值填入。换节点时也以该文档为准。

### 搭建步骤（广州机，SG1 零改动）

**① 装 Xray-core**（GitHub 直连慢，用国内加速镜像；x86_64）
```bash
cd /tmp; ver=v26.3.27
for m in 'https://ghfast.top/https://github.com' 'https://gh-proxy.com/https://github.com'; do
  curl -fsSL -m 90 -o xray.zip "$m/XTLS/Xray-core/releases/download/$ver/Xray-linux-64.zip" && break
done
unzip -o xray.zip xray -d /tmp/ && install -m 755 /tmp/xray /usr/local/bin/xray && xray version | head -1
```

**② 写配置**（HTTP 入口 `0.0.0.0:10809` + SOCKS `127.0.0.1:10808` + Reality 出站）
> 下面 `<...>` 占位符请用 SG1 `/root/proxy-setup.md` 里的真实值替换后再执行（勿把真实值提交回仓库）。
```bash
mkdir -p /usr/local/etc/xray
cat > /usr/local/etc/xray/config.json <<'JSON'
{
  "log": { "loglevel": "warning" },
  "inbounds": [
    { "tag":"http-in","listen":"0.0.0.0","port":10809,"protocol":"http",
      "sniffing":{"enabled":true,"destOverride":["http","tls"]} },
    { "tag":"socks-in","listen":"127.0.0.1","port":10808,"protocol":"socks",
      "settings":{"udp":true} }
  ],
  "outbounds": [
    { "tag":"reality-sg1","protocol":"vless",
      "settings":{"vnext":[{"address":"<SG1_IP>","port":443,
        "users":[{"id":"<UUID>","encryption":"none","flow":"xtls-rprx-vision"}]}]},
      "streamSettings":{"network":"tcp","security":"reality",
        "realitySettings":{"serverName":"<SNI>","fingerprint":"chrome",
          "publicKey":"<PUBLIC_KEY>","shortId":"<SHORT_ID>","spiderX":"/"}}
    },
    { "tag":"direct","protocol":"freedom" }
  ]
}
JSON
xray run -test -config /usr/local/etc/xray/config.json   # 期望 Configuration OK
```

**③ systemd 开机自启**
```bash
cat > /etc/systemd/system/xray.service <<'UNIT'
[Unit]
Description=Xray Service (Reality client -> SG1)
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
ExecStart=/usr/local/bin/xray run -config /usr/local/etc/xray/config.json
Restart=on-failure
RestartSec=3
LimitNOFILE=1048576
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload && systemctl enable --now xray && systemctl is-active xray
ss -tlnp | grep -E '10808|10809'
```

**④ iptables 保护 10809（只允许 docker 网段/本机），并持久化**
```bash
iptables -I INPUT -p tcp --dport 10809 -s 127.0.0.1 -j ACCEPT
iptables -I INPUT -p tcp --dport 10809 -s 172.16.0.0/12 -j ACCEPT
iptables -A INPUT -p tcp --dport 10809 -j DROP
DEBIAN_FRONTEND=noninteractive apt-get install -y -q iptables-persistent
mkdir -p /etc/iptables && iptables-save > /etc/iptables/rules.v4   # 重启后自动恢复
```

**⑤ 让容器走代理**（改override + env，重启）
```bash
# docker-compose.override.yml 的 api 服务加extra_hosts（让容器解析 host.docker.internal）
#   extra_hosts:
#     - "host.docker.internal:host-gateway"
# deploy/.env.production：
#   HTTPS_PROXY=http://host.docker.internal:10809
cd /opt/biotrace && docker compose up -d api
```

### 验证
```bash
# 本机经代理出口 IP 应为 SG1
curl -s -m 12 -x http://127.0.0.1:10809 https://api.ipify.org# 期望等于 SG1 公网 IP
# 容器内已注入代理
docker compose exec -T api sh -c 'echo $HTTPS_PROXY; getent hosts host.docker.internal'
# 端到端：触发真实发信（返回 ok:true / HTTP 200；日志无 ConnectTimeout即通）
curl -s -X POST http://127.0.0.1:8787/api/auth/login -H 'Content-Type: application/json' -d '{"email":"你的邮箱","password":"你的密码"}'
```
> Resend 免费版限速约 2 请求/秒，连发时出现 `429` 属正常限流（恰证明请求已到达 Resend），非网络故障。

### 维护 / 排障
| 现象 | 排查 |
|------|------|
| 发信/识图又超时 | `systemctl status xray`；`curl -x http://127.0.0.1:10809 https://api.ipify.org` 看能否出SG1 IP |
| 容器连不到代理 | 确认 xray 监听 `0.0.0.0:10809`（非 127）；容器内 `getent hosts host.docker.internal` 有解析；`HTTPS_PROXY` 已注入 |
| SG1 换节点/参数变了 | 以 SG1 `/root/proxy-setup.md` 为准，改 `/usr/local/etc/xray/config.json` 的 outbound → `xray run -test` → `systemctl restart xray` |
| 服务器重启后失效 | xray 已`enable`（开机自启）；iptables 已存 `/etc/iptables/rules.v4`（iptables-persistent 恢复）——两者都在则自动恢复 |
| 迁到境外机后 | 境外机直连境外通常免代理：`.env` 的 `HTTPS_PROXY` 留空、无需装 xray（见 §9） |

---

## 7. 版本更新（日常最常用）

### 7.0 🔒铁律：数据来源单一性（错一次后果严重，务必遵守）

> 这不是"设计建议"，是**硬性规则**。历史上曾因两边各自修改导致改动丢失/代理配置被覆盖。

1. **git 是全部工程内容（代码、资源、运维配置）的唯一来源**。
   - 服务器 `/opt/biotrace` 是 GitHub 的 clone，**只作运行态，永不在其上手改被git 跟踪的文件**。
   - 需要改逻辑/资源/运维配置 → **先改本地 → push GitHub → 服务器 `git pull`**。绝不在服务器上直接改 tracked 文件（会造成两边分叉，下次 pull 冲突或被 reset 丢弃）。
2. **隐私信息彻底抽离 git，只存在于服务器本地**，git 里只放空模板：
   | 文件 | 状态 | 说明 |
   |---|---|---|
   | `deploy/.env.production` | **仅服务器本地**（已 gitignore，从未入库） | 含`RESEND_API_KEY`/`GEMINI_API_KEY`/`ZHIPU_API_KEY`/`SESSION_SECRET`/`HTTPS_PROXY`等真实密钥 |
   | `deploy/.env.production.example` | 入库 | 全占位符模板，供复现部署时复制 |
   | `*.pem` | gitignore | 证书/私钥 |
   - 因为 `.env.production` 未被 git 跟踪，`git pull` **根本不会碰它**，密钥不会被覆盖。**永远不要把真实密钥写进任何入库文件**（含文档、代码、注释）。
3. **🚫 禁止在服务器上使用 `git reset --hard` / `git checkout -- <file>` 丢弃改动**，除非已100% 确认被丢内容都在 GitHub 里且已备份。它会**无差别永久删除**服务器本地未提交改动（曾差点丢失代理配置）。
4. **运维配置（非密钥）必须入库**，不要留在服务器"本地未提交"状态：
   - `docker-compose.override.yml`（含 `extra_hosts` 走代理 + `Dockerfile.cn`）——**已入库**，pull 后仍保留代理链路。
   - 若这类文件在服务器上被临时改过，正确做法是**回填到本地仓库并提交**，而不是让它在服务器上飘着。

### 7.1 标准更新流程（SOP）

> ⚠️ **服务器直连 GitHub 不通**（国内网络），`git pull` 必须**走宿主机 Xray 代理**（:10809）。

```bash
cd /opt/biotrace

# 0) 更新前必做：确认工作区干净（除.env.production 等gitignore 文件外，不应有 tracked 改动）
sudo git status -s
#若出现 tracked 文件的 " M"（已修改），停下来查清楚——那是服务器被手改的信号，
#    先把改动回填到本地仓库提交，切勿直接 pull / reset。

# 1) 走代理拉取（直连会超时）。构建/拉取属长任务，用后台跑避免 Lighthouse 命令超时。
sudo bash -c 'nohup bash -c "cd /opt/biotrace && git -c http.proxy=http://127.0.0.1:10809 pull --ff-only" > gitpull.log 2>&1 &'
sleep8 && cat gitpull.log      # 看到 Fast-forward / Already up to date 即成功

# 2) 后端有改动 → 重建并重启（走Dockerfile.cn，由 override 自动生效）
sudo bash -c 'nohup docker compose build api > build.log 2>&1 & echo $! > build.pid'
tail -f build.log      # 等 Built
sudo docker compose up -d api

# 3) 前端有改动 → 重新构建并同步
sudo bash -c 'nohup docker run --rm -v /opt/biotrace:/app -w /app \
  -e npm_config_registry=https://registry.npmmirror.com node:22-bookworm-slim \
  bash -lc "corepack enable && pnpm install --frozen-lockfile --filter @biotrace/web... && pnpm --filter @biotrace/web build" \
  > webbuild.log 2>&1 &'
tail -f webbuild.log   # 等 built in
sudo rsync -a --delete apps/web/dist/ /var/www/biotrace/
sudo chown -R www-data:www-data /var/www/biotrace

# 4) 验证（详见 §10验收清单）
curl -s http://127.0.0.1:8787/api/health
sudo docker compose exec -T api sh -c 'echo $HTTPS_PROXY; getent hosts host.docker.internal'  # 代理链路仍在
```

> - 用 `pull --ff-only`（而非 `reset --hard`）：只快进，若有分叉会**报错而非默默覆盖**，逼你先查清楚，符合铁律 §7.0-3。
> - 数据库 schema 变更在 API 启动时自动迁移，正常无需手动干预；重大变更前先备份（§8）。
> - `deploy/.env.production` 已 gitignore，pull 不会覆盖，密钥安全。

### 7.2 发布 Android 侧载包（GitHub Actions）

> 服务器更新（§7.1）只覆盖 Web/API。Android 薄壳是**独立制品**：用 GitHub Actions 打签名 release APK，挂到 GitHub Release 供侧载。细节与本机构建见 [`features/Android套壳.md`](./features/Android套壳.md)。

**更新节奏（重要）**

当前形态是 Capacitor **远程 WebView**：APK 只负责打开公网同源站点（`server.url`），页面与 API 一律走已部署的 Web。因此：

- **日常发版路径 = §7.1 更新服务器**。用户下次打开 App（或刷新）即见新前端/API，**不必**跟着每次 `main` 提交重打/重装 APK。
- APK 是**按需制品**，不是与 Web 同步的流水线；不要默认「服务器更新了就打一个新包」。

**何时才需要重打 APK**

| 需要重打 | 不需要重打 |
|----------|------------|
| 改了 `apps/mobile` 原生壳 / Manifest / 权限 | 只改 `apps/web` 前端 |
| 增删改 Capacitor 插件（如相机、文件选择） | 只改 `apps/api`、套册、文案、识图逻辑 |
| 改了 `server-url`（公网源地址变更） | 服务器按 §7.1 pull / 重建后已上线的内容 |
| 需要抬 `versionCode` 做可覆盖安装的升级包 | 同签名、同公网源下的功能迭代 |

**前置（一次性）**

1. 本机已有 release 签名库（仓库外，例如 `D:\Fun\BioTrace-secrets\biotrace-release.jks`），自行备份。
2. 仓库 Settings → Secrets and variables → Actions 已配置：
   - `ANDROID_KEYSTORE_BASE64`
   - `ANDROID_KEYSTORE_PASSWORD`
   - `ANDROID_KEY_ALIAS`
   - `ANDROID_KEY_PASSWORD`
3. 流水线文件：[`.github/workflows/android-release.yml`](../.github/workflows/android-release.yml)

**发版 SOP**

```bash
# 本地：确认要发布的提交已在 main 且已 push
git checkout main
git pull --ff-only

# 打 tag 并推送（版本号只升不降；对应 APK versionName / versionCode）
git tag android-v1.0.0
git push origin android-v1.0.0
```

或：GitHub → Actions → **Android Release APK** → Run workflow（填 `1.0.0`，可选改 `server_url`）。

**产物**

- Actions Artifact：`BioTrace-<version>.apk`（保留约 30 天）
- GitHub Release：同名 APK 附件（tag `android-v*` 或手动 Run 且勾选 Create Release）
- 默认壳内地址：`http://106.53.188.20`（可用 workflow 输入覆盖）

**发布到服务器（应用内「检查更新」真源 · 必做）**

GitHub Release **不够**：壳内检查读的是本机 API（`GET /api/app/android`），APK 必须落到服务器数据目录，且**只保留最新一份**。

目录（Docker 卷内，不被 §7.1 的 web `rsync --delete` 清掉）：

```text
/opt/biotrace/data/android-release/
  BioTrace.apk      # 固定文件名，每次覆盖
  latest.json       # 版本元数据，见 deploy/android-release.latest.json.example
```

`versionCode` 算法与 CI 一致：`major*10000 + minor*100 + patch`（如 `0.1.3` → `103`）。

在能拿到 APK 的机器上（本机下载 Release / Artifact 后上传，或服务器 curl）：

```bash
# 示例：版本 0.1.3；先把 BioTrace-0.1.3.apk 放到当前目录
VER=0.1.3
CODE=$((0*10000 + 1*100 + 3))   # → 103；按实际 major.minor.patch 算
DIR=/opt/biotrace/data/android-release

sudo mkdir -p "$DIR"
# 只留最新：覆盖固定名，删掉误放的带版本号副本
sudo cp -f "BioTrace-${VER}.apk" "$DIR/BioTrace.apk"
sudo rm -f "$DIR"/BioTrace-*.apk
sudo tee "$DIR/latest.json" >/dev/null <<EOF
{
  "versionName": "${VER}",
  "versionCode": ${CODE},
  "notes": ""
}
EOF
sudo chown -R root:root "$DIR"
sudo chmod 644 "$DIR/BioTrace.apk" "$DIR/latest.json"
```

验收：

```bash
curl -sS http://127.0.0.1:8787/api/app/android
# 应返回 versionName / versionCode / apkUrl
curl -sSI http://127.0.0.1:8787/api/app/android/apk | head
# 应 200，Content-Type 含 package-archive
```

可选环境变量：`ANDROID_RELEASE_DIR`（默认与 db 同级的 `android-release`；容器内即 `/data/android-release`）。

**应用内更新行为（产品约定）**

- 仅 Android 壳：「我的」显示版本 +「检查更新」；下载完成后**直接唤起系统安装页**（不必翻文件夹）。
- 同 minor 仅 patch 升高：不挡用，启动不弹窗。
- **第二位（minor）或 major 落后**：登录后进 App 强提示，不可跳过。
- 浏览器访问站点：不展示壳更新 UI（Web/API 仍按 §7.1 静默更新）。

> 首次带上「检查更新 / 下载安装」能力的壳，仍需**手动侧载一次**；之后用户即可应用内升级。缺 FilePicker 等插件的旧壳同理——先手装一版含新插件的包。

**验收**：真机安装 Release APK → 打开同源站点 → 登录不掉会话（与 §10 Android 项一致）→ 「我的」可检查更新；服务器已放包时能下载并弹出安装页。


---

## 8. 日常运维

```bash
# 查看日志
cd /opt/biotrace && sudo docker compose logs -f --tail=200 api

# 备份数据（数据库 + 上传图）
sudo tar czf /root/biotrace-data-$(date +%F).tgz -C /opt/biotrace data

# 重启 / 停止
sudo docker compose restart
sudo docker compose down

# 健康检查
curl -s http://127.0.0.1:8787/api/health
```

**建议**：给备份配一个定时任务；`data/uploads` 会随使用增长，注意 40G 磁盘余量。

### 8.1 管理后台（引导与密钥落盘）

产品能力见 [`features/管理后台.md`](./features/管理后台.md)。本节只写运行态：

- 入口：站点 `/admin`（独立 Cookie，不是普通用户）
- 首次启动：`deploy/.env.production`（或本地 `.env`）设 `ADMIN_BOOTSTRAP_USERNAME` + `ADMIN_BOOTSTRAP_PASSWORD`（≥8 位）；仅当 `admin_users` 为空时写入首个管理员
- 平台密钥覆盖：数据目录 `admin-runtime-secrets.json`（与 db 同级，已在 `/data` 卷内，勿提交 git）
- 存储页备份状态可选：`BIOTRACE_BACKUP_DIR` 指向存放 `biotrace-data-*.tgz` 的目录（只读展示，恢复仍按本节数据卷操作）

---

## 9. 第三阶段：迁移到境外机 + 域名 + HTTPS（远期）

场景：广州机到期，迁到境外机（如新加坡），用 `jettechdog.icu` 免备案上 HTTPS。

**数据可无缝迁移**（SQLite 单文件 + 本地图目录，全在 `./data`）：

```bash
# 旧机：打包数据
cd /opt/biotrace && sudo docker compose down
sudo tar czf /root/biotrace-data.tgz -C /opt/biotrace data

# 传到新机（scp / 对象存储中转），新机解到 /opt/biotrace/data
```

**新机步骤**
1. 按 §4.1–4.2 装环境、拉代码。若新机直连境外源很快，可删除 `docker-compose.override.yml` 用默认 `Dockerfile`（也可保留 .cn 无害）。
2. 解开数据包到 `/opt/biotrace/data`。
3. 域名：DNSPod 把 `bio.jettechdog.icu`（建议子域）A记录指向新机 IP。
4. 改 `deploy/.env.production`：
   ```
   APP_ORIGIN=https://bio.jettechdog.icu
   CORS_ORIGIN=https://bio.jettechdog.icu
   COOKIE_SECURE=1
   DEV_AUTH=0
   MAIL_FROM=BioTrace <login@jettechdog.icu>
   #境外机访问 Gemini 通常免代理：HTTPS_PROXY 可留空
   ```
   > 境外机通常直连境外 API 即可，**无需 §6.5 的 Xray 代理**（不用装xray / 加 extra_hosts）。若个别API 仍需转发再按§6.5 处理。
5. `docker compose up -d` 起API；构建并部署前端（§4.5）。
6. Nginx 用 HTTPS 版配置（见 [`deploy/nginx.biotrace.conf.example`](../deploy/nginx.biotrace.conf.example)，把 `biotrace.example.com` 换成 `bio.jettechdog.icu`），装 certbot 签证书：
   ```bash
   sudo apt-get install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d bio.jettechdog.icu
   ```
7. 放行云防火墙 443。验收 §10。

> 若坚持留在大陆广州机上域名：`jettechdog.icu` 注册商为 DNSPod（工信部名单内），可走「同商备案」；`.icu` 各省管局受理有差异，备案期 7–20 工作日，期间域名不可用。

---

## 10. 验收清单

**每次发布后冒烟**（无状态，逐次重跑；§7.1 步骤 4 引此）

1. `http://106.53.188.20/` 前端加载 HTTP 200
2. `http://106.53.188.20/api/health` 返回 `{"ok":true}`
3. 登录成功并种下 `bt_session`（HTTP 阶段非 Secure）
4. 创建旅途 → 上传 → 专家鉴定中 → 鉴定完成 → 请过目/收下 → 图鉴
5. 有 GPS 的点出现在地图，瓦片正常（控制台无 `[map]` warn）
6. 识图：Gemini 可调用，或日额尽自动切 GLM
7. `docker compose restart` 后数据仍在（`/opt/biotrace/data`）
8. 出境代理：`curl -x http://127.0.0.1:10809 https://api.ipify.org` 返回 SG1 公网 IP（§6.5）

**尚未完成 / 切 HTTPS 后再核对**
- [ ] Android 侧载 APK 打开同源站点且登录不掉会话（见 [`features/Android套壳.md`](./features/Android套壳.md)）
- [ ] 生产天地图 key 已配：构建前设 `VITE_TIANDITU_KEY`（浏览器端，白名单含生产域名）、可选 `VITE_TIANDITU_KEY_FALLBACK` / `VITE_TIANDITU_KEY_FALLBACK_2`（浏览器端备用）、服务端设 `TIANDITU_SERVER_KEY`。缺浏览器端 key 则直接用内置简图；缺服务端 key 则国别判定走离线国界数据。细节见[附录 A.5](#a5-天地图接入要点踩过的坑)
- [ ] 上线后留意控制台 `[map]` warn：配额 10000 次/日/key，超量当天拒绝、次日恢复。连续失败 6 次先切备用浏览器端 key，全部失败再切内置简图（国界 / China POV，无国名注记）
- [x] 地图审图号：已写入 `map.tiandituAttribution`（当前 `GS(2025)1508号`，取自官网首页 `mapdrawingApprovalNumber`）。**上架 / 大版本前再核对官网是否换号**，换则只改正文案 key
- [ ] HTTPS 阶段：`COOKIE_SECURE=1` 且登录会话稳定

---

## 11. 常见坑

| 现象 | 排查 |
|------|------|
| 长命令被判 TIMEOUT | 优先走 MCP `tencent-lighthouse`（默认 Timeout 3600s）；仍超时则写日志 + `get_command_result` 轮询；控制台原生集成仍仅约 60s |
| MCP 起不来 / 无工具 | 查 `.cursor/mcp.json` 是否存在且密钥非占位；`command` 是否指向可用 `node.exe`；Settings → MCP 看报错 |
| `run_command` 被护栏拦截 | 危险命令需显式 `confirmDangerous`；先 `describe_policy` / `check_agent`；确认实例在白名单 |
| 构建卡在 apt / deb.debian.org | 用 `deploy/Dockerfile.cn`（已换腾讯云源）；确认 `docker-compose.override.yml` 存在 |
| Docker 装不上（download.docker.com 握手失败）| 用腾讯云 docker-ce 镜像源（§4.1） |
| 登录后立刻掉会话 | HTTP 阶段必须 `COOKIE_SECURE=0`；`APP_ORIGIN`/`CORS_ORIGIN` 要和地址栏完全一致（含 Android WebView） |
| Android 白屏 / 无法加载 | 查 `apps/mobile/server-url.txt` 是否与公网源一致；是否已 `pnpm mobile:sync`；机子能否浏览器打开同 IP |
| Android Actions 构建失败（签名） | 查四件 Secrets 是否齐全；勿在日志中打印密码；keystore 是否为生成时那份 |
| 新 APK 无法覆盖安装 | 签名不一致（用了另一份 jks）或 `versionCode` 未升高；核对 tag 版本与 Secrets |
| 域名指大陆机打不开 | 未备案被拦；用 IP 访问，或迁境外机 / 完成备案 |
| 别人收不到找回码邮件 | Resend 发信域名未验证；仅本人邮箱能收；验证域名或临时开 `DEV_AUTH=1`（日常登录不发信） |
| 发信/识图间歇超时(ConnectTimeout) | 广州直连境外不稳；确认已走代理：xray `active` 且 `curl -x http://127.0.0.1:10809 https://api.ipify.org` 出 SG1 IP（§6.5） |
| 容器连不到宿主机代理 | xray 须监听 `0.0.0.0:10809`（非 127）；容器内 `getent hosts host.docker.internal` 需有解析（override 的 extra_hosts）；`HTTPS_PROXY` 已注入 |
| 服务器重启后代理失效 | 确认 `systemctl is-enabled xray`=enabled、`/etc/iptables/rules.v4` 含 10809 规则（§6.5 ④） |
| 前端 404 /api | Nginx 未反代 `/api/` 或 API 容器未在 127.0.0.1:8787 |
| Gemini 全失败 | 先确认代理通（§6.5）；`HTTPS_PROXY` 不可达时看日志；应自动试 GLM |
| 磁盘满 | 展示图在 `data/uploads`；定期备份清理 |

---

## 12. 关键文件速查

| 文件 | 作用 |
|------|------|
| `.cursor/mcp.json.example` | Cursor 腾讯云 Lighthouse MCP 接入模板（无密钥） |
| `.cursor/mcp.json` | 本地 MCP 配置（**gitignore，含子账号密钥，勿提交**） |
| `D:/Fun/tencent-lighthouse-mcp/` | MCP 源码与冒烟脚本（仓库外，不污染本仓） |
| `deploy/.env.production` | 生产环境变量（**gitignore，含密钥，勿提交**） |
| `docker-compose.yml` | API 服务定义（端口只绑 127.0.0.1:8787，卷./data:/data） |
| `docker-compose.override.yml` | 本地覆盖：①改用 `Dockerfile.cn` 构建；②api 加 `extra_hosts: host.docker.internal:host-gateway`（走宿主机代理）。**服务器侧文件，非 git 追踪** |
| `deploy/Dockerfile.cn` | 国内构建（apt→腾讯云、npm→npmmirror） |
| `/usr/local/etc/xray/config.json` | 广州机Xray 客户端配置（Reality→SG1 + 本地 10809/10808 入口），§6.5 |
| `/etc/systemd/system/xray.service` | Xray 开机自启服务 |
| `/etc/iptables/rules.v4` | iptables 持久化（含 10809 保护规则） |
| SG1 `/root/proxy-setup.md` | 新加坡机上的节点参数文档（Reality/Hysteria2 参数来源，不入本仓库） |
| `/etc/nginx/sites-available/biotrace` | Nginx 站点（当前 80/IP；HTTPS 版见example） |
| `deploy/nginx.biotrace.conf.example` | HTTPS + 域名版 Nginx 模板（第三阶段用） |
| `/opt/biotrace/data/android-release/` | 侧载 APK 真源（仅最新 `BioTrace.apk` + `latest.json`；§7.2） |
| `.github/workflows/android-release.yml` | Android 签名 APK 构建与 GitHub Release（§7.2） |
| `D:/Fun/BioTrace-secrets/`（仓库外） | Android release `.jks` 与凭据备份（**勿入库**） |

---

## 附录 A：架构背景与设计约定

> 原 `docs/07-部署-腾讯云轻量.md` 的仍然有效部分（2026-08-10 并入，该文已删）。  
> 那篇的「上机步骤」写的是理想终态（域名 + HTTPS），**已被本文正文取代**，不再保留。

### A.1 目标架构

```text
Browser ──HTTP(S)──► Nginx（宿主机）
                      ├── 静态 /var/www/biotrace  ← apps/web/dist
                      └── /api/* ──► 127.0.0.1:8787  ← Docker biotrace-api
                                         volume: ./data → /data
                                           ├── biotrace.db
                                           └── uploads/
API ──HTTPS_PROXY──► 新加坡代理 ──► Gemini / Resend
API ──直连──► 智谱 GLM、天地图（国内服务，勿走代理）
Browser ──直连──► 天地图瓦片（失败：备用浏览器端 key → 内置简图）
```

### A.2 机器规格（已拍板）

腾讯云轻量应用服务器，**2 核 / 2G / 40G**，Ubuntu 22.04 或 24.04 LTS x86_64，放行 22/80/443，**不需要 GPU**。2G 内存需 swap——当前机器自带 2G，`deploy/setup-swap.sh` 可跳过。

### A.3 不可违反的约定

- API **不对公网暴露 8787**，只给本机 Nginx 反代。
- Web **不是** Docker 服务：在宿主机或 CI 跑 `pnpm --filter @biotrace/web build`，产物同步到 `/var/www/biotrace`。
- 前端请求走相对路径 `/api/...`，故 Nginx 必须**同源**反代 `/api`。
- `APP_ORIGIN` 与 `CORS_ORIGIN` 必须和地址栏完全一致（含 Android WebView），无尾斜杠。
- 容器内固定 `DATABASE_URL=file:/data/biotrace.db`、`UPLOAD_DIR=/data/uploads`（compose 已写死，勿改成相对路径）。
- HTTP 阶段 `COOKIE_SECURE=0`，HTTPS 阶段改 `1`；写反了会立刻掉会话。
- 数据留在 SQLite + 本地盘，**不上** COS / 云数据库。
- 地图瓦片由浏览器直连，**不要**在服务器反代瓦片。

### A.4 需向所有者索取、且不得入库的秘密

`SESSION_SECRET`（长随机）、`GEMINI_API_KEY`、`ZHIPU_API_KEY`、`RESEND_API_KEY` + 已验证 `MAIL_FROM`、`HTTPS_PROXY` 完整 URL、`TIANDITU_SERVER_KEY`（服务端）、`VITE_TIANDITU_KEY`（浏览器端主 key，构建时内联）、可选 `VITE_TIANDITU_KEY_FALLBACK` / `VITE_TIANDITU_KEY_FALLBACK_2`（浏览器端备用）。

### A.5 天地图接入要点（踩过的坑）

- **浏览器端 / 服务端不可混用**：瓦片用浏览器端 key（配域名白名单，构建时内联，改后必须重新 build）；逆地理用服务端 key（不需白名单）。
- **备用底图 key**：同账号再创建浏览器端应用即可（不必新账号）；写入 `VITE_TIANDITU_KEY_FALLBACK` / `VITE_TIANDITU_KEY_FALLBACK_2`（前者也可逗号分隔多把）。回落链为 **主 key → 备用1 → 备用2 → 内置简图**（`apps/web/public/map/ne_50m_countries_chn_pov.geojson`，1:50m 国界 / China POV，无国名注记）。已移除 OpenFreeMap。构建 Web 时必须把这些 `VITE_*` 传进 build 环境（Vite 构建时内联），改完需重新 build / 同步 `/var/www/biotrace`。
- 瓦片必须用 `_w` 后缀（EPSG:3857，与 MapLibre 一致）；`_c` 是经纬度投影，接进去会错位。
- 浏览器端 key 只校验 User-Agent 像不像浏览器，**不强制 Referer**——泄露后伪造 UA 即可用，而配额仅 10000/日/key，**视为敏感信息并定期轮换**。
- 逆地理：`GET https://api.tianditu.gov.cn/geocoder?postStr={'lon':X,'lat':Y,'ver':1}&type=geocode&tk=KEY`，`postStr` **必须百分号编码**，取 `result.addressComponent.nation`（返回**中文常用简称**，需映射 ISO alpha-2）。
- 「成功但无国家」（海上，`status:"0"` + `nation` 为空串）与「调用失败」**必须分开**：前者直接采信 `null`，不触发离线兜底。
- 天地图是国内服务，**必须显式直连**：`identify/gemini.ts` 用 `setGlobalDispatcher` 装了出境代理，沿用全局 dispatcher 会把国内请求绕去境外。
- 坐标系 CGCS2000 ≈ WGS-84（民用精度），**EXIF 坐标直接用**，无需 GCJ-02 转换（若换高德/腾讯则必须转）。
- 配额实测：瓦片带 5 天浏览器缓存，首屏 18 次、一轮典型浏览累计 64 次，两层各有独立 10000/日额度。**费用与配额风险在瓦片，不在逆地理**（每张照片仅 1 次）。