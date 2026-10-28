// Daily entry point (launchd): npm run fetch [-- YYYY-MM-DD [NCES id]]
// With a date, fetches that date's Mon-Fri week instead (backfill); with a
// district id too, only that district (the summary still covers them all).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "./cli.ts";
import { ymd } from "./dates.ts";
import { runAll } from "./runner.ts";
import { writeSummary } from "./summary.ts";

const root = new URL("..", import.meta.url);
const { districts } = JSON.parse(
  readFileSync(new URL("districts.json", root), "utf8"),
);
const args = parseArgs(process.argv.slice(2), districts);
if ("error" in args) {
  console.error(args.error);
  process.exit(2);
}
const dataDir = process.env.DATA_DIR ?? fileURLToPath(new URL("data", root));
const now = new Date();
const failed = await runAll(args.districts, {
  dataDir,
  now,
  week: args.week,
  log: console.log,
});
// Summarize whatever is stored, for every district, even if one failed today.
writeSummary(districts, dataDir, ymd(now));
process.exitCode = failed ? 1 : 0;
