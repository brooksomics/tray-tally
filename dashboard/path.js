// Path-to-zero math for the AB 1264 high-amounts share. Pure, so tests import it too.

/** Share of the way still to go from `start` to `end` on a date (0 after end). */
const remaining = (/** @type {string} */ start, /** @type {string} */ end) => {
  const t = (/** @type {string} */ d) => new Date(`${d}T12:00:00`).getTime();
  return (/** @type {string} */ d) =>
    Math.max(0, (t(end) - t(d)) / (t(end) - t(start)));
};

const median = (/** @type {number[]} */ xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Path to zero: the median weekly share over the last `windowWeeks` weeks
 * with data (every series shown), then a straight line to 0% on `zeroBy`.
 * @param {{ week: string, mean: number | null }[]} weeks @param {string} zeroBy
 */
export function upfPath(weeks, zeroBy, windowWeeks = 8) {
  const known = weeks.filter((w) => w.mean !== null);
  const recent = [...new Set(known.map((w) => w.week))]
    .sort()
    .slice(-windowWeeks);
  if (!recent.length) return null;
  const level = median(
    known.filter((w) => recent.includes(w.week)).map((w) => Number(w.mean)),
  );
  const [from, to] = [recent[0], /** @type {string} */ (recent.at(-1))];
  const left = remaining(to, zeroBy);
  return {
    median: level,
    from,
    to,
    zeroBy,
    weeks: recent.length,
    at: (/** @type {string} */ d) => level * left(d),
  };
}

/**
 * One plain-language line under the path chart.
 * @param {NonNullable<ReturnType<typeof upfPath>>} path
 * @param {{ phaseOutBy: string, vendorsStop: string }} dates
 */
export function pathCaption(path, dates) {
  const pct = (/** @type {number} */ v) => `${Math.round(v * 100)}%`;
  return (
    `Median weekly share over the last ${path.weeks} weeks shown: ${pct(path.median)}. ` +
    `A straight line from there to 0% by ${dates.vendorsStop} passes ${pct(path.at(dates.phaseOutBy))} on ${dates.phaseOutBy}, when schools must begin phasing these foods out.`
  );
}
