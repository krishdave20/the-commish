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
| Bundled fonts | `@fontsource/instrument-serif` (SIL OFL), bundled by Vite. Body text uses the device's system font (San Francisco on Apple devices); see the hybrid look below. |
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

## Apple design principles, hybrid look (owner request, Oct 18, 2026)
The owner asked for Apple's design principles and chose a **hybrid** look, overriding SPEC section 8's type and
corner rules:
- **Body text and UI controls:** the system San Francisco font via the system stack
  (`-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, "Segoe UI", Roboto, sans-serif`), with
  tabular figures for numbers. Nothing is bundled (SF can't be redistributed), so other platforms get their system UI font.
- **Display:** Instrument Serif stays for page titles, section titles and big numbers.
- **DM Mono:** removed (package uninstalled); `<code>` uses the system monospace.
- **Corners:** 8 px radius (was 3 px max).
- **Palette:** unchanged (parchment, ink, green, warm red, gold).
- **Principles applied everywhere:** clarity, deference, depth; strong hierarchy; an 8-point spacing grid;
  44 px touch targets; one primary action per view; progressive disclosure; brief spring-like motion; short copy;
  consistent patterns. See `docs/DECLUTTER.md`.

## Cues from a reference app (owner request, Oct 18, 2026)
The owner shared screenshots of another Sleeper app and asked to take cues from it. Adopted:
- **Navigation:** horizontal section tabs (with sub-tabs) under a large serif team-name header replace the
  sidebar on desktop; phones keep the compact menu.
- **Player headshots:** Sleeper's CDN (`https://sleepercdn.com/content/nfl/players/thumb/{player_id}.jpg`), the
  owner's explicit choice. Team defenses never show a team logo (NFL marks); they get a monogram. Any image that
  fails or is offline falls back to an initials monogram. Images are decorative next to names (alt="").
- **Dark mode:** follows the system appearance, with a toggle; the light parchment look stays the default.
- **Content cues:** a sentence hero ("icemen leads killa k im gay 95.0 to 58.8"), plain-language odds
  ("you win 82 of every 100 simulations from here"), a dark "game plan" card of ranked actions, a "who this week
  hinges on" table (win-chance drop if each starter were replaced by a typical free agent), starters head to head,
  a field-style win meter, and a dark ticker band with the live matchup pinned on the left.
- Not adopted: betting odds and daily fantasy (no free data source that fits SPEC section 1).

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

## Game day (owner request, Oct 18, 2026)
Pure engine in `src/engine/live/` (scores parsing, live projection, live win probability, derived stats, feed diffing, the poller, the live and replay sources),
the shared poller in `src/app/live/` (one `LiveProvider` in `AppShell`: the ticker, the nav's live dot and `/gameday` all read it), the ticker in `src/components/ticker/`,
the page in `src/pages/GameDay.tsx` + `src/pages/gameday/`. Names: `PAGES.gameday` ("game day") and the section names in `FEATURE`.

**What Sleeper sends (checked on Sunday Oct 18, 2026 with games on, CORS `*` on all of them)**
- `GET /v1/league/{id}/matchups/{week}`: per team `points`, `starters`, `starters_points`, `players_points` (league scoring applied, bench included). Updates live.
- `GET /scores/nfl/regular/{season}/{week}` (undocumented; `/v1/scores/...` answers too): 14 games, 62 KB. Per game `status` (`pre_game` | `in_game` | `complete`), `start_time` (epoch ms),
  `metadata.{home_team, away_team, home_score, away_score, quarter, time_remaining, is_in_progress, is_over, date_time, canceled}`. `quarter` is "" before kickoff, "1" to "4", "F" or "F/OT" when over;
  the halftime and overtime labels were not on screen while checking, so the parser also accepts "H" and "OT" (unverified).
- `GET /schedule/nfl/regular/{season}`: only `status`, `date`, `home`, `away`, `week`, `game_id`. No kickoff time and no clock; it is the fallback when `scores` is down.
- `GET /v1/stats/nfl/regular/{season}/{week}`: 1,786 players, 312 KB; not polled (the matchups endpoint already carries each player's league-scored points).

**Rules**
- Polls every 30 s while a game is on or within 5 minutes of kickoff (2 requests per poll: matchups and scores); before that it sleeps until 5 minutes before the next kickoff (30 minutes at most per sleep);
  when every game is final it rests until 5 minutes before the next kickoff (next week's scores, else the schedule; at most 3 h per sleep), re-reads the NFL state on waking and rebuilds the model when the week rolls over. Paused while the tab is hidden, back-off 2 s, 4 s, … up to 2 minutes after errors. `force` only on the game day page; elsewhere the 30 s TTL (`TTL.live`) does the same job.
- Live projection per player: final → actual; not started → projection (league-scored, injury multipliers for the current week only); in progress → actual + projection × (1 − elapsed), elapsed from quarter and clock;
  no readable clock → half the game is assumed left (marked `*`).
- Live win chance: `winProb(projA, projB, sd × sqrt((Ra + Rb) / 2))`, R = a team's share of starter-minutes left; final is 1 / 0 / ½.
- Upset alert: pre-game chance under 35% and ahead now. Nail-biter: closest matchup within 12 points with players left. Blowout: biggest margin from 35 points. Game balls: top 5 starters. Left on the sideline: best lineup of the roster (actual points) minus the started lineup.
- Replay of last week: same `LiveSource` interface and same reducer. Kickoffs keep their order, gaps longer than a game + 20 minutes are squeezed (a Sunday takes about 2 minutes at 1×); each player's final points arrive in 3 to 6 chunks during his game.
- The ticker's collapsed state is kept under `wr.ticker.v1` in localStorage (not in `prefs.ts`).

## Headshots, hinges and head to head (owner request, Oct 18, 2026)
- `src/components/Avatar.tsx` (`Avatar`, `AvatarStack`, `AvatarName`; helpers in `avatarUtils.ts`; sizes 20 / 28 / 40). A player is a round crop of the Sleeper thumb
  (`loading="lazy"`, `decoding="async"`, explicit width and height); a failed or offline image, a non-numeric id, or a team defense (`pos` "DEF") is an initials monogram.
  Defenses never request an image. Always decorative (`alt=""`, monogram `aria-hidden`); the visible name stays the accessible name.
- **Who this week hinges on** (`src/engine/hinges/`, UI in `src/pages/gameday/matchup/Hinges.tsx`, mounted in the locker room's lineup tab): at stake = win chance now minus win
  chance if the starter were swapped for a typical free agent, in percentage points. The win chance is `liveWinProb`, which is exactly `winProb` before kickoff; points already
  scored stay and only the unplayed share of his game is swapped (`projection - (mu - replacement) x remaining`), so a finished game is worth 0. Negative means a free agent beats him.
- **Replacement level** (`replacementLevels`): per position, the median of the 12 best free agents' expected points for the week (free agents with a game, not already played, not on IR,
  from the model's capped free-agent pool); a position with no free agent replaces to 0.
- The opponent's view scores their starters against their own win chance. Source: the live feed once any starter has played (the what-if is ignored then), else the model (what-if applied to
  my side; the opponent's set lineup, or his best lineup when none is set). Per game is the season average, snaps is nflverse's season `snap_pct`.
- `src/pages/gameday/matchup/index.ts` exports `HeadToHead` and `Hinges`, both self-sufficient (no props), for game day to mount.

## Moments: time-aware intelligence (owner request, Oct 18, 2026)
"Like an Apple app, it knows what time it is." Rules over real data and the clock (SPEC section 1: no LLM, ever). Pure engine in `src/engine/moments/`
(`moments(ctx)` → `Moment[]`, plus `hero(ctx)`, the huddle's sentence), the app glue in `src/app/moments/` (`MomentsProvider`, `MomentsScope`, `useMoments`, the preview clock),
`<LiveActivity />` in `src/components/live-activity/`, `<MomentBanner page="…" />`, and the huddle's `Hero` and `GamePlan` in `src/pages/home/`. Styles: `src/styles/moments.css`.

**Waiver timing, checked on the real league (krishd20's "fantasy", Oct 18, 2026)**: `waiver_day_of_week: 2`, `daily_waivers: 0`, `waiver_type: 2` (FAAB, budget 1800), `waiver_clear_days: 2`,
`trade_deadline: 11`, `playoff_week_start: 15`. The league's `transactions` for weeks 3 to 6 show every weekly claim finishing **Wednesday 3:05 am US Eastern** (`status_updated`), so
`waiver_day_of_week` counts from Monday (0 = Monday, 2 = Wednesday) and the weekly run is 3:00 am Eastern (2:00 am Central). Unverified: the clock in winter (all claims seen were in daylight saving time),
and daily-waiver leagues (they fall back to the weekly rule). With no setting the fallback is "wednesday morning". The `trade_deadline` week is treated as closing when that week starts (conservative; unverified).

**The rules** (each fires only when the data it quotes exists; a moment has `startsAt`, `endsAt`, a priority 0 to 100, and the highest current one leads)
| Moment | When | Says | Priority |
|---|---|---|---|
| draft countdown | pre-draft, start time set | "the draft starts in 3d 4h", your slot | 70 (85 inside a day) |
| mock at your slot, study a tier, empty queue | pre-draft, prep items not ticked | "run a mock draft at your real slot (9th)", "study rb tier 2", "your queue is empty" | 56, 48, 44 |
| on the clock | drafting | "you're on the clock in 4 picks", "you're on the clock" (pick feed polled every 8 s while it is on) | 80 / 95 / 99 |
| draft grade | draft complete, weeks 1 to 3 | "your draft grade: B", lineup rank | 50 |
| waivers tonight | the 30 h before the run (Tuesday on) | "waivers process tonight at 2:00 am: your top add is …, bid $76" | 62, 86 inside 9 h |
| waivers cleared | 24 h after the run | "see who you got, and re-check your lineup for week N" | 74 |
| game day | the day of a non-Sunday opener, until kickoff | "game day starts tonight at 7:15 pm: 2 of your 6 starters play thursday", lineup status | 88 |
| lineup swap | Wednesday to the last kickoff | "swap X in for Y", the gain | 58 Wed, 66 Thu, 72 Fri/Sat, 84 Sun |
| injury report | Friday and Saturday | "X is questionable", best bench fallback at his position | 76 (80 if out) |
| lineup optimal | Friday and Saturday, nothing to fix | "your lineup is optimal" | 30 |
| final check | Sunday until the first Sunday kickoff | inactives ~90 minutes before kickoff, who is flagged; countdown to the inactives | 90 |
| live matchup | a game day with games on or to come, your points on the board | "icemen leads … 95.0 to 58.8", live odds | 92 |
| monday night | only Monday games left, matchup undecided (3% to 97%) | "you need 12.4 from X" | 94 |
| week recap | Tuesday | "week 6 recap: you won 112.3–98.0 · playoff odds 66% → 74%" (delta from the stored first look at that week) | 78 morning, 52 later |
| trade deadline | the week before and the deadline week | best handshake deal | 64, 74 |
| clinch | late season, `winsToClinch` close | "win and you're in", "win out and you're in" | 68, 78 |
| clinched, toilet bowl, playoffs | by standing | seed odds, bracket odds, title odds | 40, 46, 82 |
| dynasty movers, rookie prep | offseason | FantasyCalc 30-day moves on your roster, top rookies | 40, 36 |
| a hot take | in season | the best take on your players | 34 |

**Live activity**: the highest ongoing moment (`live`, or a countdown inside its `ongoingFrom`, default 12 h before: waivers 12 h, kickoff 6 h, inactives 4 h, draft 72 h). Floats top-centre under the ticker, bottom-centre above the safe
area on a phone; reserves room with `body[data-la]`. `--activity-top` moves it. Tap opens a card; Esc or a tap outside folds it; × hides it until a different moment leads; a polite live region speaks only "you're on the clock"
and a change of lead. The countdown ticks each second only while the page is visible. Pill corners come from a local `--r` (a pill radius is not a token). Dark surfaces use the inverse tokens.

**Preview clock**: `#/?now=2026-10-20T20:00` (local time of the browser; `#/?now=live` clears it). Works in production builds on purpose; kept in sessionStorage so it survives page changes; the huddle says
"previewing the clock" with a back-to-live link and the pill carries a "preview" tag. Only the clock changes: the data is today's (lineups, scores, who has played), and games' states are worked out from kickoff times.
`?phase=pre_draft` etc. still previews a huddle layout; combine them.

**Mounting**: `<LiveActivity />` (from `src/components/live-activity`) goes in the app shell inside `LiveProvider`. `MomentsProvider` can wrap the frame so everything shares one computation; without it each user
(`LiveActivity`, a `MomentBanner`, the huddle) starts its own through `MomentsScope`. The huddle's start/sit alerts card and waiver adds card are replaced by the game plan.
