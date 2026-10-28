import type { RecipeChange } from "../types.ts";
import { checkRecipe } from "./etrition-normalize.ts";
import type { CalendarRecord, RecipeRecord } from "./etrition-normalize.ts";

/** recipes.json: keyed by recipeServingID, the serving a menu row lists. */
export type RecipeCache = Record<
  string,
  { fetchedAt: string; record: RecipeRecord }
>;

export const MAX_IDS = 150; // 3 GetRecipes batches: token + calendar + 3 = 5 requests
const STALE_DAYS = 30; // "monthly" re-fetch, spread over daily runs
// ponytail: one-time catch-up. Entries cached before calcium and iron were
// kept are stale now, once: asking sets fetchedAt, so a recipe the
// API never returns isn't asked every run. Drop when no cache predates it.
const MINERALS_SINCE = "2026-10-23";
const premineral = (c: RecipeCache[string]) =>
  c.fetchedAt < MINERALS_SINCE && !("calcium" in c.record);

// The fields we keep; anything else the API sends is dropped.
const FIELDS: (keyof RecipeRecord)[] = [
  "recipeID",
  "recipeServingID",
  "recipeCategoryDescription",
  "servingSize",
  "calories",
  "caloriesUOM",
  "sugar",
  "sugarUOM",
  "addedSugar",
  "addedSugarUOM",
  "saturatedFat",
  "saturatedFatUOM",
  "dietaryFiber",
  "dietaryFiberUOM",
  "protein",
  "proteinUOM",
  "sodium",
  "sodiumUOM",
  "calcium",
  "calciumUOM",
  "iron",
  "ironUOM",
];

const pick = (r: RecipeRecord) =>
  Object.fromEntries(FIELDS.map((f) => [f, r[f]])) as unknown as RecipeRecord;

function daysBefore(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Recipe IDs to fetch: never seen or still without calories first, then
 * cached ones 30+ days old, oldest first.
 */
export function planFetch(
  rows: CalendarRecord[],
  cache: RecipeCache,
  today: string,
): number[] {
  const unseen = rows
    .filter((r) => (cache[r.recipeServingID]?.record.calories ?? null) === null)
    .map((r) => r.recipeID);
  const cutoff = daysBefore(today, STALE_DAYS);
  const stale = Object.values(cache)
    .filter((c) => c.fetchedAt <= cutoff || premineral(c))
    .sort(
      (a, b) =>
        a.fetchedAt.localeCompare(b.fetchedAt) ||
        a.record.recipeID - b.record.recipeID,
    )
    .map((c) => c.record.recipeID);
  return [...new Set([...unseen, ...stale])].slice(0, MAX_IDS);
}

function diff(
  old: RecipeRecord,
  now: RecipeRecord,
  date: string,
): RecipeChange[] {
  const { recipeID, recipeServingID } = now;
  // `f in old`: a field added to FIELDS later fills in silently, not as a change.
  return FIELDS.filter((f) => f in old && old[f] !== now[f]).map((field) => ({
    date,
    recipeID,
    recipeServingID,
    field,
    from: old[field],
    to: now[field],
  }));
}

// Asked-for but not returned still counts as checked, so it can't starve the queue.
function markAsked(cache: RecipeCache, ids: number[], today: string) {
  const next: RecipeCache = {};
  for (const [key, c] of Object.entries(cache)) {
    next[key] = ids.includes(c.record.recipeID)
      ? { ...c, fetchedAt: today }
      : c;
  }
  return next;
}

function problem(r: RecipeRecord): string | null {
  try {
    checkRecipe(r);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

export interface Merged {
  cache: RecipeCache;
  changes: RecipeChange[];
  rejected: string[]; // malformed records: not cached, old entry kept
}

/** Fold fetched recipes into the cache; changed values are reformulations or data fixes. */
export function mergeRecipes(
  cache: RecipeCache,
  fetched: { ids: number[]; records: RecipeRecord[] },
  today: string,
): Merged {
  // An empty reply is more likely a glitch than every recipe vanishing.
  const next = fetched.records.length
    ? markAsked(cache, fetched.ids, today)
    : { ...cache };
  const rejected = fetched.records.map(problem).filter((p) => p !== null);
  const changes: RecipeChange[] = [];
  for (const raw of fetched.records.filter((r) => problem(r) === null)) {
    const record = pick(raw);
    const key = String(record.recipeServingID);
    if (cache[key]) changes.push(...diff(cache[key].record, record, today));
    next[key] = { fetchedAt: today, record };
  }
  return { cache: next, changes, rejected };
}
