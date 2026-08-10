/**
 * Build introduced-index.json:
 *   1) GRIIS Country Compendium (Zenodo) → all countries
 *   2) Overlay fresher GRIIS-China checklist from GBIF species API
 *   3) Runtime still merges introduced-seed.json on top
 *
 *   pnpm --filter @biotrace/api introduced:build
 *
 * Optional: set GRIIS_COMPENDIUM_CSV to a local CSV path to skip download.
 * Cache default: apps/api/data/_cache/griis-compendium.csv (gitignored).
 */
import { createReadStream, mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ProxyAgent, fetch as undiciFetch, type RequestInit } from "undici";
import { env } from "../src/env.js";
import { binomialKey } from "../src/introduced/normalize.js";

const root = dirname(fileURLToPath(import.meta.url));
const dataDir = join(root, "../data");
const cacheDir = join(dataDir, "_cache");

const COMPENDIUM_URL =
  "https://zenodo.org/api/records/6348164/files/GRIIS%20-%20Country%20Compendium%20V1_0.csv/content";
const COMPENDIUM_DOI = "10.5281/zenodo.6348164";

/** Living GRIIS China checklist on GBIF — overlays Compendium CN (China-first). */
const GRIIS_CN_DATASET = "6d11211b-caa0-4e63-b99c-e944099d5017";

/** Product settle maps these to CN; merge any source rows so lookup keys match. */
const MERGE_INTO_CN = new Set(["TW", "HK", "MO"]);

type CountrySets = Map<string, Set<string>>;

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

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      q = !q;
      continue;
    }
    if (c === "," && !q) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

function addName(sets: CountrySets, country: string, raw: string | null | undefined) {
  const key = binomialKey(raw);
  if (!key) return;
  let cc = country.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return;
  if (MERGE_INTO_CN.has(cc)) cc = "CN";
  let set = sets.get(cc);
  if (!set) {
    set = new Set();
    sets.set(cc, set);
  }
  set.add(key);
}

async function ensureCompendiumCsv(): Promise<string> {
  const fromEnv = process.env.GRIIS_COMPENDIUM_CSV?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  mkdirSync(cacheDir, { recursive: true });
  const cached = join(cacheDir, "griis-compendium.csv");
  if (existsSync(cached) && statSync(cached).size > 1_000_000) {
    console.log(`Compendium cache hit: ${cached}`);
    return cached;
  }

  console.log(`Downloading Compendium (${COMPENDIUM_DOI}) ...`);
  const res = await undiciFetch(COMPENDIUM_URL, { ...fetchInit() });
  if (!res.ok) throw new Error(`Compendium download HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(cached, buf);
  console.log(`wrote cache ${cached} (${buf.length} bytes)`);
  return cached;
}

async function loadCompendium(csvPath: string): Promise<{
  sets: CountrySets;
  rowCount: number;
  mergedAliasRows: number;
}> {
  const sets: CountrySets = new Map();
  let rowCount = 0;
  let mergedAliasRows = 0;

  const rl = createInterface({ input: createReadStream(csvPath, { encoding: "utf8" }), crlfDelay: Infinity });
  let header: string[] | null = null;
  let idxSpecies = -1;
  let idxSci = -1;
  let idxCc = -1;
  let idxHybrid = -1;

  for await (const line of rl) {
    if (!line.trim()) continue;
    if (!header) {
      header = parseCsvLine(line);
      idxSpecies = header.indexOf("species");
      idxSci = header.indexOf("scientificName");
      idxCc = header.indexOf("countryCode_alpha2");
      idxHybrid = header.indexOf("isHybrid");
      if (idxCc < 0 || (idxSpecies < 0 && idxSci < 0)) {
        throw new Error(`Unexpected Compendium header: ${header.join(",")}`);
      }
      continue;
    }

    const row = parseCsvLine(line);
    const cc = (row[idxCc] ?? "").trim().toUpperCase();
    if (!cc) continue;
    if (MERGE_INTO_CN.has(cc)) mergedAliasRows += 1;
    if (idxHybrid >= 0 && String(row[idxHybrid]).toUpperCase() === "TRUE") continue;

    const species = idxSpecies >= 0 ? row[idxSpecies] : "";
    const sci = idxSci >= 0 ? row[idxSci] : "";
    addName(sets, cc, species || sci);
    rowCount += 1;
  }

  return { sets, rowCount, mergedAliasRows };
}

async function pullGbifChina(): Promise<string[]> {
  const names = new Set<string>();
  for (const rank of ["SPECIES", "SUBSPECIES"] as const) {
    let offset = 0;
    const limit = 100;
    for (;;) {
      const url =
        `https://api.gbif.org/v1/species/search?datasetKey=${GRIIS_CN_DATASET}` +
        `&rank=${rank}&status=ACCEPTED&limit=${limit}&offset=${offset}`;
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
  }
  return [...names].sort();
}

function mergeInto(sets: CountrySets, country: string, names: string[]) {
  let set = sets.get(country);
  if (!set) {
    set = new Set();
    sets.set(country, set);
  }
  for (const n of names) {
    const key = binomialKey(n) ?? n.trim().toLowerCase();
    if (key.includes(" ")) set.add(key);
  }
}

function toPayload(sets: CountrySets) {
  const byCountry: Record<string, string[]> = {};
  const sizes: Record<string, number> = {};
  for (const cc of [...sets.keys()].sort()) {
    const list = [...(sets.get(cc) ?? [])].sort();
    byCountry[cc] = list;
    sizes[cc] = list.length;
  }
  return { byCountry, sizes };
}

async function main() {
  const csvPath = await ensureCompendiumCsv();
  process.stdout.write("Parsing Compendium ... ");
  const { sets, rowCount, mergedAliasRows } = await loadCompendium(csvPath);
  console.log(`${rowCount} rows → ${sets.size} countries (TW/HK/MO merge rows: ${mergedAliasRows})`);

  process.stdout.write(`GBIF GRIIS CN ${GRIIS_CN_DATASET} ... `);
  const cnNames = await pullGbifChina();
  const cnBefore = sets.get("CN")?.size ?? 0;
  mergeInto(sets, "CN", cnNames);
  const cnAfter = sets.get("CN")?.size ?? 0;
  console.log(`${cnNames.length} binomials; CN ${cnBefore} → ${cnAfter}`);

  const { byCountry, sizes } = toPayload(sets);
  mkdirSync(dataDir, { recursive: true });
  const outPath = join(dataDir, "introduced-index.json");
  const payload = {
    generatedAt: new Date().toISOString(),
    notes:
      "GRIIS Country Compendium (all countries) + GBIF GRIIS-China overlay. " +
      "TW/HK/MO source rows (if any) merged into CN to match settle iso3166. " +
      "Seed overlay: introduced-seed.json (merged at runtime). All establishmentMeans kept (not isInvasive-only).",
    sources: {
      compendium: {
        type: "griis_country_compendium",
        doi: COMPENDIUM_DOI,
        url: COMPENDIUM_URL,
        countries: Object.keys(byCountry).length,
        rowsParsed: rowCount,
      },
      CN_gbif_overlay: {
        type: "griis_gbif",
        datasetKey: GRIIS_CN_DATASET,
        count: cnNames.length,
      },
    },
    sizes,
    byCountry,
  };
  writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");
  const bytes = statSync(outPath).size;
  console.log(
    `wrote ${outPath} (${(bytes / 1024).toFixed(0)} KB, ${Object.keys(byCountry).length} countries, ` +
      `${Object.values(sizes).reduce((a, b) => a + b, 0)} binomials)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
