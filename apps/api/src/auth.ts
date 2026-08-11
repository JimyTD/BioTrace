import { createHmac, timingSafeEqual } from "node:crypto";
import type { Context, Next } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { env } from "./env.js";
import { db } from "./db/index.js";
import { users, type User } from "./db/schema.js";
import { apiError } from "./errors.js";
import { hashPassword } from "./lib/password.js";

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
      t?: number;
    };
    if (!data.uid) return null;
    if (typeof data.t === "number") {
      const ageMs = Date.now() - data.t;
      if (ageMs < 0 || ageMs > env.sessionTtlMs) return null;
    }
    return data.uid;
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
    maxAge: Math.floor(env.sessionTtlMs / 1000),
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
    clearSessionCookie(c);
    const err = apiError("unauthorized", 401);
    return c.json(err.body, err.status);
  }
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) {
    clearSessionCookie(c);
    const err = apiError("unauthorized", 401);
    return c.json(err.body, err.status);
  }
  // Sliding renewal — keep logged-in like a typical app.
  setSessionCookie(c, user.id);
  c.set("user", user);
  await next();
}

export async function ensureDevUser(): Promise<User> {
  const email = "dev@local";
  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) return existing;
  const now = new Date();
  const user: User = {
    id: crypto.randomUUID(),
    email,
    passwordHash: await hashPassword(crypto.randomUUID()),
    displayName: "Dev",
    createdAt: now,
    identifyUseOwnKey: false,
    identifyUserKeyEnc: null,
    identifyUserKeyHint: null,
    identifyUserBaseUrl: null,
    identifyUserModel: null,
  };
  await db.insert(users).values(user);
  return user;
}

export type { Variables };
