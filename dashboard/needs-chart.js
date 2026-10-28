// The top chart. Browser only (Plot is a global from vendor/); the
// math lives in needs.js, where tests reach it.
import { width } from "./width.js";
import { AGES, NUTRIENTS, needShares } from "./needs.js";
import { el } from "./ui.js";

const MEALS = ["breakfast", "lunch"];
const AGE_FILL = [
  "var(--accent)",
  "color-mix(in srgb, var(--accent) 45%, transparent)",
];

const AT = { x: "share", y: "age", fy: "nutrient", fill: "age" };
// A bar's value at its end; "no data yet" at 0.
const LABEL = { ...AT, x: (r) => r.share ?? 0, fill: "currentColor", dx: 4 };

// Nutrients down the side, a bar per age; dashed at 100%: the whole day.
function plot(rows, text) {
  return Plot.plot({
    width: width(),
    x: { percent: true, grid: true, label: "% of a day's need" },
    y: { axis: null },
    fy: { label: null, axis: "left", domain: NUTRIENTS.map(([name]) => name) },
    color: { domain: AGES.map(([a]) => a), range: AGE_FILL, legend: true },
    marginLeft: 70,
    marginRight: 44, // room for the longest bar's label
    marks: [
      Plot.barX(rows, { ...AT, tip: true }),
      Plot.ruleX([1], { strokeDasharray: "4,4" }),
      Plot.text(rows, { ...LABEL, text, textAnchor: "start" }),
      Plot.ruleX([0]),
    ],
  });
}

/**
 * The selected meals' tray as a share of a day's need, per nutrient and
 * age. "(n = …)" when fewer districts than selected had the data.
 * @param {import("./data.js").Filter} f
 */
export function needsChart(rs, refs, f) {
  const meals = MEALS.filter((m) => f.meals.has(m));
  const rows = needShares(rs, refs, meals);
  if (rows.every((r) => r.share === null))
    return el("p", { textContent: "Too little data in these filters." });
  const all = new Set(rs.map((r) => r.district)).size;
  const n = (r) => (r.districts < all ? ` (n = ${r.districts})` : "");
  const pct = (r) => `${Math.round(r.share * 100)}%${n(r)}`;
  return plot(rows, (r) => (r.share === null ? "no data yet" : pct(r)));
}
