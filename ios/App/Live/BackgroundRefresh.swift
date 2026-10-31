import ActivityKit
import BackgroundTasks
import Foundation

/// Keeps the live matchup's score on the lock screen moving while the app is closed, without a server: iOS wakes the app now and then
/// (BGAppRefreshTask; about every 15 minutes at best, at iOS's discretion, less on low battery) and it reads my matchup from Sleeper's public
/// matchups endpoint. Only the two scores are fetched; the win chance is re-estimated from them (`refreshedWinChance`) until the app opens
/// and the engine's own number replaces it. Scheduled when the app goes to the background with a live, unfinished matchup on show.
enum BackgroundRefresh {
    static let taskId = "com.krishdave.thecommish.refresh"

    /// Call before the app finishes launching.
    static func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: taskId, using: nil) { task in
            guard let task = task as? BGAppRefreshTask else { return task.setTaskCompleted(success: false) }
            handle(task)
        }
    }

    static func schedule() {
        guard RefreshStore.load() != nil else { return }
        let request = BGAppRefreshTaskRequest(identifier: taskId)
        request.earliestBeginDate = .now.addingTimeInterval(15 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }

    private static func handle(_ task: BGAppRefreshTask) {
        let work = Task {
            let ok = await run()
            schedule()
            task.setTaskCompleted(success: ok)
        }
        task.expirationHandler = { work.cancel() }
    }

    private struct Row: Decodable { var roster_id: Int; var points: Double? }

    /// One refresh: fetch, re-estimate, update the activity. False when there was nothing to do or the fetch failed.
    static func run() async -> Bool {
        guard let ctx = RefreshStore.load(), let old = ctx.state.matchup,
              let live = Activity<CommishActivityAttributes>.activities.first(where: { $0.activityState != .ended && $0.activityState != .dismissed })
        else { return false }
        let r = ctx.refresh
        guard let url = URL(string: "https://api.sleeper.app/v1/league/\(r.leagueId)/matchups/\(r.week)"),
              let (data, _) = try? await URLSession.shared.data(from: url),
              let rows = try? JSONDecoder().decode([Row].self, from: data),
              let mine = rows.first(where: { $0.roster_id == r.rid })?.points,
              let theirs = rows.first(where: { $0.roster_id == r.oppRid })?.points
        else { return false }

        var state = ctx.state
        var m = old
        m.me.score = mine
        m.opp.score = theirs
        m.winP = refreshedWinChance(ctx, myScore: mine, oppScore: theirs)
        state.matchup = m
        state.compact = "\(m.me.name) \(Format.pts(mine)) · \(Format.pts(theirs)) · \(Int((m.winP * 100).rounded()))%"
        state.headline = state.compact
        state.background = true
        state.updatedAt = .now
        await live.update(ActivityContent(state: state, staleDate: state.staleDate))
        RefreshStore.update(RefreshContext(refresh: r, state: state, savedAt: ctx.savedAt))
        return true
    }

    /// My chance to win after a background refresh, given the last state the engine sent (`ctx.state.matchup`: scores, projected finals and
    /// its win chance, `ctx.refresh`: the league's weekly SD and each side's share of starter-minutes left at that time, `ctx.savedAt`: when)
    /// and the two scores Sleeper reports now. `WinModel.live` is the engine's own formula.
    static func refreshedWinChance(_ ctx: RefreshContext, myScore: Double, oppScore: Double) -> Double {
        // TODO(human)
        return ctx.state.matchup?.winP ?? 0.5
    }
}
