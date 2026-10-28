// Path-to-zero chart for the AB 1264 high-amounts share. Browser only (Plot
// is a global from vendor/); the math lives in path.js, where tests reach it.
import { withGaps } from "./data.js";
import { Y } from "./lines.js";

const day = (d) => new Date(`${d}T12:00:00`);
const series = (d) => `${d.districtName} · ${d.menu}`;
const MARKERS = [
  ["phaseOutBy", "phase-out begins"],
  ["vendorsStop", "vendors stop"],
  ["mealsExclude", "out of meals"],
];

// The statute's dates: a faint rule each, labelled up the rule.
function dateMarks(dates) {
  const marks = MARKERS.map(([key, what]) => ({
    x: day(dates[key]),
    label: `${dates[key].slice(0, 4)} ${what}`,
  }));
  const label = { x: "x", text: "label", frameAnchor: "bottom", rotate: -90 };
  return [
    Plot.ruleX(marks, { x: "x", strokeOpacity: 0.35 }),
    Plot.text(marks, { ...label, textAnchor: "start", dx: -5, dy: -4 }),
  ];
}

// Thick: the recent median. Dashed: straight to 0% by the cutoff, then 0%.
function pathMarks(path, dates) {
  const xy = { x: (p) => day(p.d), y: "v" };
  const now = [
    { d: path.from, v: path.median },
    { d: path.to, v: path.median },
  ];
  const ahead = [
    { d: path.to, v: path.median },
    { d: path.zeroBy, v: 0 },
    { d: dates.mealsExclude, v: 0 },
  ];
  const goal = [{ d: dates.phaseOutBy, v: path.at(dates.phaseOutBy) }];
  const pct = (p) => `${Math.round(p.v * 100)}%`;
  return [
    Plot.line(now, { ...xy, strokeWidth: 3 }),
    Plot.line(ahead, { ...xy, strokeDasharray: "4,4" }),
    Plot.dot(goal, { ...xy, fill: "currentColor" }),
    Plot.text(goal, { ...xy, text: pct, dx: 6, textAnchor: "start" }),
  ];
}

/** Weekly shares plus the path to zero, from the first week to 2035. */
export function pathChart(rows, path, { dates, width }) {
  const end = day(dates.mealsExclude);
  end.setMonth(end.getMonth() + 4); // room for the last marker
  const shares = { x: (d) => day(d.week), y: "mean", z: series };
  return Plot.plot({
    width,
    x: {
      label: null,
      domain: [day(rows.map((d) => d.week).sort()[0]), end],
    },
    // percent: true scales values to 0-100 before the domain applies.
    y: { domain: [0, 100], percent: true, grid: true, label: Y.path },
    marks: [
      Plot.line(withGaps(rows, "mean"), { ...shares, stroke: "districtName" }),
      ...pathMarks(path, dates),
      ...dateMarks(dates),
    ],
  });
}
