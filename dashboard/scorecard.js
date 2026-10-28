// The page's top summary: how often menus meet each line. A
// verdict per check + district + meal + week; per district, the share of
// judged weeks met; overall, the mean of district shares, so a district with
// more weeks of data doesn't count more. Pure, so tests import it too.
/** @typedef {import("./data.js").Row} Row */
/** @typedef {import("./data.js").Summary} Summary */
/** @typedef {import("./data.js").Filter} Filter */
/** @typedef {{ check: string, district: string, meal: string, week: string, met: boolean | null }} Verdict */

import * as data from "./data.js";
import {
  entreeFiberDensity,
  menuProteinShare,
  menuSodiumDensity,
} from "./series.js";

export const MEALS = ["breakfast", "lunch"];
const EPS = 1e-9; // as weekStats and best.js: exactly on a line counts as on it
const cap = (/** @type {string} */ s) => s[0].toUpperCase() + s.slice(1);

// Fiber, protein and sodium: each line's reference, the weekly series it
// reads, and how a week's value meets it. A line summary.json lacks is left out.
const LINES = [
  [
    "fiber",
    () => "fiberPer1000KcalG",
    entreeFiberDensity,
    (v, ref) => v >= ref.value - EPS,
  ],
  [
    "protein",
    () => "proteinRangeShare",
    menuProteinShare,
    (v, ref) => v >= ref.value - EPS && v <= ref.max + EPS,
  ],
  [
    "sodium",
    (m) => `usda${cap(m)}SodiumPer1000KcalMg`,
    menuSodiumDensity,
    (v, ref) => v <= ref.value + EPS,
  ],
  [
    "sodium2027",
    (m) => `usda${cap(m)}2027SodiumPer1000KcalMg`,
    menuSodiumDensity,
    (v, ref) => v <= ref.value + EPS,
  ],
];

/** Sugar: the summary's own weekly verdict (under 10%, coverage rule kept). */
function sugarVerdicts(summary, f) {
  const meals = new Map(
    summary.districts.flatMap((d) =>
      d.series.map((s) => [`${d.name}|${s.menu}`, s.meal]),
    ),
  );
  return data.weeks(summary, f).map((w) => ({
    ...{ check: "sugar", district: w.districtName, week: w.week },
    ...{
      meal: meals.get(`${w.districtName}|${w.menu}`),
      met: w.under10Percent,
    },
  }));
}

/**
 * A verdict (true, false, or null: too little data) per check + district +
 * meal + week, for the filtered rows.
 * @param {Summary} summary @param {Filter} f @param {Row[]} rs filtered
 * @returns {Verdict[]}
 */
export function verdicts(summary, f, rs) {
  const refs = summary.references ?? {};
  const lines = MEALS.filter((m) => f.meals.has(m)).flatMap((meal) =>
    LINES.flatMap(([check, key, weekly, meets]) => {
      const ref = refs[key(meal)];
      if (ref?.value === undefined) return [];
      return weekly(rs.filter((r) => r.meal === meal)).map((w) => ({
        ...{ check, district: w.districtName, meal, week: w.week },
        met: w.mean === null ? null : meets(w.mean, ref),
      }));
    }),
  );
  return [...sugarVerdicts(summary, f), ...lines];
}

/**
 * Per check + meal + district: weeks met, weeks judged, and the share (null
 * when no week could be judged).
 * @param {Verdict[]} vs
 */
export function byDistrict(vs) {
  const groups = Map.groupBy(vs, (v) => `${v.check}|${v.meal}|${v.district}`);
  return [...groups.values()].map((g) => {
    const judged = g.filter((v) => v.met !== null).length;
    const met = g.filter((v) => v.met === true).length;
    const { check, meal, district } = g[0];
    return {
      check,
      meal,
      district,
      met,
      judged,
      share: judged ? met / judged : null,
    };
  });
}

/**
 * Per check + meal: the mean of the districts' shares (each district once).
 * @param {ReturnType<typeof byDistrict>} rows
 */
export function overall(rows) {
  const judged = rows.filter((r) => r.share !== null);
  const groups = Map.groupBy(judged, (r) => `${r.check}|${r.meal}`);
  return [...groups.values()].map((g) => ({
    ...{ check: g[0].check, meal: g[0].meal, districts: g.length },
    share: g.reduce((a, r) => a + Number(r.share), 0) / g.length,
  }));
}

/**
 * The overall heading's n: selected districts with at least one judged week.
 * @param {ReturnType<typeof byDistrict>} rows
 */
export const districtCount = (rows) =>
  new Set(rows.filter((r) => r.share !== null).map((r) => r.district)).size;

/**
 * A line's own n, when fewer districts could be judged on it than the
 * heading's n (e.g. one publishes no fiber); "" when it's the same.
 * @param {ReturnType<typeof overall>} all @param {string} check @param {number} n
 */
export function checkN(all, check, n) {
  const mine = all.filter((o) => o.check === check);
  const ns = [...new Set(mine.map((o) => o.districts))];
  if (ns.length === 1 && ns[0] === n) return "";
  if (ns.length <= 1) return ` (n = ${ns[0] ?? 0})`;
  return ` (n = ${mine.map((o) => `${o.districts} ${o.meal}`).join(", ")})`;
}
