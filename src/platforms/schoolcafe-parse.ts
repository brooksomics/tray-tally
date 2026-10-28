import type { RecipeRecord } from "./etrition-normalize.ts";

// SchoolCafe responses -> rows and recipe-shaped nutrients. Pure, no I/O.

export interface Row {
  date: string;
  menuId: number;
  id: number;
  item: string;
  category: string;
  kcal: number | null; // the weekly reply carries calories, sat fat and sodium...
  satFat: number | null;
  sodium: number | null;
  servingSize: string | null; // ...the rest (sugars, fiber, protein, calcium, iron) need the detail call
}

const NUTRIENTS = {
  "Added Sugars": "addedSugar",
  Sugars: "sugar",
  "Saturated Fat": "saturatedFat",
  Sodium: "sodium",
  "Dietary Fiber": "dietaryFiber",
  Protein: "protein",
  Calcium: "calcium",
  Iron: "iron",
} as const;
type Field = (typeof NUTRIENTS)[keyof typeof NUTRIENTS];
export type Nutrients = Pick<RecipeRecord, Field | `${Field}UOM`>;
type Value = { ComponentName?: string; DailyValue?: unknown } | null;

/**
 * NutritionalValues to numbers + units. A value that isn't plainly
 * "<number><unit>" (e.g. "<1g") is null. Returns null for a reply without a
 * NutritionalValues list (unexpected shape), so callers can tell it from "empty".
 */
export function parseDetail(detail: unknown): Nutrients | null {
  const values = (detail as { NutritionalValues?: Value[] })?.NutritionalValues;
  if (!Array.isArray(values)) return null;
  const out: Record<string, number | string | null> = {};
  for (const f of Object.values(NUTRIENTS))
    [out[f], out[`${f}UOM`]] = [null, null];
  for (const v of values) {
    const f = NUTRIENTS[v?.ComponentName as keyof typeof NUTRIENTS];
    const raw =
      typeof v?.DailyValue === "string"
        ? v.DailyValue.replace(/,/g, "").trim()
        : "";
    const m = /^(\d*\.?\d+)\s*([a-z]+)$/i.exec(raw);
    if (f && m) [out[f], out[`${f}UOM`]] = [Number(m[1]), m[2]];
  }
  return out as unknown as Nutrients;
}

type Raw = Record<string, unknown>;
type At = { date: string; category: string; menuId: number };
const SHOWN = ["MenuItemId", "MenuItemDescription"];
const num = (v: unknown) => (typeof v === "number" ? v : null);
const text = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim() : null;

function toRow(i: Raw, at: At): Row {
  const ok =
    Number.isInteger(i?.MenuItemId) &&
    typeof i?.MenuItemDescription === "string";
  if (!ok)
    throw new Error(
      `SchoolCafe: unexpected menu item ${JSON.stringify(i, SHOWN)}`,
    );
  const item = String(i.MenuItemDescription).replace(/\s+/g, " ").trim();
  const nutrition = {
    kcal: num(i.Calories),
    satFat: num(i.SatFat),
    sodium: num(i.Sodium),
  };
  const servingSize = text(i.ServingSizeByGrade) ?? text(i.DefaultServingSize);
  return { ...at, id: Number(i.MenuItemId), item, ...nutrition, servingSize };
}

// "A menu has not been published for this day.": MenuItemId 0, one per
// category, for days older than about a week. Not food, so not an item.
const isPlaceholder = (i: Raw) => i?.MenuItemId === 0;

function dayRows(day: string, cats: unknown, menuId: number): Row[] {
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(day);
  if (!us)
    throw new Error(
      `SchoolCafe weekly: unexpected date key ${JSON.stringify(day)}`,
    );
  const date = `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  const lists = Object.entries((cats ?? {}) as Record<string, unknown>);
  if (!lists.every(([, v]) => Array.isArray(v)))
    throw new Error("SchoolCafe weekly: unexpected category lists");
  return lists.flatMap(([category, items]) =>
    (items as Raw[])
      .filter((i) => !isPlaceholder(i))
      .map((i) => toRow(i, { date, category, menuId })),
  );
}

/** GetWeeklyMenuitems reply ({"10/5/2026": {ENTREE: [...]}}) -> one row per item per day. */
export function flattenWeek(week: unknown, menuId: number): Row[] {
  if (!week || typeof week !== "object" || Array.isArray(week))
    throw new Error("SchoolCafe weekly: unexpected reply");
  return Object.entries(week).flatMap(([day, cats]) =>
    dayRows(day, cats, menuId),
  );
}

const unit = (v: number | null, u: string) => (v === null ? null : u) as string;
const blank = (row: Row): RecipeRecord => ({
  ...(parseDetail({ NutritionalValues: [] }) as RecipeRecord),
  ...{ recipeID: row.id, recipeServingID: row.id },
});

/**
 * Record for an item: cached detail nutrients (or none yet) with this week's
 * menu values on top. Calories, sat fat and sodium stay current even when the
 * detail is weeks old.
 */
export function withWeekly(row: Row, cached?: RecipeRecord): RecipeRecord {
  return {
    ...(cached ?? blank(row)),
    ...{
      recipeCategoryDescription: row.category,
      servingSize: row.servingSize,
    },
    ...{ calories: row.kcal, caloriesUOM: unit(row.kcal, "kcals") },
    ...{ saturatedFat: row.satFat, saturatedFatUOM: unit(row.satFat, "g") },
    ...{ sodium: row.sodium, sodiumUOM: unit(row.sodium, "mg") },
  };
}
