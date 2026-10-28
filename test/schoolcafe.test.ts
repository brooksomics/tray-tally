import assert from "node:assert/strict";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, mock, test } from "node:test";
import { fetchWeek, parseDetail } from "../src/platforms/schoolcafe.ts";
import { flattenWeek } from "../src/platforms/schoolcafe-parse.ts";
import { runAll } from "../src/runner.ts";
import { cerealBar, dmusd, fakeSchoolCafe } from "./fake-schoolcafe.ts";
import { read } from "./fake-etrition.ts";

const week: [string, string] = ["2026-10-05", "2026-10-09"];
const fresh = { cache: {}, today: "2026-10-08" };
const isDetail = (c: { url: URL }) =>
  c.url.pathname.endsWith("/GetFullNutritionInfo");
const isWeekly = (c: { url: URL }) =>
  c.url.pathname.endsWith("/GetWeeklyMenuitems");

afterEach(() => mock.restoreAll());

test("detail values parse with their units; '<1g' and blanks are null", () => {
  const r = parseDetail(cerealBar);
  assert.ok(r);
  const got = [
    r.addedSugar,
    r.addedSugarUOM,
    r.sodium,
    r.sodiumUOM,
    r.saturatedFat,
    r.dietaryFiber,
  ];
  assert.deepEqual(got, [8.33, "g", 288.33, "mg", 6.17, 3]);
  const vague = parseDetail({
    NutritionalValues: [{ ComponentName: "Added Sugars", DailyValue: "<1g" }],
  });
  assert.ok(vague);
  assert.deepEqual([vague.addedSugar, vague.protein], [null, null]);
});

test("weekly breakfast + lunch become items; details fill nutrition", async () => {
  fakeSchoolCafe();
  const { items } = await fetchWeek(dmusd, week, fresh);
  assert.equal(items.length, 97);
  const bar = items.find(
    (i) => i.date === "2026-10-05" && i.item === "Cereal Bar with Cheese Stick",
  );
  assert.ok(bar);
  assert.deepEqual(
    [bar.menu, bar.kcal, bar.addedSugarG, bar.flags],
    ["Elementary Breakfast", 270, 8.33, []],
  );
  // Not detailed yet: menu calories shown, added sugar flagged unknown, nothing dropped.
  const pending = items.filter((i) => i.flags.includes("missing_added_sugar"));
  assert.ok(pending.length > 0 && pending.every((i) => i.kcal !== null));
});

// districts.json: Del Mar looks up at most 25 items per run (Bubba, 2026-10-09).
test("2 weekly calls, then at most 25 detail calls with TrayId=0", async () => {
  const api = fakeSchoolCafe();
  api.detail = () => cerealBar;
  const run = await fetchWeek(dmusd, week, fresh);
  const weeklyCalls = api.calls.filter(isWeekly);
  assert.deepEqual(
    weeklyCalls.map((c) => c.url.searchParams.get("MealType")),
    ["Breakfast", "Lunch"],
  );
  const details = api.calls.filter(isDetail);
  assert.equal(details.length, 25);
  assert.ok(details.every((c) => c.url.searchParams.get("TrayId") === "0"));
  assert.ok(
    api.calls.every(
      (c) =>
        new Headers(c.init.headers).get("user-agent") === "school-meal-tracker",
    ),
  );
  assert.deepEqual([run.asked, run.got], [25, 25]);
});

// Austin ISD serves each meal on its own line, not one "Main Line" (probed 2026-10-20).
test("Austin ISD asks each meal's own serving line, ingredients too", async () => {
  const api = fakeSchoolCafe();
  const aisd = read("districts.json").districts.find(
    (d: { id: string }) => d.id === "4808940",
  );
  const params = { ...aisd.params, maxDetails: 0, pauseMs: 0 };
  const run = await fetchWeek({ ...aisd, params }, week, fresh);
  const lines = api.calls
    .filter((c) => !isDetail(c))
    .map((c) =>
      ["MealType", "ServingLine"].map((k) => c.url.searchParams.get(k)),
    );
  assert.deepEqual(lines.slice(0, 2), [
    ["Breakfast", "Breakfast"],
    ["Lunch", "Lunch"],
  ]);
  assert.equal(lines.length, 3); // + the daily ingredients call
  assert.ok(lines.every(([meal, line]) => meal === line));
  assert.deepEqual(run.rejected, []);
});

test("once every item is cached, a run costs only the 2 weekly calls", async () => {
  const api = fakeSchoolCafe();
  api.detail = () => cerealBar;
  const all = { ...dmusd, params: { ...dmusd.params, maxDetails: 100 } };
  api.daily = () => ({}); // one daily call a run until ingredients are known
  const first = await fetchWeek(all, week, fresh);
  const ingredients = Object.fromEntries(
    first.items.map((i) => [i.sourceId, { fetchedAt: "x", ingredients: null }]),
  );
  api.calls = [];
  await fetchWeek(all, week, { ...first, ingredients, today: "2026-10-09" });
  assert.equal(api.calls.length, 2);
});

test("the runner handles a SchoolCafé district like any other", async () => {
  fakeSchoolCafe();
  const dataDir = mkdtempSync(join(tmpdir(), "schoolcafe-"));
  const now = new Date("2026-10-08T10:00:00");
  assert.equal(await runAll([dmusd], { dataDir, now, log: () => {} }), 0);
  const files = readdirSync(join(dataDir, dmusd.id)).filter((f) =>
    /^\d{4}/.test(f),
  );
  assert.deepEqual(files.sort(), [
    "2026-10-05.json",
    "2026-10-06.json",
    "2026-10-07.json",
    "2026-10-08.json",
    "2026-10-09.json",
  ]);
});

test("format drift in the weekly reply fails loudly, naming only checked fields", () => {
  const bad = {
    "10/5/2026": { ENTREE: [{ MenuItemId: "x", Secret: "school name" }] },
  };
  assert.throws(
    () => flattenWeek(bad, 1),
    (e: Error) =>
      /unexpected menu item/.test(e.message) && !/school name/.test(e.message),
  );
  assert.throws(() => flattenWeek(null, 1), /unexpected reply/);
});
