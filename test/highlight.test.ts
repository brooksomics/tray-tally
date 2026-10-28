import assert from "node:assert/strict";
import { test } from "node:test";
import { names, pick, split } from "../dashboard/highlight.js";

const row = (districtName: string) => ({ districtName });
const rows = ["Leon", "Austin", "Leon", "Denver"].map(row);

test("names: each district once, sorted, as the charts' legend orders them", () => {
  assert.deepEqual(names(rows), ["Austin", "Denver", "Leon"]);
});

test("pick: keeps the viewer's picks that are still in the rows, once each", () => {
  const avail = ["Austin", "Denver", "Leon"];
  assert.deepEqual(pick(avail, ["Leon", "Austin"]), ["Leon", "Austin"]);
  assert.deepEqual(pick(avail, ["Leon", ""]), ["Leon"]);
  assert.deepEqual(pick(avail, ["Leon", "Leon"]), ["Leon"]);
  // A pick the filters dropped falls away; the other stays.
  assert.deepEqual(pick(avail, ["Houston", "Denver"]), ["Denver"]);
});

test("pick: with nothing usable, the first district; '*' means all (no highlight)", () => {
  const avail = ["Austin", "Denver"];
  assert.deepEqual(pick(avail, ["", ""]), ["Austin"]);
  assert.deepEqual(pick(avail, ["Houston", ""]), ["Austin"]);
  assert.equal(pick(avail, ["*", "Denver"]), null);
  assert.deepEqual(pick([], ["", ""]), []);
});

test("split: highlighted rows to focus, the rest to context", () => {
  const { focus, context } = split(rows, ["Leon"]);
  assert.deepEqual(focus, [row("Leon"), row("Leon")]);
  assert.deepEqual(context, [row("Austin"), row("Denver")]);
});
