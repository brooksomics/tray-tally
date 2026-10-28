import assert from "node:assert/strict";
import { test } from "node:test";
import { rows } from "../dashboard/data.js";
import {
  unrecorded,
  unrecordedNote,
  unrecordedTable,
} from "../dashboard/unrecorded.js";
import { UNRECORDED_SUGAR_G } from "../src/metrics.ts";
import { normalize } from "../src/platforms/etrition-normalize.ts";
import { summarize } from "../src/summary.ts";
import { district, fixture } from "./fake-etrition.ts";

// Entrées at 0 g added sugar with 8 g+ total sugars, listed so
// the 0 g isn't read as real.
const items = normalize(district, fixture.calendar.records, fixture.recipes);
const days = [...Map.groupBy(items, (i) => i.date)].map(([date, day]) => ({
  ...{ schemaVersion: 1 as const, district: district.id, date },
  ...{ firstSeen: date, lastSeen: date, items: day },
}));
const [base] = rows(summarize([{ district, days, changes: 0 }], "2026-10-08"));
type Row = typeof base;
const row = (over: Partial<Row>): Row => ({
  ...base,
  ...{ item: "Cinnamon Swirl Bread", sourceId: "5223", date: "2026-09-08" },
  ...{ kcal: 433.036, sugarG: 21.958, flags: ["suspect_added_sugar"] },
  ...over,
});
const rs = [
  row({}),
  row({ date: "2026-09-22" }),
  row({ menu: "Elementary Lunch" }), // same day, another menu: still 2 days
  row({ item: "Mandarin Orange Chicken", sourceId: "7", sugarG: 12.393 }),
  row({ item: "Banana", sourceId: "8", sugarG: 14, flags: [] }),
];

test("unrecorded: flagged items, one row each, most total sugars first", () => {
  const list = unrecorded(rs);
  assert.deepEqual(
    list.map((o) => [o.item, o.sugarG, o.kcal, o.days]),
    [
      ["Cinnamon Swirl Bread", 22, 433, 2],
      ["Mandarin Orange Chicken", 12.4, 433, 1],
    ],
  );
});

test("unrecorded table: total sugars where offenders show added sugar", () => {
  const { head, rows } = unrecordedTable(unrecorded(rs));
  assert.equal(head.join("|"), "District|Item|Total sugars (g)|kcal|Days");
  assert.equal(
    rows[0].join("|"),
    "Escondido Union|Cinnamon Swirl Bread|22|433|2",
  );
});

test("unrecorded note: how many, the rule, and that the charts count 0 g", () => {
  const note = unrecordedNote(unrecorded(rs));
  assert.match(note, /^2 entrées list 0 g added sugar but /);
  assert.ok(note.includes(`${UNRECORDED_SUGAR_G} g or more total sugars`));
  assert.match(note, /count them at 0 g/);
  assert.match(unrecordedNote(unrecorded(rs.slice(0, 1))), /^1 entrée lists /);
  assert.match(unrecordedNote([]), /^No entrée in these filters/);
});

test("unrecorded: a missing kcal stays missing, as in the offenders table", () => {
  const [o] = unrecorded([row({ kcal: null })]);
  assert.equal(o.kcal, null);
});
