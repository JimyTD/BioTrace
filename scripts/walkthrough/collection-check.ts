import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pickCollectionFaces, type CollectionFaceSource } from "../../apps/web/src/collectionFaces";
import { THEME_IDS, themeMeta } from "../../apps/web/src/themes/core";
import { collectionTreeDoorUrl } from "../../apps/web/src/themes/collectionAssets";
import { petToIndexRow, sortSpecies, wildToIndexRow } from "../../apps/web/src/speciesSearch";
import type { CollectionEntry } from "../../apps/web/src/api";

const root = fileURLToPath(new URL("../../", import.meta.url));
const row = (id: string, kingdom: string, rarity: string, cover = true): CollectionFaceSource => ({
  id, commonName: id, rarity, coverDisplayUrl: cover ? `/photos/${id}.jpg` : null,
  taxonomy: { kingdom: { name_la: kingdom, name_zh: null } } as CollectionFaceSource["taxonomy"],
});
const entries = [row("a", "Animalia", "R"), row("b", "Animalia", "SSR"), row("c", "Fungi", "N"), row("d", "Plantae", "SR")];
assert.deepEqual(pickCollectionFaces(entries, 3).map((item) => item.id), ["b", "c", "d"]);
assert.equal(pickCollectionFaces([], 3).length, 0);
assert.equal(pickCollectionFaces(entries.slice(0, 1), 3).length, 1);
assert.equal(pickCollectionFaces(entries.slice(0, 2), 3).length, 2);
assert.equal(pickCollectionFaces([row("no-cover", "Fungi", "XR", false)], 3).length, 0);
assert.equal(pickCollectionFaces([...entries, row("e", "Animalia", "R")], 3).length, 3);

const source: CollectionEntry = {
  id: "shared-id", taxonKey: "Canis lupus", commonName: null, scientificName: "Canis lupus",
  rarity: "R", coverObservationId: null, coverDisplayUrl: null,
  firstCollectedAt: "2026-09-01", updatedAt: "2026-09-01",
};
const wild = wildToIndexRow(source);
const pet = petToIndexRow({ ...source, updatedAt: "2026-09-02" });
assert.notEqual(wild.rowKey, pet.rowKey);
assert.equal(wild.href, "/collection/species/shared-id");
assert.equal(pet.href, "/collection/species/pet/shared-id");
assert.deepEqual(sortSpecies([wild, pet], "recent").map(item => item.rowKey), ["pet:shared-id", "wild:shared-id"]);

let expectedTokens: string[] | undefined;
for (const theme of THEME_IDS) {
  assert.ok(themeMeta(theme).assets.includes("collection"));
  const url = collectionTreeDoorUrl(theme);
  assert.ok(url && existsSync(resolve(root, "apps/web/public", url.slice(1))), `${theme}: missing tree poster`);
  const css = readFileSync(resolve(root, `apps/web/src/themes/${theme}.css`), "utf8");
  const tokens = [...css.matchAll(/(--(?:collection|reel)-[\w-]+)\s*:/g)].map((match) => match[1]).sort();
  assert.ok(tokens.length > 0);
  if (expectedTokens) assert.deepEqual(tokens, expectedTokens, "Collection theme tokens must match");
  expectedTokens = tokens;
}
console.log("Collection checks passed: wild/pet routes, sorting, sparse data, theme assets, token parity");
