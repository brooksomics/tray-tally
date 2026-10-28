// Pure data shaping for the dashboard; no DOM, so tests import it too.
// JSDoc types point at the TS source so tsc can type the tests (allowJs).
/** @typedef {ReturnType<typeof import("../src/summary.ts").summarize>} Summary */
/** @typedef {ReturnType<typeof rows>[number]} Row */
/** @typedef {{ districts: Set<string>, meals: Set<string>, from: string, to: string }} Filter */

import { labeler } from "./names.js";
import { mondayOf } from "./series.js";

const DEFAULT_DATA = "../data/summary.json";
const round1 = (x) => Math.round(x * 10) / 10;

/**
 * One row per item per day, with its district, menu, meal and date. A name
 * several items share ("Fruit of the Day") carries its ingredients.
 * @param {Summary} summary
 */
export function rows(summary) {
  return summary.districts.flatMap((d) => {
    const name = labeler(d);
    return d.series.flatMap((s) =>
      s.days.flatMap((day) =>
        day.items.map((i) => ({
          ...i,
          item: name(i),
          ...{ district: d.id, districtName: d.name, date: day.date },
          ...{ menu: s.menu, meal: s.meal, grades: s.grades },
        })),
      ),
    );
  });
}

/**
 * Sets of district ids and meals, plus an inclusive from/to.
 * @param {Row[]} all @param {Filter} f
 */
export function filterRows(all, f) {
  const inRange = (date) =>
    (!f.from || date >= f.from) && (!f.to || date <= f.to);
  return all.filter(
    (r) =>
      f.districts.has(r.district) && f.meals.has(r.meal) && inRange(r.date),
  );
}

/**
 * The summary's own weekly 2027 stats (with its coverage rule), filtered.
 * @param {Summary} summary @param {Filter} f
 */
export function weeks(summary, f) {
  const inRange = (w) =>
    (!f.from || w.week >= mondayOf(f.from)) && (!f.to || w.week <= f.to);
  return summary.districts
    .filter((d) => f.districts.has(d.id))
    .flatMap((d) =>
      d.series
        .filter((s) => f.meals.has(s.meal))
        .flatMap((s) =>
          s.weeks.filter(inRange).map((w) => ({
            ...w,
            ...{ districtName: d.name, menu: s.menu, meal: s.meal },
          })),
        ),
    );
}

/** @param {Row[]} g one district + item */
function offenderRow(g) {
  // kcal from the same row as the sugar: portions differ by menu.
  const top = g.reduce((a, b) => (b.addedSugarG > a.addedSugarG ? b : a));
  // One name can cover many items (SchoolCafé's "Fruit of the Day").
  const same = g.filter((r) => r.sourceId === top.sourceId);
  const days = new Set(same.map((r) => r.date)).size;
  const flagged = (f) => same.some((r) => r.flags.includes(f));
  const kcal = top.kcal === null ? null : Math.round(top.kcal);
  const addedSugarG = round1(top.addedSugarG ?? 0);
  return {
    districtName: top.districtName,
    item: top.item,
    addedSugarG,
    kcal,
    days,
    suspect: flagged("suspect"),
    estimated: flagged("estimated_added_sugar"),
  };
}

/**
 * Items ranked by added sugar (then by days served), one row per district + item.
 * @param {Row[]} rs
 */
export function offenders(rs, n = 15) {
  const groups = Map.groupBy(
    rs.filter((r) => r.addedSugarG !== null),
    (r) => `${r.district}|${r.item}`,
  );
  const ranked = [...groups].map(([, g]) => offenderRow(g));
  return ranked
    .sort((a, b) => b.addedSugarG - a.addedSugarG || b.days - a.days)
    .slice(0, n);
}

/**
 * Worst-offenders cells. "suspect" and "estimated" ride with the item: phones
 * show ~340 px, so a far-right note column ends up off-screen.
 * @param {ReturnType<typeof offenders>} list
 */
export function offenderTable(list) {
  const head = ["District", "Item", "Added sugar (g)", "kcal", "Days"];
  const item = (o) =>
    o.item +
    (o.suspect ? " (suspect)" : "") +
    (o.estimated ? " (estimated)" : "");
  const cells = (o) => [o.districtName, item(o), o.addedSugarG, o.kcal, o.days];
  return { head, rows: list.map(cells) };
}

/** Per-item sugar tip. ahaShare: grams over the AHA's 25 g a day for children. */
export const sugarTip = (/** @type {Row} */ d) =>
  `${d.item}\n${d.addedSugarG} g = ${Math.round(Number(d.ahaShare) * 100)}% of a child's daily limit\n${d.menu}`;

const nextMonday = (/** @type {string} */ week) => {
  const d = new Date(`${week}T12:00:00`);
  d.setDate(d.getDate() + 7);
  return d.toLocaleDateString("en-CA");
};

/**
 * Insert a null-valued week wherever a series skips one, so lines break there
 * instead of bridging a school break or a week without data.
 * @template {{ districtName: string, menu: string, week: string }} W
 * @param {W[]} list @param {string} y
 */
export function withGaps(list, y) {
  const bySeries = Map.groupBy(list, (w) => `${w.districtName}|${w.menu}`);
  return [...bySeries.values()].flatMap((ws) => {
    const have = new Map(ws.map((w) => [w.week, w]));
    const keys = [...have.keys()].sort();
    const out = [];
    for (let wk = keys[0]; wk <= keys.at(-1); wk = nextMonday(wk)) {
      out.push(have.get(wk) ?? { ...ws[0], week: wk, [y]: null });
    }
    return out;
  });
}

/**
 * ?data= may only point at the page's own origin. Resolved the way fetch
 * would, so backslashes, tabs and leading spaces can't sneak past.
 * @param {string | null} param @param {string} page the page's URL
 */
export function dataUrl(param, page) {
  try {
    const url = new URL(param ?? "", page);
    if (param && url.origin === new URL(page).origin) return url.href;
  } catch {
    // unparseable: fall through to the default
  }
  return DEFAULT_DATA;
}
