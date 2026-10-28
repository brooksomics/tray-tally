import { requestJson } from "../http.ts";
import type { EtritionDistrict, Item } from "../types.ts";
import { mergeRecipes, planFetch } from "./etrition-cache.ts";
import type { Merged, RecipeCache } from "./etrition-cache.ts";
import { normalize } from "./etrition-normalize.ts";
import type { CalendarRecord, RecipeRecord } from "./etrition-normalize.ts";

const BASE = "https://externalsync.etrition.com";
const BATCH = 50; // recipe IDs per GetRecipes call

/** Guest password, the same one the public menu page derives: YYYY+site+MM+DD (UTC). */
export function password(site: string, now: Date): string {
  const d = now.toISOString();
  return `${d.slice(0, 4)}${site}${d.slice(5, 7)}${d.slice(8, 10)}`;
}

const request = (url: string, init: RequestInit) =>
  requestJson(url, init, "eTrition");

async function getToken(site: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "password",
    username: `omp:${site}`,
    password: password(site, new Date()),
  });
  const json = await request(`${BASE}/token`, { method: "POST", body });
  const token = (json as { access_token?: unknown }).access_token;
  if (typeof token !== "string") throw new Error("eTrition: no access_token");
  return token;
}

async function records<T>(
  path: string,
  token: string,
  query: Record<string, string>,
): Promise<T[]> {
  const url = `${BASE}/exsync/${path}?${new URLSearchParams(query)}`;
  const json = await request(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const recs = (json as { records?: unknown }).records;
  if (!Array.isArray(recs)) throw new Error(`eTrition ${path}: no records`);
  return recs as T[];
}

function getCalendar(
  token: string,
  d: EtritionDistrict,
  range: [string, string],
) {
  return records<CalendarRecord>("GetCalendarMenus", token, {
    SessionIDs: "",
    SchoolTypeID: String(d.params.schoolTypeId),
    SchoolID: String(d.params.schoolId ?? ""),
    LanguageID: "1",
    DistrictOnly: String(d.params.districtOnly),
    GetAllergyTypeList: "false",
    GetAllergenList: "true",
    StartDate: range[0],
    EndDate: range[1],
    GetHolidays: "true",
  });
}

// Sequential on purpose: one polite request at a time.
async function getRecipes(
  token: string,
  ids: number[],
): Promise<RecipeRecord[]> {
  const out: RecipeRecord[] = [];
  for (let i = 0; i < ids.length; i += BATCH) {
    const RecipeIDs = ids.slice(i, i + BATCH).join(",");
    const query = {
      LastRecipeID: "",
      LanguageID: "1",
      PageSize: String(BATCH),
      RecipeIDs,
      UserID: "",
    };
    out.push(...(await records<RecipeRecord>("GetRecipes", token, query)));
  }
  return out;
}

/**
 * One run for one district: token + calendar + recipes the cache lacks or
 * holds stale (<= 3 batches, so <= 5 requests). Returns items for every
 * tracked menu row plus the updated cache and any recipe changes.
 */
export async function fetchWeek(
  district: EtritionDistrict,
  range: [string, string],
  state: { cache: RecipeCache; today: string },
): Promise<Merged & { items: Item[]; asked: number; got: number }> {
  const token = await getToken(district.params.site);
  const calendar = await getCalendar(token, district, range);
  const tracked = new Set(district.menus.map((m) => m.id));
  const rows = calendar.filter((c) => tracked.has(c.menuNameID));
  const ids = planFetch(rows, state.cache, state.today);
  const records = await getRecipes(token, ids);
  const merged = mergeRecipes(state.cache, { ids, records }, state.today);
  const known = Object.values(merged.cache).map((c) => c.record);
  const items = normalize(district, calendar, known);
  return { items, asked: ids.length, got: records.length, ...merged };
}
