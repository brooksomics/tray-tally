import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { normalize } from "../src/platforms/etrition-normalize.ts";
import type {
  CalendarRecord,
  RecipeRecord,
} from "../src/platforms/etrition-normalize.ts";
import type { EtritionDistrict, Item } from "../src/types.ts";

const read = (path: string) =>
  JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const district: EtritionDistrict = read("districts.json").districts[0];
const calendar: CalendarRecord[] = read(
  "fixtures/etrition/Escondido_GetCalendarMenus.json",
).records;
const recipes: RecipeRecord[] = read(
  "fixtures/etrition/Escondido_GetRecipes.json",
).records;
const items = normalize(district, calendar, recipes);

function find(date: string, menu: string, name: string): Item {
  const hit = items.find(
    (i) => i.date === date && i.menu === menu && i.item === name,
  );
  assert.ok(hit, `${date} / ${menu} / ${name}`);
  return hit;
}

test("crumb cake 2026-10-05: 19 g added sugar in 283 kcal, no flags", () => {
  const cake = find("2026-10-05", "Elementary Breakfast", "Cake,Crumb");
  const { addedSugarG, kcal, flags, meal, district: id } = cake;
  assert.deepEqual(
    { addedSugarG, kcal, flags, meal, id },
    { addedSugarG: 19, kcal: 283, flags: [], meal: "breakfast", id: "0612880" },
  );
});

test("chocolate milk: added sugar stays null and is flagged", () => {
  const milk = find(
    "2026-10-05",
    "Elementary Breakfast",
    "Fat Free Chocolate Milk",
  );
  assert.equal(milk.addedSugarG, null);
  assert.equal(milk.sugarG, 18.008);
  assert.deepEqual(milk.flags, ["missing_added_sugar"]);
});

test("an item over its meal's calorie max is flagged suspect, not dropped", () => {
  const breads = "Vanilla & Chocolate Chip Breakfast Breads";
  const hit = find("2026-10-06", "Elementary Breakfast", breads);
  assert.deepEqual([hit.kcal, hit.flags], [733.494, ["suspect"]]);
});

test("keeps only the registry's menus, with item names tidied", () => {
  const menus = [...new Set(items.map((i) => i.menu))].sort();
  assert.deepEqual(menus, ["Elementary Breakfast", "Elementary Lunch"]);
  assert.equal(items.length, 60);
  find("2026-10-05", "Elementary Lunch", "1% White Milk"); // was "1% White  Milk "
});

test("a recipe the API didn't return is kept and flagged missing_nutrition", () => {
  const known = new Set(recipes.map((r) => r.recipeID));
  const row = calendar.find(
    (c) => c.menuNameID === 3 && !known.has(c.recipeID),
  );
  assert.ok(row);
  const [item] = normalize(district, [row], recipes);
  assert.deepEqual([item.kcal, item.flags], [null, ["missing_nutrition"]]);
});

test("refuses a recipe in unexpected units rather than store wrong numbers", () => {
  const grams = { ...recipes[0], sodiumUOM: "g" };
  assert.throws(
    () => normalize(district, calendar, [grams]),
    /sodiumUOM is g, expected mg/,
  );
});

const cakeRow = () => {
  const row = calendar.find((c) => c.recipeID === 4938 && c.menuNameID === 2);
  assert.ok(row);
  return row;
};
const cake = recipes.find((r) => r.recipeID === 4938) as RecipeRecord;

test("null calories is flagged missing_nutrition, not passed as clean", () => {
  const [item] = normalize(
    district,
    [cakeRow()],
    [{ ...cake, calories: null }],
  );
  assert.deepEqual([item.kcal, item.flags], [null, ["missing_nutrition"]]);
});

test("joins on the served recipeServingID, not just the recipe", () => {
  const other = { ...cake, recipeServingID: 1, calories: 999 };
  const [item] = normalize(district, [cakeRow()], [cake, other]);
  assert.equal(item.kcal, 283);
});

test("a null value may have a null unit; a wrong type fails loudly", () => {
  const blank = { ...cake, addedSugar: null, addedSugarUOM: null };
  const [item] = normalize(district, [cakeRow()], [blank as never]);
  assert.deepEqual(item.flags, ["missing_added_sugar"]);
  const text = { ...cake, calories: "283" };
  assert.throws(
    () => normalize(district, [cakeRow()], [text as never]),
    /calories is not a number/,
  );
  const row = { ...cakeRow(), menuNameID: "2" };
  assert.throws(
    () => normalize(district, [row as never], recipes),
    /unexpected calendar row/,
  );
});

test("more added-sugar kcal than total kcal is flagged suspect", () => {
  const impossible = { ...cake, addedSugar: 80, calories: 283 }; // 320 kcal of sugar
  const [item] = normalize(district, [cakeRow()], [impossible]);
  assert.deepEqual(item.flags, ["suspect"]);
});
