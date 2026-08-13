import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, useLocation } from "react-router-dom";
import AdminApp from "./admin/AdminApp";
import App from "./App";
import { initTheme } from "./themes";
import "./themes/daylight.css";
import "./themes/tide.css";
import "./styles.css";

initTheme();

function Root() {
  const loc = useLocation();
  if (loc.pathname === "/admin" || loc.pathname.startsWith("/admin/")) {
    return <AdminApp />;
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
