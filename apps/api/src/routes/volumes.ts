import { Hono } from "hono";
import { requireUser, type Variables } from "../auth.js";
import { listVolumesForUser } from "../volumes/index.js";

export const volumeRoutes = new Hono<{ Variables: Variables }>();

volumeRoutes.use("*", requireUser);

volumeRoutes.get("/", async (c) => {
  const user = c.get("user");
  const volumes = await listVolumesForUser(user.id);
  return c.json({ volumes });
});
