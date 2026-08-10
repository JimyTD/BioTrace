import { t } from "@biotrace/messages";
import { ProxyAgent, fetch as undiciFetch, type RequestInit } from "undici";
import { env } from "../env.js";

function fetchInit(): RequestInit {
  const init: RequestInit = {};
  if (env.httpsProxy) {
    init.dispatcher = new ProxyAgent(env.httpsProxy);
  }
  return init;
}

export async function sendMagicLinkEmail(opts: { to: string; verifyUrl: string }) {
  if (!env.resendApiKey) {
    throw new Error("RESEND_API_KEY is not set");
  }

  const res = await undiciFetch("https://api.resend.com/emails", {
    ...fetchInit(),
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.mailFrom,
      to: [opts.to],
      subject: t("auth.mailSubject"),
      text: t("auth.mailText", { url: opts.verifyUrl }),
      html: t("auth.mailHtml", { url: opts.verifyUrl }),
    }),
  });

  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Resend HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
}
