// WHO's free sugars: added sugar plus the sugar in honey, syrups and fruit
// juice, 100% juice included (WHO 2015 sugars guideline). US labels already
// count honey and syrups as added sugar, so juice is the gap; milk's and
// whole fruit's own sugars aren't free. Pure, so tests import it too.
/** @typedef {import("./data.js").Row} Row */
import { addedSugarShare } from "./series.js";

// ponytail: juice by name. Fruit packed in juice counts only its added
// sugar, so its packing juice is missed (an undercount).
const JUICE = /\bjuice\b/i;
const PACKED = /\bin (100% )?(fruit )?juice\b/i;

/**
 * Free-sugar share of an item's kcal: a juice's total sugars, anything else
 * its added sugar. Null if unknown or impossible (a juice listed at 0 g
 * sugars, or over 100% of its kcal).
 * @param {Row} r
 */
export function freeShare(r) {
  if (!JUICE.test(r.item) || PACKED.test(r.item)) return r.addedSugarShareKcal;
  const share = (Number(r.sugarG) * 4) / Number(r.kcal); // NaN or ∞ if no kcal
  return share > 0 && share <= 1 ? share : null;
}

/**
 * The 2027 chart's measure with juice's sugars counted: mean share over the
 * items that have one, per week or school day.
 * @param {Row[]} rs
 */
export const freeSugarShare = (rs, per = "week") =>
  addedSugarShare(
    rs.map((r) => ({ ...r, addedSugarShareKcal: freeShare(r) })),
    per,
  );
