import { Hono } from "hono";
import { effectiveTiandituBrowserKeys } from "../admin/runtime-secrets.js";

/** Public map config — browser Tianditu keys are already exposed in the web bundle when built with VITE_*. */
export const mapRoutes = new Hono();

mapRoutes.get("/tianditu-keys", (c) => {
  return c.json({ keys: effectiveTiandituBrowserKeys() });
});
