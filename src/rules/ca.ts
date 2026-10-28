import type { Item } from "../types.ts";

// AB 1264 (Stats. 2025, ch. 467), read 2026-10-08 in the chaptered text.
// Health & Safety Code §104661(a)(1): a UPF has a listed additive AND either
// "high amounts" (a)(3)(A) or a nonnutritive sweetener (a)(3)(B); (b) excludes
// e.g. Class 1 milk, USDA commodity foods, raw and minimally processed foods.
// We can only compute (a)(3)(A): >= 10% of energy from saturated fat or from
// added sugars, or sodium (mg) : kcal >= 1:1.
// ponytail: 9 and 4 kcal/g (Atwater); the statute doesn't name conversion factors.
export const AB1264_REFERENCE = {
  note: "'High amounts' test in California's ultraprocessed-food definition: >=10% of calories from saturated fat or from added sugars, or >=1 mg sodium per calorie. Only one of the definition's conditions; see caveats.",
  source:
    "AB 1264 (Stats. 2025, ch. 467): Health & Safety Code §104661(a)(3)(A), exclusions §104661(b), dates §104662(b)(1), §104664(a), §104664(b); Ed. Code §49531(b)(4)",
  // Read in the chaptered text 2026-10-09; the dashboard's path-to-zero chart draws them.
  dates: {
    defineBy: "2028-06-01", // §104662(b)(1): the state defines "ultraprocessed foods of concern"
    phaseOutBy: "2029-07-01", // §104664(a): schools begin to phase them out
    vendorsStop: "2032-07-01", // §104664(b): vendors may not offer them to schools
    mealsExclude: "2035-07-01", // Ed. Code §49531(b)(4): school breakfasts and lunches exclude them
  },
} as const;

const EPS = 1e-9; // inputs carry <= 3 decimals; absorbs float error at exactly the line
const atLeast = (x: number | null, line: number) =>
  x === null ? null : x >= line - EPS;

/** true if any test fires; false only when all three inputs are known; else null. */
export function ab1264NutrientCriterion(i: Item): boolean | null {
  const kcal = i.kcal ?? 0;
  if (kcal <= 0) return null;
  const fat = i.saturatedFatG ?? null; // `??`: older files lack the field entirely
  const sugar = i.addedSugarG ?? null;
  const sodium = i.sodiumMg ?? null;
  const fatShare = fat === null ? null : (fat * 9) / kcal;
  const sugarShare = sugar === null ? null : (sugar * 4) / kcal;
  if ((fatShare ?? 0) > 1 || (sugarShare ?? 0) > 1) return null; // impossible: suspect data
  const tests = [
    atLeast(fatShare, 0.1),
    atLeast(sugarShare, 0.1),
    atLeast(sodium === null ? null : sodium / kcal, 1),
  ];
  if (tests.includes(true)) return true;
  return tests.includes(null) ? null : false;
}
