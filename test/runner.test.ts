import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, mock, test } from "node:test";
import { weekOf, weekOfDay } from "../src/dates.ts";
import { runAll } from "../src/runner.ts";
import {
  district,
  fakeEtrition,
  fixture,
  knownCalendar,
} from "./fake-etrition.ts";
import type { FakeApi } from "./fake-etrition.ts";

const thursday = new Date("2026-10-08T10:00:00"); // local time, like launchd
let api: FakeApi;
let dataDir: string;
let log: string[];

beforeEach(() => {
  api = fakeEtrition();
  api.calendar = knownCalendar;
  dataDir = mkdtempSync(join(tmpdir(), "runner-"));
  log = [];
});
afterEach(() => mock.restoreAll());

const run = (now = thursday, districts = [district]) =>
  runAll(districts, { dataDir, now, log: (line) => log.push(line) });
const dir = () => join(dataDir, district.id);
const file = (name: string) => readFileSync(join(dir(), name), "utf8");
const snapshot = () =>
  Object.fromEntries(
    readdirSync(dir())
      .sort()
      .map((f) => [f, file(f)]),
  );

test("weekOf: Monday to Friday of the current week (weekend: the one just ended)", () => {
  assert.deepEqual(weekOf(thursday), ["2026-10-05", "2026-10-09"]);
  assert.deepEqual(weekOf(new Date("2026-10-11T10:00:00")), [
    "2026-10-05",
    "2026-10-09",
  ]);
  assert.deepEqual(weekOf(new Date("2026-10-12T10:00:00")), [
    "2026-10-12",
    "2026-10-16",
  ]);
});

test("weekOfDay: a real calendar date's week; anything else is null", () => {
  assert.deepEqual(weekOfDay("2026-10-08"), ["2026-10-05", "2026-10-09"]);
  for (const bad of ["2026-13-01", "2026-02-31", "2026-10-8", "10/08/2026"])
    assert.equal(weekOfDay(bad), null, bad);
});

test("first run: one file per menu day, a recipe cache, <= 5 requests", async () => {
  assert.equal(await run(), 0);
  const names = readdirSync(dir()).sort();
  assert.deepEqual(names, [
    "2026-10-05.json",
    "2026-10-06.json",
    "2026-10-07.json",
    "recipes.json",
  ]);
  const day = JSON.parse(file("2026-10-05.json"));
  const { schemaVersion, firstSeen, lastSeen } = day;
  assert.deepEqual(
    { schemaVersion, firstSeen, lastSeen },
    { schemaVersion: 1, firstSeen: "2026-10-08", lastSeen: "2026-10-08" },
  );
  assert.ok(day.items.some((i: { item: string }) => i.item === "Cake,Crumb"));
  assert.ok(api.calls.length <= 5);
  assert.match(log.join("\n"), /no items: 2026-10-08, 2026-10-09/);
});

test("idempotent: same day is byte-identical; next day only lastSeen moves", async () => {
  await run();
  const first = snapshot();
  await run();
  assert.deepEqual(snapshot(), first);
  api.calls = [];
  await run(new Date("2026-10-09T10:00:00"));
  assert.equal(api.calls.length, 2, "warm cache: token + calendar only");
  const next = snapshot();
  for (const [name, text] of Object.entries(first)) {
    assert.equal(
      next[name],
      text.replace(/"lastSeen": "2026-10-08"/, '"lastSeen": "2026-10-09"'),
      name,
    );
  }
});

test("a recipe re-fetched after 30 days logs its change", async () => {
  await run();
  api.recipes = fixture.recipes.map((r) =>
    r.recipeID === 4938 ? { ...r, addedSugar: 15 } : r,
  );
  await run(new Date("2026-11-09T10:00:00"));
  // The fake ignores dates: October rows in a November run must not be written.
  assert.match(file("2026-10-05.json"), /"lastSeen": "2026-10-08"/);
  const { changes } = JSON.parse(file("changes.json"));
  assert.deepEqual(changes, [
    {
      date: "2026-11-09",
      recipeID: 4938,
      recipeServingID: 4882,
      field: "addedSugar",
      from: 19,
      to: 15,
    },
  ]);
});

test("one district failing doesn't stop the others", async () => {
  const broken = {
    ...district,
    id: "0000001",
    params: { ...district.params, site: "Broken" },
  };
  api.brokenSites = ["Broken"];
  assert.equal(await run(thursday, [broken, district]), 1);
  assert.ok(readdirSync(dir()).includes("2026-10-05.json"));
  assert.match(log.join("\n"), /0000001: FAILED: eTrition 500/);
});

// A registry typo must fail loudly, not run some other platform's adapter.
test("an unknown platform fails that district, not the run", async () => {
  const odd = { ...district, id: "0000001", platform: "nope" } as never;
  assert.equal(await run(thursday, [odd, district]), 1);
  assert.match(log.join("\n"), /0000001: FAILED: unknown platform nope/);
  assert.ok(readdirSync(dir()).includes("2026-10-05.json"), "the rest ran");
});

test("a corrupt cache fails that district and is left untouched", async () => {
  await run();
  writeFileSync(join(dir(), "recipes.json"), "{ not json");
  assert.equal(await run(), 1);
  assert.equal(file("recipes.json"), "{ not json");
});

const lighterCake = () =>
  fixture.recipes.map((r) =>
    r.recipeID === 4938 ? { ...r, addedSugar: 15 } : r,
  );

test("a malformed recipe still writes the days, then fails the district", async () => {
  api.recipes = fixture.recipes.map((r) =>
    r.recipeID === 4938 ? { ...r, caloriesUOM: "kcal" } : r,
  );
  assert.equal(await run(), 1);
  const day = JSON.parse(file("2026-10-05.json"));
  const cake = day.items.find((i: { item: string }) => i.item === "Cake,Crumb");
  assert.deepEqual(cake.flags, ["missing_nutrition"]);
  assert.match(
    log.join("\n"),
    /FAILED: 1 recipe\(s\) rejected: .*caloriesUOM is kcal/,
  );
});

test("changes.json is written before the cache, so a failure loses nothing", async () => {
  await run();
  writeFileSync(join(dir(), "changes.json"), "<<<<<<< conflict");
  api.recipes = lighterCake();
  const later = new Date("2026-11-09T10:00:00");
  assert.equal(await run(later), 1);
  assert.match(file("recipes.json"), /"addedSugar": 19/);
  writeFileSync(join(dir(), "changes.json"), '{ "changes": [] }');
  assert.equal(await run(later), 0);
  assert.equal(JSON.parse(file("changes.json")).changes[0].to, 15);
});

test("a day that shrinks is logged", async () => {
  await run();
  const records = knownCalendar.records.filter(
    (r: { menuDate: string; menuNameID: number }) =>
      r.menuDate !== "2026-10-05" || r.menuNameID !== 2,
  );
  api.calendar = { records };
  await run();
  assert.match(log.join("\n"), /2026-10-05: \d+ -> \d+ items/);
});

test("a week with no tracked items logs a warning (break, or stale ids)", async () => {
  api.calendar = { records: [] };
  assert.equal(await run(), 0);
  assert.match(log.join("\n"), /WARNING: no tracked items this week/);
});

test("a stored day that now has no items keeps its file and logs a warning", async () => {
  await run();
  const days = knownCalendar.records.map(
    (r: { menuDate: string }) => r.menuDate,
  );
  const gone = [...new Set(days)].sort().at(-1) as string;
  const before = file(`${gone}.json`);
  api.calendar = {
    records: knownCalendar.records.filter(
      (r: { menuDate: string }) => r.menuDate !== gone,
    ),
  };
  log = [];
  assert.equal(await run(), 0);
  assert.match(log[0], new RegExp(`WARNING: ${gone} has no items now`));
  assert.equal(file(`${gone}.json`), before);
});

test("a tracked menu with no items all week logs a warning (stale menu id?)", async () => {
  api.calendar = {
    records: knownCalendar.records.filter(
      (r: { menuNameID: number }) => r.menuNameID !== 3,
    ),
  };
  assert.equal(await run(), 0);
  assert.match(log[0], /WARNING: no items this week on "Elementary Lunch"/);
  assert.doesNotMatch(log[0], /on "Elementary Breakfast"/);
});

test("a past week can be fetched; first/last seen stay the run date", async () => {
  const records = knownCalendar.records.map((r: object) => ({
    ...r,
    menuDate: "2026-09-15",
  }));
  api.calendar = { records };
  const week: [string, string] = ["2026-09-14", "2026-09-18"];
  await runAll([district], {
    dataDir,
    now: thursday,
    week,
    log: (l) => log.push(l),
  });
  const q = api.calls[1].url.searchParams;
  assert.deepEqual([q.get("StartDate"), q.get("EndDate")], week);
  const day = JSON.parse(file("2026-09-15.json"));
  assert.deepEqual([day.firstSeen, day.lastSeen], ["2026-10-08", "2026-10-08"]);
});
