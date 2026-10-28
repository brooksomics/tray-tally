import assert from "node:assert/strict";
import { test } from "node:test";
import {
  UPF,
  Y,
  daySugarOpts,
  fiberOpts,
  proteinOpts,
  weeksOpts,
} from "../dashboard/lines.js";

// Readers who skip the notes still need to know which way is good.
const WAY =
  /· (lower is better|higher is better|best between the dashed lines)$/;

test("every y-axis label says which way is better", () => {
  for (const [chart, label] of Object.entries(Y))
    assert.match(label, WAY, chart);
  assert.match(Y.sugar, /lower is better$/);
  assert.match(Y.fiber, /higher is better$/);
});

test("the trend charts use those labels", () => {
  const opts = [weeksOpts({}), daySugarOpts({}), UPF, fiberOpts({})];
  assert.deepEqual(
    [...opts, proteinOpts({})].map((o) => o.label),
    [Y.sugar, Y.sugar, Y.upf, Y.fiber, Y.protein],
  );
});
