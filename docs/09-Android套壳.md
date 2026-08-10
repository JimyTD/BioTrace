# BioTrace Cut 6：Android 薄壳（侧载）

> Capacitor WebView 加载已部署的站点；**不上架应用商店**。架构见 [`docs/05`](./05-技术方案.md)；HTTP/IP 运维见 [`docs/08`](./08-部署实操手册.md)。

## 1. 形态与约束

| 项 | 结论 |
|----|------|
| 形态 | **Capacitor** Android WebView，`server.url` 指向公网站点（非 TWA） |
| 当前源 | `http://106.53.188.20`（见 [`apps/mobile/server-url.txt`](../apps/mobile/server-url.txt)） |
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
- Manifest：`usesCleartextTraffic` + [`network_security_config.xml`](../apps/mobile/android/app/src/main/res/xml/network_security_config.xml)
- 权限：`INTERNET`、`CAMERA`、读写图片（相册上传）
- 插件：`@capacitor/camera`（相册页「拍照 / 从相册选择」；Web 部署后壳内生效）

备案并上 HTTPS 后：把 `server-url.txt` 改为 `https://…`，可再收紧 cleartext 配置。

## 4. 验收清单

- [ ] 真机安装 debug APK，启动后进入与浏览器一致的站点首页
- [ ] 能走登录（当前阶段多为 `DEV_AUTH`；魔法链接邮件可能在系统浏览器打开——可接受）
- [ ] 主路径可点：旅途 / 上传识图 / 图鉴或地图（视账号数据而定）
- [ ] 「从相册选择」打开系统相册 / Photo Picker（不是通用文件管理）；一次一张
- [ ] 「拍照」可拍摄并上传
- [ ] 修改 `server-url.txt` → `pnpm mobile:sync` → 重装/重跑后指向新地址
- [ ] **不**提交上架材料、不接 Play Console

## 5. 已知限制（本 Cut 不做）

- iOS / TWA / 应用商店上架
- App Links 深链回收魔法链接到 App 内（邮件仍可能外开浏览器）
- 批量多图上传（产品上一次一张观察）

## 变更记录

- 2026-08-05：Cut 6 Capacitor Android 壳初版；默认 IP HTTP；文档与 `docs/08` 对齐。
- 2026-08-07：接入 `@capacitor/camera`；相册页原生拍照 / 从相册选择。
