# Declutter guide (owner request, Oct 18, 2026)

The owner finds the app cluttered. The look (SPEC section 8) stays; what changes is how much is on screen at once.
Every page should answer its one question in the first screenful, and let you dig for the rest.

## Rules
1. **Answer first.** Each page opens with a slim "headline strip": the 2–4 numbers that answer the page's question
   (e.g. locker room: projected points, win chance, lineup status). Everything else sits below or behind a tab.
2. **Tabs over scrolling.** A page with more than ~3 major sections splits them into in-page tabs (`Segmented`,
   synced to `?tab=` so links and the back button work). The default tab is the one people open the page for.
3. **Notes behind a "?".** Explanatory paragraphs ("each bar is the chance of…", method notes, definitions) move
   into a small disclosure next to the section title: one shared `InfoTip` component (a `?` button that toggles a
   short note; keyboard and screen-reader friendly). Keep honest caveats visible only when they change the
   meaning of a number (e.g. "last season (2025)").
4. **Fewer columns by default.** Tables show the 4–6 columns that matter; the rest appear with a "more columns"
   toggle (remembered per table in localStorage). Phones show fewer still.
5. **Less chrome.** Fewer borders and nested cards (one card per section, no cards inside cards), fewer pills and
   chips (only where they carry state: injury, tier, tone), one primary button per section.
6. **Compact page header.** Title and kicker on one line where they fit; "data as of" and refresh as a small
   right-aligned line. The header must not take more than ~110 px at desktop.
7. **Show less, link more.** Summary cards show the top 3 and link to the full page ("all 12 →").
8. **Nothing is removed outright** unless it duplicates something better elsewhere. Move it, fold it or tab it.

## Navigation (sidebar and phone menu)
Grouped, with small section labels:
- **this week:** huddle, game day, locker room
- **league:** playoff picture, hot takes
- **moves:** waiver wire, trade block
- **players:** scouting report, draft room

front office and under the hood sit quietly at the bottom.

## Per page
| Page | Headline strip | Default view | Behind tabs / disclosures |
|---|---|---|---|
| huddle | record · playoff odds · this week's matchup (score or projection, win chance) | start/sit alerts, 3 takes for your players, top 3 waiver adds | league panel and standings move out (link to playoff picture); path card merges into the strip |
| hot takes | count by relevance | compact cards: headline + stat line | "why it matters", track record, sources expand per card; filters on one row |
| scouting report (profile) | projection, ROS rank, trade value | overview | tabs: overview · game log · usage · splits · value |
| locker room | projected points · win chance · lineup status | lineup | tabs: lineup · roster · the lab; weekly chart folds into lineup |
| playoff picture | your odds, seed, magic number | standings (rank, team, record, PF, playoff %, title %) | tabs: standings · brackets · playoff machine · odds detail (heatmap, magic number chart) |
| waiver wire | best add and its lineup lift | table: player, pos, lineup lift, bid, drop | more columns; tab: trending & risers |
| trade block | — | analyzer | tabs: analyzer · handshake deals · dynasty |
| draft room | — | already tabbed | trim the chip row to one line |
| front office | — | linked accounts | sections collapse (accordion) |
| under the hood | — | short overview | sections collapse (accordion) |
