import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { weekOf } from "./dates.ts";
import {
  addedSugarFlag,
  chocolateMilk,
  entreeTest,
  itemMetrics,
  sodiumFlag,
  sugaryEntree,
  UNRECORDED_SUGAR_G,
  weekStats,
} from "./metrics.ts";
import type { RecipeCache } from "./platforms/etrition-cache.ts";
import { AB1264_REFERENCE, ab1264NutrientCriterion } from "./rules/ca.ts";
import { REFERENCES } from "./rules/federal.ts";
import { INTERNATIONAL_REFERENCES } from "./rules/international.ts";
import { readJson, writeJson } from "./store.ts";
import type { DayFile, District, Item, Menu, RecipeChange } from "./types.ts";

export const CAVEATS = [
  "Applying the weekly <10%-of-calories added-sugar limit to one item, or to an unweighted weekly mean of items offered, is a heuristic, not a compliance finding.",
  "Weekly means are estimates over the items that have data; with under half the items known there is no verdict.",
  "These are menu items offered, not what any child took or ate.",
  "Null means a value wasn't published or can't be computed (e.g. 0 kcal).",
  "California lens: ab1264NutrientCriterion only says whether an item is high in saturated fat, sodium or added sugar as AB 1264 defines it. Neither true nor false decides whether it is an ultraprocessed food: that also needs a listed additive, a nonnutritive sweetener is an alternative trigger, and some foods are excluded outright (e.g. Class 1 milk, USDA commodity foods, raw and minimally processed foods). AB 1264 restricts nothing yet: the state defines 'UPF of concern' by 2028-06-01, schools begin phasing them out by 2029-07-01, and school meals exclude them from 2035-07-01.",
  "Items over their meal's federal calorie maximum, or with more added-sugar calories than calories, are flagged 'suspect' (likely data-entry errors) and kept.",
  "A side (not an entrée) with more sodium than its whole K-5 meal may average (lunch 1,110 mg, breakfast 540 mg) is flagged 'suspect_sodium' (a likely data-entry error), kept, and left out of the menu sodium density.",
  `An entrée published at 0 g added sugar with ${UNRECORDED_SUGAR_G} g or more total sugars is flagged 'suspect_added_sugar' (its added sugar was likely not recorded), kept at 0 g, and listed under Worst offenders.`,
  "Some added-sugar values come from vendor labels or recipes rather than the menu: where a district publishes none, or publishes 0 g for an item whose label shows more. Each is flagged 'estimated_added_sugar'. Where the labels confirm a published 0 g, the item keeps 0 g and isn't flagged 'suspect_added_sugar'. A new value from the district replaces the estimate. Each value and its source is listed in districts.json.",
];

const NUTRIENTS = [
  "calories",
  "sugar",
  "addedSugar",
  "saturatedFat",
  "dietaryFiber",
  "protein",
  "sodium",
];
const DAY_FILE = /^\d{4}-\d{2}-\d{2}\.json$/;
const mondayOf = (date: string) => weekOf(new Date(`${date}T12:00:00`))[0];

type IsEntree = ReturnType<typeof entreeTest>;

// Drop what the parent (district, menu, day) already says; add the metrics.
function publicItem(i: Item, isEntree: IsEntree) {
  const { date, district, menu, meal, ...rest } = i;
  return {
    ...rest,
    ...itemMetrics(i),
    entree: (i.category ?? null) === null ? null : isEntree(i),
    ab1264NutrientCriterion: ab1264NutrientCriterion(i),
  };
}

function dayStats(d: { date: string; items: Item[] }, isEntree: IsEntree) {
  return {
    date: d.date,
    sugaryEntree: sugaryEntree(d.items, isEntree),
    chocolateMilk: chocolateMilk(d.items),
    items: d.items.map((i) => publicItem(i, isEntree)),
  };
}

function series(menu: Menu, days: DayFile[], isEntree: IsEntree) {
  const [salt, sugar] = [sodiumFlag(menu, isEntree), addedSugarFlag(isEntree)];
  const ofMenu = (d: DayFile) =>
    d.items.filter((i) => i.menu === menu.name).map((i) => sugar(salt(i)));
  const mine = days
    .map((d) => ({ ...d, items: ofMenu(d) }))
    .filter((d) => d.items.length > 0);
  const byWeek = Map.groupBy(
    mine.flatMap((d) => d.items),
    (i) => mondayOf(i.date),
  );
  return {
    menu: menu.name,
    meal: menu.meal,
    grades: menu.grades,
    primary: menu.primary ?? false,
    days: mine.map((d) => dayStats(d, isEntree)),
    weeks: [...byWeek].map(([week, items]) => weekStats(week, items)),
  };
}

/**
 * Replaces added sugar the district doesn't publish (null), or publishes as a
 * value its estimate names as wrong, from districts.json. Any other published
 * value wins: a district's own new number ends the estimate.
 */
function withEstimates(d: District, days: DayFile[]): DayFile[] {
  const find = (i: Item) =>
    d.addedSugarEstimates?.find(
      (e) => e.sourceId === i.sourceId && e.item === i.item,
    );
  const fill = (i: Item): Item => {
    const e = find(i);
    if (!e || i.addedSugarG !== (e.published ?? null)) return i;
    const flags = i.flags.filter((f) => f !== "missing_added_sugar");
    return {
      ...i,
      addedSugarG: e.addedSugarG,
      flags: [...flags, "estimated_added_sugar"],
    };
  };
  return days.map((day) => ({ ...day, items: day.items.map(fill) }));
}

/**
 * Calcium and iron were kept from 2026-10-23. An item stored
 * before then takes its recipe's cached values, the record its other
 * nutrients came from. A recipe with several cached servings is ambiguous: null.
 */
function withMinerals(days: DayFile[], recipes: RecipeCache = {}): DayFile[] {
  const byRecipe = Map.groupBy(Object.values(recipes), (c) =>
    String(c.record.recipeID),
  );
  const fill = (i: Item): Item => {
    if ("calciumMg" in i) return i;
    const [one, ...more] = byRecipe.get(i.sourceId) ?? [];
    const r = more.length ? undefined : one?.record;
    return { ...i, calciumMg: r?.calcium ?? null, ironMg: r?.iron ?? null };
  };
  return days.map((day) => ({ ...day, items: day.items.map(fill) }));
}

// Every line the page draws, each with its source: US, peer nations, California.
const ALL_REFERENCES = {
  ...REFERENCES,
  ...INTERNATIONAL_REFERENCES,
  caAb1264NutrientCriterion: AB1264_REFERENCE,
};

export interface DistrictData {
  district: District;
  days: DayFile[]; // sorted by date
  changes: number; // reformulations: recipe refreshes that changed nutrition
  recipes?: RecipeCache; // fills calcium and iron in days stored before them
}

function districtSummary({
  district: d,
  days,
  changes,
  recipes,
}: DistrictData) {
  const stored = withEstimates(d, withMinerals(days, recipes));
  return {
    id: d.id,
    name: d.name,
    state: d.state,
    wealth: d.wealth ?? null,
    reformulations: changes,
    series: d.menus.map((m) =>
      series(m, stored, entreeTest(d.entreeCategories)),
    ),
  };
}

/** summary.json: what the page reads at build time. Registry params never leave. */
export function summarize(inputs: DistrictData[], generated: string) {
  const districts = inputs.map(districtSummary);
  return {
    schemaVersion: 3, // 2: `lens` became `lenses` (+ california); 3: items carry `entree`
    generated,
    lenses: ["federal", "california"],
    references: ALL_REFERENCES,
    caveats: CAVEATS,
    districts,
  };
}

const NO_RECIPES = { recipes: {} as RecipeCache };

function load(dataDir: string, district: District): DistrictData {
  const dir = join(dataDir, district.id);
  const names = existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => DAY_FILE.test(f))
        .sort()
    : [];
  const days = names.map(
    (f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as DayFile,
  );
  const { recipes } = readJson(join(dir, "recipes.json"), NO_RECIPES);
  const log = readJson(join(dir, "changes.json"), {
    changes: [] as RecipeChange[],
  });
  const events = log.changes
    .filter((c) => NUTRIENTS.includes(c.field))
    .map((c) => `${c.recipeServingID}@${c.date}`);
  return { district, days, changes: new Set(events).size, recipes };
}

/** Summary over everything stored for these districts. */
export function buildSummary(
  districts: District[],
  dataDir: string,
  today: string,
) {
  return summarize(
    districts.map((d) => load(dataDir, d)),
    today,
  );
}

// ponytail: one file with every item ever (~1.5 MB/district/school year); split by month if the page build slows.
export function writeSummary(
  districts: District[],
  dataDir: string,
  today: string,
) {
  writeJson(
    join(dataDir, "summary.json"),
    buildSummary(districts, dataDir, today),
  );
}
