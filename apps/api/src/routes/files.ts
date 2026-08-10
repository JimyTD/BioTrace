import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { join, normalize, sep } from "node:path";
import { Readable } from "node:stream";
import { Hono } from "hono";
import { requireUser, type Variables } from "../auth.js";
import { env } from "../env.js";

export const fileRoutes = new Hono<{ Variables: Variables }>();

fileRoutes.use("*", requireUser);

fileRoutes.get("/:observationId/:filename", async (c) => {
  const rel = `${c.req.param("observationId")}/${c.req.param("filename")}`;
  if (rel.includes("..")) return c.json({ error: "invalid path" }, 400);

  const absolute = normalize(join(env.uploadDir, rel));
  const root = normalize(env.uploadDir + sep);
  if (!absolute.startsWith(root)) {
    return c.json({ error: "invalid path" }, 400);
  }

  try {
    await access(absolute);
  } catch {
    return c.json({ error: "not found" }, 404);
  }

  const stream = Readable.toWeb(createReadStream(absolute)) as ReadableStream;
  return new Response(stream, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=3600",
    },
  });
});
