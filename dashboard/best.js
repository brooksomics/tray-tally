// "Meets every line": items that pass every line the page draws, as
// published. Pure, so tests import it too.
/** @typedef {import("./data.js").Row} Row */

const EPS = 1e-9; // as weekStats: exactly on a line is not under it
const SHARE = ["usdaWeeklyAddedSugarShare", "freeSugarsFivePercentShare"];
const GRAMS = ["dgaMealAddedSugarG"];
const FIBER = ["fiberPer1000KcalG", "whoFiberPer1000KcalG"];
/** Values of the lines summary.json has; an older one may lack some. */
const lines = (refs, keys) =>
  keys.map((k) => refs[k]?.value).filter((v) => v !== undefined);

/**
 * Not "high" under AB 1264 (sat fat or added sugar >= 10% of kcal, sodium
 * >= 1 mg/kcal: under every sodium line too), added sugar under the lowest
 * share line and at most the 10 g meal line, fiber at least the highest
 * density line. Missing data (no AB 1264 verdict, no fiber) or a suspect
 * flag: no.
 * @param {Row} r
 */
export function meetsEveryLine(r, refs) {
  if (r.ab1264NutrientCriterion !== false || typeof r.fiberG !== "number")
    return false;
  if (r.flags.some((f) => f.startsWith("suspect"))) return false;
  const share = (Number(r.addedSugarG) * 4) / Number(r.kcal);
  return (
    share < Math.min(...lines(refs, SHARE)) - EPS &&
    Number(r.addedSugarG) <= Math.min(...lines(refs, GRAMS)) + EPS &&
    (1000 * r.fiberG) / Number(r.kcal) >= Math.max(...lines(refs, FIBER)) - EPS
  );
}

/** @param {Row[]} g one district + item */
function bestRow(g) {
  const [r] = g;
  return {
    districtName: r.districtName,
    item: r.item,
    fiber: Math.round((10000 * Number(r.fiberG)) / Number(r.kcal)) / 10,
    kcal: Math.round(Number(r.kcal)),
    days: new Set(g.map((x) => x.date)).size,
  };
}

/**
 * Items meeting every line, one row per district + item, most days first.
 * @param {Row[]} rs
 */
export function bestItems(rs, refs) {
  const passing = rs.filter((r) => meetsEveryLine(r, refs));
  const groups = Map.groupBy(passing, (r) => `${r.district}|${r.item}`);
  return [...groups.values()]
    .map(bestRow)
    .sort((a, b) => b.days - a.days || a.item.localeCompare(b.item));
}

/** @param {ReturnType<typeof bestItems>} list */
export function bestTable(list, n = 15) {
  const head = ["District", "Item", "Fiber per 1,000 kcal (g)", "kcal", "Days"];
  const cells = (o) => [o.districtName, o.item, o.fiber, o.kcal, o.days];
  return { head, rows: list.slice(0, n).map(cells) };
}

const FULL = ["addedSugarG", "saturatedFatG", "sodiumMg", "fiberG"];
/** Entrées (district + item) with full data, and those meeting every line. */
function entrees(rs, refs) {
  const full = (r) =>
    Number(r.kcal) > 0 && FULL.every((k) => typeof r[k] === "number");
  const judged = rs.filter((r) => r.entree === true && full(r));
  const key = (r) => `${r.district}|${r.item}`;
  const pass = judged.filter((r) => meetsEveryLine(r, refs));
  return [new Set(judged.map(key)).size, new Set(pass.map(key)).size];
}

/**
 * The line above the table: how many items pass, and how many entrées.
 * @param {Row[]} rs @param {number} n rows the table shows
 */
export function bestNote(rs, refs, n) {
  const count = bestItems(rs, refs).length;
  if (!count) return "No item in these filters meets every line.";
  const items =
    count === 1
      ? "1 item meets every line."
      : `${count} items meet every line${count > n ? `; the ${n} served most often ${n === 1 ? "is" : "are"} below` : ""}.`;
  const [checked, pass] = entrees(rs, refs);
  if (!checked) return items;
  const of = `the ${checked} ${checked === 1 ? "entrée" : "entrées"} with full data in these filters`;
  const verb = pass === 1 ? "does" : "do";
  return `${items} ${pass ? `${pass} of ${of} ${verb}` : `None of ${of} does`}.`;
}
