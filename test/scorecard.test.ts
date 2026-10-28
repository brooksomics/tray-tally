import assert from "node:assert/strict";
import { test } from "node:test";
import { filterRows, rows } from "../dashboard/data.js";
import {
  byDistrict,
  checkN,
  districtCount,
  overall,
  verdicts,
} from "../dashboard/scorecard.js";
import { names } from "../dashboard/scorecard-view.js";

// The page's top summary. One verdict per check + district +
// meal + week; per district, the share of judged weeks met; overall, the mean
// of district shares, so a district with more weeks doesn't count more.
const REFS = {
  fiberPer1000KcalG: { value: 14 },
  usdaBreakfastSodiumPer1000KcalMg: { value: 1543 },
  usdaBreakfast2027SodiumPer1000KcalMg: { value: 1386 },
  usdaLunchSodiumPer1000KcalMg: { value: 2018 },
  usdaLunch2027SodiumPer1000KcalMg: { value: 1700 },
  proteinRangeShare: { value: 0.1, max: 0.3 },
};
const MENU = { breakfast: "Elementary Breakfast", lunch: "Elementary Lunch" };
const item = (over: object) => ({
  ...{ item: "Thing", sourceId: "1", entree: true, flags: [] },
  ...{ kcal: 200, fiberG: null, sodiumMg: null, addedSugarShareKcal: null },
  proteinG: null,
  ...over,
});
const week = (monday: string, under10Percent: boolean | null) => ({
  ...{ week: monday, under10Percent, meanAddedSugarShareKcal: 0.1 },
  ...{ basis: "estimate", items: 1, coverage: 1 },
});
const series = (
  meal: "breakfast" | "lunch",
  weeks: object[],
  days: object[],
) => ({
  ...{ menu: MENU[meal], meal, grades: "K-5", primary: true },
  ...{ weeks, days },
});
const day = (date: string, items: object[]) => ({ date, items });

// A: breakfast weeks met, missed, and too thin for a sugar verdict; one lunch.
// Fiber 4 g / 200 kcal = 20 (met), 2 g / 200 = 10 (missed); sodium 300 mg /
// 200 kcal = 1,500 per 1,000 kcal: within 1,543 (now), over 1,386 (2027).
// Protein 10 g / 200 kcal = 20% (in range), 2 g = 4% (under); lunch 40% (over).
const a = {
  ...{ id: "A", name: "District A" },
  series: [
    series(
      "breakfast",
      [
        week("2026-10-05", true),
        week("2026-10-12", false),
        week("2026-10-19", null),
      ],
      [
        day("2026-10-05", [item({ fiberG: 4, sodiumMg: 300, proteinG: 10 })]),
        day("2026-10-13", [item({ fiberG: 2, sodiumMg: 300, proteinG: 2 })]),
        // exactly 14; exactly 1,386; exactly 30%
        day("2026-10-20", [
          item({ fiberG: 2.8, sodiumMg: 277.2, proteinG: 15 }),
        ]),
      ],
    ),
    series(
      "lunch",
      [week("2026-10-05", true)],
      [day("2026-10-06", [item({ proteinG: 20 })])],
    ),
  ],
};
const b = {
  ...{ id: "B", name: "District B" },
  series: [
    series(
      "breakfast",
      [week("2026-10-05", true)],
      [day("2026-10-05", [item({})])],
    ),
  ],
};
const summary = { references: REFS, districts: [a, b] } as never;
const all = rows(summary);
const filter = (over = {}) => ({
  ...{ districts: new Set(["A", "B"]), meals: new Set(["breakfast", "lunch"]) },
  ...{ from: "", to: "", ...over },
});
const run = (f = filter()) => verdicts(summary, f, filterRows(all, f));
type Keyed = { check: string; district: string; meal: string };
// District A's breakfast unless `at` says otherwise.
const pick = <T extends Keyed>(
  vs: T[],
  check: string,
  at: Partial<Keyed> = {},
) => {
  const { district = "District A", meal = "breakfast" } = at;
  return vs.filter(
    (v) => v.check === check && v.district === district && v.meal === meal,
  );
};
const weekly = (
  vs: (Keyed & { week: string; met: boolean | null })[],
  check: string,
) =>
  pick(vs, check)
    .map((v) => `${v.week.slice(5)}:${v.met}`)
    .join(" ");

test("a verdict per check, district, meal and week; too little data is null", () => {
  const vs = run();
  assert.equal(weekly(vs, "sugar"), "10-05:true 10-12:false 10-19:null");
  assert.equal(weekly(vs, "fiber"), "10-05:true 10-12:false 10-19:true");
  assert.equal(weekly(vs, "sodium"), "10-05:true 10-12:true 10-19:true");
  assert.equal(weekly(vs, "sodium2027"), "10-05:false 10-12:false 10-19:true");
  assert.equal(weekly(vs, "protein"), "10-05:true 10-12:false 10-19:true");
  const over = pick(vs, "protein", { meal: "lunch" });
  assert.deepEqual(
    over.map((v) => v.met),
    [false],
  );
  // No fiber or sodium published that week: no verdict, not a miss.
  const lunch = pick(vs, "fiber", { meal: "lunch" });
  assert.deepEqual(
    lunch.map((v) => v.met),
    [null],
  );
});

test("verdicts follow the filters", () => {
  const vs = run(
    filter({ meals: new Set(["breakfast"]), districts: new Set(["A"]) }),
  );
  assert.ok(
    vs.length > 0 &&
      vs.every((v) => v.meal === "breakfast" && v.district === "District A"),
  );
  const late = run(filter({ from: "2026-10-12" }));
  assert.deepEqual(
    pick(late, "sugar").map((v) => v.week),
    ["2026-10-12", "2026-10-19"],
  );
});

test("per district: the share of judged weeks that met the line", () => {
  const rowsOf = byDistrict(run());
  const sugarA = pick(rowsOf, "sugar")[0];
  assert.deepEqual([sugarA.met, sugarA.judged, sugarA.share], [1, 2, 0.5]);
  const fiberLunch = pick(rowsOf, "fiber", { meal: "lunch" })[0];
  assert.deepEqual([fiberLunch.judged, fiberLunch.share], [0, null]);
});

test("overall: each district counts once, not each week", () => {
  const sugar = overall(byDistrict(run())).find(
    (o) => o.check === "sugar" && o.meal === "breakfast",
  );
  // A met 1 of 2 judged weeks, B 1 of 1: (0.5 + 1) / 2, not 2 of 3.
  assert.deepEqual([sugar?.share, sugar?.districts], [0.75, 2]);
  // A district with no judged week isn't a 0% district: it's left out.
  const fiberLunch = overall(byDistrict(run())).filter(
    (o) => o.check === "fiber" && o.meal === "lunch",
  );
  assert.deepEqual(fiberLunch, []);
});

test("a line an older summary.json lacks is left out, not failed", () => {
  const old = { references: {}, districts: [a] } as never;
  const f = filter();
  const checks = new Set(
    verdicts(old, f, filterRows(rows(old), f)).map((v) => v.check),
  );
  assert.deepEqual([...checks], ["sugar"]);
});

// The overall heading's n, and a line's own n when it's
// averaged over fewer districts (e.g. a district that publishes no fiber).
test("n: selected districts with at least one judged week", () => {
  assert.equal(districtCount(byDistrict(run())), 2);
  const rowsOf = [
    { check: "sugar", meal: "breakfast", district: "A", share: 1 },
    { check: "fiber", meal: "breakfast", district: "A", share: null },
    { check: "fiber", meal: "breakfast", district: "C", share: null },
  ];
  assert.equal(districtCount(rowsOf as never), 1, "C was never judged");
});

test("a line's own n shows only when it differs from the heading's", () => {
  const all = overall(byDistrict(run()));
  // Only A publishes fiber and sodium; only A serves lunch.
  assert.equal(checkN(all, "fiber", 2), " (n = 1)");
  assert.equal(checkN(all, "sodium", 2), " (n = 1)");
  assert.equal(checkN(all, "sugar", 2), " (n = 2 breakfast, 1 lunch)");
  assert.equal(checkN(all, "sugar", 1), " (n = 2 breakfast, 1 lunch)");
  const even = [
    { check: "sugar", meal: "breakfast", districts: 2, share: 1 },
    { check: "sugar", meal: "lunch", districts: 2, share: 1 },
  ];
  assert.equal(checkN(even, "sugar", 2), "");
  assert.equal(checkN([], "fiber", 2), " (n = 0)");
});

// A skimmer reads "Added sugar … 100%" as all sugar; each name says the bar
// counts weeks, so 100% reads as every week meeting the line.
test("every check's name says it counts weeks", () => {
  const label = names(REFS);
  for (const [check, text] of Object.entries(label))
    assert.match(text, /^Weeks with /, check);
  assert.equal(
    label.fiber,
    "Weeks with entrée fiber at least 14 g per 1,000 kcal",
  );
  assert.equal(
    label.protein,
    "Weeks with protein between 10% and 30% of calories",
  );
});
