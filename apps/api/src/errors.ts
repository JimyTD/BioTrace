import { t, type MessageKey } from "@biotrace/messages";

const known: Record<string, MessageKey> = {
  unauthorized: "error.unauthorized",
  "not found": "error.notFound",
  "trip not found": "error.tripNotFound",
  "file is required": "error.fileRequired",
  "file must be an image": "error.fileMustBeImage",
  "GEMINI_API_KEY is not set": "error.geminiKeyMissing",
  "confirm phrase mismatch": "error.confirmPhraseMismatch",
  identify_too_coarse: "error.identifyTooCoarse",
  identify_quota: "error.identifyUnavailable",
  identify_unavailable: "error.identifyUnavailable",
  identify_not_organism: "error.identifyNotCollectible",
  identify_human: "error.identifyNotCollectible",
  identify_not_living: "error.identifyNotCollectible",
};

export function apiError(code: string, status: number) {
  const key = known[code];
  return {
    body: { error: key ? t(key) : code, code },
    status: status as 400 | 401 | 403 | 404 | 500,
  };
}

export function localizeThrownMessage(message: string): string {
  const key = known[message];
  if (key) return t(key);
  if (message.includes("GEMINI_API_KEY") && message.includes("ZHIPU")) {
    return t("error.identifyUnavailable");
  }
  if (message.includes("GEMINI_API_KEY") || message.includes("ZHIPU_API_KEY")) {
    return t("error.identifyUnavailable");
  }
  if (
    message.includes("429") ||
    message.toLowerCase().includes("quota") ||
    message.toLowerCase().includes("too many requests")
  ) {
    return t("error.identifyUnavailable");
  }
  return message;
}
