import { REFERENCES, SODIUM_MG } from "./rules/federal.ts";
import type { Item, Menu } from "./types.ts";

// Federal lens: pure functions over stored items. Missing inputs give null, never 0.
const AHA_G = REFERENCES.ahaDailyAddedSugarG.value;
const MEAL_G = REFERENCES.dgaMealAddedSugarG.value;
const WEEKLY_SHARE = REFERENCES.usdaWeeklyAddedSugarShare.value;
// ponytail: judgment call; with under half the items known, a weekly mean says too little.
const MIN_COVERAGE = 0.5;

const round3 = (x: number) => Math.round(x * 1000) / 1000;
const key = (s: string) => s.trim().toLowerCase();

/** Entrée: "ENTREE" anywhere in the category, or one of the district's own (SDUSD: "Poultry"). */
export function entreeTest(extra: string[] = []) {
  const own = new Set(extra.map(key));
  return (i: Item) =>
    /ENTREE/i.test(i.category ?? "") || own.has(key(i.category ?? ""));
}

/**
 * Flags a side with more sodium than its whole meal may average: likely a
 * data-entry error, e.g. a 15 kcal salad at 1,315 mg. Entrées
 * are exempt: real ones carry most of a meal's sodium, a few more than all.
 */
export function sodiumFlag(menu: Menu, isEntree: (i: Item) => boolean) {
  const max = SODIUM_MG[menu.grades][menu.meal] ?? Infinity;
  return (i: Item): Item =>
    i.category !== null && !isEntree(i) && (i.sodiumMg ?? 0) > max
      ? { ...i, flags: [...i.flags, "suspect_sodium"] }
      : i;
}

// ponytail: judgment call on the 2026-10-15 data: it catches
// every implausible 0 seen (breads at 22 g, orange chicken 12 g, corn dogs
// 9 g); pizza and burgers sit near 5 g, likely tomato and bun sugars.
export const UNRECORDED_SUGAR_G = 8;

/**
 * Flags an entrée published at 0 g added sugar with UNRECORDED_SUGAR_G or
 * more total sugars: its added sugar was likely not recorded. Sides are
 * exempt: fruit, milk and juice carry sugars with none added.
 */
export function addedSugarFlag(isEntree: (i: Item) => boolean) {
  return (i: Item): Item =>
    isEntree(i) && i.addedSugarG === 0 && (i.sugarG ?? 0) >= UNRECORDED_SUGAR_G
      ? { ...i, flags: [...i.flags, "suspect_added_sugar"] }
      : i;
}

/** Added-sugar share of kcal, unrounded; null if unknown, 0 kcal, or impossible (> 100%). */
function share(i: Item): number | null {
  if (i.addedSugarG === null || !(i.kcal && i.kcal > 0)) return null;
  const s = (i.addedSugarG * 4) / i.kcal;
  return s > 1 ? null : s;
}

export function itemMetrics(i: Item) {
  const g = i.addedSugarG;
  const s = share(i);
  return {
    addedSugarShareKcal: s === null ? null : round3(s),
    ahaShare: g === null ? null : round3(g / AHA_G),
    overMealLimit: g === null ? null : g > MEAL_G,
  };
}

/** true if any entrée has > 10 g; false only when every item is known; else null. */
export function sugaryEntree(
  items: Item[],
  isEntree = entreeTest(),
): boolean | null {
  const entrees = items.filter(isEntree);
  if (entrees.some((i) => (i.addedSugarG ?? 0) > MEAL_G)) return true;
  const unknown =
    entrees.length === 0 ||
    items.some((i) => (i.category ?? null) === null) ||
    entrees.some((i) => i.addedSugarG === null);
  return unknown ? null : false;
}

// By name: SDUSD files milk as "Beverages ", EUSD as "DAIRY".
const NOT_A_DRINK = /chip|muffin|pancake|cookie|bread|bar\b/i;

/** Any chocolate milk that day: "milk" (a word) and "choc" in the name, not food. */
export function chocolateMilk(items: Item[]): boolean {
  return items.some(
    (i) =>
      /\bmilk\b/i.test(i.item) &&
      /choc/i.test(i.item) &&
      !NOT_A_DRINK.test(i.item),
  );
}

/** Distance to 2027: unweighted mean share over items with data, vs < 10%. */
export function weekStats(week: string, items: Item[]) {
  const shares = items.map(share).filter((s) => s !== null);
  const mean = shares.length
    ? shares.reduce((a, b) => a + b, 0) / shares.length
    : null;
  const coverage = items.length ? shares.length / items.length : 0;
  const judged = mean !== null && coverage >= MIN_COVERAGE;
  return {
    week,
    basis: "estimate",
    items: items.length,
    coverage: round3(coverage),
    meanAddedSugarShareKcal: mean === null ? null : round3(mean),
    // Unrounded, with a hair of float tolerance: exactly 10% is not under 10%.
    under10Percent: judged ? mean < WEEKLY_SHARE - 1e-9 : null,
  };
}
