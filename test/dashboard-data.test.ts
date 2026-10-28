import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  dataUrl,
  filterRows,
  offenderTable,
  offenders,
  rows,
  sugarTip,
  weeks,
  withGaps,
} from "../dashboard/data.js";
import { pathCaption, upfPath } from "../dashboard/path.js";
import {
  addedSugarShare,
  entreeFiberDensity,
  menuSodiumDensity,
  upfShare,
} from "../dashboard/series.js";
import { footerText, label } from "../dashboard/ui.js";
import { daySugarOpts, mealSymbols, mondayTicks } from "../dashboard/lines.js";
import { normalize } from "../src/platforms/etrition-normalize.ts";
import { summarize } from "../src/summary.ts";
import { district, fixture } from "./fake-etrition.ts";

const items = normalize(district, fixture.calendar.records, fixture.recipes);
const days = [...Map.groupBy(items, (i) => i.date)].map(([date, day]) => ({
  ...{ schemaVersion: 1 as const, district: district.id, date },
  ...{ firstSeen: date, lastSeen: date, items: day },
}));
const summary = summarize([{ district, days, changes: 0 }], "2026-10-08");
const all = rows(summary);
const only = (over = {}) => ({
  districts: new Set([district.id]),
  meals: new Set(["breakfast"]),
  from: "",
  to: "",
  ...over,
});

test("rows: one per item per day, carrying district, menu, meal and date", () => {
  assert.equal(all.length, items.length);
  const cake = all.find((r) => r.item === "Cake,Crumb");
  assert.ok(cake);
  const { districtName, menu, meal, grades, date, addedSugarG } = cake;
  assert.deepEqual(
    { districtName, menu, meal, grades, date, addedSugarG },
    {
      districtName: "Escondido Union",
      menu: "Elementary Breakfast",
      meal: "breakfast",
      grades: "K-5",
      date: "2026-10-05",
      addedSugarG: 19,
    },
  );
});

test("filters: district, meal and an inclusive date range", () => {
  const breakfast = filterRows(all, only());
  assert.ok(breakfast.every((r) => r.menu === "Elementary Breakfast"));
  const monday = filterRows(
    all,
    only({ from: "2026-10-05", to: "2026-10-05" }),
  );
  assert.ok(monday.length > 0 && monday.every((r) => r.date === "2026-10-05"));
  assert.equal(filterRows(all, only({ districts: new Set() })).length, 0);
});

test("worst offenders: highest added sugar first, with days and suspect flag", () => {
  const [first, second] = offenders(filterRows(all, only()), 5);
  assert.deepEqual(
    [first.item, first.addedSugarG, first.suspect],
    ["Vanilla & Chocolate Chip Breakfast Breads", 33.1, true],
  );
  assert.deepEqual([second.item, second.days], ["Cake,Crumb", 1]);
});

// Phones show ~340 px: "suspect" rides with the item, not in a far-right column.
test("offenders table: suspect next to the item, no separate note column", () => {
  const { head, rows: cells } = offenderTable(
    offenders(filterRows(all, only())),
  );
  assert.ok(!head.includes("Note"), head.join());
  assert.equal(
    cells[0][1],
    "Vanilla & Chocolate Chip Breakfast Breads (suspect)",
  );
  assert.equal(cells[1][1], "Cake,Crumb");
  assert.equal(cells[0].length, head.length);
});

test("ultra-processed share leaves milk out (Class 1 milk is outside AB 1264)", () => {
  const [week] = upfShare(filterRows(all, only()));
  assert.ok(week.n > 0 && week.mean !== null && week.mean > 0);
  const milkOnly = filterRows(all, only()).filter((r) => /milk/i.test(r.item));
  assert.deepEqual(upfShare(milkOnly), []);
});

test("weekly entree fiber and the summary's own 2027 weeks", () => {
  const [fiber] = entreeFiberDensity(filterRows(all, only()));
  assert.equal(fiber.week, "2026-10-05");
  assert.ok(fiber.mean !== null && fiber.mean > 0);
  const [w] = weeks(summary, only());
  assert.deepEqual(
    [w.menu, w.week, w.under10Percent],
    ["Elementary Breakfast", "2026-10-05", null],
  );
});

const row = (over: object) => ({ ...all[0], ...over });

// Size-neutral: each entrée's fiber per 1,000 kcal, averaged per week.
test("fiber density: entrées the summary marks, each one's g per 1,000 kcal", () => {
  const rs = [
    row({ entree: true, category: "Poultry", fiberG: 4, kcal: 200 }), // 20
    row({ entree: true, category: "Poultry", fiberG: 3, kcal: 300 }), // 10
    row({ entree: true, category: "Poultry", fiberG: 5, kcal: null }), // skipped
    row({ entree: true, category: "Poultry", fiberG: 5, kcal: 0 }), // skipped
    row({ entree: false, category: "ENTREE LUNCH", fiberG: 9, kcal: 100 }),
  ];
  assert.equal(entreeFiberDensity(rs)[0].mean, 15);
});

// The menu as one tray: total sodium over total kcal of every item offered,
// so a 0 mg fruit dilutes a salty entrée the way it would in a meal.
test("menu sodium density: sum of sodium over sum of kcal, all items, per week", () => {
  const rs = [
    row({ entree: true, sodiumMg: 900, kcal: 300 }),
    row({ entree: false, sodiumMg: 0, kcal: 100 }), // fruit: counts
    row({ entree: false, sodiumMg: 150, kcal: 0 }), // no kcal: skipped
    row({ entree: false, sodiumMg: null, kcal: 200 }), // no sodium: skipped
    row({ date: "2026-10-12", sodiumMg: 100, kcal: 100 }),
  ];
  const got = menuSodiumDensity(rs).map((w) => [w.week, w.mean]);
  // 1000 * 900 / 400; a mean of item densities would give 1,500, entrées 3,000.
  assert.deepEqual(got, [
    ["2026-10-05", 2250],
    ["2026-10-12", 1000],
  ]);
});

test("menu sodium density leaves out items flagged suspect_sodium", () => {
  const rs = [
    row({ sodiumMg: 900, kcal: 300, flags: [] }),
    row({ sodiumMg: 1315, kcal: 15, flags: ["suspect_sodium"] }),
    row({ sodiumMg: 100, kcal: 100, flags: ["suspect"] }), // over a kcal max: kept
  ];
  assert.equal(menuSodiumDensity(rs)[0].mean, 2500); // 1000 * 1000 / 400
});

// Shape by meal, so breakfast and lunch tell apart at a glance: every point
// carries its meal; lunch circles, breakfast triangles; a legend only when
// both show.
test("meal symbols: each point carries its meal; lunch circles, breakfast triangles", () => {
  const rs = [row({ meal: "lunch", menu: "L" }), row({ meal: "breakfast" })];
  const meals = menuSodiumDensity(rs).map((p) => p.meal);
  assert.deepEqual(meals.sort(), ["breakfast", "lunch"]);
  assert.equal(weeks(summary, only())[0].meal, "breakfast");
  const s = mealSymbols(rs);
  assert.deepEqual(
    [s.domain, s.range, s.legend],
    [["lunch", "breakfast"], ["circle", "triangle"], true],
  );
  assert.equal(mealSymbols([rs[0]]).legend, false);
});

// Plot's default date ticks fall on Sundays, so a week's dot on
// its Monday read as the day before. Tick the Mondays shown, thinned to fit.
test("Monday ticks: the weeks shown, thinned to fit, always the last", () => {
  const weeks = ["2026-08-17", "2026-08-24", "2026-08-31", "2026-09-07"];
  const shuffled = [weeks[3], weeks[0], weeks[2], weeks[1], weeks[0]];
  assert.deepEqual(mondayTicks(shuffled, 1000), weeks);
  // 4 weeks × 70 px > 200 px: every other week, counted back from the last.
  assert.deepEqual(mondayTicks(shuffled, 200), [weeks[1], weeks[3]]);
  assert.deepEqual(mondayTicks([], 320), []);
});

// The same series per school day, each point keeping its week.
const [mon, tue] = ["2026-10-05", "2026-10-06"];
const twoDays = [
  { date: mon, sodiumMg: 900, kcal: 300, fiberG: 3 },
  { date: tue, sodiumMg: 100, kcal: 100, fiberG: 2 },
].map((over) => ({
  ...row({ item: "Burrito", entree: true, flags: [], ...over }),
  addedSugarShareKcal: 0.1,
}));

test("per day: a point per district + menu + school day, with its week", () => {
  const all = [
    upfShare,
    entreeFiberDensity,
    menuSodiumDensity,
    addedSugarShare,
  ];
  for (const f of all) {
    const days = f(twoDays, "day").map((p) => `${p.date} ${p.week}`);
    assert.deepEqual(days, [`${mon} ${mon}`, `${tue} ${mon}`], f.name);
    const weeks = f(twoDays).map((p) => [p.date, p.week]);
    assert.deepEqual(weeks, [[undefined, mon]], `${f.name}: weekly by default`);
  }
  const sodium = menuSodiumDensity(twoDays, "day").map((p) => p.mean);
  assert.deepEqual(sodium, [3000, 1000]);
});

test("added sugar per day: mean share over items that have one; counts known", () => {
  const rs = [0.2, 0.1, null].map((v) => row({ addedSugarShareKcal: v }));
  const [d] = addedSugarShare(rs, "day");
  assert.deepEqual(
    [d.n, d.known, Math.round(Number(d.mean) * 1000)],
    [3, 2, 150],
  );
});

// Same bar as the weekly verdict (src/metrics.ts MIN_COVERAGE = 0.5).
test("daily added sugar: hollow when under half the day's items have a value", () => {
  const { y, hollow, rules } = daySugarOpts({});
  const days = [
    { n: 4, known: 2, mean: 0.1 },
    { n: 5, known: 2, mean: 0.1 },
    { n: 1, known: 0, mean: null },
  ];
  assert.deepEqual([y, days.map(hollow)], ["mean", [false, true, true]]);
  assert.equal(rules.length, 2, "the weekly chart's US and WHO lines");
});

test("milk is left out by name, whatever the category (SDUSD files it as 'Beverages ')", () => {
  const milk = ["Milk, White 1%, Carton", "Milk, 1% Fat Chocolate Carton"];
  const kept = [
    "Milkshake",
    "Milk Chocolate Chip Muffin",
    "Buttermilk Pancakes",
  ];
  const rs = [
    ...milk.map((item) =>
      row({ item, category: "Beverages ", ab1264NutrientCriterion: true }),
    ),
    ...kept.map((item) =>
      row({ item, category: null, ab1264NutrientCriterion: false }),
    ),
  ];
  const [w] = upfShare(rs);
  assert.deepEqual([w.n, w.mean], [3, 0]);
});

test("weekly lines break on weeks without data", () => {
  const rs = [
    row({ date: "2026-08-17", fiberG: 2, kcal: 1000 }), // 2 g per 1,000 kcal
    row({ date: "2026-09-07", fiberG: 4, kcal: 1000 }),
  ];
  const weeksSeen = withGaps(entreeFiberDensity(rs), "mean").map((w) => [
    w.week,
    w.mean,
  ]);
  assert.deepEqual(weeksSeen, [
    ["2026-08-17", 2],
    ["2026-08-24", null],
    ["2026-08-31", null],
    ["2026-09-07", 4],
  ]);
});

test("offenders: kcal comes from the same row as the sugar; values rounded", () => {
  const rs = [
    row({ item: "Mac", addedSugarG: 3.04, kcal: 226 }),
    row({ item: "Mac", addedSugarG: 5.06, kcal: 313.3 }),
  ];
  const [mac] = offenders(rs);
  assert.deepEqual([mac.addedSugarG, mac.kcal], [5.1, 313]);
});

// SchoolCafé's "Fruit of the Day" is one label over many fruits (Del Mar:
// dried cranberries one day, a banana the next).
test("offenders: days count only the item shown, not others sharing its name", () => {
  const fruit = (sourceId: string, date: string, addedSugarG: number) =>
    row({ item: "Fruit of the Day", sourceId, date, addedSugarG });
  const rs = [
    fruit("175617", "2026-10-05", 22),
    fruit("175617", "2026-10-06", 22),
    fruit("170172", "2026-10-07", 0),
    fruit("201567", "2026-10-09", 0),
  ];
  const [cranberries] = offenders(rs);
  assert.deepEqual([cranberries.addedSugarG, cranberries.days], [22, 2]);
});

// A value the district didn't publish says so, as "suspect" does.
test("offenders table: an estimated value is marked next to the item", () => {
  const milk = { item: "Fat Free Chocolate Milk", addedSugarG: 7 };
  const rs = [row({ ...milk, flags: ["estimated_added_sugar"] })];
  const [cells] = offenderTable(offenders(rs)).rows;
  assert.equal(cells[1], "Fat Free Chocolate Milk (estimated)");
});

test("sugar tip: grams, then the share of a child's day (AHA 25 g)", () => {
  const d = row({ item: "Parfait", addedSugarG: 19, ahaShare: 0.76 });
  const want = `Parfait\n19 g = 76% of a child's daily limit\n${d.menu}`;
  assert.equal(sugarTip(d), want);
});

// Browsers read a backslash as a slash and drop tabs and leading spaces.
const OFFSITE = [
  "https://evil.example/s.json",
  "//evil.example/s.json",
  "\\\\evil.example/s.json",
  "/\\evil.example/s.json",
  " https://evil.example/s.json",
  "ht\ttps://evil.example/s.json",
  "javascript:alert(1)",
  "http://[",
];

test("?data= only accepts same-origin paths", () => {
  const page = "http://localhost:8000/dashboard/";
  assert.equal(dataUrl(null, page), "../data/summary.json");
  assert.equal(
    dataUrl("../data/other.json", page),
    "http://localhost:8000/data/other.json",
  );
  for (const bad of OFFSITE)
    assert.equal(dataUrl(bad, page), "../data/summary.json", bad);
});

test("footer: sources plus only the caveats no section shows", () => {
  const shown = [summary.caveats[0]];
  const text = footerText(summary, shown);
  assert.ok(!text.includes(summary.caveats[0]));
  assert.match(text, /^District context: /);
  for (const c of summary.caveats.slice(1)) assert.ok(text.includes(c), c);
});

// The AB 1264 charts apply California's test to every district, so the
// picker says which districts it doesn't bind.
test("district labels name the state", () => {
  assert.equal(label({ name: "Austin ISD", state: "TX" }), "Austin ISD (TX)");
  const frpmPercent = { value: 10.4, year: "2025-26", source: "CDE" };
  const d = { name: "Del Mar Union", state: "CA", wealth: { frpmPercent } };
  assert.equal(
    label(d),
    "Del Mar Union (CA): 10.4% eligible for free/reduced-price meals",
  );
});

// app.js fills these with replaceChildren(svg | table | p): a <table> host
// would nest a table in a table.
test("every container app.js fills is a div", () => {
  const html = readFileSync(
    new URL("../dashboard/index.html", import.meta.url),
    "utf8",
  );
  const app = readFileSync(
    new URL("../dashboard/app.js", import.meta.url),
    "utf8",
  );
  const list = /const CHARTS = \[([^\]]*)\]/.exec(app)?.[1] ?? "";
  const ids = [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length >= 5, "found the chart ids");
  for (const id of ids) {
    const tag = new RegExp(`<(\\w+)[^>]*\\bid="${id}"`).exec(html)?.[1];
    assert.equal(tag, "div", id);
  }
});

// Path to zero: median of the last N weeks' shares, then a straight line to 0%.
const pw = (week: string, mean: number | null) => ({ week, mean });
const PATH_WEEKS = [
  pw("2026-08-31", 0.9), // outside a 3-week window
  pw("2026-09-07", 0.6),
  pw("2026-09-14", 0.5),
  pw("2026-09-14", null), // no data: ignored
  pw("2026-09-21", 0.7),
  pw("2026-09-21", 0.4),
];

test("upf path: median over the last weeks, straight to 0% by the date", () => {
  const path = upfPath(PATH_WEEKS, "2026-12-21", 3);
  assert.ok(path);
  assert.equal(path.median, 0.55); // of 0.4, 0.5, 0.6, 0.7
  assert.deepEqual([path.from, path.to], ["2026-09-07", "2026-09-21"]);
  assert.equal(path.at("2026-09-21"), 0.55);
  assert.ok(Math.abs(path.at("2026-11-05") - 0.55 / 2) < 0.01, "halfway");
  assert.equal(path.at("2026-12-21"), 0);
  assert.equal(path.at("2027-06-01"), 0, "stays at 0 after");
  assert.equal(upfPath([pw("2026-09-07", null)], "2026-12-21"), null);
});

test("upf path caption: the median now and the share due at the phase-out", () => {
  const path = upfPath(PATH_WEEKS, "2026-12-20", 3); // 90 days after 09-21
  assert.ok(path);
  const dates = { phaseOutBy: "2026-10-09", vendorsStop: "2026-12-20" }; // 1/5 of the way
  assert.match(
    pathCaption(path, dates),
    /last 3 weeks shown: 55%\. .*0% by 2026-12-20 passes 44% on 2026-10-09/,
  );
});
