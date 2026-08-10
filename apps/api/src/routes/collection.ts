import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { requireUser, type Variables } from "../auth.js";
import { db } from "../db/index.js";
import { collectionEntries, observations } from "../db/schema.js";
import { sanitizeUserCollection } from "../services/collection.js";
import { serializeCollectionEntry } from "../serialize.js";

export const collectionRoutes = new Hono<{ Variables: Variables }>();

collectionRoutes.use("*", requireUser);

collectionRoutes.get("/", async (c) => {
  const user = c.get("user");
  await sanitizeUserCollection(user.id);
  const rows = await db.query.collectionEntries.findMany({
    where: eq(collectionEntries.userId, user.id),
    orderBy: [desc(collectionEntries.updatedAt)],
  });

  const payload = await Promise.all(
    rows.map(async (entry) => {
      let coverUrl: string | null = null;
      if (entry.coverObservationId) {
        const obs = await db.query.observations.findFirst({
          where: eq(observations.id, entry.coverObservationId),
        });
        if (obs) {
          coverUrl = `/api/files/${obs.displayPath.replace(/\\/g, "/")}`;
        }
      }
      return serializeCollectionEntry(entry, coverUrl);
    }),
  );

  return c.json({ entries: payload });
});
