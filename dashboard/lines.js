// Chart options: reference lines (value, dash, label) and date ticks. Pure,
// so tests import it too.
// Line values and sources live in summary.json's references.
const [US, PEER] = ["4,4", "1,3"]; // dashed, dotted
const pct = (r) => r && `${Math.round(r.value * 100)}%`;

// Y-axis labels say which way is good, for readers who skip the notes.
const [lower, higher] = [" · lower is better", " · higher is better"];
export const Y = {
  sugar: `added sugar, % of calories${lower}`,
  itemSugar: `added sugar per item (g)${lower}`,
  upf: `% of items (milk left out)${lower}`,
  path: `% of items${lower}`,
  fiber: `fiber per 1,000 kcal (g)${higher}`,
  protein: "protein, % of calories · best between the dashed lines",
  sodium: `sodium per 1,000 kcal (mg)${lower}`,
};

export const weeksOpts = (refs) => ({
  y: "meanAddedSugarShareKcal",
  label: Y.sugar,
  percent: true,
  hollow: (d) => d.under10Percent === null,
  rules: [
    {
      value: refs.usdaWeeklyAddedSugarShare?.value,
      dash: US,
      label: `US 2027 rule, WHO: ${pct(refs.usdaWeeklyAddedSugarShare)}`,
    },
    {
      value: refs.freeSugarsFivePercentShare?.value,
      dash: PEER,
      label: `WHO (conditional), UK: ${pct(refs.freeSugarsFivePercentShare)}`,
    },
  ],
});
// Per day: the weekly chart's lines; hollow under the weekly verdict's
// coverage bar (src/metrics.ts MIN_COVERAGE = 0.5).
export const daySugarOpts = (refs) => ({
  ...weeksOpts(refs),
  y: "mean",
  hollow: (d) => d.known < d.n / 2,
});
export const UPF = {
  y: "mean",
  label: Y.upf,
  percent: true,
};
export const fiberOpts = (refs) => ({
  y: "mean",
  label: Y.fiber,
  rules: [
    {
      value: refs.fiberPer1000KcalG?.value,
      dash: US,
      label: `US: ${refs.fiberPer1000KcalG?.value}`,
    },
    {
      value: refs.whoFiberPer1000KcalG?.value,
      dash: PEER,
      label: `WHO: ${refs.whoFiberPer1000KcalG?.value}`,
    },
  ],
});

// Protein (food-84z): a range's two ends, dashed for the US (ages 4–18, a whole day's
// eating), dotted for Japan (per lunch).
const range = (ref, name, dash) =>
  [ref?.value, ref?.max].map((value) => ({
    value,
    dash,
    label: `${name}: ${pct({ value })}`,
  }));
export const proteinOpts = (refs) => ({
  y: "mean",
  label: Y.protein,
  percent: true,
  rules: [
    ...range(refs.proteinRangeShare, "US, ages 4–18", US),
    ...range(refs.japanLunchProteinRangeShare, "Japan lunch", PEER),
  ],
});

// Sodium: dashed US K-5 limits (now, from 2027-07-01); dotted Japan, lunch only.
const line = (dash) => (ref, name) => ({
  value: ref?.value,
  dash,
  label: `${name}: ${ref?.value?.toLocaleString("en-US")}`,
});
const [us, peer] = [line(US), line(PEER)];
export const SODIUM_RULES = {
  lunch: (refs) => [
    us(refs.usdaLunchSodiumPer1000KcalMg, "US now"),
    us(refs.usdaLunch2027SodiumPer1000KcalMg, "US from 2027-07"),
    peer(refs.japanLunchSodium8to9Per1000KcalMg, "Japan 8–9 y"),
    peer(refs.japanLunchSodium6to7Per1000KcalMg, "Japan 6–7 y"),
    peer(refs.japanLunchSodium10to11Per1000KcalMg, "Japan 10–11 y"),
  ],
  breakfast: (refs) => [
    us(refs.usdaBreakfastSodiumPer1000KcalMg, "US now"),
    us(refs.usdaBreakfast2027SodiumPer1000KcalMg, "US from 2027-07"),
  ],
};

/**
 * Shape by meal: lunch circles, breakfast triangles. A legend only when both
 * meals show (the sodium charts draw one meal each).
 * @param {{ meal: string }[]} rows
 */
export const mealSymbols = (rows) => ({
  domain: ["lunch", "breakfast"],
  range: ["circle", "triangle"],
  legend: new Set(rows.map((d) => d.meal)).size > 1,
});

/**
 * Mondays to tick: the weeks shown, about one per 70 px, always the last.
 * @param {string[]} weeks Mondays, YYYY-MM-DD, any order @param {number} width
 */
export const mondayTicks = (weeks, width) => {
  const ws = [...new Set(weeks)].sort();
  const step = Math.ceil((ws.length * 70) / width);
  return ws.filter((_, i) => (ws.length - 1 - i) % step === 0);
};
