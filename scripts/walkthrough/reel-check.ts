import assert from "node:assert/strict";
import { bookmarkReel, collectionReelStorageKey, reconcileReelPosition, reelWindow, restoreReel, wrapIndex } from "../../apps/web/src/collectionReel";
import { collectionOriginPath } from "../../apps/web/src/collectionNavigation";
import { peekCollection, rememberCollection } from "../../apps/web/src/pageCache";

const items = Array.from({ length: 5000 }, (_, i) => ({ rowKey: `wild:${i}` }));
assert.equal(wrapIndex(-1, 5000), 4999);
assert.equal(wrapIndex(5001, 5000), 1);
assert.equal(wrapIndex(1, 0), 0);
for (const position of [-5001.25, -.1, 0, 4999.9, 5000, 90000.4]) {
  for (const width of [280, 390, 1000]) {
    const slots = reelWindow(position, 5000, width, 182);
    assert.ok(slots.length <= 9, "The visible window must not grow with the collection");
    assert.equal(new Set(slots.map(slot => slot.logical)).size, slots.length);
    assert.ok(slots.every(slot => slot.index >= 0 && slot.index < 5000));
    const bookmark = bookmarkReel(items, position, true);
    assert.ok(bookmark);
    const restored = restoreReel(items, JSON.stringify(bookmark));
    assert.ok(Math.abs(restored.position - (wrapIndex(Math.floor(position), 5000) + position - Math.floor(position))) < 1e-8);
    assert.equal(restored.paused, true);
  }
}
assert.deepEqual(reelWindow(0, 0, 390, 162), []);
assert.equal(bookmarkReel([], 0, false), null);
assert.equal(bookmarkReel(items, Infinity, false), null);
assert.deepEqual(restoreReel(items, "broken"), { position: 0, paused: false });
assert.deepEqual(restoreReel(items, '{"key":"missing","fraction":0.5}'), { position: 0, paused: false });
assert.deepEqual(restoreReel(items, '{"key":"wild:4","fraction":-8,"paused":false}'), { position: 4, paused: false });
const saved = bookmarkReel(items, 12.5, true);
assert.equal(restoreReel([{ rowKey: "new" }, ...items], JSON.stringify(saved)).position, 13.5);
const inserted = [{ rowKey: "new" }, ...items];
assert.equal(reconcileReelPosition(items, inserted, 12.5), 13.5);
assert.equal(reconcileReelPosition(items, inserted, 5012.5), 5014.5);
assert.equal(reconcileReelPosition(items, [], 12.5), 0);
assert.equal(reconcileReelPosition(items, items.filter(e => e.rowKey !== "wild:12"), 12.5), 12.5);
assert.deepEqual(restoreReel(items, '{"key":"removed","paused":true}'), { position: 0, paused: true });
assert.notEqual(collectionReelStorageKey("user-a"), collectionReelStorageKey("user-b"));
rememberCollection("user-a", { entryCount: 3 });
assert.equal(peekCollection("user-a")?.entryCount, 3);
assert.equal(peekCollection("user-b"), null);
assert.equal(collectionOriginPath({ from: "/collection" }), "/collection");
assert.equal(collectionOriginPath({ from: "/collection/tree/0%3AAnimalia" }), "/collection/tree/0%3AAnimalia");
assert.equal(collectionOriginPath({ from: "https://example.com" }), null);
assert.equal(collectionOriginPath({ from: "/collection/tree-other" }), null);
assert.equal(collectionOriginPath(null), null);
console.log("Reel checks passed: wrapping, bounded windows, resume/reconciliation, account isolation, return routes");
