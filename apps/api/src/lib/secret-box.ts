import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(`biotrace-identify-key:v1:${secret}`).digest();
}

/** AES-256-GCM; format `v1$<iv>$<tag>$<ciphertext>` (base64url). */
export function sealSecret(plaintext: string, secret: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1$${iv.toString("base64url")}$${tag.toString("base64url")}$${enc.toString("base64url")}`;
}

export function openSecret(blob: string, secret: string): string {
  const parts = blob.split("$");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("invalid secret blob");
  }
  const key = deriveKey(secret);
  const iv = Buffer.from(parts[1]!, "base64url");
  const tag = Buffer.from(parts[2]!, "base64url");
  const data = Buffer.from(parts[3]!, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function keyHint(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (trimmed.length <= 4) return trimmed;
  return trimmed.slice(-4);
}
