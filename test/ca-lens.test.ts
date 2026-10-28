import assert from "node:assert/strict";
import { test } from "node:test";
import { normalize } from "../src/platforms/etrition-normalize.ts";
import { ab1264NutrientCriterion } from "../src/rules/ca.ts";
import { summarize } from "../src/summary.ts";
import type { Item } from "../src/types.ts";
import { district, fixture } from "./fake-etrition.ts";

const items = normalize(district, fixture.calendar.records, fixture.recipes);
const cake = items.find((i) => i.item === "Cake,Crumb") as Item;
const food = (over: Partial<Item>): Item => ({
  ...cake,
  kcal: 300,
  saturatedFatG: 0,
  sodiumMg: 0,
  addedSugarG: 0,
  ...over,
});

test("crumb cake meets the AB 1264 nutrient criterion (27% kcal added sugar)", () => {
  assert.equal(cake.saturatedFatG, 1.2);
  assert.equal(ab1264NutrientCriterion(cake), true);
});

test("each trigger alone, at exactly the statute's 'equal to or greater'", () => {
  // 1.2*9/108 and 3.3*4/132 are 0.0999... in floating point; the law says >= 10%.
  assert.equal(
    ab1264NutrientCriterion(food({ kcal: 108, saturatedFatG: 1.2 })),
    true,
  );
  assert.equal(
    ab1264NutrientCriterion(food({ kcal: 132, addedSugarG: 3.3 })),
    true,
  );
  assert.equal(ab1264NutrientCriterion(food({ sodiumMg: 300 })), true); // 1 mg : 1 kcal
  assert.equal(
    ab1264NutrientCriterion(food({ kcal: 108, saturatedFatG: 1.19 })),
    false,
  );
  assert.equal(
    ab1264NutrientCriterion(food({ addedSugarG: 7.4, sodiumMg: 299 })),
    false,
  );
});

test("impossible or meaningless energy gives null", () => {
  assert.equal(
    ab1264NutrientCriterion(food({ kcal: 100, addedSugarG: 50 })),
    null,
  );
  assert.equal(ab1264NutrientCriterion(food({ kcal: -5 })), null);
});

test("unknown inputs give null unless another trigger already fires", () => {
  assert.equal(ab1264NutrientCriterion(food({ saturatedFatG: null })), null);
  assert.equal(
    ab1264NutrientCriterion(food({ saturatedFatG: null, sodiumMg: 400 })),
    true,
  );
  assert.equal(ab1264NutrientCriterion(food({ kcal: null })), null);
  assert.equal(ab1264NutrientCriterion(food({ kcal: 0 })), null);
});

const day = {
  ...{ schemaVersion: 1 as const, district: district.id, date: "2026-10-05" },
  ...{ firstSeen: "x", lastSeen: "x", items },
};
const summary = summarize(
  [{ district, days: [day], changes: 0 }],
  "2026-10-08",
);
const MUST_SAY = [
  /nonnutritive sweetener/i,
  /Class 1 milk/,
  /2028-06-01/,
  /2029-07-01/,
  /2035-07-01/,
  /neither true nor false decides/i,
];

test("summary.json: California lens per item, with source", () => {
  assert.deepEqual(
    [summary.schemaVersion, summary.lenses],
    [3, ["federal", "california"]],
  );
  const items = summary.districts[0].series[0].days[0].items;
  const out = items.find((i) => i.item === "Cake,Crumb");
  assert.equal(out?.ab1264NutrientCriterion, true);
  assert.match(summary.references.caAb1264NutrientCriterion.source, /104661/);
});

// The path-to-zero chart draws these; read in the chaptered text 2026-10-09.
test("AB 1264 dates are published with their sections", () => {
  const ref = summary.references.caAb1264NutrientCriterion;
  assert.deepEqual(ref.dates, {
    defineBy: "2028-06-01",
    phaseOutBy: "2029-07-01",
    vendorsStop: "2032-07-01",
    mealsExclude: "2035-07-01",
  });
  for (const s of ["104662(b)(1)", "104664(a)", "104664(b)", "49531(b)(4)"])
    assert.ok(ref.source.includes(s), s);
});

test("the caveat says what the criterion does not decide", () => {
  const caveats = summary.caveats.join(" ");
  for (const must of MUST_SAY) assert.match(caveats, must);
});
