import { CALORIES } from "../rules/federal.ts";
import type { Flag, Item, Menu } from "../types.ts";

/** GetCalendarMenus record: only the fields we read. */
export interface CalendarRecord {
  menuNameID: number;
  recipeID: number;
  recipeServingID: number;
  menuDescription: string;
  menuDate: string;
}

/** GetRecipes record: only the fields we read. */
export interface RecipeRecord {
  recipeID: number;
  recipeServingID: number;
  recipeCategoryDescription: string | null;
  servingSize: string | null;
  calories: number | null;
  caloriesUOM: string;
  sugar: number | null;
  sugarUOM: string;
  addedSugar: number | null;
  addedSugarUOM: string;
  saturatedFat: number | null;
  saturatedFatUOM: string;
  dietaryFiber: number | null;
  dietaryFiberUOM: string;
  protein: number | null;
  proteinUOM: string;
  sodium: number | null;
  sodiumUOM: string;
  calcium?: number | null; // absent in entries cached before 2026-10-23
  calciumUOM?: string;
  iron?: number | null;
  ironUOM?: string;
}

// Nutrient field -> required unit. Responses are only cast, so check shapes here.
const UNITS = {
  calories: "kcals",
  sugar: "g",
  addedSugar: "g",
  saturatedFat: "g",
  dietaryFiber: "g",
  protein: "g",
  sodium: "mg",
  calcium: "mg",
  iron: "mg",
} as const;

export function checkRecipe(r: RecipeRecord): void {
  for (const [field, unit] of Object.entries(UNITS)) {
    const value: unknown = r[field as keyof typeof UNITS];
    const got = r[`${field}UOM` as keyof RecipeRecord];
    const where = `recipe ${r.recipeID}: ${field}`;
    // Unpublished (null) or absent (an older cache entry): flagged later, unit irrelevant.
    if (value === null || value === undefined) continue;
    if (typeof value !== "number") throw new Error(`${where} is not a number`);
    if (got !== unit)
      throw new Error(`${where}UOM is ${got}, expected ${unit}`);
  }
}

const ROW_FIELDS = [
  "menuNameID",
  "recipeID",
  "recipeServingID",
  "menuDescription",
  "menuDate",
];

function checkRow(c: CalendarRecord): void {
  const ok =
    [c.menuNameID, c.recipeID, c.recipeServingID].every(Number.isInteger) &&
    typeof c.menuDescription === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(c.menuDate);
  if (!ok) {
    // Only the checked fields: rows also carry school names, which must not reach logs.
    const shown = JSON.stringify(c, ROW_FIELDS);
    throw new Error(`eTrition: unexpected calendar row ${shown}`);
  }
}

function flags(menu: Menu, r: RecipeRecord | undefined): Flag[] {
  if (!r) return ["missing_nutrition"];
  const max = CALORIES[menu.grades][menu.meal]?.[1];
  const out: Flag[] = [];
  if (r.calories === null) out.push("missing_nutrition");
  if (r.addedSugar === null) out.push("missing_added_sugar");
  const kcal = r.calories ?? 0;
  const overMax = max !== undefined && kcal > max;
  const impossible =
    r.addedSugar !== null &&
    r.calories !== null &&
    r.addedSugar * 4 > r.calories;
  if (overMax || impossible) out.push("suspect");
  return out;
}

// A recipe's nutrients, item-named; unpublished (or no recipe) is null.
const nutrients = (r?: RecipeRecord) => ({
  kcal: r?.calories ?? null,
  sugarG: r?.sugar ?? null,
  addedSugarG: r?.addedSugar ?? null,
  saturatedFatG: r?.saturatedFat ?? null,
  fiberG: r?.dietaryFiber ?? null,
  proteinG: r?.protein ?? null,
  sodiumMg: r?.sodium ?? null,
  calciumMg: r?.calcium ?? null,
  ironMg: r?.iron ?? null,
});

function toItem(c: CalendarRecord, menu: Menu, r?: RecipeRecord) {
  if (r) checkRecipe(r);
  return {
    date: c.menuDate,
    menu: menu.name,
    meal: menu.meal,
    item: c.menuDescription.replace(/\s+/g, " ").trim(),
    category: r?.recipeCategoryDescription ?? null,
    sourceId: String(c.recipeID),
    servingSize: r?.servingSize ?? null,
    ...nutrients(r),
    flags: flags(menu, r),
  };
}

/** Calendar rows for the district's tracked menus, joined to recipe nutrition. */
export function normalize(
  district: { id: string; menus: Menu[] },
  calendar: CalendarRecord[],
  recipes: RecipeRecord[],
): Item[] {
  const menus = new Map(district.menus.map((m) => [m.id, m]));
  // Key on the serving the menu lists: one recipe can have several servings.
  const served = new Map(recipes.map((r) => [r.recipeServingID, r]));
  return calendar.flatMap((c) => {
    checkRow(c);
    const menu = menus.get(c.menuNameID);
    if (!menu) return [];
    return [
      {
        district: district.id,
        ...toItem(c, menu, served.get(c.recipeServingID)),
      },
    ];
  });
}
