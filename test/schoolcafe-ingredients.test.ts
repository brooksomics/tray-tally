import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, mock, test } from "node:test";
import { rows as pageRows } from "../dashboard/data.js";
import { labeler } from "../dashboard/names.js";
import { fetchWeek } from "../src/platforms/schoolcafe.ts";
import {
  mergeIngredients,
  parseDaily,
  planDaily,
} from "../src/platforms/schoolcafe-ingredients.ts";
import { flattenWeek } from "../src/platforms/schoolcafe-parse.ts";
import { runAll } from "../src/runner.ts";
import { read } from "./fake-etrition.ts";
import { dmusd, fakeSchoolCafe } from "./fake-schoolcafe.ts";

// Only CalendarView/GetDailyMenuitems carries SubIngredientsDisplay
// (fixtures/schoolcafe/daily.json: Del Mar lunch, 2026-10-07).
const daily = read("fixtures/schoolcafe/daily.json");
const week: [string, string] = ["2026-10-05", "2026-10-09"];
const today = "2026-10-08";
const fresh = { cache: {}, today };
const isDaily = (c: { url: URL }) =>
  c.url.pathname.endsWith("/CalendarView/GetDailyMenuitems");
const askedDays = (calls: { url: URL }[]) =>
  calls.filter(isDaily).map((c) => c.url.searchParams.get("ServingDate"));
const lunch = flattenWeek(
  read("fixtures/schoolcafe/dmusd-weekly-lunch.json"),
  2,
);
const on = (date: string) => lunch.filter((r) => r.date === date);

afterEach(() => mock.restoreAll());

test("daily reply -> ingredients per MenuItemId; blank is null; odd shapes fail", () => {
  const got = parseDaily(daily);
  assert.equal(got.get(170131), "Raisins, Individual Pack, USDA");
  assert.equal(got.get(146817), "Milk, chocolate, fat free, Hollandia");
  assert.equal(got.size, 12);
  const blank = { FRUIT: [{ MenuItemId: 9, SubIngredientsDisplay: " " }] };
  assert.equal(parseDaily(blank).get(9), null);
  const placeholder = { FRUIT: [{ MenuItemId: 0 }] }; // "menu not published"
  assert.equal(parseDaily(placeholder).size, 0);
  assert.throws(() => parseDaily([]), /SchoolCafe daily: unexpected reply/);
  assert.throws(() => parseDaily({ FRUIT: [{ MenuItemId: "x" }] }), /item/);
});

// Every lunch day but Friday 10-09 asked, with this answer.
const asked = (fetchedAt: string, ingredients: string | null) =>
  Object.fromEntries(
    lunch
      .filter((r) => r.date !== "2026-10-09")
      .map((r) => [r.id, { fetchedAt, ingredients }]),
  );
const planned = (cache: object) =>
  planDaily(lunch, cache as never, today)?.date ?? null;

test("plan: the day and meal with the most items lacking ingredients", () => {
  assert.equal(planned({}), "2026-10-05");
  assert.equal(planned(asked("x", "known")), "2026-10-09");
  const all = Object.fromEntries(
    lunch.map((r) => [r.id, { fetchedAt: "x", ingredients: "y" }]),
  );
  assert.equal(planned(all), null);
});

test("plan: asked without an answer is asked again after 7 days, not before", () => {
  assert.equal(planned(asked("2026-10-02", null)), "2026-10-09");
  assert.equal(planned(asked("2026-10-01", null)), "2026-10-05");
});

test("one daily call a run, for the day and meal with the most items lacking ingredients", async () => {
  const api = fakeSchoolCafe();
  await fetchWeek(dmusd, week, fresh);
  const calls = api.calls.filter(isDaily);
  assert.equal(calls.length, 1);
  const q = calls[0].url.searchParams;
  assert.deepEqual(
    ["SchoolId", "ServingDate", "ServingLine", "MealType"].map((k) => q.get(k)),
    [dmusd.params.schoolId, "2026-10-05", "Main Line", "Lunch"],
  );
});

test("the planned day's items carry their own ingredients; others are null", async () => {
  fakeSchoolCafe();
  const run = await fetchWeek(dmusd, week, fresh);
  const monday = new Set(on("2026-10-05").map((r) => String(r.id)));
  for (const i of run.items.filter((x) => monday.has(x.sourceId)))
    assert.equal(i.ingredients, `Ingredients of ${i.sourceId}`);
  const unasked = run.items.filter((i) => !(i.sourceId in run.ingredients));
  assert.ok(unasked.length && unasked.every((i) => i.ingredients === null));
  assert.equal(run.ingredients[[...monday][0]].fetchedAt, today);
});

test("a known list is never lost to a blank or a missing row; unknown ones become null", () => {
  const cache = {
    "1": { fetchedAt: "x", ingredients: "Raisins" },
    "2": { fetchedAt: "x", ingredients: "Strawberries" },
  };
  const found = new Map<number, string | null>([
    [2, null],
    [3, "Pears"],
  ]);
  const next = mergeIngredients(cache, { ids: [1, 2, 3, 4], found }, today);
  assert.deepEqual(
    [1, 2, 3, 4].map((id) => next[id].ingredients),
    ["Raisins", "Strawberries", "Pears", null],
  );
  assert.equal(next[4].fetchedAt, today);
});

test("a failing daily call is a warning, not a failed district; the next run tries another day", async () => {
  const api = fakeSchoolCafe();
  api.daily = () => new Response("down", { status: 503 });
  const dataDir = mkdtempSync(join(tmpdir(), "ingredients-"));
  const lines: string[] = [];
  const opts = {
    dataDir,
    now: new Date(`${today}T10:00:00`),
    log: (l: string) => lines.push(l),
  };
  assert.equal(await runAll([dmusd], opts), 0);
  assert.match(lines.join("\n"), /WARNING: SchoolCafe daily 2026-10-05: /);
  await runAll([dmusd], opts);
  assert.deepEqual(askedDays(api.calls), ["2026-10-05", "2026-10-06"]);
});

test("an empty reply doesn't pin the plan to one day", async () => {
  const api = fakeSchoolCafe();
  api.daily = () => ({});
  const first = await fetchWeek(dmusd, week, fresh);
  await fetchWeek(dmusd, week, { ...fresh, ...first });
  assert.deepEqual(askedDays(api.calls), ["2026-10-05", "2026-10-06"]);
});

test("the runner keeps ingredients in recipes.json between runs", async () => {
  const api = fakeSchoolCafe();
  const dataDir = mkdtempSync(join(tmpdir(), "ingredients-"));
  const opts = { dataDir, now: new Date(`${today}T10:00:00`), log: () => {} };
  await runAll([dmusd], opts);
  const path = join(dataDir, dmusd.id, "recipes.json");
  const saved = JSON.parse(readFileSync(path, "utf8"));
  const id = String(on("2026-10-05")[0].id);
  assert.equal(saved.ingredients[id].ingredients, `Ingredients of ${id}`);
  await runAll([dmusd], opts);
  assert.deepEqual(askedDays(api.calls), ["2026-10-05", "2026-10-06"]);
});

// Dashboard: SchoolCafé's "Fruit of the Day" covers 17 items at Del Mar; only
// the ingredients say which fruit. A name shared by several items gets them.
const named = (
  sourceId: string,
  item: string,
  ingredients?: string | null,
) => ({
  ...{ sourceId, item, ingredients },
});
const labelled = [
  named("175617", "Fruit of the Day", "Cranberries, Dried, Packets"),
  named("202674", "Fruit of the Day", "Strawberries, raw, whole"),
  named("202674", "Fruit of the Day"), // an older day file, stored without
  named("1", "Fruit of the Day", null),
  named("146817", "Fat Free Chocolate Milk", "Milk, chocolate, Hollandia"),
];

test("labels: a shared name gets its item's ingredients from any day; a unique one doesn't", () => {
  const name = labeler({ series: [{ days: [{ items: labelled }] }] });
  assert.deepEqual(labelled.map(name), [
    "Fruit of the Day (Cranberries, Dried, Packets)",
    "Fruit of the Day (Strawberries, raw, whole)",
    "Fruit of the Day (Strawberries, raw, whole)",
    "Fruit of the Day",
    "Fat Free Chocolate Milk",
  ]);
});

test("page rows use the labels, so each fruit is its own row", () => {
  const day = { date: "2026-10-05", items: labelled };
  const series = [{ menu: "Lunch", meal: "lunch", grades: "K-5", days: [day] }];
  const summary = {
    districts: [{ id: "0610740", name: "Del Mar Union", series }],
  };
  const names = pageRows(summary as never).map((r) => r.item);
  assert.equal(names[0], "Fruit of the Day (Cranberries, Dried, Packets)");
});
