// Weekly and daily series for the charts. Pure, so tests import it too.
/** @typedef {import("./data.js").Row} Row */

const NOT_A_DRINK = /chip|muffin|pancake|cookie|bread|bar\b/i;
/** Milk by name: SDUSD files it as "Beverages ", EUSD as "DAIRY". @param {Row} r */
export const isMilk = (r) =>
  /\bmilk\b/i.test(r.item) && !NOT_A_DRINK.test(r.item);
const sum = (/** @type {number[]} */ xs) => xs.reduce((a, b) => a + b, 0);
const mean = (/** @type {number[]} */ xs) =>
  xs.length ? sum(xs) / xs.length : null;
/** Σ a ÷ Σ kcal, times scale (sodium: per 1,000 kcal; protein: 4 kcal/g). */
const pooled =
  (/** @type {number} */ scale) => (/** @type {[number, number][]} */ ps) =>
    ps.length
      ? (scale * sum(ps.map((p) => p[0]))) / sum(ps.map((p) => p[1]))
      : null;

/** @param {string} date YYYY-MM-DD, local */
export function mondayOf(date) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toLocaleDateString("en-CA");
}

/**
 * combine(values) per district + menu + week, or + school day when per is
 * "day"; null values are left out. Every point carries its week's Monday.
 * @template T
 * @param {Row[]} rs
 * @param {{ value: (r: Row) => T | null | undefined, combine: (vals: T[]) => number | null }} metric
 * @param {"week" | "day"} per
 */
function grouped(rs, { value, combine }, per) {
  const at = (/** @type {Row} */ r) =>
    per === "day" ? r.date : mondayOf(r.date);
  const groups = Map.groupBy(rs, (r) => `${r.district}|${r.menu}|${at(r)}`);
  return [...groups].map(([key, g]) => {
    const [district, menu, when] = key.split("|");
    const vals = g.map(value).filter((v) => v !== null && v !== undefined);
    return {
      ...{ district, districtName: g[0].districtName, menu, meal: g[0].meal },
      ...{ week: mondayOf(when), date: per === "day" ? when : undefined },
      ...{ n: g.length, known: vals.length, mean: combine(vals) },
    };
  });
}

/**
 * Share of items meeting AB 1264's high-amounts test, per week. Milk is left
 * out: Class 1 milk is outside the UPF definition (HSC §104661(b)(5)).
 * @param {Row[]} rs
 */
export const upfShare = (rs, per = "week") =>
  grouped(
    rs.filter((r) => !isMilk(r)),
    {
      value: (r) =>
        r.ab1264NutrientCriterion === null
          ? null
          : Number(r.ab1264NutrientCriterion),
      combine: mean,
    },
    per,
  );

/**
 * Each entrée's fiber per 1,000 kcal, averaged per week: size-neutral, so a
 * small breakfast and a big lunch compare fairly. No kcal: left out.
 * @param {Row[]} rs
 */
export const entreeFiberDensity = (rs, per = "week") =>
  grouped(
    rs.filter((r) => r.entree === true), // set by summary.ts
    {
      value: (r) =>
        r.fiberG === null || !(Number(r.kcal) > 0)
          ? null
          : (r.fiberG * 1000) / Number(r.kcal),
      combine: mean,
    },
    per,
  );

/**
 * Sodium per 1,000 kcal of the week's menu as one tray: total sodium over
 * total kcal of every item offered. A meal's own density is that ratio over
 * its items, so a per-meal limit ÷ meal kcal compares. Items without sodium
 * or kcal, or flagged suspect_sodium, are left out of both sums.
 * @param {Row[]} rs
 */
export const menuSodiumDensity = (rs, per = "week") =>
  grouped(
    rs,
    {
      value: (r) =>
        typeof r.sodiumMg !== "number" ||
        !(Number(r.kcal) > 0) ||
        r.flags.includes("suspect_sodium") // a likely entry error (summary.ts)
          ? null
          : /** @type {[number, number]} */ ([r.sodiumMg, Number(r.kcal)]),
      combine: pooled(1000),
    },
    per,
  );

/**
 * Protein's share of the menu's kcal as one tray, at 4 kcal per gram: total
 * protein over total kcal of every item offered, as menuSodiumDensity. Items
 * without protein or kcal are left out of both sums.
 * @param {Row[]} rs
 */
export const menuProteinShare = (rs, per = "week") =>
  grouped(
    rs,
    {
      value: (r) =>
        typeof r.proteinG !== "number" || !(Number(r.kcal) > 0)
          ? null
          : /** @type {[number, number]} */ ([r.proteinG, Number(r.kcal)]),
      combine: pooled(4),
    },
    per,
  );

/**
 * Mean added-sugar share of kcal over the items that have one: the weekly
 * chart's measure (summary.ts weekStats), per school day. `known` / `n` is
 * its coverage.
 * @param {Row[]} rs
 */
export const addedSugarShare = (rs, per = "week") =>
  grouped(rs, { value: (r) => r.addedSugarShareKcal, combine: mean }, per);
