import { createHash, randomInt } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import {
  clearSessionCookie,
  ensureDevUser,
  requireUser,
  setSessionCookie,
  type Variables,
} from "../auth.js";
import { db } from "../db/index.js";
import { passwordResetTokens, users } from "../db/schema.js";
import { env } from "../env.js";
import { takeRateLimit } from "../lib/rate-limit.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { sendPasswordResetEmail } from "../mail/resend.js";
import { serializeUser } from "../serialize.js";
import { t } from "@biotrace/messages";

export const authRoutes = new Hono<{ Variables: Variables }>();

const emailSchema = z.string().trim().email().max(320);
const passwordSchema = z.string().min(8).max(128);
const displayNameSchema = z.string().trim().max(40).optional();

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function clientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  const xf = c.req.header("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "unknown";
  return c.req.header("x-real-ip") || "unknown";
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

authRoutes.post("/dev-login", async (c) => {
  if (!env.devAuth) {
    return c.json({ error: t("error.devAuthDisabled"), code: "dev_auth_disabled" }, 403);
  }
  const user = await ensureDevUser();
  setSessionCookie(c, user.id);
  return c.json({ user: serializeUser(user) });
});

authRoutes.post("/register", async (c) => {
  const body = z
    .object({
      email: emailSchema,
      password: passwordSchema,
      displayName: displayNameSchema,
    })
    .safeParse(await c.req.json().catch(() => ({})));

  if (!body.success) {
    return c.json({ error: t("auth.invalidRegister"), code: "invalid_register" }, 400);
  }

  const email = normalizeEmail(body.data.email);
  const ip = clientIp(c);
  if (
    !takeRateLimit(`register:email:${email}`, 5, 60 * 60_000) ||
    !takeRateLimit(`register:ip:${ip}`, 20, 60 * 60_000)
  ) {
    return c.json({ error: t("auth.rateLimited"), code: "rate_limited" }, 429);
  }

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) {
    return c.json({ error: t("auth.emailTaken"), code: "email_taken" }, 409);
  }

  const now = new Date();
  const displayName = body.data.displayName?.trim() || null;
  const user = {
    id: crypto.randomUUID(),
    email,
    passwordHash: await hashPassword(body.data.password),
    displayName,
    createdAt: now,
  };
  await db.insert(users).values(user);
  setSessionCookie(c, user.id);
  return c.json({ user: serializeUser(user) });
});

authRoutes.post("/login", async (c) => {
  const body = z
    .object({
      email: emailSchema,
      password: z.string().min(1).max(128),
    })
    .safeParse(await c.req.json().catch(() => ({})));

  if (!body.success) {
    return c.json({ error: t("auth.invalidCredentials"), code: "invalid_credentials" }, 400);
  }

  const email = normalizeEmail(body.data.email);
  const ip = clientIp(c);
  if (
    !takeRateLimit(`login:email:${email}`, 10, 15 * 60_000) ||
    !takeRateLimit(`login:ip:${ip}`, 40, 15 * 60_000)
  ) {
    return c.json({ error: t("auth.rateLimited"), code: "rate_limited" }, 429);
  }

  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user || !(await verifyPassword(body.data.password, user.passwordHash))) {
    return c.json({ error: t("auth.invalidCredentials"), code: "invalid_credentials" }, 401);
  }

  setSessionCookie(c, user.id);
  return c.json({ user: serializeUser(user) });
});

authRoutes.post("/request-reset", async (c) => {
  const body = z
    .object({ email: emailSchema })
    .safeParse(await c.req.json().catch(() => ({})));

  const generic = { ok: true as const, message: t("auth.resetSent") };

  if (!body.success) {
    return c.json({ error: t("auth.invalidEmail"), code: "invalid_email" }, 400);
  }

  const email = normalizeEmail(body.data.email);
  const ip = clientIp(c);
  if (
    !takeRateLimit(`reset:email:${email}`, 5, 15 * 60_000) ||
    !takeRateLimit(`reset:ip:${ip}`, 20, 15 * 60_000)
  ) {
    return c.json({ error: t("auth.rateLimited"), code: "rate_limited" }, 429);
  }

  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  // Always return generic — do not reveal whether the account exists.
  if (!user) {
    return c.json(generic);
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const tokenHash = hashToken(`${email}:${code}`);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.passwordResetTtlMs);

  await db.insert(passwordResetTokens).values({
    id: crypto.randomUUID(),
    email,
    tokenHash,
    expiresAt,
    consumedAt: null,
    createdAt: now,
  });

  try {
    if (!env.resendApiKey) {
      if (env.devAuth) {
        console.log(`[auth] password reset code (no RESEND_API_KEY, DEV_AUTH log): ${email} ${code}`);
      } else {
        return c.json({ error: t("error.mailNotConfigured"), code: "mail_not_configured" }, 503);
      }
    } else {
      await sendPasswordResetEmail({ to: email, code });
    }
  } catch (err) {
    console.error("[auth] send password reset failed", err);
    return c.json({ error: t("error.mailSendFailed"), code: "mail_send_failed" }, 502);
  }

  return c.json(generic);
});

authRoutes.post("/reset-password", async (c) => {
  const body = z
    .object({
      email: emailSchema,
      code: z.string().trim().regex(/^\d{6}$/),
      password: passwordSchema,
    })
    .safeParse(await c.req.json().catch(() => ({})));

  if (!body.success) {
    return c.json({ error: t("auth.invalidReset"), code: "invalid_reset" }, 400);
  }

  const email = normalizeEmail(body.data.email);
  const ip = clientIp(c);
  if (
    !takeRateLimit(`reset-confirm:email:${email}`, 10, 15 * 60_000) ||
    !takeRateLimit(`reset-confirm:ip:${ip}`, 30, 15 * 60_000)
  ) {
    return c.json({ error: t("auth.rateLimited"), code: "rate_limited" }, 429);
  }

  const tokenHash = hashToken(`${email}:${body.data.code}`);
  const now = new Date();
  const row = await db.query.passwordResetTokens.findFirst({
    where: and(
      eq(passwordResetTokens.tokenHash, tokenHash),
      eq(passwordResetTokens.email, email),
      gt(passwordResetTokens.expiresAt, now),
      isNull(passwordResetTokens.consumedAt),
    ),
  });

  if (!row) {
    return c.json({ error: t("auth.invalidResetCode"), code: "invalid_reset_code" }, 400);
  }

  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user) {
    return c.json({ error: t("auth.invalidResetCode"), code: "invalid_reset_code" }, 400);
  }

  await db
    .update(passwordResetTokens)
    .set({ consumedAt: now })
    .where(eq(passwordResetTokens.id, row.id));
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(body.data.password) })
    .where(eq(users.id, user.id));

  // Force re-login with new password.
  clearSessionCookie(c);
  return c.json({ ok: true as const, message: t("auth.resetOk") });
});

authRoutes.post("/logout", async (c) => {
  clearSessionCookie(c);
  return c.json({ ok: true });
});

authRoutes.get("/me", requireUser, async (c) => {
  return c.json({ user: serializeUser(c.get("user")) });
});

authRoutes.patch("/me", requireUser, async (c) => {
  const body = z
    .object({
      displayName: z.union([z.string().trim().max(40), z.literal("")]),
    })
    .safeParse(await c.req.json().catch(() => ({})));

  if (!body.success) {
    return c.json({ error: t("auth.invalidProfile"), code: "invalid_profile" }, 400);
  }

  const user = c.get("user");
  const displayName = body.data.displayName.trim() || null;
  await db.update(users).set({ displayName }).where(eq(users.id, user.id));
  const updated = { ...user, displayName };
  return c.json({ user: serializeUser(updated) });
});

authRoutes.post("/change-password", requireUser, async (c) => {
  const body = z
    .object({
      currentPassword: z.string().min(1).max(128),
      newPassword: passwordSchema,
    })
    .safeParse(await c.req.json().catch(() => ({})));

  if (!body.success) {
    return c.json({ error: t("auth.invalidPasswordChange"), code: "invalid_password_change" }, 400);
  }

  const user = c.get("user");
  if (!(await verifyPassword(body.data.currentPassword, user.passwordHash))) {
    return c.json({ error: t("auth.wrongPassword"), code: "wrong_password" }, 401);
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(body.data.newPassword) })
    .where(eq(users.id, user.id));
  setSessionCookie(c, user.id);
  return c.json({ ok: true as const, message: t("auth.passwordChanged") });
});
