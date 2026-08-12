import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { join, normalize, sep } from "node:path";
import { Readable } from "node:stream";
import { t } from "@biotrace/messages";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { requireUser, type Variables } from "../auth.js";
import { db } from "../db/index.js";
import { observations } from "../db/schema.js";
import { env } from "../env.js";
import { isTripMember } from "../services/trip-share.js";

export const fileRoutes = new Hono<{ Variables: Variables }>();

fileRoutes.use("*", requireUser);

fileRoutes.get("/:observationId/:filename", async (c) => {
  const user = c.get("user");
  const observationId = c.req.param("observationId");
  const filename = c.req.param("filename");
  const rel = `${observationId}/${filename}`;
  if (rel.includes("..")) {
    return c.json({ error: t("error.invalidPath"), code: "invalid_path" }, 400);
  }

  const row = await db.query.observations.findFirst({
    where: eq(observations.id, observationId),
    columns: { id: true, userId: true, tripId: true },
  });
  if (!row) {
    return c.json({ error: t("error.notFound"), code: "not_found" }, 404);
  }
  const allowed =
    row.userId === user.id || (await isTripMember(row.tripId, user.id));
  if (!allowed) {
    return c.json({ error: t("error.notFound"), code: "not_found" }, 404);
  }

  const absolute = normalize(join(env.uploadDir, rel));
  const root = normalize(env.uploadDir + sep);
  if (!absolute.startsWith(root)) {
    return c.json({ error: t("error.invalidPath"), code: "invalid_path" }, 400);
  }

  try {
    await access(absolute);
  } catch {
    return c.json({ error: t("error.notFound"), code: "not_found" }, 404);
  }

  const stream = Readable.toWeb(createReadStream(absolute)) as ReadableStream;
  return new Response(stream, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=3600",
    },
  });
});
