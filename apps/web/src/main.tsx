import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, useLocation } from "react-router-dom";
import AdminApp from "./admin/AdminApp";
import App from "./App";
import { isNativeAndroidShell } from "./androidUpdate";
import DownloadPage from "./pages/DownloadPage";
import { initTheme } from "./themes";
import "./themes/daylight.css";
import "./styles.css";

initTheme();

if (/Android/i.test(navigator.userAgent) || isNativeAndroidShell()) {
  document.documentElement.dataset.webview = "android";
}

function Root() {
  const loc = useLocation();
  if (loc.pathname === "/admin" || loc.pathname.startsWith("/admin/")) {
    return <AdminApp />;
  }
  if (loc.pathname === "/download" || loc.pathname === "/download/") {
    return <DownloadPage />;
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
