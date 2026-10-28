import assert from "node:assert/strict";
import { test } from "node:test";
import { needShares, tray } from "../dashboard/needs.js";
import { summarize } from "../src/summary.ts";

// food-ebu: the top chart. What a K-5 breakfast and lunch tray gives of
// fiber, protein, calcium and iron, as a share of a day's need.
test("a day's need: fiber AI, protein, calcium and iron RDAs, ages 4-8 and 9-13", () => {
  const refs = summarize([], "x").references;
  const { fiberDailyNeedG: fiber, proteinDailyNeedG: protein } = refs;
  const { calciumDailyNeedMg: calcium, ironDailyNeedMg: iron } = refs;
  const pairs = [fiber, protein, calcium, iron].map((r) => [
    ...[r.value, r.ages9to13],
  ]);
  assert.deepEqual(pairs.flat(), [25, 31, 19, 34, 1000, 1300, 10, 8]);
  assert.match(fiber.note, /girls 9-13: 26 g/);
  assert.match(calcium.source, /Adequate Intakes, Elements/);
  const { usdaK5BreakfastMinKcal: b, usdaK5LunchMinKcal: l } = refs;
  assert.deepEqual([b.value, l.value], [350, 550]);
});

const row = (item: string, calciumMg: number | null, kcal: number) => ({
  ...{ district: "A", meal: "lunch", item, calciumMg, kcal },
});
const LUNCH = [
  row("Milk, White 1%", 300, 100),
  row("Milk, Chocolate FF", 250, 140),
  row("Cheese Pizza", 100, 300),
  row("Apple", 20, 100),
  row("Mystery Side", null, 200), // unpublished: left out
];
const near = (x: number | null) => (x === null ? x : Math.round(x * 1e6) / 1e6);

// Every meal must offer milk, so a tray holds a carton: the mean of the milks
// offered. The rest of the calories carry the menu's other items, pooled.
test("a tray: one carton of milk plus the rest of the menu's density", () => {
  // 275 mg in 120 kcal of milk, then 120 mg / 400 kcal over the other 430.
  assert.equal(near(tray(LUNCH as never, "calciumMg", 550)), 404);
  const food = LUNCH.slice(2, 4); // no milk listed: all density
  assert.equal(near(tray(food as never, "calciumMg", 550)), 165);
  const thin = LUNCH.map((r, i) => (i < 3 ? { ...r, calciumMg: null } : r));
  assert.equal(tray(thin as never, "calciumMg", 550), null, "1 of 5 known");
});

// Milk 300 mg / 100 kcal, food 0.5 mg/kcal: breakfast 300 + 125, lunch
// 300 + 225, so 950 mg a day at school (C: 600, its food has none).
const menu = (district: string, meal: string, food: number | null) => [
  { district, meal, item: "Milk, 1%", calciumMg: 300, kcal: 100 },
  { district, meal, item: "Bean Burrito", calciumMg: food, kcal: 200 },
  {
    district,
    meal,
    item: "Pear",
    calciumMg: food === null ? null : 0,
    kcal: 0,
  },
];
const REFS = {
  calciumDailyNeedMg: { value: 1000, ages9to13: 1300 },
  usdaK5BreakfastMinKcal: { value: 350 },
  usdaK5LunchMinKcal: { value: 550 },
};
const rs = [
  ...menu("A", "breakfast", 100),
  ...menu("A", "lunch", 100),
  ...menu("B", "breakfast", 100),
  ...menu("B", "lunch", null), // too little known: B is left out
  ...menu("C", "breakfast", 0),
  ...menu("C", "lunch", 0),
];

test("needs: each district's breakfast + lunch over the need, averaged", () => {
  const got = needShares(rs as never, REFS, ["breakfast", "lunch"]);
  assert.deepEqual(
    got.map((g) => [g.nutrient, g.age, near(g.share), g.districts]),
    [
      ["Calcium", "ages 4–8", 0.775, 2], // (0.95 + 0.6) / 2
      ["Calcium", "ages 9–13", near(1550 / 2600), 2],
    ],
  );
  const lunch = needShares(rs as never, REFS, ["lunch"]);
  assert.deepEqual([near(lunch[0].share), lunch[0].districts], [0.4125, 2]);
  assert.deepEqual(needShares(rs as never, {}, ["lunch"]), [], "no lines");
});
