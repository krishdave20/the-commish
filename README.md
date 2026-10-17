# War Room build kit

1. Unzip this folder somewhere on your Mac, for example ~/Projects/war-room.
2. Open Terminal in that folder and start Claude Code (`claude`).
3. Paste the kickoff prompt from the bottom of SPEC.md.

What's inside:
- SPEC.md: the full build spec Claude Code follows (same text as BUILD_PROMPT.md).
- reference/fantasy_war_room.html: the working live war room. Open it in a browser to see the target look and behavior.
- reference/sleeper_live.js, ff_live.js, shell.js: the tested in-browser engine (Sleeper pull, scoring, ranges, matchup grades, simulation, clinch math, lineup, waivers, trades).
- reference/sleeper_model.ipynb: the offline research notebook (model bake-off, calibration, tests).
