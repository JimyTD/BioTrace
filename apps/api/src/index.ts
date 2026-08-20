import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { t } from "@biotrace/messages";
import { ensureBootstrapAdmin } from "./admin/auth.js";
import { applyRuntimeSecrets } from "./admin/runtime-secrets.js";
import type { Variables } from "./auth.js";
import { migrate } from "./db/index.js";
import { env } from "./env.js";
import { providerSnapshot } from "./identify/health.js";
import { identifyQueueSize } from "./jobs/identify-queue.js";
import { adminRoutes } from "./routes/admin.js";
import { appRoutes } from "./routes/app.js";
import { authRoutes } from "./routes/auth.js";
import { collectionRoutes } from "./routes/collection.js";
import { fileRoutes } from "./routes/files.js";
import { mapRoutes } from "./routes/map.js";
import { observationRoutes } from "./routes/observations.js";
import { tripRoutes } from "./routes/trips.js";
import { volumeRoutes } from "./routes/volumes.js";

applyRuntimeSecrets();

const app = new Hono<{ Variables: Variables }>();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: env.corsOrigins,
    credentials: true,
  }),
);

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    devAuth: env.devAuth,
    geminiConfigured: Boolean(env.geminiApiKey),
    tokenhubConfigured: Boolean(env.tokenhubApiKey),
    providers: {
      gemini: providerSnapshot("gemini", Boolean(env.geminiApiKey)),
      tokenhub: providerSnapshot("tokenhub", Boolean(env.tokenhubApiKey)),
    },
    identifyQueue: identifyQueueSize(),
  }),
);

app.route("/api/auth", authRoutes);
app.route("/api/app", appRoutes);
app.route("/api/trips", tripRoutes);
app.route("/api/observations", observationRoutes);
app.route("/api/collection", collectionRoutes);
app.route("/api/volumes", volumeRoutes);
app.route("/api/files", fileRoutes);
app.route("/api/map", mapRoutes);
app.route("/api/admin", adminRoutes);

app.onError((err, c) => {
  console.error(err);
  if (err && typeof err === "object" && "name" in err && err.name === "ZodError") {
    return c.json({ error: t("error.invalidRequest"), code: "invalid request", detail: err }, 400);
  }
  const message = err instanceof Error ? err.message : "server error";
  if (message.includes("GEMINI_API_KEY")) {
    return c.json({ error: t("error.geminiKeyMissing"), code: message }, 500);
  }
  return c.json({ error: t("error.server"), code: message }, 500);
});

await migrate();
await ensureBootstrapAdmin();

serve({ fetch: app.fetch, port: env.port, hostname: env.host }, (info) => {
  console.log(`BioTrace API http://${info.address}:${info.port}`);
  console.log(
    `DEV_AUTH=${env.devAuth ? "on" : "off"} cookieSecure=${env.cookieSecure} cors=${env.corsOrigins.join(",")}`,
  );
  console.log(
    `Gemini=${env.geminiApiKey ? "ok" : "missing"} TokenHub=${env.tokenhubApiKey ? "ok" : "missing"}`,
  );
});
