# the commish for iPhone

A native SwiftUI app around the web app's engine. The screens you use most are native: the huddle, game day, your lineup and the
playoff picture, plus check in and the More list. A **Live Activity** puts your live score, kickoff and waiver countdowns and the draft
clock on the lock screen and in the Dynamic Island. The deeper tools (hot takes, scouting report, waiver wire, trade block, draft room,
record book and the rest) open as site pages pushed inside the app's own navigation, with no web chrome.

Every number comes from the same TypeScript engine as the site. A hidden web view runs it (`#/native-feed`, `src/app/native/NativeFeed.tsx`)
and posts a JSON snapshot that the SwiftUI screens draw. There is no Swift port of the model to drift out of step with the regression-tested one.

## Run it

You need **Xcode 16 or newer** (from the App Store) and Node 22+.

```bash
npm install
npm run ios:web
npm run ios:open
```

`ios:web` builds the site into `dist/`, and the app's "Copy web app" build phase copies it into the bundle. Re-run it after web changes.

In Xcode:

1. Select the **TheCommish** target, then **Signing & Capabilities**, and pick your team (a free Apple ID works). Do the same for **CommishWidgets**.
   If the bundle id `com.krishdave.thecommish` is taken, change it in both targets (the widget's must start with the app's).
2. Pick an iPhone simulator or your phone and press Run.
3. On a phone with a free Apple ID: Settings → General → VPN & Device Management → trust your developer certificate. A free-account build
   stops opening after 7 days. Run it from Xcode again to renew it.

**Live reload while working on the web side:** run `npm run dev -- --host`, then in Xcode open Product → Scheme → Edit Scheme → Run →
Environment Variables and add `COMMISH_DEV_URL` = `http://<your Mac's IP>:5173/` (debug builds only).

**Web Inspector:** debug builds are inspectable. In Safari, open Develop → (your simulator or phone) and choose the page (`native-feed` is the engine).

## How the pieces fit

| Piece | Where |
|---|---|
| Native screens | `App/UI/` (`RootView` tabs, `HuddleView`, `GameDayView`, `LineupView`, `LeagueView`, `MoreView`, `CheckInView`, `WebPageView`) |
| Snapshot model (mirrors `src/app/native/snapshot.ts`) | `App/Model/Snapshot.swift`, `App/Model/AppModel.swift` |
| Serving the site at `commish://app/` | `App/Engine/AppSchemeHandler.swift` (the nightly nflverse JSON is read from the live site) |
| JS ↔ Swift messages (mirrors `src/app/native/bridge.ts`) | `App/Engine/WebBridge.swift` |
| Live Activity: start, update, end | `App/Live/LiveActivityController.swift` |
| Lock screen and Dynamic Island views | `Widget/CommishLiveActivity.swift` |
| Score updates with the app closed | `App/Live/BackgroundRefresh.swift` |
| Local alerts as notifications | `App/Live/Notifications.swift` |
| Shared by app and widget | `Shared/CommishActivity.swift` (the activity's data), `Shared/Theme.swift` (palette, number formats, the win model) |

The project uses Xcode 16's synchronized folders: drop a Swift file into `App/`, `Widget/` or `Shared/` and it is in the build. There is no
file list to edit.

## Limits (no server, by design)

- **Live Activity updates with the app closed** come from iOS background refresh: about every 15 minutes at best, and less on low battery.
  Each one fetches only the two scores from Sleeper. The win chance is then re-estimated on the phone, and the lock screen says so,
  until you open the app and the engine's own number replaces it. Real-time lock-screen updates would need push (a server plus a paid
  developer account).
- **Starting** a Live Activity needs the app in front (an iOS rule). It starts the next time you open the app while something is ongoing.
- **Notifications** (waivers in 1 hour, kickoff in 30 minutes, on the clock, the final) fire while the app is open or recently backgrounded,
  the same as the installed web app.
