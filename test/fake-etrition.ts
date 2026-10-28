// Shared test helper (no tests here): a fake eTrition API over the fixtures.
import { readFileSync } from "node:fs";
import { mock } from "node:test";
import type { RecipeRecord } from "../src/platforms/etrition-normalize.ts";
import type { EtritionDistrict } from "../src/types.ts";

export const read = (path: string) =>
  JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
// Without its estimates: fixture tests see only what EUSD published.
const { addedSugarEstimates, ...eusd } = read("districts.json").districts[0];
export const district: EtritionDistrict = eusd;
export const fixture = {
  calendar: read("fixtures/etrition/Escondido_GetCalendarMenus.json"),
  recipes: read("fixtures/etrition/Escondido_GetRecipes.json")
    .records as RecipeRecord[],
};

// Calendar rows whose recipe is in the fixture (12 of 43 recipes were saved),
// for tests where a warm cache must be complete.
const known = new Set(fixture.recipes.map((r) => r.recipeID));
export const knownCalendar = {
  records: fixture.calendar.records.filter((r: { recipeID: number }) =>
    known.has(r.recipeID),
  ),
};

export interface FakeApi {
  calls: { url: URL; init: RequestInit }[];
  calendar: unknown;
  recipes: RecipeRecord[];
  brokenSites: string[]; // token requests for these sites get HTTP 500
}

function reply(api: FakeApi, url: URL, init: RequestInit): Response {
  if (url.pathname === "/token") {
    const site = new URLSearchParams(String(init.body)).get("username");
    const broken = api.brokenSites.some((s) => site === `omp:${s}`);
    return Response.json(
      { access_token: "tok" },
      { status: broken ? 500 : 200 },
    );
  }
  if (url.pathname.endsWith("/GetCalendarMenus"))
    return Response.json(api.calendar);
  const ids = (url.searchParams.get("RecipeIDs") ?? "").split(",").map(Number);
  return Response.json({
    records: api.recipes.filter((r) => ids.includes(r.recipeID)),
  });
}

/** Mocks global fetch; call mock.restoreAll() after each test. */
export function fakeEtrition(): FakeApi {
  const api: FakeApi = {
    calls: [],
    calendar: fixture.calendar,
    recipes: fixture.recipes,
    brokenSites: [],
  };
  mock.method(globalThis, "fetch", async (input: string, init: RequestInit) => {
    const url = new URL(input);
    api.calls.push({ url, init });
    return reply(api, url, init);
  });
  return api;
}
