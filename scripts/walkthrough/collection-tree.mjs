import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const sharp = require("sharp");
const input = resolve(root, process.argv[2] ?? ".shot/collection-tree.png");
const image = sharp(input);
const metadata = await image.metadata();
assert.equal(metadata.hasAlpha, true, "The poster must have a transparent background");
const stats = await image.stats();
assert.equal(stats.channels[3].min, 0, "The background must be transparent");
assert.ok(stats.channels[3].max > 200, "The tree must not be blank");
const background = { r: 0, g: 0, b: 0, alpha: 0 };
const poster = await image.trim()
  .extend({ top: 20, bottom: 20, left: 20, right: 20, background })
  .resize(720, 800, { fit: "contain", background })
  .webp({ quality: 90, alphaQuality: 100, effort: 6 }).toBuffer();
for (const theme of ["clear", "daylight"]) {
  const dir = resolve(root, "apps/web/public/collection", theme);
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, "tree-door.webp"), poster);
}
console.log(`Collection tree: 720x800 RGBA, ${poster.length} bytes per theme`);
