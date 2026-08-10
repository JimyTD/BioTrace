import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import {
  clearSessionCookie,
  ensureDevUser,
  ensureUserByEmail,
  requireUser,
  setSessionCookie,
  type Variables,
} from "../auth.js";
import { db } from "../db/index.js";
import { loginTokens } from "../db/schema.js";
import { env } from "../env.js";
import { takeRateLimit } from "../lib/rate-limit.js";
import { sendMagicLinkEmail } from "../mail/resend.js";
import { serializeUser } from "../serialize.js";
import { t } from "@biotrace/messages";

export const authRoutes = new Hono<{ Variables: Variables }>();

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function clientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  const xf = c.req.header("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "unknown";
  return c.req.header("x-real-ip") || "unknown";
}

authRoutes.post("/dev-login", async (c) => {
  if (!env.devAuth) {
    return c.json({ error: t("error.devAuthDisabled"), code: "dev_auth_disabled" }, 403);
  }
  const user = await ensureDevUser();
  setSessionCookie(c, user.id);
  return c.json({ user: serializeUser(user) });
});

authRoutes.post("/request-link", async (c) => {
  const body = z
    .object({
      email: z.string().trim().email().max(320),
    })
    .safeParse(await c.req.json().catch(() => ({})));

  // Always same shape — do not reveal validation details that enable probing beyond format.
  const generic = { ok: true as const, message: t("auth.linkSent") };

  if (!body.success) {
    return c.json({ error: t("auth.invalidEmail"), code: "invalid_email" }, 400);
  }

  const email = body.data.email.toLowerCase();
  const ip = clientIp(c);
  if (!takeRateLimit(`magic:email:${email}`, 5, 15 * 60_000) || !takeRateLimit(`magic:ip:${ip}`, 20, 15 * 60_000)) {
    return c.json({ error: t("auth.rateLimited"), code: "rate_limited" }, 429);
  }

  const raw = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(raw);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.magicLinkTtlMs);

  await db.insert(loginTokens).values({
    id: crypto.randomUUID(),
    email,
    tokenHash,
    expiresAt,
    consumedAt: null,
    createdAt: now,
  });

  const verifyUrl = `${env.appOrigin}/api/auth/verify?token=${encodeURIComponent(raw)}`;

  try {
    if (!env.resendApiKey) {
      if (env.devAuth) {
        console.log(`[auth] magic link (no RESEND_API_KEY, DEV_AUTH log): ${verifyUrl}`);
      } else {
        return c.json({ error: t("error.mailNotConfigured"), code: "mail_not_configured" }, 503);
      }
    } else {
      await sendMagicLinkEmail({ to: email, verifyUrl });
    }
  } catch (err) {
    console.error("[auth] send magic link failed", err);
    return c.json({ error: t("error.mailSendFailed"), code: "mail_send_failed" }, 502);
  }

  return c.json(generic);
});

authRoutes.get("/verify", async (c) => {
  const token = c.req.query("token")?.trim() ?? "";
  const failRedirect = `${env.appOrigin}/?authError=invalid_link`;

  if (!token) {
    return c.redirect(failRedirect, 302);
  }

  const tokenHash = hashToken(token);
  const now = new Date();
  const row = await db.query.loginTokens.findFirst({
    where: and(eq(loginTokens.tokenHash, tokenHash), gt(loginTokens.expiresAt, now)),
  });

  if (!row) {
    return c.redirect(failRedirect, 302);
  }

  // Allow reuse within a short grace window so that email-client link prefetch
  // (e.g. QQ Mail) that consumes the token first does not break the real user click.
  if (row.consumedAt) {
    const graceOk = now.getTime() - row.consumedAt.getTime() <= env.magicLinkConsumeGraceMs;
    if (!graceOk) {
      return c.redirect(failRedirect, 302);
    }
    // Do NOT extend the window: keep the original consumedAt.
  } else {
    await db.update(loginTokens).set({ consumedAt: now }).where(eq(loginTokens.id, row.id));
  }

  const user = await ensureUserByEmail(row.email);
  setSessionCookie(c, user.id);
  return c.redirect(`${env.appOrigin}/`, 302);
});

authRoutes.post("/logout", async (c) => {
  clearSessionCookie(c);
  return c.json({ ok: true });
});

authRoutes.get("/me", requireUser, async (c) => {
  return c.json({ user: serializeUser(c.get("user")) });
});
