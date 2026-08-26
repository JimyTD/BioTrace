# 本地走查台

改表现层（皮肤、结构摆放、动效）时用来**自己看见自己改出了什么**，以及给改造类改动做验收。

结论先说：**改造类改动（只搬结构、不改观感）的验收标准是「默认皮肤下改造前后逐像素 0 差异」**。
"看起来一样"不算验收——2026-08-25 就是靠肉眼过的，结果示意稿里打在卡纸下沿的说明字实现成了框外正文。

## 一次准备

```powershell
# 1. API（另开一个终端，别关）
pnpm.cmd --filter @biotrace/api start

# 2. Web dev server，端口固定 5190（shot.ps1 默认连这个）
pnpm.cmd --filter @biotrace/web exec vite --host 127.0.0.1 --port 5190 --strictPort

# 3. 建 dev 用户（浏览器访问一次，或让下面的 shot.ps1 跑一次也会建）
#    然后灌假数据：一条共享旅途 + 覆盖全部状态的九条观察
python scripts/walkthrough/seed.py
```

`shot.ps1` 会把 `dev-login.html` 拷进 `apps/web/public/`（那份已 gitignore，
不入库、发版从 git 干净检出所以也不会带上）。它做三件事：换一个 dev 会话、
标记引导页已看过、跳到目标路由。

## 截图

```powershell
# 旅途列表
powershell -ExecutionPolicy Bypass -File scripts\walkthrough\shot.ps1 `
  -To "/" -Out ".shot\before.png" -Width 430 -Height 932

# 指定皮肤
... -Theme lightbox

# 开包三个阶段（预览页认 ?phase= / ?rarity= / ?hold=1 / ?photo= / ?when= / ?where=）
# hold=1 让阶段停在原地不自己往下走——揭示只有几百毫秒，不冻住就只能截到它演完的样子
# photo= 换样张：默认那张 _sample-photo.jpg 是棕褐铜版画，判断不了「颜色显出来」这类效果
... -To "/dev/settle-art?phase=revealing&rarity=SSR&hold=1&photo=/themes/_demo/demo-photo-dragonfly.jpg"

# 落在开书动画里（预置交接）
... -To "/trips/<tripId>" -Extra "book=<tripId>"

# 落在照片飞行动画里：预置交接，进详情页就自己演，不必点鼠标
... -To "/observations/<obsId>" -Extra "lift=<obsId>&trip=<tripId>" -Wait 3000
```

产物统一放 `.shot/`（gitignore）。

## 比对

```powershell
python scripts/walkthrough/diff.py .shot/before.png .shot/after.png
```

输出不同像素数、最大通道差、差异外接框；有差异时写一张 `*-diff.png` 把差异点涂红。

## 和风格示意页并排

`diff.py` 只能比两张同源截图。要验「示意页上那个东西到底做出来没有」，
得把示意和实现拼在一起看——这是**出过 `public/themes/*.html` 的皮肤在汇报前必做的一步**。

```powershell
# 示意页是多栏的，先切出要比的那一栏（x,y,w,h）
python scripts/walkthrough/side.py .shot/demo.png .shot/impl.png .shot/cmp.png --crop-left=24,172,381,728
```

两图按同高缩放后左右拼。分开看两张图都「像那么回事」，拼一起才看得出
卡纸下沿该有的字是不是跑到框外去了、片子是不是小了一圈。

## 拿改造前的基准图

工作区里改了一半也能拿到基准：把要比的文件临时 stash 掉，截一张，再 pop 回来。

```powershell
git stash push -- apps/web/src/styles.css apps/web/src/pages/TripsPage.tsx
powershell -ExecutionPolicy Bypass -File scripts\walkthrough\shot.ps1 -To "/" -Out ".shot\before.png"
git stash pop
```

## 四个坑

- **`-Width` 低于约 500 是假的**。Windows 上无头窗口有最小宽度，给 430 会按 500 渲染再裁成 430，
  于是你以为在看手机宽度、其实在看 500 宽的布局右边被切掉。逐像素比不受影响（两边一样宽），
  所以这个坑会一直藏着。真要验手机窗口宽度得改走 CDP 的设备模拟，现在没接。

- **`-Wait` 太小会挂住**。它是无头浏览器的虚拟时钟预算，而虚拟时钟在等网络时不走。
  相册页有「鉴定中」的观察时会一直轮询，预算给小了浏览器就永远不出图。默认 9000 够用，
  要截动画中间帧再往下调，调到不出图就是撞上这条了。
- **渲染是确定性的**。同一份代码连截两次应当 0 差异。先验这一条，再去解读改造前后的差异，
  否则分不清是改动还是噪声。虚拟时钟也是确定的，所以连中间帧都可重复——
  但**卡不准想要的那一帧**：虚拟时钟在等图片解码时不走，动画真正开演的预算值很窄，
  给 3000 可能停在「页面已淡出、飞行体还没画」的空档上。动作类改动最终仍得人工过一遍。
- **`cqw` 有 1/64px 的舍入**。从百分比换算成容器查询单位时会有零点几像素的偏移，
  逐像素比得出来、肉眼看不出。这类差异要在汇报里点名，不能当成 0 差异蒙混。
