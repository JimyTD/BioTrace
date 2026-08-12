/** Replay saved encounter rows through current formula (no LLM). */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { collectibleRankFromTier, resolveFromEncounter } from "../src/rarity/formula.js";

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
    agent?: string;
    model: string | null;
    encounter_frequency?: number;
    extinct_or_unobtainable?: boolean;
    pest_or_weed?: boolean;
    iconic_appeal?: number;
    swarm_or_habituated?: number;
    protection_level?: string;
    hard_to_photograph?: number | boolean;
  }>;
};

let exact = 0;
let within1 = 0;
for (const r of j.rows) {
  if (r.encounter_frequency == null || !r.model) continue;
  const out = resolveFromEncounter({
    frequency: r.encounter_frequency,
    extinct: r.extinct_or_unobtainable,
    pestOrWeed: r.pest_or_weed,
    iconicAppeal: r.iconic_appeal,
    swarmOrHabituated: r.swarm_or_habituated,
    protectionLevel: r.protection_level,
    hardToPhotograph: r.hard_to_photograph,
  });
  const ref = String(r.user ?? "").trim() || String(r.agent ?? "").trim();
  const d = Math.abs(collectibleRankFromTier(out.rarity) - collectibleRankFromTier(ref));
  if (d === 0) exact += 1;
  if (d <= 1) within1 += 1;
  const mark = out.rarity !== r.model ? ` (was ${r.model})` : "";
  console.log(
    `#${r.id} ${r.label}: ref ${ref} → ${out.rarity}${mark} freq=${out.frequency} S=${out.offsetScore.toFixed(2)} d=${out.offsetDelta} Δ${d}` +
      (out.adjustments.length ? ` [${out.adjustments.join(",")}]` : ""),
  );
}
console.log(`\nexact ${exact} | within1 ${within1}`);
