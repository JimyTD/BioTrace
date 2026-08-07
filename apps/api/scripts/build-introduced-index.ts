/**
 * Build introduced-index.json from GRIIS checklists on GBIF (species API).
 *
 *   pnpm exec tsx scripts/build-introduced-index.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ProxyAgent, fetch as undiciFetch, type RequestInit } from "undici";
import { env } from "../src/env.js";
import { binomialKey } from "../src/introduced/normalize.js";

const root = dirname(fileURLToPath(import.meta.url));
const dataDir = join(root, "../data");

/** GRIIS country checklists we ship as the public index (CN first; US/JP if available). */
const GRIIS_DATASETS: Record<string, string> = {
  CN: "6d11211b-caa0-4e63-b99c-e944099d5017",
  // US / JP remain seed-overlay only until we pin stable GRIIS dataset keys here.
};

function fetchInit(): RequestInit {
  const init: RequestInit = {};
  if (env.httpsProxy) init.dispatcher = new ProxyAgent(env.httpsProxy);
  return init;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await undiciFetch(url, { ...fetchInit() });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
  return JSON.parse(body) as T;
}

async function pullDatasetNames(datasetKey: string): Promise<string[]> {
  const names = new Set<string>();
  let offset = 0;
  const limit = 100;
  for (;;) {
    const url =
      `https://api.gbif.org/v1/species/search?datasetKey=${datasetKey}` +
      `&rank=SPECIES&status=ACCEPTED&limit=${limit}&offset=${offset}`;
    const page = await fetchJson<{
      count: number;
      endOfRecords?: boolean;
      results?: Array<{ canonicalName?: string; scientificName?: string; rank?: string }>;
    }>(url);
    for (const row of page.results ?? []) {
      const raw = row.canonicalName?.trim() || row.scientificName?.trim();
      const key = binomialKey(raw);
      if (key) names.add(key);
    }
    offset += limit;
    if (page.endOfRecords || offset >= (page.count ?? 0) || !(page.results?.length)) break;
    await new Promise((r) => setTimeout(r, 120));
  }
  // subspecies too
  offset = 0;
  for (;;) {
    const url =
      `https://api.gbif.org/v1/species/search?datasetKey=${datasetKey}` +
      `&rank=SUBSPECIES&status=ACCEPTED&limit=${limit}&offset=${offset}`;
    const page = await fetchJson<{
      count: number;
      endOfRecords?: boolean;
      results?: Array<{ canonicalName?: string; scientificName?: string }>;
    }>(url);
    for (const row of page.results ?? []) {
      const raw = row.canonicalName?.trim() || row.scientificName?.trim();
      const key = binomialKey(raw);
      if (key) names.add(key);
    }
    offset += limit;
    if (page.endOfRecords || offset >= (page.count ?? 0) || !(page.results?.length)) break;
    await new Promise((r) => setTimeout(r, 120));
  }
  return [...names].sort();
}

async function main() {
  const byCountry: Record<string, string[]> = {};
  const sources: Record<string, { type: string; datasetKey: string; count: number }> = {};

  for (const [cc, datasetKey] of Object.entries(GRIIS_DATASETS)) {
    process.stdout.write(`GRIIS ${cc} ${datasetKey} ... `);
    const names = await pullDatasetNames(datasetKey);
    byCountry[cc] = names;
    sources[cc] = { type: "griis_gbif", datasetKey, count: names.length };
    console.log(`${names.length} binomials`);
  }

  mkdirSync(dataDir, { recursive: true });
  const outPath = join(dataDir, "introduced-index.json");
  const payload = {
    generatedAt: new Date().toISOString(),
    notes:
      "Public GRIIS checklists via GBIF species API. Seed overlay: introduced-seed.json (merged at runtime).",
    sources,
    byCountry,
  };
  writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");
  console.log(`wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
