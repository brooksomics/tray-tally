export type Meal = "breakfast" | "lunch";
export type Grades = "K-5"; // TK-12 meals are universal; TK eats the K-5 menu
export type Flag =
  | "missing_added_sugar"
  | "missing_nutrition"
  | "suspect"
  | "suspect_sodium" // set by summary.ts, never stored
  | "suspect_added_sugar" // set by summary.ts, never stored
  | "estimated_added_sugar"; // set by summary.ts, never stored

export interface Menu {
  id: number;
  name: string;
  meal: Meal;
  grades: Grades;
  primary?: boolean;
  mealType?: string; // SchoolCafe: the MealType query value, e.g. "Breakfast"
  servingLine?: string; // SchoolCafe: overrides the district's servingLine
}

export interface EtritionParams {
  site: string;
  schoolTypeId: number;
  districtOnly: boolean;
  schoolId?: number;
}

export interface Sourced {
  value: number;
  year: string;
  source: string;
}

/** District wealth context for rich-vs-poor comparisons (published). */
export interface Wealth {
  frpmPercent: Sourced; // students eligible for free/reduced-price meals
  medianHouseholdIncome?: Sourced; // all households in the district
  parentsMedianHouseholdIncome?: Sourced; // households with public-school children
}

/** Fields every districts.json entry has. `id` is the NCES LEAID: 7 chars, keep as string. */
interface DistrictBase {
  id: string;
  name: string;
  state: string;
  menus: Menu[];
  note?: string; // registry-only context; never copied into published output
  entreeCategories?: string[]; // main-dish categories without "ENTREE" in the name
  wealth?: Wealth;
  addedSugarEstimates?: AddedSugarEstimate[];
}

/** Stands in for added sugar a district doesn't publish, or publishes wrong; the basis stays here. */
export interface AddedSugarEstimate {
  sourceId: string;
  item: string; // must match too, in case a sourceId is reused
  addedSugarG: number;
  published?: number; // the wrong value it replaces (e.g. 0); omitted: fills only a null
  basis: string;
}

export interface EtritionDistrict extends DistrictBase {
  platform: "etrition";
  params: EtritionParams;
}

export interface SchoolCafeParams {
  schoolId: string; // GUID of one representative school
  servingLine: string;
  maxDetails?: number; // nutrition-detail calls per run (default 10)
  pauseMs?: number; // between detail calls (default 1000)
}

export interface SchoolCafeDistrict extends DistrictBase {
  platform: "schoolcafe";
  params: SchoolCafeParams;
}

export type District = EtritionDistrict | SchoolCafeDistrict;

/** One offered menu item on one day (PRD §6). Nutrition is null when unpublished. */
export interface Item {
  date: string;
  district: string;
  menu: string;
  meal: Meal;
  item: string;
  category: string | null; // as published, e.g. "ENTREE BREAKFAST", "DAIRY"
  sourceId: string;
  servingSize: string | null;
  kcal: number | null;
  sugarG: number | null;
  addedSugarG: number | null;
  saturatedFatG: number | null;
  fiberG: number | null;
  proteinG: number | null;
  sodiumMg: number | null;
  calciumMg?: number | null; // absent in days stored before 2026-10-23 (food-ebu)
  ironMg?: number | null;
  ingredients?: string | null; // SchoolCafe only: SubIngredientsDisplay, null until fetched
  flags: Flag[];
}

/** One changed field on a re-fetched recipe (data/<district>/changes.json). */
export interface RecipeChange {
  date: string;
  recipeID: number;
  recipeServingID: number;
  field: string;
  from: unknown;
  to: unknown;
}

/** data/<district>/<date>.json, written by the runner. */
export interface DayFile {
  schemaVersion: 1;
  district: string;
  date: string;
  firstSeen: string;
  lastSeen: string;
  items: Item[];
}
