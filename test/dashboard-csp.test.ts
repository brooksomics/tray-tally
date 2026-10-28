import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

// The blog serves the dashboard under CSP script-src 'self', so every script
// and module import must come from the page's own folder.
const dir = new URL("../dashboard/", import.meta.url);
const read = (name: string) => readFileSync(new URL(name, dir), "utf8");

test("dashboard modules import nothing from other hosts", () => {
  const modules = readdirSync(dir).filter((f) => f.endsWith(".js"));
  for (const f of modules) {
    const remote = read(f).match(/\bfrom\s+["']\w+:\/\/[^"']+["']/g);
    assert.equal(remote, null, `${f} imports ${remote}`);
  }
});

test("dashboard page loads scripts only from its own folder", () => {
  const srcs = [...read("index.html").matchAll(/<script[^>]*\ssrc="([^"]+)"/g)];
  assert.ok(srcs.length > 0, "page has script tags");
  for (const [, src] of srcs) {
    assert.doesNotMatch(src, /^\w+:|^\/\//, `remote script ${src}`);
    assert.ok(existsSync(new URL(src, dir)), `missing ${src}`);
  }
});
