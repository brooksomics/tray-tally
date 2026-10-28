import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, mock, test } from "node:test";
import { fetchWeek } from "../src/platforms/etrition.ts";
import { normalize } from "../src/platforms/etrition-normalize.ts";
import { entreeTest } from "../src/metrics.ts";
import { runAll } from "../src/runner.ts";
import { summarize } from "../src/summary.ts";
import type { EtritionDistrict, Item } from "../src/types.ts";
import { fakeEtrition, read } from "./fake-etrition.ts";

// SDUSD publishes menus per school; the registry queries one representative
// elementary and everything published is labeled with the district only.
const sdusd: EtritionDistrict = read("districts.json").districts.find(
  (d: EtritionDistrict) => d.id === "0634320",
);
const calendar = read("fixtures/etrition/SDUSDNutrition_GetCalendarMenus.json");
const items = sdusd ? normalize(sdusd, calendar.records, []) : [];

afterEach(() => mock.restoreAll());

test("registry: SDUSD queries one school, not the district-only view", () => {
  assert.ok(sdusd, "SDUSD (NCES 0634320) in districts.json");
  const { site, districtOnly, schoolId } = sdusd.params;
  assert.deepEqual(
    [site, districtOnly, schoolId],
    ["SDUSDNutrition", false, 20],
  );
});

test("tracks breakfast-in-classroom and elementary lunch; not PREK or supper", () => {
  const counts = Object.fromEntries(
    [...Map.groupBy(items, (i) => i.menu)].map(([m, rows]) => [m, rows.length]),
  );
  assert.deepEqual(counts, {
    "Breakfast in the Classroom": 28,
    "Elementary Lunch": 47,
  });
  assert.ok(items.every((i) => i.district === "0634320"));
});

test("the calendar call names the school and turns district-only off", async () => {
  const api = fakeEtrition();
  api.calendar = calendar;
  await fetchWeek(sdusd, ["2026-10-05", "2026-10-09"], {
    cache: {},
    today: "2026-10-08",
  });
  const q = api.calls[1].url.searchParams;
  const got = ["SchoolID", "DistrictOnly", "SchoolTypeID"].map((k) => q.get(k));
  assert.deepEqual(got, ["20", "false", "1"]); // SchoolTypeID 1: UNVERIFIED for SDUSD
  const body = new URLSearchParams(String(api.calls[0].init.body));
  assert.equal(body.get("username"), "omp:SDUSDNutrition");
});

test("published output names the district only, never the school", () => {
  const day = {
    schemaVersion: 1 as const,
    district: sdusd.id,
    date: "2026-10-05",
    firstSeen: "x",
    lastSeen: "x",
    items,
  };
  const text = JSON.stringify(
    summarize([{ district: sdusd, days: [day], changes: 0 }], "2026-10-08"),
  );
  assert.match(text, /San Diego Unified/);
  assert.ok(!/adams|"schoolId"/i.test(text));
  assert.ok(
    sdusd.note && !text.includes(sdusd.note),
    "registry note stays private",
  );
});

test("each SDUSD menu id maps to the right meal and grade band", () => {
  const got = sdusd.menus.map((m) => [m.id, m.meal, m.grades]);
  assert.deepEqual(got, [
    [2, "breakfast", "K-5"],
    [114, "lunch", "K-5"],
  ]);
  assert.ok(
    !sdusd.menus.some((m) => /soft/i.test(m.name)),
    "regular food, not texture-modified",
  );
});

test("the runner's day files carry no school name or id", async () => {
  const api = fakeEtrition();
  api.calendar = calendar;
  const dataDir = mkdtempSync(join(tmpdir(), "sdusd-"));
  await runAll([sdusd], {
    dataDir,
    now: new Date("2026-10-08T10:00:00"),
    log: () => {},
  });
  const dir = join(dataDir, sdusd.id);
  const text = readdirSync(dir)
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .join("");
  assert.ok(text.length > 0 && !/adams|schoolID|schoolName/i.test(text));
});

test("a bad calendar row's error names only the checked fields", () => {
  const row = { ...calendar.records[0], menuNameID: "2" };
  assert.throws(
    () => normalize(sdusd, [row], []),
    (e: Error) =>
      /unexpected calendar row/.test(e.message) &&
      !/adams|schoolID/i.test(e.message),
  );
});

test("SDUSD's main dishes count as entrées (pizza, nuggets, muffins)", () => {
  const isEntree = entreeTest(sdusd.entreeCategories);
  const is = (category: string) => isEntree({ category } as Item);
  const mains = ["Heat and Serve", "Meat/Meat Alternate", "Poultry"];
  // Breakfast: the wrapped muffin/concha/pancake bites is the main item.
  for (const c of [...mains, "IW (individually wrapped)"]) assert.ok(is(c), c);
  for (const c of ["Grains", "Beverages ", "Dairy", "Fruit"])
    assert.ok(!is(c), c);
});
