import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bestItems,
  bestNote,
  bestTable,
  meetsEveryLine,
} from "../dashboard/best.js";
import { rows } from "../dashboard/data.js";
import { normalize } from "../src/platforms/etrition-normalize.ts";
import { REFERENCES } from "../src/rules/federal.ts";
import { INTERNATIONAL_REFERENCES } from "../src/rules/international.ts";
import { summarize } from "../src/summary.ts";
import { district, fixture } from "./fake-etrition.ts";

// The page's own lines: sugar 10% and 5% of kcal, 10 g a meal; fiber 14
// and 12.5 g per 1,000 kcal; AB 1264's high-amounts test (computed upstream).
const refs = { ...REFERENCES, ...INTERNATIONAL_REFERENCES };
const items = normalize(district, fixture.calendar.records, fixture.recipes);
const days = [...Map.groupBy(items, (i) => i.date)].map(([date, day]) => ({
  ...{ schemaVersion: 1 as const, district: district.id, date },
  ...{ firstSeen: date, lastSeen: date, items: day },
}));
const [base] = rows(summarize([{ district, days, changes: 0 }], "2026-10-08"));
type Row = typeof base;
const apple: Row = {
  ...base,
  ...{ item: "Apple", date: "2026-10-05", entree: false, flags: [] },
  ...{ kcal: 100, addedSugarG: 0, fiberG: 4, sodiumMg: 2, saturatedFatG: 0 },
  ab1264NutrientCriterion: false,
};
const with_ = (over: Partial<Row>): Row => ({ ...apple, ...over });

test("meets every line: an apple does; each line can rule an item out", () => {
  assert.equal(meetsEveryLine(apple, refs), true);
  const out: [string, Partial<Row>][] = [
    ["5% of kcal from added sugar is not under 5%", { addedSugarG: 1.25 }],
    ["over 10 g of added sugar", { kcal: 1000, addedSugarG: 10.5, fiberG: 14 }],
    ["fiber under 14 g per 1,000 kcal", { fiberG: 1.39 }],
    ["high under AB 1264", { ab1264NutrientCriterion: true }],
    ["AB 1264 unknown (missing data)", { ab1264NutrientCriterion: null }],
    ["no fiber value", { fiberG: null }],
    ["flagged suspect", { flags: ["suspect"] }],
    ["5% after float error", { kcal: 12, addedSugarG: 0.15, fiberG: 0.2 }],
    ["flagged suspect_sodium", { flags: ["suspect_sodium"] }],
    ["flagged suspect_added_sugar", { flags: ["suspect_added_sugar"] }],
  ];
  for (const [why, over] of out)
    assert.equal(meetsEveryLine(with_(over), refs), false, why);
});

test("meets every line: the edges that pass, and lines an older summary lacks", () => {
  const edges = [
    { fiberG: 1.4 }, // exactly 14 g per 1,000 kcal
    { kcal: 1000, addedSugarG: 10, fiberG: 14 }, // exactly 10 g, 4% of kcal
    { addedSugarG: 1.2 }, // 4.8% of kcal
    { kcal: 145, fiberG: 2.03 }, // 14 g per 1,000 kcal, 13.999… in floats
  ];
  for (const over of edges)
    assert.equal(meetsEveryLine(with_(over), refs), true);
  // 8% of kcal: over the 5% line, but an older summary.json has no 5% line.
  const eight = with_({ addedSugarG: 2 });
  assert.equal(meetsEveryLine(eight, refs), false);
  const { freeSugarsFivePercentShare, ...older } = refs;
  assert.equal(meetsEveryLine(eight, older), true);
  assert.equal(freeSugarsFivePercentShare.value, 0.05);
  // No fiber lines either: still no verdict without a fiber value.
  const { fiberPer1000KcalG: _, whoFiberPer1000KcalG: __, ...noFiber } = refs;
  assert.equal(meetsEveryLine(with_({ fiberG: null }), noFiber), false);
});

test("best items: one row per district + item, most days first, then by name", () => {
  const rs = [
    with_({ item: "Pear", date: "2026-10-05", kcal: 96.4, fiberG: 5.5 }),
    with_({ item: "Apple", date: "2026-10-05" }),
    with_({ item: "Apple", date: "2026-10-06" }),
    with_({ item: "Apple", date: "2026-10-06" }), // same day, other menu
    with_({ item: "Banana", date: "2026-10-07" }),
    with_({ item: "Cookie", ab1264NutrientCriterion: true }),
  ];
  const got = bestItems(rs, refs).map((o) => Object.values(o).join(" "));
  assert.deepEqual(got, [
    "Escondido Union Apple 40 100 2",
    "Escondido Union Banana 40 100 1",
    "Escondido Union Pear 57.1 96 1", // 1000 × 5.5 / 96.4 = 57.05
  ]);
});

test("best table: the most-served n rows, phone-width columns", () => {
  const list = bestItems([with_({}), with_({ item: "Pear" })], refs);
  const { head, rows } = bestTable(list, 1);
  assert.deepEqual(head, [
    "District",
    "Item",
    "Fiber per 1,000 kcal (g)",
    "kcal",
    "Days",
  ]);
  assert.deepEqual(rows, [["Escondido Union", "Apple", 40, 100, 1]]);
});

const entree = (item: string, over: Partial<Row> = {}) =>
  with_({ item, entree: true, fiberG: 1, ...over }); // 10 g per 1,000 kcal
const noteRows = [
  with_({}),
  entree("Burrito"),
  entree("Burrito", { date: "2026-10-06" }),
  entree("Pizza", { saturatedFatG: null, ab1264NutrientCriterion: null }),
  // High in sodium, but added sugar unknown: not full data, not counted.
  entree("Hot dog", { addedSugarG: null, ab1264NutrientCriterion: true }),
  entree("Water", { kcal: 0, ab1264NutrientCriterion: null }), // no kcal: same
];

test("best note: how many items pass, and how many entrées with full data do", () => {
  const one = "1 item meets every line.";
  const none = "None of the 1 entrée with full data in these filters does.";
  assert.equal(bestNote(noteRows, refs, 15), `${one} ${none}`);
  const more = [
    ...noteRows,
    entree("Bean bowl", { fiberG: 2 }),
    with_({ item: "Pear" }),
  ];
  const three = "3 items meet every line; the 1 served most often is below.";
  const some = "1 of the 2 entrées with full data in these filters does.";
  assert.equal(bestNote(more, refs, 1), `${three} ${some}`);
  const empty = "No item in these filters meets every line.";
  assert.equal(bestNote([], refs, 15), empty);
});
