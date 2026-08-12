import { desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { adminAuditLog } from "../db/schema.js";
import type { AdminUser } from "../db/schema.js";

export async function writeAudit(opts: {
  admin: AdminUser;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  summary?: string | null;
  ok?: boolean;
}) {
  await db.insert(adminAuditLog).values({
    id: crypto.randomUUID(),
    adminId: opts.admin.id,
    adminUsername: opts.admin.username,
    action: opts.action,
    targetType: opts.targetType ?? null,
    targetId: opts.targetId ?? null,
    summary: opts.summary ?? null,
    ok: opts.ok ?? true,
    createdAt: new Date(),
  });
}

export async function listAudit(limit = 50) {
  return db.query.adminAuditLog.findMany({
    orderBy: [desc(adminAuditLog.createdAt)],
    limit: Math.min(Math.max(limit, 1), 200),
  });
}
