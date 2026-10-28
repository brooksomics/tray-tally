// Shared test helper (no tests here): a fake SchoolCafé API over the fixtures.
import { mock } from "node:test";
import type { SchoolCafeDistrict } from "../src/types.ts";
import { read } from "./fake-etrition.ts";

const registry: SchoolCafeDistrict = read("districts.json").districts.find(
  (d: { id: string }) => d.id === "0610740",
);
// No pauses between detail calls in tests.
export const dmusd: SchoolCafeDistrict = {
  ...registry,
  params: { ...registry.params, pauseMs: 0 },
};
const weekly: Record<string, unknown> = {
  Breakfast: read("fixtures/schoolcafe/dmusd-weekly-breakfast.json"),
  Lunch: read("fixtures/schoolcafe/dmusd-weekly-lunch.json"),
};
export const cerealBar = read("fixtures/schoolcafe/dmusd-detail-243529.json");

const known: Record<string, unknown> = {
  "243529": cerealBar,
  "146829": read("fixtures/schoolcafe/dmusd-detail-146829.json"),
};

export interface FakeSchoolCafe {
  calls: { url: URL; init: RequestInit }[];
  detail: (id: string) => unknown; // default: fixture details for 2 items, else empty
  daily: (q: URLSearchParams) => unknown; // default: see dailyReply
}

// The real daily fixture for lunch 2026-10-07; any other day is built from
// the weekly fixture, each item's ingredients "Ingredients of <MenuItemId>".
const real = read("fixtures/schoolcafe/daily.json");
type Day = Record<string, { MenuItemId: number }[]>;
export function dailyReply(q: URLSearchParams): unknown {
  const [date, meal] = [q.get("ServingDate") ?? "", q.get("MealType") ?? ""];
  if (date === "2026-10-07" && meal === "Lunch") return real;
  const [y, m, d] = date.split("-").map(Number);
  const day = ((weekly[meal] ?? {}) as Record<string, Day>)[`${m}/${d}/${y}`];
  const fill = (i: { MenuItemId: number }) => ({
    ...i,
    SubIngredientsDisplay: `Ingredients of ${i.MenuItemId}`,
  });
  return Object.fromEntries(
    Object.entries(day ?? {}).map(([cat, items]) => [cat, items.map(fill)]),
  );
}

export function fakeSchoolCafe(): FakeSchoolCafe {
  const api: FakeSchoolCafe = {
    calls: [],
    detail: (id) => known[id] ?? { NutritionalValues: [] },
    daily: dailyReply,
  };
  mock.method(globalThis, "fetch", async (input: string, init: RequestInit) => {
    const url = new URL(input);
    api.calls.push({ url, init });
    const q = url.searchParams;
    const path = url.pathname;
    const body = path.endsWith("/GetWeeklyMenuitems")
      ? weekly[q.get("MealType") ?? ""]
      : path.endsWith("/GetDailyMenuitems")
        ? api.daily(q)
        : api.detail(q.get("MenuItemId") ?? "");
    return body instanceof Response ? body : Response.json(body);
  });
  return api;
}
