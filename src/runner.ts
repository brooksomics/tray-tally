import { existsSync } from "node:fs";
import { join } from "node:path";
import { weekOf, ymd } from "./dates.ts";
import * as etrition from "./platforms/etrition.ts";
import * as schoolcafe from "./platforms/schoolcafe.ts";
import type { Merged, RecipeCache } from "./platforms/etrition-cache.ts";
import type { IngredientCache } from "./platforms/schoolcafe-ingredients.ts";
import { readJson, writeJson } from "./store.ts";
import type { District, Item, RecipeChange } from "./types.ts";

export interface RunOptions {
  dataDir: string;
  now: Date;
  week?: [string, string]; // default: now's week (backfill passes a past one)
  log: (line: string) => void;
}

const byMenuThenItem = (a: Item, b: Item) =>
  a.menu.localeCompare(b.menu) ||
  a.item.localeCompare(b.item) ||
  a.sourceId.localeCompare(b.sourceId) ||
  JSON.stringify(a).localeCompare(JSON.stringify(b)); // full tie-break: stable files

/**
 * data/<district>/<date>.json per day with items. Overwritten (menus change
 * after publication; git keeps every version), firstSeen kept. Returns notes.
 */
function writeDays(dir: string, items: Item[], today: string): string[] {
  const notes: string[] = [];
  for (const [date, day] of Map.groupBy(items, (i) => i.date)) {
    const path = join(dir, `${date}.json`);
    const old = readJson<{ firstSeen: string; items: Item[] } | null>(
      path,
      null,
    );
    if (old && day.length < old.items.length) {
      notes.push(`${date}: ${old.items.length} -> ${day.length} items`);
    }
    const head = { schemaVersion: 1, district: day[0].district, date };
    const seen = { firstSeen: old?.firstSeen ?? today, lastSeen: today };
    writeJson(path, { ...head, ...seen, items: day.sort(byMenuThenItem) });
  }
  return notes;
}

function appendChanges(path: string, changes: RecipeChange[]): void {
  if (changes.length === 0) return;
  const old = readJson(path, { changes: [] as RecipeChange[] }).changes;
  writeJson(path, { schemaVersion: 1, changes: [...old, ...changes] });
}

// SchoolCafé's ingredients ride in the same file.
function saveRecipes(
  dir: string,
  run: Merged & { ingredients?: IngredientCache },
): void {
  // Changes before cache: if this write fails, the old cache re-detects them.
  appendChanges(join(dir, "changes.json"), run.changes);
  // Integer-like keys enumerate in ascending order, so this output is stable.
  const { ingredients } = run;
  writeJson(join(dir, "recipes.json"), {
    ...{ schemaVersion: 1, recipes: run.cache },
    ...(ingredients && { ingredients }),
  });
}

const weekdays = ([monday]: [string, string]) =>
  [0, 1, 2, 3, 4].map((i) => {
    const d = new Date(`${monday}T12:00:00`);
    d.setDate(d.getDate() + i);
    return ymd(d);
  });

// A weekday can be empty because there's no school (informational). A stored
// day that is empty now keeps its old file, which is still published: warn.
function missingDays(dir: string, week: [string, string], items: Item[]) {
  const dates = new Set(items.map((i) => i.date));
  const missing = weekdays(week).filter((day) => !dates.has(day));
  const kept = missing.filter((day) => existsSync(join(dir, `${day}.json`)));
  return [
    ...(missing.length ? [`no items: ${missing.join(", ")}`] : []),
    ...kept.map((day) => `WARNING: ${day} has no items now; old file kept`),
  ];
}

// A silent week is a break or stale ids; one silent menu, a stale menu id.
function staleWarnings(d: District, items: Item[]): string[] {
  const served = new Set(items.map((i) => i.menu));
  if (!served.size)
    return [
      "WARNING: no tracked items this week (a break, or stale school/menu ids?)",
    ];
  return d.menus
    .filter((m) => !served.has(m.name))
    .map((m) => `WARNING: no items this week on "${m.name}" (stale menu id?)`);
}

type Caches = { recipes: RecipeCache; ingredients?: IngredientCache };
const EMPTY: Caches = { recipes: {} };
// What every adapter returns; SchoolCafé adds ingredients and warnings.
type Run = Merged & {
  items: Item[];
  asked: number;
  got: number;
  ingredients?: IngredientCache;
  warnings?: string[];
};

// One adapter per menu platform; each returns the same shape.
function fetchFor(
  d: District,
  week: [string, string],
  state: { cache: RecipeCache; today: string; ingredients?: IngredientCache },
): Promise<Run> {
  if (d.platform === "schoolcafe") return schoolcafe.fetchWeek(d, week, state);
  if (d.platform === "etrition") return etrition.fetchWeek(d, week, state);
  throw new Error(`unknown platform ${(d as { platform: string }).platform}`);
}

async function runDistrict(d: District, opts: RunOptions) {
  const dir = join(opts.dataDir, d.id);
  const [today, week] = [ymd(opts.now), opts.week ?? weekOf(opts.now)];
  const { recipes, ingredients } = readJson(join(dir, "recipes.json"), EMPTY);
  const run = await fetchFor(d, week, { cache: recipes, today, ingredients });
  saveRecipes(dir, run);
  const items = run.items.filter((i) => i.date >= week[0] && i.date <= week[1]);
  const notes = [
    ...writeDays(dir, items, today),
    ...missingDays(dir, week, items),
    ...staleWarnings(d, items),
    ...(run.warnings ?? []),
  ];
  const counts = `recipes asked ${run.asked}, got ${run.got}; ${run.changes.length} changes`;
  opts.log([`${d.id}: ${items.length} items`, counts, ...notes].join("; "));
  const [first] = run.rejected;
  if (first)
    throw new Error(`${run.rejected.length} recipe(s) rejected: ${first}`);
}

/** Each district in turn; one failing doesn't stop the rest. Returns failures. */
export async function runAll(districts: District[], opts: RunOptions) {
  let failed = 0;
  for (const d of districts) {
    try {
      await runDistrict(d, opts);
    } catch (e) {
      failed++;
      opts.log(`${d.id}: FAILED: ${(e as Error).message}`);
    }
  }
  return failed;
}
