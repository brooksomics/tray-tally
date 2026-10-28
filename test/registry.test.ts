import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CALORIES } from "../src/rules/federal.ts";
import type { District } from "../src/types.ts";

const registry = new URL("../districts.json", import.meta.url);
const { schemaVersion, districts } = JSON.parse(readFileSync(registry, "utf8"));

// Published next to the menus, so every number needs its year and source.
function checkWealth(d: District): void {
  for (const [k, w] of Object.entries(d.wealth ?? {})) {
    const ok = typeof w.value === "number" && w.year && w.source;
    assert.ok(ok, `${d.id}: wealth.${k} needs value, year, source`);
  }
  assert.equal(
    typeof d.wealth?.frpmPercent?.value,
    "number",
    `${d.id}: FRPM %`,
  );
}

// eTrition per-school needs a numeric schoolId; SchoolCafé a GUID + meal types.
function checkPlatform(d: District): void {
  if (d.platform === "etrition") {
    const ok = d.params.districtOnly || Number.isInteger(d.params.schoolId);
    assert.ok(ok, `${d.id}: a per-school district needs a schoolId`);
    return;
  }
  assert.equal(d.platform, "schoolcafe", `${d.id}: platform`);
  assert.match(d.params.schoolId, /^[0-9a-f-]{36}$/, `${d.id}: schoolId GUID`);
  assert.ok(
    d.menus.every((m) => m.mealType),
    `${d.id}: menus need mealType`,
  );
}

// An estimate stands in for an unpublished value, so it must say why.
function checkEstimates(d: District): void {
  for (const e of d.addedSugarEstimates ?? []) {
    const ok = e.sourceId && e.item && e.addedSugarG >= 0 && e.basis;
    assert.ok(ok, `${d.id}: estimate needs sourceId, item, addedSugarG, basis`);
  }
}

function checkDistrict(d: District): void {
  assert.match(d.id, /^\d{7}$/, `${d.id}: NCES LEAID is 7 digits`);
  checkPlatform(d);
  checkWealth(d);
  checkEstimates(d);
  const menuIds = d.menus.map((m) => m.id);
  assert.equal(new Set(menuIds).size, menuIds.length, `${d.id}: menu ids`);
  for (const m of d.menus) {
    assert.ok(["breakfast", "lunch"].includes(m.meal), `${m.name}: meal`);
    assert.ok(m.grades in CALORIES, `${m.name}: grades ${m.grades}`);
  }
}

// TK-12 meals are universal and TK eats the elementary menu; preschool menus
// follow CACFP (7 CFR 226.20), which our K-12 benchmarks don't fit.
test("TK and up only: no preschool menus in the registry", () => {
  for (const d of districts as District[])
    for (const m of d.menus) {
      assert.equal(m.grades, "K-5", `${d.id} ${m.name}`);
      assert.doesNotMatch(m.name, /preschool|prek/i, `${d.id} ${m.name}`);
    }
});

// districts.json is hand-edited; a typo here would silently skip checks.
test("districts.json entries are well-formed", () => {
  assert.equal(schemaVersion, 1);
  const ids = districts.map((d: District) => d.id);
  assert.equal(new Set(ids).size, ids.length, "district ids unique");
  for (const d of districts) checkDistrict(d);
});
