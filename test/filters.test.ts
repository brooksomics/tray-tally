import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { filterSummary } from "../dashboard/ui.js";

// The filters fold away under one line, so that line says what's selected.
const f = (districts: string[], meals: string[]) => ({
  districts: new Set(districts),
  meals: new Set(meals),
  ...{ from: "2026-08-10", to: "2026-10-23" },
});

test("filter summary: all, some or no districts and meals", () => {
  assert.equal(
    filterSummary(f(["a", "b"], ["lunch", "breakfast"]), 2),
    "All 2 districts · breakfast, lunch · 2026-08-10 to 2026-10-23",
  );
  assert.equal(
    filterSummary(f(["a"], ["lunch"]), 2),
    "1 of 2 districts · lunch · 2026-08-10 to 2026-10-23",
  );
  assert.equal(
    filterSummary(f([], []), 2),
    "0 of 2 districts · no meals · 2026-08-10 to 2026-10-23",
  );
});

test("filters start folded, inside a <details>", () => {
  const html = readFileSync(
    new URL("../dashboard/index.html", import.meta.url),
    "utf8",
  );
  assert.match(html, /<details class="filters">\s*<summary>/);
  assert.match(html, /<form id="filters"><\/form>\s*<\/details>/);
});
