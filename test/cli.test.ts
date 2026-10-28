import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseArgs } from "../src/cli.ts";
import type { District } from "../src/types.ts";
import { read } from "./fake-etrition.ts";

const all: District[] = read("districts.json").districts;
const ids = (ds: District[]) => ds.map((d) => d.id);

test("no arguments: every district, this week", () => {
  const got = parseArgs([], all);
  assert.ok(!("error" in got));
  assert.deepEqual([got.week, ids(got.districts)], [undefined, ids(all)]);
});

test("a date picks that week; a district id narrows the run to it", () => {
  const one = parseArgs(["2026-09-09", "0610740"], all);
  assert.ok(!("error" in one));
  assert.deepEqual(one.week, ["2026-09-07", "2026-09-11"]);
  assert.deepEqual(ids(one.districts), ["0610740"]);
  const every = parseArgs(["2026-09-09"], all);
  assert.ok(!("error" in every));
  assert.deepEqual(ids(every.districts), ids(all));
});

test("bad dates, unknown districts and extra arguments are errors", () => {
  for (const args of [
    ["2026-13-01"],
    ["2026-09-07", "9999999"],
    ["2026-09-07", "0610740", "x"],
  ])
    assert.ok("error" in parseArgs(args, all), args.join(" "));
});

// A stored EUSD day, so the summary has something of another district to keep.
function seedEusdDay(): string {
  const dataDir = mkdtempSync(join(tmpdir(), "cli-"));
  const day = { schemaVersion: 1, district: "0612880", date: "2026-09-08" };
  const item = {
    ...day,
    menu: "Elementary Lunch",
    meal: "lunch",
    item: "Taco",
  };
  const file = { ...day, firstSeen: "x", lastSeen: "x", items: [item] };
  mkdirSync(join(dataDir, "0612880"));
  const path = join(dataDir, "0612880", "2026-09-08.json");
  writeFileSync(path, JSON.stringify(file));
  return dataDir;
}

// fetch is stubbed to fail, so nothing leaves the machine.
const OFFLINE =
  "data:text/javascript,globalThis.fetch=async()=>{throw new Error('offline')}";
const runOffline = (args: string[], dataDir: string) =>
  spawnSync(process.execPath, ["--import", OFFLINE, "src/run.ts", ...args], {
    env: { ...process.env, DATA_DIR: dataDir },
    encoding: "utf8",
  });

test("run.ts with a district fetches only it, and summarizes every district", () => {
  const dataDir = seedEusdDay();
  const run = runOffline(["2026-09-09", "0610740"], dataDir);
  assert.equal(run.status, 1, run.stderr);
  assert.match(run.stdout, /^0610740: FAILED: offline$/m);
  assert.doesNotMatch(run.stdout, /0612880|0634320/);
  const summary = JSON.parse(
    readFileSync(join(dataDir, "summary.json"), "utf8"),
  );
  const eusd = summary.districts.find(
    (d: { id: string }) => d.id === "0612880",
  );
  assert.equal(eusd.series[1].days[0].items[0].item, "Taco");
  assert.equal(summary.districts.length, all.length);
});
