import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeRecipes, planFetch } from "../src/platforms/etrition-cache.ts";
import type { RecipeCache } from "../src/platforms/etrition-cache.ts";
import type {
  CalendarRecord,
  RecipeRecord,
} from "../src/platforms/etrition-normalize.ts";
import { fixture } from "./fake-etrition.ts";

const cake = fixture.recipes.find((r) => r.recipeID === 4938) as RecipeRecord;
const recipe = (id: number): RecipeRecord => ({
  ...cake,
  recipeID: id,
  recipeServingID: id,
});
const row = (id: number) =>
  ({ recipeID: id, recipeServingID: id }) as CalendarRecord;
const cached = (id: number, fetchedAt: string) => ({
  [String(id)]: { fetchedAt, record: recipe(id) },
});

test("plans unseen recipes first, then the stalest (30+ days) cached ones", () => {
  const cache: RecipeCache = {
    ...cached(1, "2026-10-01"), // fresh: skip
    ...cached(2, "2026-09-01"), // stale
    ...cached(3, "2026-08-01"), // stalest
  };
  const rows = [row(9), row(1), row(9), row(8)];
  assert.deepEqual(planFetch(rows, cache, "2026-10-08"), [9, 8, 3, 2]);
});

test("plans at most 150 recipes (3 batches)", () => {
  const rows = Array.from({ length: 400 }, (_, i) => row(i + 1));
  assert.equal(planFetch(rows, {}, "2026-10-08").length, 150);
});

test("merging logs each changed nutrient as a reformulation", () => {
  const cache = cached(4938, "2026-09-01");
  const lighter = { ...recipe(4938), addedSugar: 15, calories: 270 };
  const fetched = { ids: [4938], records: [lighter] };
  const out = mergeRecipes(cache, fetched, "2026-10-08");
  const what = out.changes.map((c) => [c.field, c.from, c.to]);
  assert.deepEqual(what, [
    ["calories", 283, 270],
    ["addedSugar", 19, 15],
  ]);
  const { date, recipeID, recipeServingID } = out.changes[0];
  assert.deepEqual(
    [date, recipeID, recipeServingID],
    ["2026-10-08", 4938, 4938],
  );
  const { fetchedAt, record } = out.cache["4938"];
  assert.deepEqual([fetchedAt, record.addedSugar], ["2026-10-08", 15]);
});

test("first sight is not a change; extra API fields are not cached", () => {
  const raw = { ...recipe(5), allergyList: [{ name: "Wheat" }] };
  const out = mergeRecipes({}, { ids: [5], records: [raw] }, "2026-10-08");
  assert.deepEqual(out.changes, []);
  const { record } = out.cache["5"];
  assert.equal(record.calories, 283);
  assert.ok(!("allergyList" in record) && !("recipeCode" in record));
});

test("asked-for but missing from a reply counts as checked", () => {
  const cache = { ...cached(7, "2026-08-01"), ...cached(8, "2026-08-01") };
  const fetched = { ids: [7, 8], records: [recipe(8)] };
  const out = mergeRecipes(cache, fetched, "2026-10-08");
  assert.equal(out.cache["7"].fetchedAt, "2026-10-08"); // gone: don't re-ask daily
});

test("an empty reply marks nothing as checked (likely an API glitch)", () => {
  const cache = cached(7, "2026-08-01");
  const out = mergeRecipes(cache, { ids: [7], records: [] }, "2026-10-08");
  assert.equal(out.cache["7"].fetchedAt, "2026-08-01");
});

test("a malformed recipe is rejected alone; the old entry stays", () => {
  const bad = { ...recipe(6), calories: "283" } as never;
  const fetched = { ids: [6, 9], records: [bad, recipe(9)] };
  const out = mergeRecipes(cached(6, "2026-08-01"), fetched, "2026-10-08");
  assert.match(out.rejected[0], /recipe 6: calories is not a number/);
  assert.deepEqual(out.cache["6"].record, recipe(6));
  assert.equal(out.cache["9"].record.calories, 283);
});

test("a cached recipe with no calories yet is re-fetched every run", () => {
  const empty = {
    fetchedAt: "2026-10-07",
    record: { ...recipe(4), calories: null },
  };
  const cache: RecipeCache = { "4": empty, ...cached(5, "2026-10-07") };
  assert.deepEqual(planFetch([row(4), row(5)], cache, "2026-10-08"), [4]);
});

test("a field the old cache entry never had is not logged as a change", () => {
  const old = { ...recipe(3) } as Partial<RecipeRecord>;
  delete old.recipeCategoryDescription; // cached before the field existed
  const cache = {
    "3": { fetchedAt: "2026-09-01", record: old as RecipeRecord },
  };
  const out = mergeRecipes(
    cache,
    { ids: [3], records: [recipe(3)] },
    "2026-10-08",
  );
  assert.deepEqual(out.changes, []);
});
