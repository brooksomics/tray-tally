// Chart builders (Plot is a browser global from vendor/, so browser only).
// Reference-line options live in lines.js; the series math in series.js.
import * as data from "./data.js";
import { SODIUM_RULES, Y, mealSymbols, mondayTicks } from "./lines.js";
import { menuSodiumDensity, mondayOf } from "./series.js";
import { el } from "./ui.js";

// Fit the reading column (phones included), up to 1000 px.
export const WIDTH = Math.max(
  320,
  Math.min(1000, document.body.clientWidth - 32),
);
const day = (d) => new Date(`${d.date ?? d.week}T12:00:00`);
// A line per district + menu; color by district, shape by meal (food-9xf).
const series = (d) => `${d.districtName} · ${d.menu}`;
const DISTRICT = "districtName";
// Ticks on Mondays ("Oct 12"), where a week's dot sits.
const xAxis = (/** @type {string[]} */ weeks, /** @type {string} */ label) => ({
  label,
  ticks: mondayTicks(weeks, WIDTH).map((week) => day({ week })),
  tickFormat: (/** @type {Date} */ d) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
});

export function sugarChart(rs) {
  const title = (d) => `${d.item}\n${d.addedSugarG} g · ${d.menu}`;
  const who = { stroke: "districtName", symbol: "meal" };
  const dots = { ...who, x: day, y: "addedSugarG", tip: true, title };
  return Plot.plot({
    width: WIDTH,
    x: xAxis(
      rs.map((r) => mondayOf(r.date)),
      "day",
    ),
    y: { grid: true, zero: true, label: Y.itemSugar },
    color: { legend: true },
    symbol: mealSymbols(rs),
    marks: [Plot.ruleY([10], { strokeDasharray: "4,4" }), Plot.dot(rs, dots)],
  });
}

// Reference lines, labelled at the right: dashed for the US, dotted for peer
// nations. A line whose value an older summary.json lacks is skipped.
// Returns [lines, labels]: lines go under the data, labels on top of it.
function ruleMarks(rules) {
  const known = rules.filter((r) => r.value !== undefined);
  const label = { y: "value", text: "label", frameAnchor: "right" };
  return [
    known.map((r) => Plot.ruleY([r.value], { strokeDasharray: r.dash })),
    Plot.text(known, { ...label, textAnchor: "end", dy: -6 }),
  ];
}

// Weekly: one line per district + menu, broken where a week has no data.
// Daily: one line per district + menu + week, so weekends break it.
const trendLine = (rows, y, per) =>
  per === "day"
    ? Plot.line(rows, {
        x: day,
        y,
        z: (d) => series(d) + d.week,
        stroke: DISTRICT,
      })
    : Plot.line(data.withGaps(rows, y), {
        x: day,
        y,
        z: series,
        stroke: DISTRICT,
      });

// Hollow points where `hollow(d)` (too little data for a verdict).
function trendMarks(rows, { y, rules = [], hollow = () => false, per }) {
  const who = { stroke: DISTRICT, symbol: "meal", channels: { menu: "menu" } };
  const dot = (fill) => ({ ...who, x: day, y, fill, tip: true });
  const [lines, labels] = ruleMarks(rules);
  return [
    ...lines,
    trendLine(rows, y, per),
    // A literal "none" fill (not a channel value), so it never enters the legend.
    Plot.dot(
      rows.filter((d) => !hollow(d)),
      dot(DISTRICT),
    ),
    Plot.dot(rows.filter(hollow), dot("none")),
    labels,
  ];
}

/** A dot per week (on its Monday), or per school day when opts.per is "day". */
export function trendChart(rows, opts) {
  const { label, percent, per } = opts;
  return Plot.plot({
    width: WIDTH,
    x: xAxis(
      rows.map((d) => d.week),
      per === "day" ? "school day" : "week of (Monday)",
    ),
    y: { grid: true, zero: true, percent, label },
    color: { legend: true },
    symbol: mealSymbols(rows),
    marks: trendMarks(rows, opts),
  });
}

export function sodiumChart(rs, refs, { meal, per = "week" }) {
  const mine = rs.filter((r) => r.meal === meal);
  if (!mine.length)
    return el("p", { textContent: `No ${meal} in these filters.` });
  const opts = { y: "mean", label: Y.sodium, per };
  const rules = SODIUM_RULES[meal](refs);
  return trendChart(menuSodiumDensity(mine, per), { ...opts, rules });
}
