// Entrées published at 0 g added sugar with 8 g or more total sugars, flagged
// 'suspect_added_sugar' in summary.ts. Listed so the 0 g the
// charts count isn't read as real. Pure, so tests import it too.
/** @typedef {import("./data.js").Row} Row */

const FLAG = "suspect_added_sugar";
const SUGAR_G = 8; // UNRECORDED_SUGAR_G in src/metrics.ts; a test keeps them equal
const round1 = (x) => Math.round(x * 10) / 10;

/** @param {Row[]} g one district + item */
function unrecordedRow(g) {
  const top = g.reduce((a, b) => (b.sugarG > a.sugarG ? b : a));
  return {
    districtName: top.districtName,
    item: top.item,
    sugarG: round1(Number(top.sugarG)),
    kcal: top.kcal === null ? null : Math.round(top.kcal),
    days: new Set(g.map((r) => r.date)).size,
  };
}

/**
 * Flagged items, one row per district + item, most total sugars first.
 * @param {Row[]} rs
 */
export function unrecorded(rs) {
  const flagged = rs.filter((r) => r.flags.includes(FLAG));
  const groups = Map.groupBy(flagged, (r) => `${r.district}|${r.sourceId}`);
  return [...groups.values()]
    .map(unrecordedRow)
    .sort((a, b) => b.sugarG - a.sugarG || b.days - a.days);
}

/** @param {ReturnType<typeof unrecorded>} list */
export function unrecordedTable(list) {
  const head = ["District", "Item", "Total sugars (g)", "kcal", "Days"];
  const cells = (o) => [o.districtName, o.item, o.sugarG, o.kcal, o.days];
  return { head, rows: list.map(cells) };
}

/** @param {ReturnType<typeof unrecorded>} list */
export function unrecordedNote(list) {
  const rule = `0 g added sugar but ${SUGAR_G} g or more total sugars`;
  if (!list.length) return `No entrée in these filters lists ${rule}.`;
  const n = list.length;
  const which = n === 1 ? "1 entrée lists" : `${n} entrées list`;
  return `${which} ${rule}. Their added sugar was likely not recorded; the charts above count them at 0 g, as published.`;
}
