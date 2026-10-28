import type { Item } from "../types.ts";
import type { Row } from "./schoolcafe-parse.ts";

// SchoolCafé ingredients: only CalendarView/GetDailyMenuitems
// carries SubIngredientsDisplay, one day and meal type per call. Pure, no I/O.
// ponytail: a known list is never refreshed; add a stale check like recipes'
// 30 days if a district's ingredients turn out to change.
const RETRY_DAYS = 7; // asked, no answer (blank, missing, failed): ask again after

/** recipes.json "ingredients": SubIngredientsDisplay per MenuItemId (null: none published). */
export type IngredientCache = Record<
  string,
  { fetchedAt: string; ingredients: string | null }
>;

type Raw = { MenuItemId?: unknown; SubIngredientsDisplay?: unknown };

/** GetDailyMenuitems reply ({ENTREE: [...], FRUIT: [...]}) -> MenuItemId -> ingredients. */
export function parseDaily(reply: unknown): Map<number, string | null> {
  const lists = Object.values((reply ?? []) as Record<string, unknown>);
  if (Array.isArray(reply) || !lists.every(Array.isArray))
    throw new Error("SchoolCafe daily: unexpected reply");
  const out = new Map<number, string | null>();
  for (const i of lists.flat() as Raw[]) {
    if (!Number.isInteger(i?.MenuItemId))
      throw new Error("SchoolCafe daily: unexpected menu item");
    const text = String(i.SubIngredientsDisplay ?? "").trim();
    if (i.MenuItemId !== 0) out.set(i.MenuItemId as number, text || null);
  }
  return out;
}

function retryCutoff(today: string): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - RETRY_DAYS);
  return d.toISOString().slice(0, 10);
}

/**
 * The day and meal type with the most items lacking ingredients (earliest on
 * a tie), with the ids that call should answer; null when none lack them.
 * Lacking: never asked, or asked RETRY_DAYS or more ago without an answer.
 */
export function planDaily(rows: Row[], cache: IngredientCache, today: string) {
  const cutoff = retryCutoff(today);
  const due = (id: number) =>
    !cache[id] ||
    (cache[id].ingredients === null && cache[id].fetchedAt <= cutoff);
  const missing = rows.filter((r) => due(r.id));
  const groups = Map.groupBy(missing, (r) => `${r.date}|${r.menuId}`);
  const [most] = [...groups.values()].sort(
    (a, b) => b.length - a.length || a[0].date.localeCompare(b[0].date),
  );
  if (!most) return null;
  const { date, menuId } = most[0];
  const day = rows.filter((r) => r.date === date && r.menuId === menuId);
  return { date, menuId, ids: day.map((r) => r.id) };
}

/**
 * Fold one daily reply into the cache. Every planned id counts as asked: one
 * without an answer is null (asked again after RETRY_DAYS), so a bad day
 * can't hold the plan. A known list is never lost to a blank or a missing row.
 */
export function mergeIngredients(
  cache: IngredientCache,
  reply: { ids: number[]; found: Map<number, string | null> }, // ids: all asked
  today: string,
): IngredientCache {
  const next = { ...cache };
  for (const id of new Set([...reply.ids, ...reply.found.keys()])) {
    const ingredients = reply.found.get(id) ?? null;
    if (ingredients !== null || !next[id]?.ingredients)
      next[id] = { fetchedAt: today, ingredients };
  }
  return next;
}

/** Items with their cached ingredients (null until fetched). */
export function withIngredients(items: Item[], cache: IngredientCache) {
  return items.map((i) => ({
    ...i,
    ingredients: cache[i.sourceId]?.ingredients ?? null,
  }));
}
