# the commish

A fantasy football web app for Sleeper leagues, built from free public data: Sleeper, nflverse and FantasyCalc.
It runs entirely in your browser, and no AI or paid services are used at runtime.

- `SPEC.md` is the original build spec (written for an Electron app called "War Room").
- `docs/WEB_APP_NOTES.md` lists every way this web app differs from the spec.
- `reference/` holds the tested in-browser model this app ports, plus the saved league fixture used by tests.

## Develop
```bash
npm install
npm run dev        # http://localhost:5173
npm test           # vitest
npm run lint       # oxlint + tsc
npm run dist       # static build in dist/
```

Data credits: Sleeper public API. Play-by-play and snap data: nflverse. Charting data: FTN Data via nflverse. Values: FantasyCalc.
