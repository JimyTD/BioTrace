import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { t } from "@biotrace/messages";
import type { Variables } from "./auth.js";
import { migrate } from "./db/index.js";
import { env } from "./env.js";
import { providerSnapshot } from "./identify/health.js";
import { identifyQueueSize } from "./jobs/identify-queue.js";
import { authRoutes } from "./routes/auth.js";
import { collectionRoutes } from "./routes/collection.js";
import { fileRoutes } from "./routes/files.js";
import { observationRoutes } from "./routes/observations.js";
import { tripRoutes } from "./routes/trips.js";

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
    zhipuConfigured: Boolean(env.zhipuApiKey),
    providers: {
      gemini: providerSnapshot("gemini", Boolean(env.geminiApiKey)),
      zhipu: providerSnapshot("zhipu", Boolean(env.zhipuApiKey)),
    },
    identifyQueue: identifyQueueSize(),
  }),
);

app.route("/api/auth", authRoutes);
app.route("/api/trips", tripRoutes);
app.route("/api/observations", observationRoutes);
app.route("/api/collection", collectionRoutes);
app.route("/api/files", fileRoutes);

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

serve({ fetch: app.fetch, port: env.port, hostname: env.host }, (info) => {
  console.log(`BioTrace API http://${info.address}:${info.port}`);
  console.log(
    `DEV_AUTH=${env.devAuth ? "on" : "off"} cookieSecure=${env.cookieSecure} cors=${env.corsOrigins.join(",")}`,
  );
  console.log(`Gemini=${env.geminiApiKey ? "ok" : "missing"} Zhipu=${env.zhipuApiKey ? "ok" : "missing"}`);
});
