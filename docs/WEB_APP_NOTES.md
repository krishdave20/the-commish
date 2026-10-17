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

## Playoff brackets (owner request, Oct 16, 2026)
Brackets live in `src/engine/bracket/` (pure), `src/components/bracket/` (the interactive `Bracket`) and are placed on the playoff
picture (`pages/race/BracketCard.tsx`), the huddle (`pages/home/PathCard.tsx`, `PostseasonBrackets.tsx`) and Front Office
(`pages/settings/LosersSection.tsx`). Names: `FEATURE.bracket` ("road to the ’ship", kicker "playoff bracket"), `LOSERS_COPY`
(the toilet bowl: "consolation bracket: losers advance"; or "the consolation prize").

**What Sleeper sends (checked on the fixture league and on the finished 2025 league, Oct 16, 2026)**
- `GET /v1/league/{id}/winners_bracket` and `/losers_bracket`: arrays of `{ r, m, t1, t2, w, l, t1_from?, t2_from?, p? }`, CORS `*`, cached 5 min by Sleeper's CDN
  (the client refetches after 5 min, not 6 h). `[]` or `null` is possible; the client turns both into `[]`.
- The bracket exists in week 6: Sleeper fills round 1 from the current standings (`t1`/`t2` set, `w`/`l` null) and leaves later rounds as `t*_from` links.
- The winners bracket holds every game of the playoff weeks, not only the title road: round 2 also has the round-1 losers' games and round 3 the
  placement games `p: 3 | 5 | 7`. `p: 1` is the championship. The app keeps only the road to `p: 1`.
- Round-1 order is 1v8, 4v5, 3v6, 2v7 (t1 is the better seed); seeds are not in the rows, so they are read off that layout. Bye layout for 6 teams
  is assumed (bye teams appear in round 2 without a `_from`), unverified: no 6-team league was available.
- League settings of both leagues: `playoff_teams` 8, `playoff_week_start` 15, `playoff_round_type` 0, `playoff_seed_type` 0, `playoff_type` 0.
  Meaning used: round_type 0 one week per round, 1 two-week championship, 2 two weeks every round; seed_type 0 fixed bracket, 1 reseed each round;
  `playoff_type` is read but not used.
- **There is no league setting for toilet bowl versus consolation.** The league object only has `loser_bracket_id` and `loser_bracket_overrides_id`
  (and the app searched every settings key). Sleeper's own help centre offers both styles, so the app reads the style off the losers bracket: its
  `p: 1` game takes `{ w }` links in a consolation bracket (this league) and would take `{ l }` links in a toilet bowl (not yet seen).

**Model**
- Toilet bowl default (owner decision): the non-playoff teams play a bracket seeded worst-first; the LOSER of each game advances; the team that loses
  every round is "toilet bowl champ" (the worst team). The front-office setting (`prefs.losers`: `match` | `toilet` | `consolation`, default `toilet`, device-wide
  like the other prefs) switches it to a plain consolation bracket (winners advance, seeded best-first) or to whatever Sleeper's own losers bracket is.
- One data model for all three: a pick is always "the team that advances", so a toilet bowl click is "flush X" and the loser advances.
- Real games from Sleeper lock a game by the pair of teams that played it, so the played games of Sleeper's losers bracket lock the matching toilet bowl games.
- Round scores: normal around the expected lineup points of the round's week(s) (`team.exp` by week, what-if applied), the model's weekly SD (×0.85 for the
  week in progress); two-week rounds add means and variances. Weeks the model has no mean for borrow the team's average (the pull stops at the
  last round of a one-week-per-round bracket, so two-week rounds borrow).
- **Odds on the bracket are exact**: every set of results is walked (≤ 2^16), so they add to 1 and do not wobble when you pick. Larger brackets sample.
- **Season simulation**: the playoff pass runs after the LAST regular-season run, over every stored seeding, with the same PRNG stream continuing after
  the regular-season draws; regular-season outputs are bit-identical with it on or off (tested with exact equality on the fixture). It plays the
  championship, the toilet bowl and the consolation bracket per run and adds `titlePct`, `finalsPct`, `expFinish`, `flushPct`, `consolationPct`,
  `inToiletBowlPct`. Fields are only present once all runs are done.
- Seeding on the playoff picture: "if it ended today" (division winners, then record, points for), "projected" (most likely seed per team, greedy by
  probability, no seed double-booked), "from the machine" (record after the machine's picks; unpicked games go to the favourite).
- Side edits outside the bracket folders: `engine/model.ts` (adds `meta.playoff`), `engine/types.ts`, `engine/sim.ts` (+ `bracket/prng.ts`, which holds
  `mulberry32` unchanged), `engine/simInput.ts`, `app/results.ts`, `app/prefs.ts` (+ `losers`, and a `wr-prefs` event), `components/OddsCell.tsx` (`invert`),
  `test/fakes.ts` (bracket endpoints on the fake Sleeper client); `lib.test.ts` and `m2.test.tsx` now allow for the new pref and the extra odds columns.
- Not done: no health-check row for the bracket endpoints (`src/data/health.ts` was not in scope).
