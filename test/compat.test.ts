import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, mock, test } from "node:test";
import { sugaryEntree } from "../src/metrics.ts";
import { ab1264NutrientCriterion } from "../src/rules/ca.ts";
import { runAll } from "../src/runner.ts";
import type { Item } from "../src/types.ts";
import {
  district,
  fakeEtrition,
  fixture,
  knownCalendar,
} from "./fake-etrition.ts";

// Files written by older versions lack fields added since. They must read as
// "unpublished" (null), never crash a run and never count as a clean false.
afterEach(() => mock.restoreAll());

// Keep only ids + calories (so entries aren't re-fetched and their missing
// fields really get read): whatever field is added next, an entry without it
// must not crash a run. This broke twice: `category`, then `saturatedFat`.
function oldCache(dataDir: string): void {
  const bare = (r: (typeof fixture.recipes)[number]) => {
    const { recipeID, recipeServingID, calories, caloriesUOM } = r;
    const record = { recipeID, recipeServingID, calories, caloriesUOM };
    // After calcium's one-time catch-up, so nothing is re-asked.
    return { fetchedAt: "2026-10-23", record };
  };
  const recipes = Object.fromEntries(
    fixture.recipes.map((r) => [r.recipeServingID, bare(r)]),
  );
  mkdirSync(join(dataDir, district.id));
  writeFileSync(
    join(dataDir, district.id, "recipes.json"),
    JSON.stringify({ recipes }),
  );
}

test("a recipe cache missing any field but ids + calories still runs", async () => {
  const api = fakeEtrition();
  api.calendar = knownCalendar;
  const dataDir = mkdtempSync(join(tmpdir(), "compat-"));
  oldCache(dataDir);
  const log: string[] = [];
  const now = new Date("2026-10-24T10:00:00");
  const failed = await runAll([district], {
    dataDir,
    now,
    log: (l) => log.push(l),
  });
  assert.equal(failed, 0, log.join("\n"));
  assert.match(
    log.join("\n"),
    /recipes asked 0, got 0/,
    "entries read from cache",
  );
});

test("an item from an old day file gives null, not false", () => {
  const item = {
    item: "Waffle",
    kcal: 200,
    sodiumMg: 100,
    addedSugarG: 4,
    addedSugar: 4,
  } as unknown as Item;
  assert.equal(ab1264NutrientCriterion(item), null, "saturatedFatG missing");
  assert.equal(sugaryEntree([item]), null, "category missing");
});
