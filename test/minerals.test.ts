import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeRecipes, planFetch } from "../src/platforms/etrition-cache.ts";
import type { RecipeCache } from "../src/platforms/etrition-cache.ts";
import { normalize } from "../src/platforms/etrition-normalize.ts";
import type { RecipeRecord } from "../src/platforms/etrition-normalize.ts";
import { parseDetail } from "../src/platforms/schoolcafe-parse.ts";
import { summarize } from "../src/summary.ts";
import { district, fixture } from "./fake-etrition.ts";
import { cerealBar } from "./fake-schoolcafe.ts";

// Calcium and iron, which both platforms publish, kept like the
// other nutrients; days stored before then take them from the recipe cache.
const recipes = fixture.recipes as RecipeRecord[];
const cheerios = recipes.find((r) => r.recipeID === 4700) as RecipeRecord;
const today = "2026-10-23";
const fetched = (records: RecipeRecord[]) =>
  mergeRecipes({}, { ids: records.map((r) => r.recipeID), records }, today);

test("eTrition: items carry calcium and iron (mg); the cache keeps them", () => {
  const items = normalize(district, fixture.calendar.records, recipes);
  const item = items.find((i) => i.sourceId === "4700");
  assert.deepEqual([item?.calciumMg, item?.ironMg], [150, 5.4]);
  const kept = fetched([cheerios]).cache["4645"].record;
  assert.deepEqual([kept.calcium, kept.iron], [150, 5.4]);
  const grams = { ...cheerios, calciumUOM: "g" };
  assert.equal(fetched([grams]).rejected.length, 1, "wrong unit refused");
});

test("SchoolCafé: Calcium and Iron parse with units; unlisted ones are null", () => {
  const r = parseDetail(cerealBar);
  assert.deepEqual(
    [r?.calcium, r?.calciumUOM, r?.iron, r?.ironUOM],
    [427.33, "mg", 1.95, "mg"],
  );
  const none = parseDetail({ NutritionalValues: [] });
  assert.ok(none && "calcium" in none && none.calcium === null);
});

// Asked once: a recipe the API doesn't return gets today's fetchedAt, so
// it can't come back every run and starve the queue.
test("a recipe cached before calcium was kept is re-fetched, once", () => {
  const { calcium, calciumUOM, iron, ironUOM, ...before } = cheerios;
  assert.ok([calcium, calciumUOM, iron, ironUOM].every((v) => v !== undefined));
  const at = (fetchedAt: string, record: RecipeRecord) => ({
    fetchedAt,
    record,
  });
  const cache: RecipeCache = {
    "1": at("2026-10-20", { ...before, recipeID: 1 } as RecipeRecord),
    "2": at("2026-10-20", { ...cheerios, recipeID: 2, calcium: null }),
    "3": at(today, { ...before, recipeID: 3 } as RecipeRecord),
  };
  assert.deepEqual(planFetch([], cache, today), [1]);
});

// As a day file stored before calcium and iron were kept.
const keep = (i: object) => {
  const { calciumMg, ironMg, ...old } = i as Record<string, unknown>;
  return old;
};
const olderDays = () => {
  const items = normalize(district, fixture.calendar.records, recipes);
  return [...Map.groupBy(items, (i) => i.date)].map(([date, day]) => ({
    ...{ schemaVersion: 1 as const, district: district.id, date },
    ...{ firstSeen: date, lastSeen: date, items: day.map(keep) as never },
  }));
};
const summaryItems = (cache: RecipeCache) =>
  summarize(
    [{ district, days: olderDays(), changes: 0, recipes: cache }],
    today,
  ).districts[0].series.flatMap((s) => s.days.flatMap((d) => d.items));

test("days stored without calcium and iron take their recipe's cached values", () => {
  const cache = fetched([cheerios]).cache;
  const items = summaryItems(cache);
  const bowl = items.find((i) => i.sourceId === "4700");
  assert.deepEqual([bowl?.calciumMg, bowl?.ironMg], [150, 5.4]);
  const other = items.find((i) => i.sourceId === "4830"); // milk: not cached
  assert.deepEqual([other?.calciumMg, other?.ironMg], [null, null]);
  // Two servings of one recipe: which one was served is unknown.
  const twice = { ...cache, "9": { ...cache["4645"] } };
  const amb = summaryItems(twice).find((i) => i.sourceId === "4700");
  assert.equal(amb?.calciumMg, null);
});
