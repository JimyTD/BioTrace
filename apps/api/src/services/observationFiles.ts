import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { env } from "../env.js";

export async function removeObservationFiles(displayPath: string) {
  const fileAbs = join(env.uploadDir, displayPath);
  const obsDir = dirname(fileAbs);
  await rm(obsDir, { recursive: true, force: true }).catch(() => undefined);
}
