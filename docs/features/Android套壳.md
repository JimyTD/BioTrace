# BioTrace Cut 6：Android 薄壳（侧载）

> Capacitor WebView 加载已部署的站点；**不上架应用商店**。架构见 [`planning/05-技术方案.md`](../planning/05-技术方案.md)；HTTP/IP 运维见 [`OPS.md`](../OPS.md)。

## 1. 形态与约束

| 项 | 结论 |
|----|------|
| 形态 | **Capacitor** Android WebView，`server.url` 指向公网站点（非 TWA） |
| 当前源 | `http://106.53.188.20`（见 [`apps/mobile/server-url.txt`](../../apps/mobile/server-url.txt)） |
| 分发 | 侧载 debug/release APK；不上 Play |
| 与后端 | 只读已部署站点；不改 API 契约 |
| 服务器配合 | HTTP 阶段必须 `COOKIE_SECURE=0`；`APP_ORIGIN`/`CORS_ORIGIN` 与地址栏一致 |

## 2. 仓库布局

```text
apps/mobile/
  capacitor.config.js   # 读 server-url.txt 或 BIOTRACE_SERVER_URL
  server-url.txt        # 改服务器地址后执行 pnpm mobile:sync
  www/                  # 本地占位页（正常会被 server.url 覆盖）
  android/              # Capacitor 原生工程（可 Android Studio 打开）
```

根脚本：`pnpm mobile:sync`、`pnpm mobile:open`。

## 3. 本机构建（侧载）

### 前置

- Node + pnpm（仓库已用）
- [Android Studio](https://developer.android.com/studio)（含 SDK / Platform Tools）
- 真机：开启「开发者选项 → USB 调试」；或导出 APK 手动安装

### 改服务器地址

1. 编辑 `apps/mobile/server-url.txt` 第一行有效 URL（无尾斜杠），或设环境变量 `BIOTRACE_SERVER_URL`。
2. 在仓库根执行：

```bash
pnpm install
pnpm mobile:sync
```

3. 用 Android Studio 打开 `apps/mobile/android`，Run 到真机；或命令行：

```bash
cd apps/mobile/android
.\gradlew.bat assembleDebug
# 产物：app\build\outputs\apk\debug\app-debug.apk
```

### Cleartext / 权限

- `capacitor.config.js`：`server.cleartext: true`、`android.allowMixedContent: true`
- Manifest：`usesCleartextTraffic` + [`network_security_config.xml`](../../apps/mobile/android/app/src/main/res/xml/network_security_config.xml)
- 权限：`INTERNET`、`CAMERA`、读写图片（相册上传）
- 插件：`@capacitor/camera`（相册页「拍照 / 从相册选择」；Web 部署后壳内生效）

备案并上 HTTPS 后：把 `server-url.txt` 改为 `https://…`，可再收紧 cleartext 配置。

## 4. GitHub Actions 发布（签名 release）

运维入口见 [`OPS.md` §7.2](../OPS.md)。技术要点如下。

| 项 | 说明 |
|----|------|
| Workflow | [`.github/workflows/android-release.yml`](../../.github/workflows/android-release.yml) |
| 触发 | 推送 tag `android-vX.Y.Z`，或 Actions 手动 Run |
| 产物 | 签名 `BioTrace-X.Y.Z.apk` → Artifact +（默认）GitHub Release |
| 版本 | tag / 输入的 `X.Y.Z` → `versionName`；`versionCode = X*10000 + Y*100 + Z`（`-PbiotraceVersion*`） |
| 公网源 | 默认 `BIOTRACE_SERVER_URL=http://106.53.188.20`；手动 Run 可改 |
| 签名 | GitHub Secrets 注入；**不**把 `.jks` 放进仓库 |

**Secrets（仓库 Settings → Actions）**

| Name | 内容 |
|------|------|
| `ANDROID_KEYSTORE_BASE64` | release `.jks` 的 base64 |
| `ANDROID_KEYSTORE_PASSWORD` | keystore 密码 |
| `ANDROID_KEY_ALIAS` | 如 `biotrace` |
| `ANDROID_KEY_PASSWORD` | key 密码 |

本机生成 base64（PowerShell）：

```powershell
[Convert]::ToBase64String(
  [IO.File]::ReadAllBytes("D:\Fun\BioTrace-secrets\biotrace-release.jks")
) | Set-Clipboard
```

> 丢失同一份 jks / 密码后，无法再打出可覆盖安装的同签名升级包；用户需卸载重装。密钥只放仓库外备份 + Actions Secrets。

## 5. 验收清单

- [ ] 真机安装 debug 或 **Release** APK，启动后进入与浏览器一致的站点首页
- [ ] 能走登录（邮箱+密码；找回用 App 内填重置码；会话 Cookie 杀进程后仍在）
- [ ] 主路径可点：旅途 / 上传识图 / 图鉴或地图（视账号数据而定）
- [ ] 「从相册选择」打开系统相册 / Photo Picker（不是通用文件管理）；一次一张
- [ ] 「拍照」可拍摄并上传
- [ ] 修改 `server-url.txt` → `pnpm mobile:sync` → 重装/重跑后指向新地址
- [ ] GitHub Release 附件可下载并安装；同签名升级时 `versionCode` 递增可覆盖安装
- [ ] **不**提交上架材料、不接 Play Console

## 6. 已知限制（本 Cut 不做）

- iOS / TWA / 应用商店上架
- App Links 深链回收魔法链接到 App 内（邮件仍可能外开浏览器）
- 批量多图上传（产品上一次一张观察）
