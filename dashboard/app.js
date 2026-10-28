// Dashboard: reads summary.json, renders filters + charts.
// Shaping: data.js / series.js / path.js; charts: charts.js, lines.js; DOM + labels: ui.js.
import { bestItems, bestNote, bestTable } from "./best.js";
import { sodiumChart, sugarChart, trendChart, WIDTH } from "./charts.js";
import * as data from "./data.js";
import { names, pick } from "./highlight.js";
import {
  UPF,
  daySugarOpts,
  fiberOpts,
  proteinOpts,
  weeksOpts,
} from "./lines.js";
import { needsChart } from "./needs-chart.js";
import { pathChart } from "./path-chart.js";
import { pathCaption, upfPath } from "./path.js";
import {
  addedSugarShare,
  entreeFiberDensity,
  menuProteinShare,
  upfShare,
} from "./series.js";
import { scorecard } from "./scorecard-view.js";
import {
  buildForm,
  el,
  filterSummary,
  footerText,
  label,
  readFilter,
  table,
} from "./ui.js";
import { unrecorded, unrecordedNote, unrecordedTable } from "./unrecorded.js";

const param = new URLSearchParams(location.search).get("data");
const DATA = data.dataUrl(param, location.href);
const CHARTS = [
  "needs",
  "scorecard",
  "sugar",
  "weeks",
  "upf",
  "upf-path",
  "fiber",
  "protein",
  "sodium-lunch",
  "sodium-breakfast",
  "offenders",
  "unrecorded",
  "best",
  "day-sugar",
  "day-upf",
  "day-fiber",
  "day-protein",
  "day-sodium-lunch",
  "day-sodium-breakfast",
];
const $ = (id) => document.getElementById(id);

function offendersTable(list) {
  const { head, rows } = data.offenderTable(list);
  return table(head, rows);
}

// A note, then its table when it has rows: "Meets every line"
// and likely unrecorded added sugar.
function noted(note, { head, rows }) {
  const p = el("p", { className: "note", textContent: note });
  return el("div", {}, p, ...(rows.length ? [table(head, rows)] : []));
}

// Path to zero by the 2032 vendor cutoff; an older summary.json has no dates.
function upfPathSection(upf, refs) {
  const dates = refs.caAb1264NutrientCriterion?.dates;
  const path = dates && upfPath(upf, dates.vendorsStop);
  if (!path)
    return el("p", {
      textContent:
        "No path: no weekly share in these filters, or summary.json predates the AB 1264 dates (rerun npm run fetch).",
    });
  const caption = pathCaption(path, dates);
  const chart = pathChart(upf, path, { dates, width: WIDTH });
  return el(
    "div",
    {},
    chart,
    el("p", { className: "note", textContent: caption }),
  );
}

function charts(summary, f, rs) {
  const [upf, refs, zeros] = [upfShare(rs), summary.references, unrecorded(rs)];
  return [
    ["needs", needsChart(rs, refs, f)],
    ["scorecard", scorecard(summary, f, rs)],
    ["sugar", sugarChart(rs)],
    ["weeks", trendChart(data.weeks(summary, f), weeksOpts(refs))],
    ["upf", trendChart(upf, UPF)],
    ["upf-path", upfPathSection(upf, refs)],
    ["fiber", trendChart(entreeFiberDensity(rs), fiberOpts(refs))],
    ["protein", trendChart(menuProteinShare(rs), proteinOpts(refs))],
    ["sodium-lunch", sodiumChart(rs, refs, { meal: "lunch" })],
    ["sodium-breakfast", sodiumChart(rs, refs, { meal: "breakfast" })],
    ["offenders", offendersTable(data.offenders(rs))],
    ["unrecorded", noted(unrecordedNote(zeros), unrecordedTable(zeros))],
    ["best", noted(bestNote(rs, refs, 15), bestTable(bestItems(rs, refs), 15))],
    ...dailyCharts(rs, refs, dayHighlight(rs)),
  ];
}

// The weekly charts per school day; `highlight` districts in color.
function dailyCharts(rs, refs, highlight) {
  const per = "day";
  const daily = (opts) => ({ ...opts, per, highlight });
  const trend = (id, series, opts) => [
    id,
    trendChart(series(rs, per), daily(opts)),
  ];
  return [
    trend("day-sugar", addedSugarShare, daySugarOpts(refs)),
    trend("day-upf", upfShare, UPF),
    trend("day-fiber", entreeFiberDensity, fiberOpts(refs)),
    trend("day-protein", menuProteinShare, proteinOpts(refs)),
    ["day-sodium-lunch", sodiumChart(rs, refs, daily({ meal: "lunch" }))],
    [
      "day-sodium-breakfast",
      sodiumChart(rs, refs, daily({ meal: "breakfast" })),
    ],
  ];
}

// The By-day picks, rebuilt each render because the filters decide which
// districts there are. A pick the filters drop falls back (highlight.js).
function dayHighlight(rs) {
  const { a, b } = $("day-highlight").elements;
  const avail = names(rs);
  const hl = pick(avail, [a.value, b.value]);
  const opts = avail.map((n) => [n, n]);
  fillSelect(a, [...opts, ["*", "All districts"]], hl?.[0] ?? "*");
  fillSelect(b, [["", "no second district"], ...opts], hl?.[1] ?? "");
  b.disabled = !hl;
  return hl;
}

function fillSelect(select, options, value) {
  const option = ([v, t]) => el("option", { value: v, textContent: t });
  select.replaceChildren(...options.map(option));
  select.value = value;
}

function render(summary, all, form) {
  const f = readFilter(form);
  $("filter-summary").textContent = filterSummary(f, summary.districts.length);
  const rs = data.filterRows(all, f);
  const empty = () => el("p", { textContent: "No items match these filters." });
  const out = rs.length
    ? charts(summary, f, rs)
    : CHARTS.map((id) => [id, empty()]);
  for (const [id, node] of out) $(id).replaceChildren(node);
}

function fillText(summary, lastDay) {
  const { caveats, generated } = summary;
  $("generated").textContent =
    `Menus through ${lastDay} (fetched ${generated}). District-level only.`;
  $("caveat-2027").textContent = caveats[0];
  const ca = caveats.find((c) => c.startsWith("California lens"));
  $("caveat-ca").textContent = ca ?? "";
  $("footer").textContent = footerText(summary, [caveats[0], ca]);
}

async function main() {
  const summary = await (await fetch(DATA)).json();
  const all = data.rows(summary);
  const form = $("filters");
  const districts = summary.districts.map((d) => [d.id, label(d)]);
  const dates = all.map((r) => r.date).sort();
  buildForm(form, districts, dates);
  fillText(summary, dates.at(-1));
  form.addEventListener("change", () => render(summary, all, form));
  $("day-highlight").addEventListener("change", () =>
    render(summary, all, form),
  );
  // The daily charts are too dense for a phone: folded there, open elsewhere.
  if (matchMedia("(max-width: 640px)").matches) $("by-day").open = false;
  render(summary, all, form);
}

main().catch((e) => {
  const hint =
    "Serve the repo root (python3 -m http.server) after npm run fetch.";
  $("generated").textContent = `Couldn't load ${DATA}: ${e.message}. ${hint}`;
});
