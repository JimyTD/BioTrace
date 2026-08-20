import { Agent } from "undici";
import { classifyProviderError, parseRetryDelayMs, type ErrorKind } from "../identify/health.js";

/**
 * 必须显式直连：`identify/gemini.ts` 用 setGlobalDispatcher 装了出境代理，
 * 沿用全局 dispatcher 会把对 TokenHub（国内服务）的请求绕去境外再回来。
 */
let directAgent: Agent | null = null;
export function tokenhubDirectAgent(): Agent {
  if (!directAgent) directAgent = new Agent();
  return directAgent;
}

/**
 * TokenHub 网关错误码会撞上通用分类器：
 * - `401006`（endpoint is inactive）码里带 "401"，实际是瞬态，重试即通。
 * - `HTTP 402` 是未开通或免费额度用尽，应按耗尽打冷却并降下一档，不要当抖动重试。
 */
export function classifyTokenhubError(message: string): ErrorKind {
  if (/401006|endpoint is inactive/i.test(message)) return "transient";
  if (/HTTP 402|额度不足|insufficient quota|未开通/i.test(message)) return "daily_exhausted";
  return classifyProviderError(message);
}

export function tokenhubCoolMsFor(kind: ErrorKind, message: string): number {
  switch (kind) {
    case "rate_limited":
      return parseRetryDelayMs(message);
    case "daily_exhausted":
      return 6 * 60 * 60_000;
    case "auth":
      return 30 * 60_000;
    case "transient":
      return 20_000;
    default:
      return 10 * 60_000;
  }
}
