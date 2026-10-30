import assert from "node:assert/strict";
import { test } from "node:test";
import { rows } from "../dashboard/data.js";
import { freeShare, freeSugarShare } from "../dashboard/free-sugar.js";
import { Y, freeOpts } from "../dashboard/lines.js";
import { normalize } from "../src/platforms/etrition-normalize.ts";
import { summarize } from "../src/summary.ts";
import { district, fixture } from "./fake-etrition.ts";

const items = normalize(district, fixture.calendar.records, fixture.recipes);
const date = items[0].date;
const day = { schemaVersion: 1 as const, district: district.id, date };
const days = [{ ...day, firstSeen: date, lastSeen: date, items }];
const s = summarize([{ district, days, changes: 0 }], date);
const row = (over: object) => ({ ...rows(s)[0], ...over });
const juice = (over: object) => row({ addedSugarShareKcal: 0, ...over });

test("free sugars: a juice's total sugars, anything else its added sugar", () => {
  const cases: [object, number | null][] = [
    [row({ item: "Burrito", sugarG: 9, addedSugarShareKcal: 0.1 }), 0.1],
    [juice({ item: "Apple Juice", sugarG: 12, kcal: 60 }), 0.8],
    [
      juice({ item: "Orange Tangerine Juice / Jugo", sugarG: 6, kcal: 60 }),
      0.4,
    ],
    [juice({ item: "Orange Juice", sugarG: 0, kcal: 60 }), null], // can't be
    [juice({ item: "Assorted Juice", sugarG: 14, kcal: null }), null],
    [juice({ item: "Juice Cup", sugarG: 20, kcal: 60 }), null], // > 100%
    [juice({ item: "Peaches in 100% Juice", sugarG: 15 }), 0], // packed fruit
  ];
  for (const [r, want] of cases) {
    const got = freeShare(r as ReturnType<typeof row>);
    assert.equal(got === null ? null : Math.round(got * 100) / 100, want);
  }
});

test("free sugars per week: mean over items that have a share; counts known", () => {
  const rs = [
    row({ item: "Burrito", addedSugarShareKcal: 0.1 }),
    juice({ item: "Apple Juice", sugarG: 12, kcal: 60 }),
    juice({ item: "Orange Juice", sugarG: 0, kcal: 60 }),
  ];
  const [w] = freeSugarShare(rs);
  assert.deepEqual(
    [w.n, w.known, Math.round(Number(w.mean) * 100)],
    [3, 2, 45],
  );
});

test("the free-sugar chart's lines are WHO's: 10% and 5%", () => {
  const opts = freeOpts(s.references);
  assert.equal(opts.label, Y.free);
  assert.deepEqual(
    opts.rules.map((r) => [r.value, r.label]),
    [
      [0.1, "WHO: 10%"],
      [0.05, "WHO (conditional), UK: 5%"],
    ],
  );
});
