// Which districts the daily charts draw in color; the rest go grey, for
// context, so one or two districts' days read without the overplotting.
// Pure, so tests import it too.

/** Each district once, sorted: the order Plot gives a legend. */
export const names = (rows) =>
  [...new Set(rows.map((r) => r.districtName))].sort();

/**
 * The viewer's picks still in `avail`, once each; else the first district.
 * "*" (all districts) means no highlight: null.
 */
export function pick(avail, wanted) {
  if (wanted[0] === "*") return null;
  const kept = [...new Set(wanted)].filter((n) => avail.includes(n));
  return kept.length ? kept : avail.slice(0, 1);
}

export function split(rows, highlight) {
  const on = (r) => highlight.includes(r.districtName);
  return { focus: rows.filter(on), context: rows.filter((r) => !on(r)) };
}
