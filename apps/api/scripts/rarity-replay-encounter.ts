/** Replay saved encounter_class rows through current formula (no LLM). */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectibleRankFromTier,
  parseEncounterClass,
  resolveFromEncounter,
} from "../src/rarity/formula.js";

const file =
  process.argv[2] ||
  join(
    dirname(fileURLToPath(import.meta.url)),
    "out",
    "rarity-calibrate-2026-08-07T06-37-47-026Z.json",
  );

const j = JSON.parse(readFileSync(file, "utf8")) as {
  rows: Array<{
    id: number;
    label: string;
    user: string;
    model: string | null;
    encounter_class?: string;
    swarm_or_habituated?: number;
    protection_level?: string;
    hard_to_photograph?: boolean;
  }>;
};

let exact = 0;
let within1 = 0;
for (const r of j.rows) {
  const cls = parseEncounterClass(r.encounter_class);
  if (!cls || !r.model) continue;
  const out = resolveFromEncounter({
    encounterClass: cls,
    swarmOrHabituated: r.swarm_or_habituated,
    protectionLevel: r.protection_level,
    hardToPhotograph: r.hard_to_photograph,
  });
  const d = Math.abs(collectibleRankFromTier(out.rarity) - collectibleRankFromTier(r.user));
  if (d === 0) exact += 1;
  if (d <= 1) within1 += 1;
  const mark = out.rarity !== r.model ? ` (was ${r.model})` : "";
  console.log(
    `#${r.id} ${r.label}: user ${r.user} → ${out.rarity}${mark} class=${cls} Δ${d}` +
      (out.adjustments.length ? ` [${out.adjustments.join(",")}]` : ""),
  );
}
console.log(`\nexact ${exact} | within1 ${within1}`);
