import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runAll } from "../src/runner.ts";
import type { District, Item } from "../src/types.ts";

// Calls the real eTrition and SchoolCafé APIs for every district in
// districts.json, so it only runs on purpose: LIVE=1 npm test.
// Keep it to one run per weekday (PRD §3). Writes to a temp dir, not data/.
const registry = new URL("../districts.json", import.meta.url);
const districts: District[] = JSON.parse(
  readFileSync(registry, "utf8"),
).districts;
const skip = !process.env.LIVE && "set LIVE=1 to call the real eTrition API";

function readItems(dir: string): Item[] {
  const days = readdirSync(dir).filter((f) =>
    /^\d{4}-\d{2}-\d{2}\.json$/.test(f),
  );
  return days.flatMap(
    (f) => JSON.parse(readFileSync(join(dir, f), "utf8")).items,
  );
}

test("live: one runner pass over every district", { skip }, async (t) => {
  const dataDir = mkdtempSync(join(tmpdir(), "live-"));
  const log = (line: string) => t.diagnostic(line);
  assert.equal(await runAll(districts, { dataDir, now: new Date(), log }), 0);
  for (const d of districts) {
    const items = readItems(join(dataDir, d.id));
    const flagged = (f: string) =>
      items.filter((i) => i.flags.some((x) => x === f));
    const suspect = flagged("suspect").map(
      (i) => `${i.date} ${i.item} ${i.kcal}`,
    );
    t.diagnostic(`${d.id} suspect: ${suspect.join("; ")}`);
    assert.ok(items.length > 0, `${d.id}: no items`);
    assert.equal(
      flagged("missing_nutrition").length,
      0,
      `${d.id}: recipes missing`,
    );
  }
});
