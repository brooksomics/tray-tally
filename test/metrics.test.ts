import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test, mock } from "node:test";
import { itemMetrics } from "../src/metrics.ts";
import { normalize } from "../src/platforms/etrition-normalize.ts";
import { runAll } from "../src/runner.ts";
import { summarize, writeSummary } from "../src/summary.ts";
import type { DayFile, Item } from "../src/types.ts";
import {
  district,
  fakeEtrition,
  fixture,
  knownCalendar,
} from "./fake-etrition.ts";

const items = normalize(district, fixture.calendar.records, fixture.recipes);
const days: DayFile[] = [...Map.groupBy(items, (i) => i.date)].map(
  ([date, day]) => ({
    schemaVersion: 1,
    district: district.id,
    date,
    firstSeen: date,
    lastSeen: date,
    items: day,
  }),
);
const find = (date: string, name: string) =>
  items.find(
    (i) =>
      i.date === date && i.item === name && i.menu === "Elementary Breakfast",
  ) as Item;
const cake = find("2026-10-05", "Cake,Crumb");
const summary = summarize([{ district, days, changes: 2 }], "2026-10-08");
const series = (menu: string) =>
  summary.districts[0].series.find((s) => s.menu === menu);

afterEach(() => mock.restoreAll());

test("crumb cake: 19 g = 76% of the AHA's 25 g, 27% of its kcal, over 10 g", () => {
  assert.equal(cake.category, "ENTREE BREAKFAST");
  const m = itemMetrics(cake);
  assert.deepEqual(m, {
    addedSugarShareKcal: 0.269,
    ahaShare: 0.76,
    overMealLimit: true,
  });
  assert.equal(Math.round((m.addedSugarShareKcal ?? 0) * 100), 27);
});

test("missing values stay null, never 0", () => {
  const milk = find("2026-10-05", "Fat Free Chocolate Milk");
  assert.deepEqual(itemMetrics(milk), {
    addedSugarShareKcal: null,
    ahaShare: null,
    overMealLimit: null,
  });
  const noKcal = itemMetrics({ ...cake, kcal: null });
  assert.deepEqual([noKcal.addedSugarShareKcal, noKcal.ahaShare], [null, 0.76]);
});

test("day flags: sugary entrée and chocolate milk", () => {
  const monday = series("Elementary Breakfast")?.days.find(
    (d) => d.date === "2026-10-05",
  );
  assert.deepEqual([monday?.sugaryEntree, monday?.chocolateMilk], [true, true]);
  const lunch = series("Elementary Lunch")?.days[0];
  assert.equal(
    lunch?.sugaryEntree,
    null,
    "lunch entrées have no nutrition in the fixture",
  );
});

// The fixture lacks fruit nutrition (12 of 43 recipes saved), so both weeks
// are too thin for a verdict; the mean is still published, as an estimate.
test("fixture weeks: thin data gives an estimate but no verdict", () => {
  const [breakfast] = series("Elementary Breakfast")?.weeks ?? [];
  const { items, coverage, meanAddedSugarShareKcal, under10Percent } =
    breakfast;
  assert.deepEqual(
    { items, coverage, meanAddedSugarShareKcal, under10Percent },
    {
      items: 21,
      coverage: 0.476,
      meanAddedSugarShareKcal: 0.147,
      under10Percent: null,
    },
  );
  const [lunch] = series("Elementary Lunch")?.weeks ?? [];
  assert.deepEqual([lunch.items, lunch.under10Percent], [39, null]);
});

// EUSD published a 15 kcal salad at 1,315 mg. A side alone can't
// plausibly carry more sodium than its whole meal may average.
const lunchItem = items.find((i) => i.meal === "lunch") as Item;
const v = (base: Item, item: string, over: Partial<Item>): Item => ({
  ...{ ...base, item, date: "2026-10-05", flags: [] },
  ...over,
});
const salty: DayFile = {
  ...days[0],
  date: "2026-10-05",
  items: [
    v(cake, "side 541", {
      ...{ category: "FRUIT", sodiumMg: 541 },
      flags: ["missing_added_sugar"],
    }),
    v(cake, "side 540", { category: "FRUIT", sodiumMg: 540 }),
    v(cake, "entree 999", { sodiumMg: 999 }),
    v(cake, "no category 999", { category: null, sodiumMg: 999 }),
    v(lunchItem, "salad 1111", { category: "VEGETABLES", sodiumMg: 1111 }),
    v(lunchItem, "salad 1110", { category: "VEGETABLES", sodiumMg: 1110 }),
  ],
};

test("a side over its meal's K-5 sodium limit is flagged suspect_sodium", () => {
  const s = summarize([{ district, days: [salty], changes: 0 }], "2026-10-08");
  const got = s.districts[0].series.flatMap((x) =>
    x.days.flatMap((d) => d.items.map((i) => [i.item, i.flags])),
  );
  assert.deepEqual(got, [
    ["side 541", ["missing_added_sugar", "suspect_sodium"]],
    ["side 540", []],
    ["entree 999", []],
    ["no category 999", []],
    ["salad 1111", ["suspect_sodium"]],
    ["salad 1110", []],
  ]);
});

// An entrée published at 0 g added sugar with 8 g or more total
// sugars likely left its added sugar unrecorded (EUSD Cinnamon Swirl Bread:
// 22 g sugars, 0 g added). Fruit, milk and juice carry sugars without any.
const sweet: DayFile = {
  ...salty,
  items: [
    v(cake, "bread 8", { sugarG: 8, addedSugarG: 0 }),
    v(cake, "bread 7.9", { sugarG: 7.9, addedSugarG: 0 }),
    v(cake, "bread 0.5 added", { sugarG: 20, addedSugarG: 0.5 }),
    v(cake, "bread unpublished", { sugarG: 20, addedSugarG: null }),
    v(cake, "fruit", { category: "FRUIT", sugarG: 20, addedSugarG: 0 }),
    v(cake, "no category", { category: null, sugarG: 20, addedSugarG: 0 }),
  ],
};

test("an entrée at 0 g added sugar with 8 g+ sugars is flagged suspect_added_sugar", () => {
  const s = summarize([{ district, days: [sweet], changes: 0 }], "2026-10-08");
  const got = s.districts[0].series.flatMap((x) =>
    x.days.flatMap((d) => d.items.map((i) => [i.item, i.flags])),
  );
  assert.deepEqual(got, [
    ["bread 8", ["suspect_added_sugar"]],
    ["bread 7.9", []],
    ["bread 0.5 added", []],
    ["bread unpublished", []],
    ["fruit", []],
    ["no category", []],
  ]);
  assert.match(s.caveats.join(" "), /'suspect_added_sugar'/);
});

test("summary names the district, lens, sources and caveats", () => {
  const d = summary.districts[0];
  assert.deepEqual(
    [d.id, d.name, d.state, d.reformulations],
    ["0612880", "Escondido Union", "CA", 2],
  );
  assert.deepEqual(summary.lenses, ["federal", "california"]);
  assert.match(
    summary.caveats.join(" "),
    /heuristic, not a compliance finding/,
  );
  assert.equal(summary.references.ahaDailyAddedSugarG.value, 25);
  assert.deepEqual(series("Elementary Breakfast")?.primary, true);
  assert.equal(d.wealth?.frpmPercent.value, 72.6);
  assert.equal(d.wealth?.medianHouseholdIncome?.value, 87874);
});

test("writeSummary summarizes what the runner stored", async () => {
  const api = fakeEtrition();
  api.calendar = knownCalendar;
  const dataDir = mkdtempSync(join(tmpdir(), "summary-"));
  const now = new Date("2026-10-08T10:00:00");
  await runAll([district], { dataDir, now, log: () => {} });
  writeSummary([district], dataDir, "2026-10-08");
  const path = join(dataDir, "summary.json");
  const built: ReturnType<typeof summarize> = JSON.parse(
    readFileSync(path, "utf8"),
  );
  const breakfast = built.districts[0].series.find(
    (s) => s.menu === "Elementary Breakfast",
  );
  assert.deepEqual(
    breakfast?.days.map((d) => d.date),
    ["2026-10-05", "2026-10-06", "2026-10-07"],
  );
});
