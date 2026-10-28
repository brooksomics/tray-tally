import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { fetchWeek, password } from "../src/platforms/etrition.ts";
import type { CalendarRecord } from "../src/platforms/etrition-normalize.ts";
import {
  district,
  fakeEtrition,
  fixture,
  knownCalendar,
} from "./fake-etrition.ts";
import type { FakeApi } from "./fake-etrition.ts";

const week: [string, string] = ["2026-10-05", "2026-10-09"];
const fresh = { cache: {}, today: "2026-10-08" };
const tracked = new Set(district.menus.map((m) => m.id));
let api: FakeApi;

beforeEach(() => (api = fakeEtrition()));
afterEach(() => mock.restoreAll());

const paths = () => api.calls.map((c) => c.url.pathname);
const header = (i: number, name: string) =>
  new Headers(api.calls[i].init.headers).get(name);
const batchSizes = () =>
  api.calls
    .filter((c) => c.url.pathname.endsWith("/GetRecipes"))
    .map((c) => c.url.searchParams.get("RecipeIDs")?.split(",").length);

// n unseen recipes, each on its own row of a tracked menu
function synthetic(n: number) {
  const row = { ...fixture.calendar.records[0], menuNameID: 2 };
  const ids = Array.from({ length: n }, (_, i) => i + 1);
  return {
    records: ids.map((id) => ({ ...row, recipeID: id, recipeServingID: id })),
  };
}

test("guest password is YYYY + site + MM + DD on the UTC date", () => {
  const evening = new Date("2026-10-08T23:30:00-07:00"); // already 10-09 in UTC
  assert.equal(password("Escondido", evening), "2026Escondido1009");
});

test("token, then calendar, then recipes, with the guest login", async () => {
  await fetchWeek(district, week, fresh);
  assert.deepEqual(paths(), [
    "/token",
    "/exsync/GetCalendarMenus",
    "/exsync/GetRecipes",
  ]);
  const body = new URLSearchParams(String(api.calls[0].init.body));
  assert.equal(body.get("username"), "omp:Escondido");
  assert.match(body.get("password") ?? "", /^\d{4}Escondido\d{4}$/);
  const q = api.calls[1].url.searchParams;
  const got = ["DistrictOnly", "SchoolTypeID", "StartDate", "EndDate"];
  assert.deepEqual(
    got.map((k) => q.get(k)),
    ["true", "1", ...week],
  );
});

test("asks only for recipes on tracked menus; caches what it got", async () => {
  const { items, cache } = await fetchWeek(district, week, fresh);
  const asked = api.calls[2].url.searchParams.get("RecipeIDs")?.split(",");
  const want = fixture.calendar.records
    .filter((c: CalendarRecord) => tracked.has(c.menuNameID))
    .map((c: CalendarRecord) => c.recipeID);
  assert.deepEqual(
    asked?.map(Number).sort(),
    [...new Set<number>(want)].sort(),
  );
  assert.equal(items.length, 60); // elementary menus only
  assert.equal(Object.keys(cache).length, fixture.recipes.length);
});

test("every request names the project; API calls carry the token", async () => {
  await fetchWeek(district, week, fresh);
  for (let i = 0; i < api.calls.length; i++) {
    assert.equal(header(i, "user-agent"), "school-meal-tracker");
  }
  assert.equal(header(1, "authorization"), "Bearer tok");
  assert.equal(header(2, "authorization"), "Bearer tok");
});

test("recipes come in batches of 50, at most 3 (<= 5 requests a run)", async () => {
  api.calendar = synthetic(120);
  await fetchWeek(district, week, fresh);
  assert.deepEqual(batchSizes(), [50, 50, 20]);
  api.calls = [];
  api.calendar = synthetic(200);
  const { items } = await fetchWeek(district, week, fresh);
  assert.deepEqual(batchSizes(), [50, 50, 50]);
  assert.equal(api.calls.length, 5);
  assert.equal(
    items.filter((i) => i.flags.includes("missing_nutrition")).length,
    200,
  );
});

test("a warm cache needs only the token and calendar requests", async () => {
  api.calendar = knownCalendar;
  const { cache } = await fetchWeek(district, week, fresh);
  api.calls = [];
  const { items } = await fetchWeek(district, week, {
    cache,
    today: "2026-10-09",
  });
  assert.deepEqual(paths(), ["/token", "/exsync/GetCalendarMenus"]);
  const cake = items.find((i) => i.item === "Cake,Crumb");
  assert.equal(cake?.addedSugarG, 19);
});

test("fails loudly on an HTTP error or a reply without a token", async () => {
  const cases: [unknown, number, RegExp][] = [
    ["nope", 500, /eTrition 500/],
    [{ token: "x" }, 200, /no access_token/],
  ];
  for (const [body, status, error] of cases) {
    mock.method(globalThis, "fetch", async () =>
      Response.json(body, { status }),
    );
    await assert.rejects(fetchWeek(district, week, fresh), error);
  }
});

test("fails loudly when a response has no records array", async () => {
  api.calendar = { recordz: [] };
  await assert.rejects(
    fetchWeek(district, week, fresh),
    /GetCalendarMenus: no records/,
  );
});
