/**
 * Merge curated country lists into apps/api/data/introduced-seed.json
 *
 * Usage:
 *   node scripts/merge-introduced.mjs path/to/extra.json
 *
 * Extra file shape: { "CN": ["Name …"], "US": [...] }
 * Dedupes case-insensitively; does not fetch GRIIS (manual curation only).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(root, "data/introduced-seed.json");

const base = JSON.parse(readFileSync(outPath, "utf8"));
const extraPath = process.argv[2];
if (!extraPath) {
  console.error("Usage: node scripts/merge-introduced.mjs <extra.json>");
  process.exit(1);
}
const extra = JSON.parse(readFileSync(resolve(extraPath), "utf8"));

function mergeList(a = [], b = []) {
  const seen = new Set();
  const out = [];
  for (const name of [...a, ...b]) {
    if (typeof name !== "string") continue;
    const key = name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name.trim());
  }
  return out.sort((x, y) => x.localeCompare(y));
}

const countries = new Set([...Object.keys(base), ...Object.keys(extra)]);
const merged = {};
for (const cc of [...countries].sort()) {
  if (cc.startsWith("_")) continue;
  merged[cc] = mergeList(base[cc], extra[cc]);
}

writeFileSync(outPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
console.log(`Wrote ${outPath}`);
for (const [cc, list] of Object.entries(merged)) {
  console.log(`  ${cc}: ${list.length}`);
}
