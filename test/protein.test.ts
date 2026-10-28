import assert from "node:assert/strict";
import { test } from "node:test";
import { proteinOpts } from "../dashboard/lines.js";
import { menuProteinShare } from "../dashboard/series.js";
import { summarize } from "../src/summary.ts";

// Protein lines, as a share of calories: the National Academies' range for
// ages 4-18 (a whole day's eating) and the range Japan sets for its lunches.
test("protein lines: 10-30% for ages 4-18 (AMDR), 13-20% for a Japanese school lunch", () => {
  const refs = summarize([], "x").references;
  const us = refs.proteinRangeShare;
  assert.deepEqual([us.value, us.max], [0.1, 0.3]);
  assert.match(us.source, /Acceptable Macronutrient Distribution Ranges/);
  assert.match(us.source, /Children, 4–18 y/);
  const japan = refs.japanLunchProteinRangeShare;
  assert.deepEqual([japan.value, japan.max], [0.13, 0.2]);
  assert.match(japan.source, /告示第10号/);
  assert.match(japan.source, /13～20%/);
});

const row = (over: object) =>
  ({
    ...{ district: "A", districtName: "District A", menu: "Lunch" },
    ...{ meal: "lunch", date: "2026-10-05", item: "Thing", flags: [] },
    ...{ kcal: 100, proteinG: null },
    ...over,
  }) as never;

// The menu as one tray, as sodium: 4 kcal per gram of protein, summed, over
// the summed kcal of every item offered.
test("menu protein share: protein calories over all calories, per week", () => {
  const rs = [
    row({ proteinG: 20, kcal: 300 }),
    row({ proteinG: 0, kcal: 100 }), // fruit: counts
    row({ proteinG: 5, kcal: 0 }), // no kcal: skipped
    row({ proteinG: null, kcal: 200 }), // no protein: skipped
    row({ date: "2026-10-13", proteinG: 2.5, kcal: 100 }),
  ];
  const got = menuProteinShare(rs).map((w) => [w.week, w.mean]);
  assert.deepEqual(got, [
    ["2026-10-05", 0.2], // 4 * 20 / 400
    ["2026-10-12", 0.1],
  ]);
  assert.equal(menuProteinShare(rs, "day")[1].date, "2026-10-13");
});

test("protein chart: dashed US range, dotted Japan range, in percent", () => {
  const opts = proteinOpts(summarize([], "x").references);
  assert.equal(opts.percent, true);
  assert.deepEqual(
    opts.rules.map((r) => [r.value, r.dash, r.label]),
    [
      [0.1, "4,4", "US, ages 4–18: 10%"],
      [0.3, "4,4", "US, ages 4–18: 30%"],
      [0.13, "1,3", "Japan lunch: 13%"],
      [0.2, "1,3", "Japan lunch: 20%"],
    ],
  );
  // An older summary.json: no values, so the chart draws no lines.
  assert.ok(proteinOpts({}).rules.every((r) => r.value === undefined));
});
