# 交接：清理其余 aria 家族（BioTrace）

> 给接手的 agent。**先读完再动手**；有疑问先问，不要自行扩大范围。

## 一、背景（已经发生的事）

1. 用户定的口径：**读屏名不是我们的需求**——BioTrace 的核心是看照片，读屏用户能听到的价值有限。
2. 已经完成：**全仓 `aria-label` 已删**（19 处），并删掉 6 个只为它存在的 key
   （`album.liftPhoto`、`album.openObservation`、`collection.volumeOpen`、`collection.stampLift`、
   `tree3d.close`、`map.openDetail`）；品牌 SVG 生成器 `scripts/brand-make-mark.py` 也不再输出 `aria-label`。
   提交：`c0293b7`。
3. **本任务**：剩下的 `aria-*` 家族（`aria-label` 的同类，同样是给读屏用户用的）一并清掉。

## 二、范围（实测用量，2026-09-15）

| 项 | 用量 | 是什么 | 处置 |
|---|---|---|---|
| `aria-hidden` | 68 | 告诉读屏「这块是装饰，别念」 | 删属性（元素保留） |
| `aria-modal` | 6 | 告诉读屏「这是模态弹窗」 | 删属性 |
| `aria-pressed` | 4 | 告诉读屏「这个开关当前按下没」 | 删属性 |
| `aria-labelledby` | 2 | 告诉读屏「这个弹窗的名字取自那个元素」 | 删属性 |
| `aria-selected` | 1 | 同上，选中态 | 删属性 |
| `sr-only` | 4 处用法 + 1 条 CSS | 「屏幕上看不见、只念给读屏听」的文字 | 删元素/属性 + 删 CSS 规则 |
| `role="…"` | 若干 | 同类（`dialog`/`group`/`tablist`/`tab`/`presentation`/`img`） | **第二部分**，见 §五 |

`sr-only` 的 4 处：
- `apps/web/src/pages/CollectionSpeciesPage.tsx:107` — 搜索框的 `<label className="sr-only" htmlFor=…>`（输入框另有 `placeholder`，删掉视觉不变）
- `apps/web/src/pages/TripsPage.tsx:84`、`:110` — 同上，两个输入框的隐藏 label
- `apps/web/src/pages/ObservationSettlePage.tsx:235` — `<span className="sr-only">{rarityLabel(...)}</span>`（稀有度的隐藏播报）

CSS 规则：`apps/web/src/styles.css:146` 的 `.sr-only { … }`。

## 三、动手前必须知道的三个事实（我已核过，你可复核）

1. **CSS 里没有任何 `[aria-*]` / `[role]` 选择器**——所以删这些属性**不会影响样式**。
   复核：`git grep -n -E "\[(aria-|role)" -- apps/web/src`（应无输出）。
2. **JS 只有一处**动这类属性：`apps/web/src/photoLift.ts:44` 的
   `flyer.setAttribute("aria-hidden", "true")`（照片飞行时那个临时元素）。删这一行即可，不影响动画。
   复核：`git grep -n -E "Attribute\(\"aria-" -- apps/web/src`。
3. **`alt` 不要动**。`alt` 不是 aria：图片加载失败时它会显示出来，也参与搜索；`alt=""` 是「装饰图」的
   既定写法。本任务与它无关。
   **`inert` 也不要动**（如 `CollectionSpeciesPage` 里 `cardOpen ? { inert: true } : {}`）——它有真实行为（挡住交互），不是语义标注。

## 四、做法与验收

**做法**：逐个删属性/元素/CSS 规则，**不改任何别的代码**；不重构、不顺手改文案、不动 `zh.ts`。

**验收（缺一不可，全部要给可复现命令与输出）**：
1. `pnpm --filter @biotrace/web exec tsc -b` → EXIT=0
2. `pnpm check:copy` → 通过
3. `python scripts/check-dead-keys.py` → **0 死 key / 0 幽灵引用**
4. `git grep -n -E "aria-|sr-only" -- apps/web/src packages` → 只剩你要保留的（应当为空）
5. **视觉零差异**（这个项目的验收标准是「改造前后逐像素 0 差异」）：
   ```powershell
   # 改动前先截基准（本地 API 在 8787、web dev server 在 5173 时可直接用）
   powershell -ExecutionPolicy Bypass -File scripts\walkthrough\shot.ps1 -To "/" -Out ".shot\base-trips.png" -Port 5173
   powershell -ExecutionPolicy Bypass -File scripts\walkthrough\shot.ps1 -To "/me" -Out ".shot\base-me.png" -Port 5173
   # 改完再截一次，然后逐像素比
   python scripts/walkthrough/diff.py .shot/base-trips.png .shot/after-trips.png
   python scripts/walkthrough/diff.py .shot/base-me.png    .shot/after-me.png
   ```
   两次都要输出 `不同像素 0`。相册页要真数据：dev 会话 + 旅途 id 见 §六。

**纪律**：提交说明用中文；只提交自己这轮动的文件；不提交 `prototypes/`（那是走查材料）。

## 五、第二部分：`role="…"`（可选，先问用户）

`role` 是同一族的语义标注（`dialog` / `group` / `tablist` / `tab` / `presentation` / `img`）。
同样已核实：**没有 CSS 或 JS 依赖它**。要不要一起清，先问用户——`role="presentation"` 与
`role="img"` 在个别浏览器里还有极小的渲染差异，清之前建议先按 §四 的截图比对做一次基线。

## 六、本地环境（跑验收用）

- API：`pnpm.cmd --filter @biotrace/api start`（端口 8787；`/api/health` 返回 `devAuth: true` 才可用）
- Web dev server：端口 5173（`/proto` 挂 `prototypes/`，`/devpages` 挂 `apps/web/devpages/`）
- 建 dev 会话取数据：
  ```powershell
  $s = $null
  Invoke-WebRequest -Uri "http://127.0.0.1:8787/api/auth/dev-login" -Method POST -UseBasicParsing -SessionVariable s | Out-Null
  (Invoke-WebRequest -Uri "http://127.0.0.1:8787/api/trips" -UseBasicParsing -WebSession $s).Content
  ```
- 无头截图/取 DOM 都走 `scripts/walkthrough/shot.ps1` 与 `dev-login.html`（README 在同目录）。
