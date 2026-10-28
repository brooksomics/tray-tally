// Top-of-page summary as plain HTML: it wraps on phones and
// needs no chart library. The math lives in scorecard.js, where tests reach it.
import {
  MEALS,
  byDistrict,
  checkN,
  districtCount,
  overall,
  verdicts,
} from "./scorecard.js";
import { el } from "./ui.js";

const CHECKS = ["sugar", "fiber", "protein", "sodium", "sodium2027"];
const SHORT = ["Sugar", "Fiber", "Protein", "Sodium now", "Sodium 2027"];
const cap = (/** @type {string} */ s) => s[0].toUpperCase() + s.slice(1);
const pct = (share) => (share === null ? "–" : `${Math.round(share * 100)}%`);

/**
 * Each check's name, with its line's value from summary.json. "Weeks with"
 * so a skimmer reads 100% as every week meeting the line, not all sugar.
 */
export const names = (refs) => ({
  sugar: "Weeks with added sugar under 10% of calories",
  fiber: `Weeks with entrée fiber at least ${refs.fiberPer1000KcalG?.value} g per 1,000 kcal`,
  protein: `Weeks with protein between ${pct(refs.proteinRangeShare?.value)} and ${pct(refs.proteinRangeShare?.max)} of calories`,
  sodium: "Weeks with sodium within today's K-5 limit",
  sodium2027: "Weeks with sodium within the 2027 K-5 limit",
});

const TABLE_NOTE =
  "Share of weeks that met each line, then weeks met / weeks judged. Higher is better; darker cells are higher.";

// Which end is good, laid over the tracks, so no one needs the note for it.
function key() {
  const ends = el(
    "span",
    { className: "ends" },
    el("span", { textContent: "← worse: no week met the line" }),
    el("span", { textContent: "better: every week met it →" }),
  );
  return el("div", { className: "bar key" }, el("span"), ends, el("span"));
}

// A meal's share, drawn to scale on a 0–100% track.
function bar(meal, share) {
  const fill = el("span", { className: "fill" });
  fill.style.width = `${Math.round((share ?? 0) * 100)}%`;
  const track = el("span", { className: "track" }, fill);
  const value = el("b", { textContent: pct(share) });
  return el(
    "div",
    { className: "bar" },
    el("span", { textContent: meal }),
    track,
    value,
  );
}

/** All selected districts: a row per check, a bar per meal. */
function overallView(rows, label, meals) {
  const [all, n] = [overall(rows), districtCount(rows)];
  const share = (check, meal) =>
    all.find((o) => o.check === check && o.meal === meal)?.share ?? null;
  const shown = CHECKS.filter((c) => rows.some((r) => r.check === c));
  const score = (check) =>
    el(
      "div",
      { className: "score" },
      el("p", { textContent: label[check] + checkN(all, check, n) }),
      ...meals.map((m) => bar(cap(m), share(check, m))),
    );
  return el("div", { className: "scores" }, key(), ...shown.map(score));
}

// A district's cell: the share, the weeks behind it, a tint to scale.
function cell(r) {
  if (!r || r.share === null)
    return el("td", { textContent: "–", title: "no week to judge" });
  const td = el(
    "td",
    { title: `${r.met} of ${r.judged} weeks` },
    pct(r.share),
    el("small", { textContent: `${r.met}/${r.judged}` }),
  );
  td.style.background = `color-mix(in srgb, var(--accent) ${Math.round(r.share * 35)}%, transparent)`;
  return td;
}

// Short column heads; the full check name rides in the title.
const headRow = (meal, label) =>
  el(
    "tr",
    {},
    el("th", { textContent: cap(meal) }),
    ...CHECKS.map((c, i) =>
      el("th", { textContent: SHORT[i], title: label[c] }),
    ),
  );

/** One meal: a row per district, a cell per check. */
function districtTable(rows, meal, label) {
  const mine = rows.filter((r) => r.meal === meal);
  const districts = [...new Set(mine.map((r) => r.district))];
  const find = (d, c) => mine.find((r) => r.district === d && r.check === c);
  const head = headRow(meal, label);
  const row = (d) =>
    el(
      "tr",
      {},
      el("td", { textContent: d }),
      ...CHECKS.map((c) => cell(find(d, c))),
    );
  return el("table", { className: "scoretable" }, head, ...districts.map(row));
}

/**
 * The section: all selected districts, then one table per meal by district.
 * @param {import("./data.js").Summary} summary
 * @param {import("./data.js").Filter} f
 * @param {import("./data.js").Row[]} rs filtered
 */
export function scorecard(summary, f, rs) {
  const rows = byDistrict(verdicts(summary, f, rs));
  if (!rows.some((r) => r.share !== null))
    return el("p", {
      textContent: "No week in these filters has enough data to judge.",
    });
  const label = names(summary.references ?? {});
  const meals = MEALS.filter((m) => f.meals.has(m));
  return el(
    "div",
    { className: "scorecard" },
    el("h3", {
      textContent: `All selected districts (n = ${districtCount(rows)})`,
    }),
    overallView(rows, label, meals),
    el("h3", { textContent: "By district" }),
    el("p", { className: "note", textContent: TABLE_NOTE }),
    ...meals.map((m) => districtTable(rows, m, label)),
  );
}
