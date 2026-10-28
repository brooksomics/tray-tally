import assert from "node:assert/strict";
import { test } from "node:test";
import { onWidthChange, width } from "../dashboard/width.js";

// The browser globals width.js reads, stubbed: a body of a given width, a
// resize listener we can fire, and timers that run at once.
const g = globalThis as Record<string, unknown>;
let fire = () => {};
function browser(clientWidth: number) {
  g.document = { body: { clientWidth } };
  g.addEventListener = (_: string, fn: () => void) => (fire = fn);
  g.setTimeout = (fn: () => void) => (fn(), 0);
  g.clearTimeout = () => {};
}
const resizeTo = (w: number) => {
  (g.document as { body: { clientWidth: number } }).body.clientWidth = w;
  fire();
};

test("width: the reading column, 32 px of margin, between 320 and 1000", () => {
  browser(500);
  assert.equal(width(), 468);
  browser(200);
  assert.equal(width(), 320);
  browser(2000);
  assert.equal(width(), 1000);
});

test("onWidthChange: redraws when a resize changes the width (a phone turned sideways), not otherwise", () => {
  browser(390);
  let draws = 0;
  onWidthChange(() => draws++);
  resizeTo(390); // e.g. the address bar hiding: same width
  assert.equal(draws, 0);
  resizeTo(844); // turned sideways
  assert.equal(draws, 1);
  resizeTo(844);
  assert.equal(draws, 1);
  resizeTo(390); // and back
  assert.equal(draws, 2);
});
