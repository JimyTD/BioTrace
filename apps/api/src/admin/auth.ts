import { createHmac, timingSafeEqual } from "node:crypto";
import type { Context, Next } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { env } from "../env.js";
import { db } from "../db/index.js";
import { adminUsers, type AdminUser } from "../db/schema.js";
import { apiError } from "../errors.js";
import { hashPassword } from "../lib/password.js";

const COOKIE = "bt_admin_session";

export type AdminVariables = { admin: AdminUser };

function sign(payload: string): string {
  return createHmac("sha256", env.sessionSecret).update(`admin:${payload}`).digest("base64url");
}

export function createAdminSessionToken(adminId: string): string {
  const body = Buffer.from(JSON.stringify({ aid: adminId, t: Date.now() }), "utf8").toString(
    "base64url",
  );
  return `${body}.${sign(body)}`;
}

export function parseAdminSessionToken(token: string): string | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      aid?: string;
      t?: number;
    };
    if (!data.aid) return null;
    if (typeof data.t === "number") {
      const ageMs = Date.now() - data.t;
      if (ageMs < 0 || ageMs > env.sessionTtlMs) return null;
    }
    return data.aid;
  } catch {
    return null;
  }
}

export function setAdminSessionCookie(c: Context, adminId: string) {
  setCookie(c, COOKIE, createAdminSessionToken(adminId), {
    httpOnly: true,
    sameSite: "Lax",
    secure: env.cookieSecure,
    path: "/",
    maxAge: Math.floor(env.sessionTtlMs / 1000),
  });
}

export function clearAdminSessionCookie(c: Context) {
  deleteCookie(c, COOKIE, { path: "/", secure: env.cookieSecure });
}

export async function requireAdmin(c: Context<{ Variables: AdminVariables }>, next: Next) {
  const token = getCookie(c, COOKIE);
  if (!token) {
    const err = apiError("unauthorized", 401);
    return c.json(err.body, err.status);
  }
  const adminId = parseAdminSessionToken(token);
  if (!adminId) {
    clearAdminSessionCookie(c);
    const err = apiError("unauthorized", 401);
    return c.json(err.body, err.status);
  }
  const admin = await db.query.adminUsers.findFirst({ where: eq(adminUsers.id, adminId) });
  if (!admin) {
    clearAdminSessionCookie(c);
    const err = apiError("unauthorized", 401);
    return c.json(err.body, err.status);
  }
  setAdminSessionCookie(c, admin.id);
  c.set("admin", admin);
  await next();
}

/** Create bootstrap admin when table empty and env credentials set. */
export async function ensureBootstrapAdmin(): Promise<void> {
  const existing = await db.query.adminUsers.findFirst();
  if (existing) return;
  const username = env.adminBootstrapUsername.trim();
  const password = env.adminBootstrapPassword;
  if (!username || !password || password.length < 8) {
    console.warn(
      "[admin] no admin_users and ADMIN_BOOTSTRAP_USERNAME/PASSWORD unset or weak — admin login unavailable until seeded",
    );
    return;
  }
  const row = {
    id: crypto.randomUUID(),
    username,
    passwordHash: await hashPassword(password),
    createdAt: new Date(),
  };
  await db.insert(adminUsers).values(row);
  console.log(`[admin] bootstrap admin created: ${username}`);
}
