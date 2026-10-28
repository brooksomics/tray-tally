import { requestJson } from "../http.ts";
import type { Item, Menu, SchoolCafeDistrict } from "../types.ts";
import { mergeRecipes, planFetch } from "./etrition-cache.ts";
import type { Merged, RecipeCache } from "./etrition-cache.ts";
import { normalize } from "./etrition-normalize.ts";
import {
  mergeIngredients,
  parseDaily,
  planDaily,
  withIngredients,
} from "./schoolcafe-ingredients.ts";
import type { IngredientCache } from "./schoolcafe-ingredients.ts";
import type { CalendarRecord, RecipeRecord } from "./etrition-normalize.ts";
import { flattenWeek, parseDetail, withWeekly } from "./schoolcafe-parse.ts";
import type { Row } from "./schoolcafe-parse.ts";

export { parseDetail } from "./schoolcafe-parse.ts";

// SchoolCafe (e.g. Del Mar Union). Endpoints read from the public web app's
// bundle, 2026-10-08: weekly menus per meal type (with calories, sat fat,
// sodium), then one nutrition-detail call per item for added sugar, sugar,
// fiber, protein. Details become recipe-shaped records, so the eTrition cache,
// validation, change log and normalizer are shared. Ingredients come from one
// daily call per run.
const BASE = "https://webapis.schoolcafe.com/api/";
const get = (path: string, query: Record<string, string>) =>
  requestJson(`${BASE}${path}?${new URLSearchParams(query)}`, {}, "SchoolCafe");
const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

// Weekly and daily menus take the same query (daily: seen 2026-10-08).
function menuReply(
  d: SchoolCafeDistrict,
  menu: Menu,
  at: { path: string; date: string },
) {
  const SchoolId = d.params.schoolId;
  const ServingLine = menu.servingLine ?? d.params.servingLine;
  const MealType = menu.mealType ?? menu.name;
  const query = { SchoolId, ServingDate: at.date, ServingLine, MealType };
  return get(`CalendarView/${at.path}`, {
    ...query,
    enabledWeekendMenus: "false",
  });
}

// One weekly call per tracked meal type, one at a time.
async function weeklyRows(
  d: SchoolCafeDistrict,
  monday: string,
): Promise<Row[]> {
  const rows: Row[] = [];
  const at = { path: "GetWeeklyMenuitems", date: monday };
  for (const menu of d.menus)
    rows.push(...flattenWeek(await menuReply(d, menu, at), menu.id));
  return rows;
}

// An empty NutritionalValues list is cached as "published nothing"; a reply
// without one is an error (not cached, asked again next run).
async function detailRecord(row: Row): Promise<RecipeRecord> {
  const nutrients = parseDetail(
    await get("GetFullNutritionInfo", {
      MenuItemId: String(row.id),
      TrayId: "0",
    }),
  );
  if (!nutrients)
    throw new Error(`SchoolCafe detail ${row.id}: unexpected reply`);
  return withWeekly(row, { ...withWeekly(row), ...nutrients });
}

// Sequential, `pauseMs` apart; one failure is reported, the rest still run.
async function details(ids: number[], rows: Map<number, Row>, pauseMs: number) {
  const records: RecipeRecord[] = [];
  const errors: string[] = [];
  for (const [n, id] of ids.entries()) {
    if (n > 0) await pause(pauseMs);
    try {
      records.push(await detailRecord(rows.get(id) as Row));
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  return { records, errors };
}

const toCalendar = (r: Row): CalendarRecord => ({
  ...{ menuNameID: r.menuId, recipeID: r.id, recipeServingID: r.id },
  ...{ menuDescription: r.item, menuDate: r.date },
});

// Items with no detail yet, then stale ones, on this week's menu only: an
// off-menu item has no row to refresh from. Not planFetch's "no calories yet":
// here calories come from the weekly reply, so that would re-ask forever.
function planIds(
  rows: Row[],
  state: { cache: RecipeCache; today: string },
  max: number,
) {
  const unseen = rows.filter((r) => !(r.id in state.cache)).map((r) => r.id);
  const onMenu = new Set(rows.map((r) => String(r.id)));
  const mine = Object.entries(state.cache).filter(([id]) => onMenu.has(id));
  const stale = planFetch([], Object.fromEntries(mine), state.today);
  return [...new Set([...unseen, ...stale])].slice(0, max);
}

// The daily call for the day and meal with the most items lacking
// ingredients. Ingredients are extra, so a failure is a warning, not a failed
// district; its items count as asked, so the next run tries another day.
async function daily(d: SchoolCafeDistrict, rows: Row[], state: State) {
  const cache = state.ingredients ?? {};
  const plan = planDaily(rows, cache, state.today);
  const menu = d.menus.find((m) => m.id === plan?.menuId);
  if (!plan || !menu) return { ingredients: cache, warnings: [] };
  const asked = (found: Map<number, string | null>) =>
    mergeIngredients(cache, { ids: plan.ids, found }, state.today);
  try {
    await pause(d.params.pauseMs ?? 1000);
    const at = { path: "GetDailyMenuitems", date: plan.date };
    const found = parseDaily(await menuReply(d, menu, at));
    return { ingredients: asked(found), warnings: [] };
  } catch (e) {
    const why = `SchoolCafe daily ${plan.date}: ${(e as Error).message}`;
    return { ingredients: asked(new Map()), warnings: [`WARNING: ${why}`] };
  }
}

type State = {
  cache: RecipeCache;
  today: string;
  ingredients?: IngredientCache;
};
type Run = Merged & {
  items: Item[];
  asked: number;
  got: number;
  ingredients: IngredientCache;
  warnings: string[];
};

/** As eTrition's fetchWeek: a weekly call per meal type, <= maxDetails detail calls, <= 1 daily call. */
export async function fetchWeek(
  d: SchoolCafeDistrict,
  range: [string, string],
  state: State,
): Promise<Run> {
  const rows = await weeklyRows(d, range[0]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const { maxDetails = 10, pauseMs = 1000 } = d.params;
  const ids = planIds(rows, state, maxDetails);
  const { records, errors } = await details(ids, byId, pauseMs);
  const merged = mergeRecipes(state.cache, { ids, records }, state.today);
  const record = (r: Row) => withWeekly(r, merged.cache[r.id]?.record);
  const known = [...byId.values()].map(record);
  const { ingredients, warnings } = await daily(d, rows, state);
  const plain = normalize(d, rows.map(toCalendar), known);
  const items = withIngredients(plain, ingredients);
  const rejected = [...errors, ...merged.rejected];
  const counts = { asked: ids.length, got: records.length };
  return { ...merged, ...counts, items, rejected, ingredients, warnings };
}
