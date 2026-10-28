# Contributing

Thanks for helping. The tracker follows school breakfast and lunch menus, with nutrition, for a handful of US districts, and it grows one district at a time.

Not a developer? [Open an issue](https://github.com/brooksomics/tray-tally/issues/new/choose) and choose **Ask for a district**. You don't need to know anything about the code.

## How contributions work

- One maintainer reviews and merges. `main` is protected: every pull request needs the maintainer's approval and a green CI run.
- Reviews happen in the maintainer's spare time. The aim is two to three weeks, but that's not a promise.
- You change code and configuration, never data. A scheduled GitHub Action fetches every district each weekday and commits the results, `summary.json` included, to the `data` branch. A pull request must not add or change anything under `data/`.
- The usual contribution is adding a district: one entry in [`districts.json`](districts.json). Bug fixes and adapter improvements are welcome too.

## Privacy

The tracker works at the district level.

- Each district is tracked through one representative elementary school, picked because its menus cover the district. It doesn't need to be your child's school, and we'd rather it weren't: nobody reading the repo should be able to tell which school your family uses.
- Keep personal and family details out of files, branch names, commit messages and pull request text. No children's names, no "my kid's school", no teachers, no addresses.
- Never commit a school-directory reply (SchoolCafé's `GetSchoolsList`, or any list of a district's schools), not even a trimmed one. Fixtures hold one school's menus only.

## Be gentle with menu servers

The scheduled run makes a few requests per district each weekday morning, one at a time and spaced out. A SchoolCafé district costs one weekly call per tracked meal, up to `maxDetails` nutrition calls `pauseMs` apart, and at most one daily call. An eTrition district costs 2 to 5 requests.

Don't add anything that polls more often, sends requests in parallel, raises `maxDetails` or lowers `pauseMs`. When you look a district up by hand, make one call at a time, a second or more apart.

## Which districts can be added

- **SchoolCafé**: yes, with the steps below.
- **eTrition**: yes, but the lookup isn't written up yet. Open an issue first and we'll work through it with you. The entry looks like Escondido Union's (one district-wide menu, `districtOnly: true`) or San Diego Unified's (menus per school, so one `schoolId`).
- **Nutrislice and MealViewer**: no. Their terms, as we read them, rule out automated collection and republishing. A request for one of these districts stays open in the issues, so the demand is on record.
- **PDF-only menus**: there is no adapter for them yet.

A new platform is welcome only if its terms allow automated access and republishing. Open an issue before you start an adapter.

## Set up

Needs Node 26+, and `gitleaks` + `trufflehog` on PATH, because the git hooks call them (on macOS: `brew install gitleaks trufflehog`).

```sh
npm ci && npm run prepare             # prepare installs the pre-commit + pre-push hooks
$EDITOR .git/info/privacy-denylist    # one private term per line: your child's name, school, street
npm run check                         # eslint, prettier, tsc, tests with coverage >= 80%
```

The pre-push hook searches your whole git history for the denylist terms (case-insensitive) and blocks the push on a match. It also blocks every push while the file is missing or empty. The file is untracked, so it never leaves your machine. CI can't run this check for you.

`npm test` runs against saved replies in `fixtures/` and calls no menu server. Leave `LIVE=1` to the maintainer.

## Add a SchoolCafé district

The lookups below use the same API as SchoolCafé's own web app, at `https://webapis.schoolcafe.com/api/`. The whole lookup takes about 15 calls.

1. **Find the menu app.** On the district's nutrition page, follow the menu link. A `schoolcafe.com/<site>` address means SchoolCafé. Note `<site>`, and check that the district isn't already in `districts.json`.

2. **Find the ids.** The NCES district id (LEAID) is 7 digits; look it up in the NCES district search on nces.ed.gov or on educationdata.urban.org. Keep it a string, since some start with 0. Then ask SchoolCafé for the district and its schools:

   ```
   GetISDByShortName?shortname=<site>     -> ISDId
   GetSchoolsList?districtId=<ISDId>      -> each school's SchoolId (a GUID)
   ```

   The school list is a directory. Keep it outside the repo.

3. **Pick a representative elementary and its serving lines.** Any elementary that serves the district's regular breakfast and lunch will do. List its meal types, then each meal's serving lines:

   ```
   GetMealType?schoolid=<SchoolId>&startdate=<date>&enddate=<date>
   GetServiceLine?schoolid=<SchoolId>&startdate=<date>&enddate=<date>&mealtype=<meal type>
   ```

   Track the regular breakfast and lunch lines. Leave out pre-K lines and Breakfast in the Classroom, which often has a different menu. If schools use different lines, check a few and take the lines most elementaries use (the Denver entry shows how).

4. **Check the menu is district-wide.** Fetch one week of each meal for your school and for a second elementary, and compare them item for item:

   ```
   CalendarView/GetWeeklyMenuitems?SchoolId=<SchoolId>&ServingDate=<Monday, YYYY-MM-DD>&ServingLine=<line>&MealType=<meal type>&enabledWeekendMenus=false
   ```

   If they differ, say so in your pull request.

5. **Write the entry.** Copy the closest entry in `districts.json`: Leon County Schools (`1201110`) uses one serving line for both meals; Denver (`0803360`), Houston ISD (`4823640`) and Austin ISD (`4808940`) put breakfast on its own line with `servingLine` on the breakfast menu. Then:
   - Set `id`, `name`, `state`, `params.schoolId` and `params.servingLine` (the lunch line). Keep `maxDetails: 25` and `pauseMs: 1000`.
   - Each menu needs `mealType` spelled as SchoolCafé spells it, `meal` (`breakfast` or `lunch`) and `grades: "K-5"`. No preschool menus.
   - Items count as entrées when their category contains "ENTREE". If the district files main dishes elsewhere, list those categories in `entreeCategories`, as Houston ISD does.
   - In `note`, record the school you picked, the school you compared it with, the week, and any lines you left out. The dashboard never shows the note, but it's public in the repo.

6. **Add the wealth figures.** The dashboard labels each district with its free/reduced-price meal share and median household income, so each figure needs a `value`, `year` and `source`. The free/reduced share is required.
   - Free/reduced share, outside California: NCES Common Core of Data via educationdata.urban.org. Divide students eligible for free or reduced-price lunch by enrollment, over the district's non-charter schools that report both. Urban's year 2024 is the 2024-25 school year. If several schools report as many eligible students as enrolled, say the share may run high, as Houston's source does.
   - California: the CDE free/reduced-price meal file, as the California entries show.
   - Median household incomes (optional): the NCES ACS-ED district dashboard, `nces.ed.gov/Programs/Edge/ACSDashboard/<NCES id>`, for all households and for households with public-school children.

   Copy an existing `source` string and change the numbers.

7. **Run the checks, then one live week.** `npm run check` includes `test/registry.test.ts`, which checks every entry's shape. Then, from the repo root:

   ```sh
   DATA_DIR=../smt-check npm run fetch -- <a date in the current or last school week> <NCES id>
   ```

   That fetches one Mon-Fri week for your district only, into `../smt-check` instead of `data/`. You want `<NCES id>: <n> items; recipes asked <a>, got <g>; <c> changes` and no `FAILED`. It's a real run, so run it once. When last checked, SchoolCafé served no menus from before October 1, so older weeks come back empty.

8. **Look at it on the dashboard.**

   ```sh
   cd .. && python3 -m http.server 8000 --bind 127.0.0.1
   ```

   Open `http://localhost:8000/<your clone's folder>/dashboard/?data=/smt-check/summary.json`, pick your district, and check that its charts appear.

9. **Open a pull request** from a branch such as `feature/leon-county`. Its diff should be your `districts.json` entry, plus a test if you changed code. Fill in the checklist. Once it's merged, the next scheduled run fetches the district with the rest.

## Bug fixes and adapter changes

Welcome. Write a test that fails without your change, then make it pass. `test/schoolcafe.test.ts` shows the pattern: it reads an entry from `districts.json` and runs it against a fake SchoolCafé built from `fixtures/`. A new fixture is one school's menu reply, never a school list.

ESLint keeps functions to 20 lines, 3 parameters and 2 levels of nesting, and files to 400 lines. Test coverage stays at 80% or above. CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs the same hooks and `npm run check`, then scans the history for secrets.

Commit messages say what changed, at the district level, e.g. "Add Leon County Schools via SchoolCafé".

## License

By contributing, you agree that your contribution is licensed under the [MIT License](LICENSE), like the rest of the tracker.
