import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, useLocation } from "react-router-dom";
import AdminApp from "./admin/AdminApp";
import App from "./App";
import { isNativeAndroidShell } from "./androidUpdate";
import DownloadPage from "./pages/DownloadPage";
import { initTheme } from "./themes";
import "./themes/daylight.css";
import "./themes/clear.css";
import "./styles.css";
// 槽位实现自带的样式，排在结构表之后，皮肤才好覆盖。见 docs/features/皮肤主题.md §2.4
import "./components/SettleRaritySeal.css";
import "./components/ClearRevealStage.css";

initTheme();

if (/Android/i.test(navigator.userAgent) || isNativeAndroidShell()) {
  document.documentElement.dataset.webview = "android";
}

/** 仅开发构建注册。生产访问 /dev/tree 会落到 App（登录或回首页）。 */
const DevTreePage = import.meta.env.DEV
  ? lazy(() => import("./pages/DevTreePage"))
  : null;

function Root() {
  const loc = useLocation();
  if (loc.pathname === "/admin" || loc.pathname.startsWith("/admin/")) {
    return <AdminApp />;
  }
  if (loc.pathname === "/download" || loc.pathname === "/download/") {
    return <DownloadPage />;
  }
  /* 物种树的 dev 预览：走独立分流以**绕过登录与 API**。
     树的渲染问题和数据链路无关，混在一起排查很慢；而且冷启动态
     （一条收集都没有）恰恰最该反复看 —— 新用户看到的就是它。
     生产包不注册这条路由，模块也不打进去。 */
  if (DevTreePage && (loc.pathname === "/dev/tree" || loc.pathname === "/dev/tree/")) {
    return (
      <Suspense fallback={null}>
        <DevTreePage />
      </Suspense>
    );
  }
  return <App />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Root />
    </BrowserRouter>
  </StrictMode>,
);
