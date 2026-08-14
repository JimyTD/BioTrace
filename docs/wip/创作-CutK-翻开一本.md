# Cut K · 翻开一本（暂停快照）

> **性质：施工暂停备注，不是功能真源。**  
> 创作通线仍以 [`创作-方案.md`](./创作-方案.md) 为准；本文件只记下 **Cut K（进旅途）** 做到哪、观感钉了什么、安卓为什么反复「没有」。  
> 暂停：2026-08-14。下一段开聊前先读本文件，**不要**按 [`创作-方案.md`](./创作-方案.md) §8.3 的旧草案重做（那版是「克隆拉宽 + WAAPI」，已被否）。

## 铁律（往后都按这个）

**安卓和网页必须是同一套表现，不准一高一低。** 不能为了真机能跑就给安卓做弱一档（去掉虚化、改 `scaleX`、只留垫层）。若某套观感两端无法统一，**这套宁愿不做**，先说清楚，不要静默降级、不要先改设计再通报。出包可以，功能必须做对。

## 0. 这是哪一轮

创作线第一刀：**点旅途封面，像翻开一本。** 不是收纳 A–J，不是稀有度，不是开包。

通线没变：

**打开旅途 = 翻开一本；相册里的照片 = 卡进齿孔的相片；开包 = 唯一一次揭开。**

L / M / N 已接到正式页，见 [`创作-CutL-相册入槽.md`](./创作-CutL-相册入槽.md)、[`创作-CutMN-拿起与折页.md`](./创作-CutMN-拿起与折页.md)。O 登录扉页仍后置。

## 1. 观感（演示里已认可，正式环境按这个收）

独立演示（须 **http 完整地址**）：[`apps/web/public/trips/open-book-preview.html`](../../apps/web/public/trips/open-book-preview.html)

1. 掀的是墙上那块 **3:2 封面**，不要把封面拉成一整页空白纸再翻。
2. 封面走到**屏幕中间**再掀。
3. 墙**大幅虚化**到几乎看不清（桌面约 blur 44px）；内页先虚后清。
4. 挡墙的是内页 / 垫层，不是封面撑满。

深链（地图 / 开包 / 观察回来、无手递）：不演掀封面，**也不虚化**，相册直接在。虚化只属于从封面墙上掀开那一下。  
合上：相册里回「旅途」。  
网页端（鼠标）不要回退到淡入切页。

## 2. 正式怎么挂（已落地，不要拆）

`/` 与 `/trips/:id` 都走 `TripsShelf`：封面墙常驻，相册盖在墙上。`/trips/:id/manage` 仍独立。上传 / 识图 / 开包未改。

| 文件 | 作用 |
|------|------|
| `apps/web/src/App.tsx` | `TripsShelf`：墙 + 有 `:id` 时挂 `TripBookLayer` |
| `apps/web/src/pages/TripsPage.tsx` | 封面是 `button`（不要 `<a>`）；按下就记手递，再 `navigate` |
| `apps/web/src/openBookHandoff.ts` | 内存 + `sessionStorage` key `bt_open_book` |
| `apps/web/src/components/TripBookLayer.tsx` | 翻开 / 合上；`OpenBookCloseContext` 给相册返回 |
| `apps/web/src/pages/TripAlbumPage.tsx` | 返回「旅途」走 `closeBook()` 再回 `/` |
| `apps/web/src/styles.css` | `.trip-book-*`、`.page-trips.is-book-back`、`.content.is-book-open` |
| `apps/web/src/main.tsx` / `index.html` | 安卓 UA 写 `data-webview="android"`（不要只等 Capacitor） |

动效：**`requestAnimationFrame` 插值同一套观感**（抬起 → 居中 → `rotateY` 掀开；墙 blur 44；内页先 36 再清）。不靠 CSS transition / `element.animate()` 时长。这不是改设计。

**禁止为安卓另做一套弱表现**（合页改 `scaleX`、去掉虚化、只留垫层）。做不对就说，不要静默降级。

出包可以、而且这轮该出：壳要硬件加速 + 首次启动清 WebView 缓存，否则真机可能一直握着旧页、3D/虚化也不合成。`server.url` 仍是 `http://106.53.188.20`。

## 3. 安卓为什么看起来「没有」（已踩过，别再猜 APK）

已排除：没推代码、必须重打 APK。

真因按出现顺序：

1. **`<a href>` 整页跳**：WebView 先跟链接走，手递丢掉，像直接切页。已改 `button`。
2. **CSS / WAAPI 时长被系统打成 0**：关动画时 transition 和 `element.animate()` 瞬间结束。已改 rAF。
3. **大面积 `filter: blur` + `rotateY`**：不少 WebView 不画，等相位到 `open` 才突然出相册。曾误改成手机不走模糊 / 3D——**已否决**（违反铁律）。
4. **只靠 Capacitor 打标**：桥没就绪就没有 `data-webview`，又走回 3D / blur。已改：`index.html` 用 UA 先打标。
5. **WebView 缓存旧 `index.html`**：nginx 对 html 几乎没 `Cache-Control`。更新后要**清 App 缓存**再开，只划掉有时不够。对照：同一手机 Chrome 打开 `http://106.53.188.20`。
6. **`cf1b093` 已在线上仍没有**：不是没更新。`/` 与 `/trips/:id` 各挂一份 `TripsShelf`，一点就整树重挂；`server.url` 下还可能整页重载。`take()` 立刻清手递，重载后只剩切页。桌面不重载所以正常。

线上查过：`d330e7b` 已在仓库且重建过，安卓仍「没有」——所以不是「没更新」，是 3 / 4。下一拍是 `cf1b093`。

## 4. 已推（Cut K 相关，`main`）

| 提交 | 说了什么 |
|------|----------|
| `e8c4496` | 旅途进相册改为翻开一本 |
| `04fb7a2` | 想让安卓看见翻开，加重虚化（仍走 CSS / 3D，安卓不够） |
| `9c49a61` | 进相册不再被链接整页跳走 |
| `d330e7b` | 自绘插值，不再依赖 CSS / 3D |
| `cf1b093` | UA 识别；手机不再走模糊和 3D |

（中间夹过邀请码复制等无关提交，不要卷进来。）

## 4.1 2026-08-14 再查（`cf1b093` 已在线上仍没有）

不是没更新。线上已是 `cf1b093`。更像是 `/` 与 `/trips/:id` 各挂一份 `TripsShelf`，一点就整树重挂；`server.url` 下还可能整页重载。`take()` 立刻清手递，重载后只剩切页。

**已否决：** 为安卓改 `scaleX`、去掉 blur/3D。观感必须和演示一致。

未推（正确做法）：手递 peek、翻完再清；两路由同一 layout；rAF 驱动 **同一套** `rotateY` + 墙/内页虚化；壳开硬件加速并清一次 WebView 缓存。**接受重打 APK。**

## 5. 回来时先做

1. 服务器更新到本轮提交；**重打并安装 APK**（壳改了硬件加速 + 清缓存）。
2. 真机与网页应是同一套：抬起 → 居中 → `rotateY` 掀开；墙虚化；内页先虚后清。
3. 若仍对不齐：对着真机 WebView 查，不准再给安卓做弱一档。两端做不到同一套就停，不要硬做。
4. 过关后再开 **Cut L（相册入槽）**。

## 6. 不要做的

不为创作改识图 / 稀有度 / 开包；不把演示 HTML 的硬编码 hex 贴进 `pages/`；不走 3D 翻书库、整页纸纹、第二套火漆高潮。删功能必须请示。
