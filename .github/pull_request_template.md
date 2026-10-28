<!-- Thanks! This description is public: no names, no "my kid's school", nothing about your family. -->

## What this changes

## Checklist

- [ ] `npm run check` passes.
- [ ] Nothing added or changed under `data/`.
- [ ] No school-directory reply (a list of a district's schools) anywhere in the diff. A new fixture holds one school's menus only.
- [ ] No personal or family details in files, commit messages or this description.
- [ ] Nothing new calls a menu server more often, or faster, than the daily run does.
- [ ] A code change comes with a test that failed before the change.

### Adding a district (skip otherwise)

- [ ] The district is on SchoolCafé or eTrition.
- [ ] One new `districts.json` entry, keyed by its 7-digit NCES id (SchoolCafé: `maxDetails: 25`, `pauseMs: 1000`).
- [ ] Its `note` names the representative school, the school it was compared with, and the week.
- [ ] Every wealth figure has a value, year and source.
- [ ] One live week with `DATA_DIR` outside the repo logged `<NCES id>: <n> items ...` with no `FAILED`, and the district's charts appear on the dashboard.
