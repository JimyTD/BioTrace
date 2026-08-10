import { createHmac, timingSafeEqual } from "node:crypto";
import type { Context, Next } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { env } from "./env.js";
import { db } from "./db/index.js";
import { users, type User } from "./db/schema.js";
import { apiError } from "./errors.js";

const COOKIE = "bt_session";

type Variables = { user: User };

function sign(payload: string): string {
  return createHmac("sha256", env.sessionSecret).update(payload).digest("base64url");
}

export function createSessionToken(userId: string): string {
  const body = Buffer.from(JSON.stringify({ uid: userId, t: Date.now() }), "utf8").toString(
    "base64url",
  );
  return `${body}.${sign(body)}`;
}

export function parseSessionToken(token: string): string | null {
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
      uid?: string;
    };
    return data.uid ?? null;
  } catch {
    return null;
  }
}

export function setSessionCookie(c: Context, userId: string) {
  setCookie(c, COOKIE, createSessionToken(userId), {
    httpOnly: true,
    sameSite: "Lax",
    secure: env.cookieSecure,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, COOKIE, { path: "/", secure: env.cookieSecure });
}

export async function requireUser(c: Context<{ Variables: Variables }>, next: Next) {
  const token = getCookie(c, COOKIE);
  if (!token) {
    const err = apiError("unauthorized", 401);
    return c.json(err.body, err.status);
  }
  const userId = parseSessionToken(token);
  if (!userId) {
    const err = apiError("unauthorized", 401);
    return c.json(err.body, err.status);
  }
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) {
    const err = apiError("unauthorized", 401);
    return c.json(err.body, err.status);
  }
  c.set("user", user);
  await next();
}

export async function ensureDevUser(): Promise<User> {
  return ensureUserByEmail("dev@local");
}

export async function ensureUserByEmail(email: string): Promise<User> {
  const normalized = email.trim().toLowerCase();
  const existing = await db.query.users.findFirst({ where: eq(users.email, normalized) });
  if (existing) return existing;
  const now = new Date();
  const user: User = { id: crypto.randomUUID(), email: normalized, createdAt: now };
  await db.insert(users).values(user);
  return user;
}

export type { Variables };
