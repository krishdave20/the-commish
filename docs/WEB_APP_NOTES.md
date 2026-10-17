# the commish: how it differs from SPEC.md

SPEC.md calls the app "War Room". The owner renamed it **the commish** (Oct 16, 2026): app, docs, package
(`the-commish`) and GitHub repo. The reference files in `reference/` keep their original names.

The owner changed the target from an Electron macOS app to a web app (Oct 16, 2026).
Everything in SPEC.md still applies except where this table says otherwise.

| SPEC.md says | Web app does |
|---|---|
| Electron main process + typed IPC | Browser `fetch` behind a typed `DataApi` (`src/data/contract.ts`). The UI never calls `fetch`. Tests swap in a fixture-backed transport. |
| Files under `userData`, raw gzipped | IndexedDB (via `idb`). Raw responses stored gzipped with `CompressionStream`; derived aggregates as JSON. |
| Worker thread for pbp parsing | Done ahead of time by a nightly job (see nflverse below); Web Workers for any in-browser heavy work. |
| Season sim in a Web Worker | Same. |
| Unsigned `.dmg` | Static build (`npm run dist` → `dist/`), hosted free on GitHub Pages (owner decision, Oct 16, 2026). `base: './'` + `HashRouter`. |
| "Check for updates" menu item | About screen compares the version with an optional `version.json` URL. |
| Bundled fonts | `@fontsource/dm-mono` and `@fontsource/instrument-serif` (both SIL OFL), bundled by Vite. |
| Playwright launches the built app | Playwright runs against `vite preview` (milestone 6). |

## Names: fantasy football DNA (owner request, Oct 16, 2026)
Feature names carry fantasy flavor; the look stays editorial and every page keeps a plain-English kicker so the
name never hides what the page does. Takes headlines still follow SPEC section 7 (no hype words). One source of
truth: `src/app/names.ts`.

| Feature (SPEC) | Name in the app | Plain kicker |
|---|---|---|
| Home | Huddle | This week at a glance |
| Takes feed | Hot Takes | Rule-based reads from real numbers |
| Players | Scouting Report | Every player, every split |
| My team | Locker Room | Your roster and lineup |
| What-if lab | The Lab | What if…? |
| Lineup alerts | Start/Sit Alerts | |
| League race | Playoff Picture | Standings, odds, clinch marks |
| Playoff machine | Playoff Machine | Pick winners, watch it move |
| Wins-needed chart | Magic Number | Wins you need to clinch |
| Seed heatmap | Seeding Odds | |
| Waivers | Waiver Wire | Who helps your lineup most |
| Waiver gain | Lineup Lift | Points added to your best lineup |
| Trades | Trade Block | Score any deal |
| Win-win ideas | Handshake Deals | Trades both managers should take |
| Dynasty trade lens | Contender or Rebuilder | |
| Draft | Draft Room | |
| Live draft assistant | On the Clock | |
| Mock draft | Mock Draft | |
| Settings | Front Office | Accounts, data, cache |
| Data health | Injury Report | Healthy / Questionable / Out per data source |
| How it works | Under the Hood | Model, calibration, sources |
| Sign in | Check In | |

## All lowercase (owner request, Oct 16, 2026)
The whole app renders in lowercase: titles, nav, micro-labels (overriding SPEC section 8's uppercase micro-labels),
buttons, player and team names, document titles. Done once in CSS (`text-transform: lowercase` on the root, and no
`uppercase` anywhere) plus lowercase source strings in `src/app/names.ts`, so the DOM text stays readable for
screen readers and search. Numbers and `$` amounts are unaffected.

## Engine deviation: team defenses score (Oct 16, 2026)
Sleeper's weekly stats mark team-defense rows with `gp`, not `gms_active`. The reference engine only checks
`gms_active`, so it never gave a DEF actual points, locked points, calibration samples or matchup grades. The app
counts a DEF row as played when `gp > 0`. On the Oct 16 fixture this moves playoff odds by at most 2.67 points
(one team; 9 of 12 move ≤0.5) and leaves the top-3 waiver adds unchanged.
- SPEC section 5's regression contract (±1.5 points, same top-3) is enforced, strictly, on
  `buildModel(pull, { referenceCompat: true })`, which reproduces the reference to 0.005 points.
- The default model is checked separately: same top-3, every team within ±3 points, and the drift must be explained
  by DEF actuals.

## CORS (checked Oct 16, 2026)
- Sleeper (`api.sleeper.app`, documented and undocumented) and FantasyCalc send `Access-Control-Allow-Origin: *`, so the browser calls them directly.
- nflverse GitHub release assets send no CORS header, and `pbp_participation_2025.csv` is 49 MB. Decided (Oct 16, 2026): a scheduled GitHub Action downloads nflverse files, builds per-player-week aggregates, and publishes small JSON next to the site. Until then the app shows nflverse panels as unavailable.

## ID join reality check
Of 830 active QB/RB/WR/TE in `/v1/players/nfl`, only 158 have `gsis_id` and 205 have `espn_id`. The name + team + position fallback will carry most joins; Data health must show what is unmatched.

## Rate limits and freshness
- Stay far below 1,000 calls/min: at most 8 requests in flight and 300/min.
- `/v1/players/nfl` at most once per 24 h.
- On open, refetch anything older than 6 h; Refresh forces a refetch (players file still capped daily unless forced from Settings).
- If the network fails, serve the cache and mark it stale, with the "data as of" stamp of the cached copy.
