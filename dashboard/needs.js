// The top chart: what a K-5 breakfast and lunch tray gives of
// fiber, protein, calcium and iron, as a share of a day's need. Pure, so
// tests import it too.
/** @typedef {import("./data.js").Row} Row */

import { isMilk } from "./series.js";

// [label, row field, summary.json reference for the day's need]
export const NUTRIENTS = [
  ["Fiber", "fiberG", "fiberDailyNeedG"],
  ["Protein", "proteinG", "proteinDailyNeedG"],
  ["Calcium", "calciumMg", "calciumDailyNeedMg"],
  ["Iron", "ironMg", "ironDailyNeedMg"],
];
// A need's value is for ages 4-8; ages9to13 for 9-13.
export const AGES = [
  ["ages 4–8", "value"],
  ["ages 9–13", "ages9to13"],
];
const KCAL = {
  breakfast: "usdaK5BreakfastMinKcal",
  lunch: "usdaK5LunchMinKcal",
};
const MIN_COVERAGE = 0.5; // as weekStats: with under half known, no estimate
const sum = (/** @type {number[]} */ xs) => xs.reduce((a, b) => a + b, 0);
const mean = (/** @type {number[]} */ xs) => sum(xs) / xs.length;

/**
 * One meal's tray of `key` at `kcal`: a carton of milk (the mean of the
 * milks offered; every meal must offer milk) plus the menu's other items,
 * pooled, over the calories left. Null with under half the items known.
 * @param {Row[]} rs one district + meal @param {string} key @param {number} kcal
 */
export function tray(rs, key, kcal) {
  const ok = rs.filter((r) => typeof r[key] === "number" && r.kcal > 0);
  if (!rs.length || ok.length < rs.length * MIN_COVERAGE) return null;
  const [milk, food] = [ok.filter(isMilk), ok.filter((r) => !isMilk(r))];
  const carton = milk.length
    ? [mean(milk.map((r) => r[key])), mean(milk.map((r) => r.kcal))]
    : [0, 0];
  const density = food.length
    ? sum(food.map((r) => r[key])) / sum(food.map((r) => r.kcal))
    : 0;
  return carton[0] + density * Math.max(0, kcal - carton[1]);
}

/** A district's trays over the meals; null if any meal has no estimate. */
function total(rs, key, kcal) {
  const trays = Object.entries(kcal).map(([meal, k]) =>
    tray(
      rs.filter((r) => r.meal === meal),
      key,
      k,
    ),
  );
  return trays.every((t) => t !== null) ? sum(trays) : null;
}

/**
 * Per nutrient and age: the mean over districts of their breakfast + lunch
 * (the meals given) as a share of the day's need, each district once.
 * `districts`: how many had an estimate. A need summary.json lacks: no row.
 * @param {Row[]} rs @param {Record<string, any>} refs @param {string[]} meals
 */
export function needShares(rs, refs, meals) {
  if (meals.some((m) => refs[KCAL[m]] === undefined)) return [];
  const kcal = Object.fromEntries(meals.map((m) => [m, refs[KCAL[m]].value]));
  const districts = [...Map.groupBy(rs, (r) => r.district).values()];
  return NUTRIENTS.filter(([, , need]) => refs[need]).flatMap(
    ([nutrient, key, need]) => {
      const totals = districts.map((g) => total(g, key, kcal));
      const known = totals.filter((t) => t !== null);
      return AGES.map(([age, field]) => ({
        ...{ nutrient, age, districts: known.length },
        share: known.length
          ? mean(known.map((t) => t / refs[need][field]))
          : null,
      }));
    },
  );
}
