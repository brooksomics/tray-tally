import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { fetchWeek } from "../src/platforms/schoolcafe.ts";
import { flattenWeek, parseDetail } from "../src/platforms/schoolcafe-parse.ts";
import { cerealBar, dmusd, fakeSchoolCafe } from "./fake-schoolcafe.ts";

const week: [string, string] = ["2026-10-05", "2026-10-09"];
const today = "2026-10-08";
const nutrients = parseDetail(cerealBar);
assert.ok(nutrients);
const old = (id: number, over = {}) => ({
  fetchedAt: "2026-09-01",
  record: {
    ...nutrients,
    recipeID: id,
    recipeServingID: id,
    recipeCategoryDescription: "ENTREE",
    servingSize: null,
    calories: 250,
    caloriesUOM: "kcals",
    ...over,
  },
});
const detailCalls = (api: ReturnType<typeof fakeSchoolCafe>) =>
  api.calls
    .filter((c) => c.url.pathname.endsWith("/GetFullNutritionInfo"))
    .map((c) => c.url.searchParams.get("MenuItemId"));

afterEach(() => mock.restoreAll());

test("a stale cached item that's off this week's menu is skipped, not crashed on", async () => {
  const api = fakeSchoolCafe();
  api.detail = () => cerealBar;
  const all = { ...dmusd, params: { ...dmusd.params, maxDetails: 100 } };
  const warm = await fetchWeek(all, week, { cache: {}, today });
  api.calls = [];
  const run = await fetchWeek(dmusd, week, {
    cache: { ...warm.cache, "999": old(999) },
    today,
  });
  assert.deepEqual(detailCalls(api), []);
  assert.ok(run.items.length > 0);
  assert.deepEqual(run.rejected, []);
});

// Calories come from the weekly reply, so "no calories yet" isn't "no detail yet".
test("an item the weekly reply lists without calories isn't re-asked every run", async () => {
  const api = fakeSchoolCafe();
  const all = { ...dmusd, params: { ...dmusd.params, maxDetails: 100 } };
  const warm = await fetchWeek(all, week, { cache: {}, today });
  const noKcal = Object.entries(warm.cache).map(([id, c]) => [
    id,
    { ...c, record: { ...c.record, calories: null } },
  ]);
  api.calls = [];
  await fetchWeek(dmusd, week, { cache: Object.fromEntries(noKcal), today });
  assert.deepEqual(detailCalls(api), []);
});

test("stale on-menu items are refreshed however many stale off-menu ones pile up", async () => {
  const api = fakeSchoolCafe();
  const all = { ...dmusd, params: { ...dmusd.params, maxDetails: 100 } };
  const warm = await fetchWeek(all, week, { cache: {}, today });
  const [onMenu] = Object.keys(warm.cache);
  const offMenu = Array.from({ length: 151 }, (_, n) => [
    String(900000 + n),
    { ...old(900000 + n), fetchedAt: "2026-08-01" },
  ]);
  const cache = {
    ...warm.cache,
    [onMenu]: { ...warm.cache[onMenu], fetchedAt: "2026-09-01" },
    ...Object.fromEntries(offMenu),
  };
  api.calls = [];
  await fetchWeek(dmusd, week, { cache, today });
  assert.deepEqual(detailCalls(api), [onMenu]);
});

test("calories, sat fat and sodium come from this week's menu, even before a detail", async () => {
  const api = fakeSchoolCafe();
  api.detail = () => ({ NutritionalValues: [] });
  const cache = { "243529": old(243529, { calories: 250, sodium: 1 }) };
  const { items } = await fetchWeek(
    { ...dmusd, params: { ...dmusd.params, maxDetails: 0 } },
    week,
    { cache, today },
  );
  const bar = items.find((i) => i.sourceId === "243529");
  assert.deepEqual(
    [bar?.kcal, bar?.sodiumMg, bar?.addedSugarG],
    [270, 288.33, 8.33],
  );
  const pending = items.find((i) => i.item === "Chicken Corn Dogs");
  assert.deepEqual(
    [pending?.kcal, pending?.flags],
    [240, ["missing_added_sugar"]],
  );
});

test("a failing detail call is reported and the rest still run", async () => {
  const api = fakeSchoolCafe();
  let n = 0;
  api.detail = () =>
    n++ === 0 ? new Response("down", { status: 500 }) : cerealBar;
  const run = await fetchWeek(dmusd, week, { cache: {}, today });
  const max = Number(dmusd.params.maxDetails); // the registry's per-run limit
  assert.equal(detailCalls(api).length, max);
  assert.equal(run.got, max - 1);
  assert.match(run.rejected[0], /SchoolCafe 500/);
});

test("an empty detail is cached as 'published nothing'; an odd reply is an error", async () => {
  const api = fakeSchoolCafe();
  api.detail = () => ({ NutritionalValues: [] });
  const max = Number(dmusd.params.maxDetails); // the registry's per-run limit
  const first = await fetchWeek(dmusd, week, { cache: {}, today });
  assert.equal(Object.keys(first.cache).length, max);
  api.detail = () => ({ Message: "error" });
  const odd = await fetchWeek(dmusd, week, { cache: {}, today });
  assert.deepEqual(
    [Object.keys(odd.cache).length, odd.rejected.length],
    [0, max],
  );
});

test("detail values: thousands separators, leading dots, numbers, null entries", () => {
  const values = [
    { ComponentName: "Sodium", DailyValue: "1,200mg" },
    { ComponentName: "Added Sugars", DailyValue: ".5g" },
    { ComponentName: "Protein", DailyValue: 7 },
    null,
  ];
  const r = parseDetail({ NutritionalValues: values });
  assert.ok(r);
  assert.deepEqual([r.sodium, r.addedSugar, r.protein], [1200, 0.5, null]);
});

// Seen 2026-10-09 for days older than about a week: one placeholder per
// category, MenuItemId 0. Not food: no item, and no nutrition lookup for it.
const placeholder = {
  MenuItemId: 0,
  MenuItemDescription: "A menu has not been published for this day.",
  Calories: 0,
};
const milk = { MenuItemId: 146817, MenuItemDescription: "Milk", Calories: 110 };

test("'menu not published' placeholder rows (MenuItemId 0) are skipped", () => {
  const rows = flattenWeek(
    {
      "9/28/2026": { CONDIMENT: [placeholder, placeholder] },
      "10/1/2026": { MILK: [milk], CONDIMENT: [placeholder] },
    },
    1,
  );
  assert.deepEqual(
    rows.map((r) => [r.date, r.id]),
    [["2026-10-01", 146817]],
  );
});

test("weekly replies of the wrong shape fail with a clear message", () => {
  assert.throws(() => flattenWeek({ Message: "x" }, 1), /unexpected/);
  assert.throws(() => flattenWeek({ "2026-10-05": { ENTREE: [] } }, 1), /date/);
});
