# tray-tally

What US school districts actually serve kids: daily breakfast and lunch menus, with nutrition, for a handful of districts (California, Texas, Colorado and Florida so far), scored against federal and state lines. The dashboard is live at [bubbabrooks.info/school-meals](https://www.bubbabrooks.info/school-meals/).

- Want your district added? Developers: see [CONTRIBUTING.md](CONTRIBUTING.md). Everyone else: [open an "Add my district" issue](https://github.com/brooksomics/tray-tally/issues/new/choose).
- District level only. The menus and nutrition come from what each district publishes.

## Setup

Needs Node 26+, and `gitleaks` + `trufflehog` on PATH (`brew install gitleaks trufflehog`).

```sh
npm ci && npm run prepare             # prepare installs pre-commit + pre-push hooks (prek);
                                      # npm ci alone skips it when npm has ignore-scripts=true
$EDITOR .git/info/privacy-denylist    # private terms (your family's names, your kid's school), one per line;
                                      # untracked; push fails without it, or if a term is in history
npm run check                         # eslint, prettier, tsc, tests with coverage >= 80%
```

`git push --no-verify` skips every local check, privacy included. Nothing server-side catches it.

## Branch flow

Work on a `feature/*` branch and merge it into `main` through a pull request. There is no `dev` branch.

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs on pull requests (opened, reopened, or pushed to) and on pushes to `main`. Pushing a feature branch with no open pull request runs nothing. It repeats the local checks (prek's pre-commit hooks, `npm run check`) and scans the whole history with gitleaks and trufflehog. CI runs after the code is already on GitHub, so it backs up the local hooks, not replaces them. It has no privacy denylist: that check exists only in the local pre-push hook.

## Daily job

`npm run fetch` fetches the current week for every district in `districts.json`. It writes `data/<NCES id>/` and rebuilds `data/summary.json`.

The [`fetch` workflow](.github/workflows/fetch.yml) runs it on weekdays at 17:00 UTC (10:00 Pacific in summer, 09:00 in winter) and commits `data/` to the [`data` branch](https://github.com/brooksomics/tray-tally/tree/data), so `main` holds no data. Run it by hand from the Actions tab. A district that fails still lets the others' days be committed, then fails the run. GitHub turns a public repo's schedules off after 60 days without activity, so after a summer break check the Actions tab and re-enable it.

To refresh the blog's copy: `git worktree add ../tray-tally-data data` (later, `git -C ../tray-tally-data pull`), then `DATA_DIR=../tray-tally-data scripts/publish-blog.sh <blog checkout>`.

### On a Mac instead (launchd)

A `launchd` agent can run the same job locally on weekdays at 10:00. Don't run it alongside the workflow, which would double the requests to the menu servers.
- If the Mac is asleep at 10:00, launchd starts the job on wake, and several missed runs collapse into one (`man launchd.plist`).
- If the Mac is powered off, the day is skipped. Every run re-fetches the whole week, so that heals by itself.

The job runs whatever is checked out in this folder. Keep `main` checked out here, and do feature work in a `git worktree`.

Install from the repo root:

```sh
P=local.school-meal-tracker.fetch; R="$PWD"; L="$HOME/Library/Logs/school-meal-tracker"
F="$HOME/Library/LaunchAgents/$P.plist"; N="$(command -v node)"
"$N" -e 'parseInt(process.versions.node) >= 26 || (console.error("need Node 26+:", process.execPath), process.exit(1))' &&
mkdir -p "$L" && cat > "$F" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$P</string>
  <key>ProgramArguments</key><array><string>$N</string><string>src/run.ts</string></array>
  <key>WorkingDirectory</key><string>$R</string>
  <key>StartCalendarInterval</key><array>
    <dict><key>Weekday</key><integer>1</integer><key>Hour</key><integer>10</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Weekday</key><integer>2</integer><key>Hour</key><integer>10</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Weekday</key><integer>3</integer><key>Hour</key><integer>10</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Weekday</key><integer>4</integer><key>Hour</key><integer>10</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Weekday</key><integer>5</integer><key>Hour</key><integer>10</integer><key>Minute</key><integer>0</integer></dict>
  </array>
  <key>StandardOutPath</key><string>$L/fetch.out.log</string>
  <key>StandardErrorPath</key><string>$L/fetch.err.log</string>
</dict></plist>
EOF
# A reinstall unloads the old job first; bootout errors harmlessly on a first install.
plutil -lint "$F" && { launchctl bootout gui/$(id -u)/$P 2>/dev/null; launchctl bootstrap gui/$(id -u) "$F"; }
```

The heredoc fills in your paths at install time, so nothing user-specific is committed. The plist pins the `node` that ran the install. launchd's environment may find a different Node, e.g. nvm's default, so if you change Node versions, reinstall: run the same block again. (Bootstrapping a job that's already loaded fails with `Bootstrap failed: 5: Input/output error`, hence the bootout.) To fire it once now, run `launchctl kickstart -k gui/$(id -u)/local.school-meal-tracker.fetch`. That's a real run, one request at a time:
- An eTrition district makes 2–5 requests: token, calendar, and up to 3 recipe batches.
- A SchoolCafé district makes one weekly call per tracked meal, plus up to `maxDetails` nutrition-detail calls (Del Mar: 25), `pauseMs` apart (1 s).

Check it:

```sh
P=local.school-meal-tracker.fetch
launchctl print gui/$(id -u)/$P | grep -E "runs =|last exit code"   # want: last exit code = 0
tail -5 ~/Library/Logs/school-meal-tracker/fetch.out.log           # one line per district per run
tail -20 ~/Library/Logs/school-meal-tracker/fetch.err.log          # errors land here
```

A healthy run logs a line like this for each district:

```
<NCES id>: <n> items; recipes asked <a>, got <g>; <c> changes
```

Weekdays without items (no school) show up as `no items: …` and are not errors. Three warnings need a look, but don't fail the run:
- `WARNING: no tracked items this week`: expected during a break. In a school week, a school or menu id in `districts.json` went stale.
- `WARNING: no items this week on "<menu>" (stale menu id?)`: the other menus have items, so that menu's id likely changed.
- `WARNING: <date> has no items now; old file kept`: a day that had a menu lost it, e.g. a no-school day announced late. The old file stays published until you delete `data/<NCES id>/<date>.json`.

A failing district logs `<NCES id>: FAILED: …`, and the job exits 1.

| Symptom | Fix |
|---|---|
| `No such file` for node / `SyntaxError` on `.ts` | The pinned Node moved or is older than 26. Reinstall from a shell where `node --version` prints v26+. |
| `FAILED: eTrition 4xx/5xx` / `FAILED: SchoolCafe 4xx/5xx` | The API was down or changed. The next run retries, and stored data is untouched. |
| `FAILED: eTrition: unexpected calendar row …` / `FAILED: SchoolCafe…: unexpected …` (weekly reply, menu item) | The menu format changed. Nothing is written for that district until the code handles it. |
| `FAILED: <n> recipe(s) rejected: … is not a number` / `UOM is …` | The nutrition format changed. The days are still written, and the unexpected recipe is reported until the code handles it. |
| `FAILED: <n> recipe(s) rejected: SchoolCafe …` | Some nutrition-detail calls failed. The days are still written, and an item without a detail yet is asked again next run. |

Uninstall: `launchctl bootout gui/$(id -u)/local.school-meal-tracker.fetch && rm ~/Library/LaunchAgents/local.school-meal-tracker.fetch.plist`

## Dashboard

A static page over `data/summary.json`, with no build step:

```sh
mkdir -p data && curl -sfL https://raw.githubusercontent.com/brooksomics/tray-tally/data/summary.json -o data/summary.json
                                  # the daily job's latest; or `npm run fetch` to make your own
python3 -m http.server 8000       # from the repo root
open http://localhost:8000/dashboard/
```

It has views for added sugar per item, weekly distance to the 2027 rule, AB 1264's "high amounts" share (milk left out) with a path to zero by 2032, fiber per entrée per 1,000 kcal, sodium per 1,000 kcal of the menu (lunch and breakfast, against US K-5 and Japan limits), and the worst offenders. Under them, "Meets every line" lists the items that pass every line on the page, with a plain guide to what the lines mean, and "The high bar" sets out what good school food looks like in law elsewhere, with sources. A "By day" section at the bottom draws the weekly charts per school day. Weekly dots sit on their week's Monday. Menus are elementary breakfast and lunch, which TK eats too; preschool menus aren't tracked. You can filter by district, meal and dates. Districts are labelled with their free/reduced-meal % and median household income, so ticking two of them compares richer and poorer side by side.
- Charts use Observable Plot 0.6.17 and d3 7.9.0, copied from npm into `dashboard/vendor/` (integrity-checked) so the page loads no outside scripts. Only change: plot.umd.min.js had three invisible characters (U+00AD twice, U+200B once, all inside string literals) rewritten as `\u` escapes, which the blog's hidden-Unicode test requires.
- `?data=<url>` points the page at another `summary.json`.
- To deploy, serve `dashboard/` and `data/summary.json` next to each other from any static host.

## License

[MIT](LICENSE). The vendored Plot and d3 in `dashboard/vendor/` keep their own ISC licenses. Menus and nutrition data come from the districts' published menus.
