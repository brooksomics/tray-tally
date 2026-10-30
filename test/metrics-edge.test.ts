import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  chocolateMilk,
  entreeTest,
  itemMetrics,
  sugaryEntree,
} from "../src/metrics.ts";
import { buildSummary, summarize } from "../src/summary.ts";
import type { DayFile, Item } from "../src/types.ts";
import { district } from "./fake-etrition.ts";

const base: Item = {
  date: "2026-10-05",
  district: district.id,
  menu: "Elementary Breakfast",
  meal: "breakfast",
  item: "Thing",
  category: "ENTREE BREAKFAST",
  sourceId: "1",
  servingSize: "Each",
  kcal: 100,
  sugarG: null,
  addedSugarG: null,
  saturatedFatG: null,
  fiberG: null,
  proteinG: null,
  sodiumMg: null,
  flags: [],
};
const item = (over: Partial<Item>): Item => ({ ...base, ...over });
const week = (items: Item[]) => {
  const day: DayFile = {
    schemaVersion: 1,
    district: district.id,
    date: "2026-10-05",
    firstSeen: "2026-10-05",
    lastSeen: "2026-10-05",
    items,
  };
  const s = summarize([{ district, days: [day], changes: 0 }], "2026-10-08");
  return s.districts[0].series[0].weeks[0];
};

test("the <10% verdict uses the unrounded mean (0.0996 is under)", () => {
  const w = week([item({ addedSugarG: 2.49 }), item({ addedSugarG: 2.49 })]);
  assert.deepEqual(
    [w.meanAddedSugarShareKcal, w.under10Percent, w.basis],
    [0.1, true, "estimate"],
  );
});

test("a week with under half its items known gets no verdict", () => {
  const w = week([item({ addedSugarG: 1 }), item({}), item({})]);
  assert.deepEqual([w.coverage, w.under10Percent], [0.333, null]);
});

test("chocolate milk under other names, not chocolate-chip food", () => {
  const cases: [string, string | null, boolean][] = [
    ["Milk, 1% Fat Chocolate Carton", "DAIRY", true],
    ["Choc Milk", "DAIRY", true],
    ["Chocolate 1% Milk", "DAIRY", true],
    ["Fat Free Chocolate Milk", null, true],
    ["Milk Chocolate Chip Muffin", "ENTREE BREAKFAST", false],
    ["Milk Chocolate Chip Muffin", null, false],
  ];
  for (const [name, category, want] of cases) {
    assert.equal(chocolateMilk([item({ item: name, category })]), want, name);
  }
});

test("sugary entrée: true over 10 g, false only when all known, else null", () => {
  const entree = (g: number | null) =>
    item({ category: "BREAKFAST ENTREE", addedSugarG: g });
  assert.equal(sugaryEntree([entree(19)]), true);
  assert.equal(sugaryEntree([entree(5)]), false);
  assert.equal(sugaryEntree([entree(5), entree(null)]), null);
  assert.equal(
    sugaryEntree([item({ category: "DAIRY", addedSugarG: 0 })]),
    null,
    "no entrée found",
  );
  const old = { ...entree(5) } as Partial<Item>;
  delete old.category; // day file written before `category` existed
  assert.equal(sugaryEntree([old as Item]), null);
});

test("entrées: ENTREE anywhere in the category, plus the district's own list", () => {
  const isEntree = entreeTest(["Heat and Serve", "Poultry"]);
  const pizza = item({ category: "Heat and Serve ", addedSugarG: 12 });
  assert.equal(isEntree(pizza), true, "SDUSD's trailing space");
  assert.equal(isEntree(item({ category: "Lunch Entree'" })), true);
  assert.equal(isEntree(item({ category: "Grains" })), false);
  assert.equal(sugaryEntree([pizza], isEntree), true);
  assert.equal(sugaryEntree([pizza]), null, "default list: no entrée found");
});

test("summary items say whether they're an entrée (null: no category)", () => {
  const sd = { ...district, entreeCategories: ["Poultry"] };
  const cats = ["Poultry", "ENTREE LUNCH", "Grains", null];
  const day: DayFile = {
    ...{ schemaVersion: 1, district: district.id, date: "2026-10-05" },
    ...{ firstSeen: "x", lastSeen: "x" },
    // Only the district-listed entrée is over 10 g.
    items: cats.map((category, n) =>
      item({ category, addedSugarG: n ? 5 : 12 }),
    ),
  };
  const s = summarize([{ district: sd, days: [day], changes: 0 }], "x");
  const [out] = s.districts[0].series[0].days;
  assert.deepEqual(
    out.items.map((i) => i.entree),
    [true, true, false, null],
  );
  assert.equal(out.sugaryEntree, true, "the district's list decides the day");
});

// EUSD publishes no added sugar for its chocolate milk, and 0 g
// for a pan dulce that SDUSD and Del Mar publish at 7 g (same nutrition facts).
const milk = { sourceId: "4831", item: "Fat Free Chocolate Milk" };
const bread = { sourceId: "4706", item: "Pan Dulce Assorted" };
const basis = "Del Mar's published value, same nutrition facts";
const eusd = {
  ...district,
  addedSugarEstimates: [
    { ...milk, addedSugarG: 7, basis },
    { ...bread, addedSugarG: 7, published: 0, basis },
  ],
};
const milkDay: DayFile = {
  ...{ schemaVersion: 1, district: district.id, date: "2026-10-05" },
  ...{ firstSeen: "x", lastSeen: "x" },
  items: [
    item({ ...milk, flags: ["missing_added_sugar"] }),
    item({ ...milk, addedSugarG: 9 }), // published: wins
    item({ ...milk, item: "1% White Milk" }), // same id, other name
    // The published 0 it replaces; once replaced, not flagged as unrecorded.
    item({ ...bread, addedSugarG: 0, sugarG: 8 }),
    item({ ...bread, addedSugarG: 5 }), // a new published value wins
  ],
};

test("an estimate replaces only a missing or named wrong value, flagged; a new published value wins", () => {
  const day = milkDay;
  const s = summarize([{ district: eusd, days: [day], changes: 0 }], "x");
  const [series] = s.districts[0].series;
  assert.deepEqual(
    series.days[0].items.map((i) => [i.addedSugarG, i.flags]),
    [
      [7, ["estimated_added_sugar"]],
      [9, []],
      [null, []],
      [7, ["estimated_added_sugar"]],
      [5, []],
    ],
  );
  assert.equal(series.weeks[0].coverage, 0.8, "estimates count");
  assert.ok(
    !JSON.stringify(s).includes(basis),
    "the basis stays in districts.json",
  );
});

test("an estimate confirming a published 0 g keeps it and clears the suspect flag", () => {
  const bake = { sourceId: "5112", item: "Cheesy Taco Bake" };
  const confirmed = { ...bake, addedSugarG: 0, published: 0, basis };
  const d = { ...district, addedSugarEstimates: [confirmed] };
  const items = [item({ ...bake, addedSugarG: 0, sugarG: 9 })];
  const days = [{ ...milkDay, items }];
  const s = summarize([{ district: d, days, changes: 0 }], "x");
  const [i] = s.districts[0].series[0].days[0].items;
  assert.deepEqual([i.addedSugarG, i.flags], [0, ["estimated_added_sugar"]]);
});

test("impossible or uncomputable shares are null", () => {
  assert.equal(
    itemMetrics(item({ addedSugarG: 12, kcal: 12 })).addedSugarShareKcal,
    null,
  );
  assert.equal(
    itemMetrics(item({ addedSugarG: 0, kcal: 0 })).addedSugarShareKcal,
    null,
  );
});

const change = (field: string, date = "2026-11-09") => ({
  ...{ date, recipeID: 1, recipeServingID: 1 },
  ...{ field, from: 1, to: 2 },
});

test("reformulations: one per recipe refresh that changed nutrition", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "reform-"));
  mkdirSync(join(dataDir, district.id));
  const changes = [
    change("addedSugar"),
    change("calories"), // same refresh: still one reformulation
    change("recipeCategoryDescription"),
    change("servingSize", "2026-12-09"),
    change("saturatedFat", "2027-01-08"),
  ];
  const path = join(dataDir, district.id, "changes.json");
  writeFileSync(path, JSON.stringify({ changes }));
  const { districts } = buildSummary([district], dataDir, "2026-12-10");
  assert.equal(districts[0].reformulations, 2);
});

test("published summary carries no platform params (site, school)", () => {
  const sdusdLike = {
    ...district,
    params: { ...district.params, schoolId: 20 },
  };
  const text = JSON.stringify(
    summarize([{ district: sdusdLike, days: [], changes: 0 }], "2026-10-08"),
  );
  assert.ok(!/"(params|site|schoolId|schoolTypeId)"/.test(text));
  assert.match(
    JSON.stringify(summarize([], "x").references.ahaDailyAddedSugarG),
    /unverified/i,
  );
});

// The fiber chart's dashed line comes from here, published with its source.
test("fiber line: 14 g per 1,000 kcal, the density behind the fiber Daily Value", () => {
  const refs = summarize([], "x").references;
  const ref = refs.fiberPer1000KcalG;
  assert.equal(ref.value, 14);
  assert.match(ref.source, /81 FR 33742/);
  assert.match(ref.source, /101\.9\(c\)\(9\)/);
  assert.match(ref.note, /2,000/);
  // TK and up is universal, so every child here is 4+: no ages 1-3 detail.
  assert.match(ref.note, /4 and up/);
  assert.doesNotMatch(ref.note, /1-3|1–3/);
  assert.ok(!("fiberTenPercentDailyValueG" in refs), "the 2.8 g line is gone");
});

// Peer-nation lines, published with their sources.
test("WHO fibre density and the 5% free-sugar line are published, sourced", () => {
  const refs = summarize([], "x").references;
  assert.equal(refs.whoFiberPer1000KcalG.value, 12.5);
  assert.match(refs.whoFiberPer1000KcalG.source, /0\.0125 g of fibre/);
  assert.match(refs.whoFiberPer1000KcalG.source, /Annex 8/);
  const five = refs.freeSugarsFivePercentShare;
  assert.equal(five.value, 0.05);
  assert.match(five.source, /below 5% of total energy intake/);
  assert.match(five.source, /SACN/);
  assert.match(
    five.note,
    /juice/,
    "free sugars count juice; we only see added",
  );
});

// Sodium lines, mg per 1,000 kcal. US: the K-5 weekly limit
// over the fewest calories a K-5 meal may average (lunch 550, breakfast 350).
test("US sodium lines: K-5 limits now and from 2027-07-01, per 1,000 kcal", () => {
  const refs = summarize([], "x").references;
  const lunch = [
    refs.usdaLunchSodiumPer1000KcalMg,
    refs.usdaLunch2027SodiumPer1000KcalMg,
  ];
  const breakfast = [
    refs.usdaBreakfastSodiumPer1000KcalMg,
    refs.usdaBreakfast2027SodiumPer1000KcalMg,
  ];
  assert.deepEqual(
    [...lunch, ...breakfast].map((r) => r.value),
    [2018, 1700, 1543, 1386], // 1110, 935, 540, 485 mg
  );
  for (const r of lunch) assert.match(r.source, /210\.10\(f\)\(4\)/);
  for (const r of breakfast) assert.match(r.source, /220\.8\(f\)\(4\)/);
  assert.match(lunch[1].source, /July 1, 2027/);
});

// Japan: MEXT's per-lunch salt limit at its own calories, salt / 2.54 = sodium.
test("Japan sodium lines: MEXT 2021 per-lunch salt, ages 6-7, 8-9, 10-11", () => {
  const refs = summarize([], "x").references;
  const japan = [
    refs.japanLunchSodium6to7Per1000KcalMg,
    refs.japanLunchSodium8to9Per1000KcalMg,
    refs.japanLunchSodium10to11Per1000KcalMg,
  ];
  // 1.5 g / 530 kcal, 2 g / 650 kcal, 2 g / 780 kcal of salt equivalent
  assert.deepEqual(
    japan.map((r) => r.value),
    [1114, 1211, 1009],
  );
  for (const r of japan) {
    assert.match(r.source, /告示第10号/);
    assert.match(r.source, /2\.54/);
  }
});

test("exactly 10% is not under 10%, despite floating point", () => {
  const w = week([item({ kcal: 132, addedSugarG: 3.3 })]); // 0.0999... in floats
  assert.equal(w.under10Percent, false);
  assert.equal(
    itemMetrics(item({ kcal: -5, addedSugarG: 1 })).addedSugarShareKcal,
    null,
  );
});

test("chocolate milk filed under 'Beverages ' (SDUSD) still counts", () => {
  const sdusd = item({
    item: "Milk, 1% Fat Chocolate Carton",
    category: "Beverages ",
  });
  assert.equal(chocolateMilk([sdusd]), true);
  assert.equal(
    chocolateMilk([item({ item: "Chocolate Chip Pancakes", category: null })]),
    false,
  );
});
