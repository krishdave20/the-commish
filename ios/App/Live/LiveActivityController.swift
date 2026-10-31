import ActivityKit
import Foundation

/// Keeps one Live Activity (lock screen and Dynamic Island) on the top activity of the latest snapshot: started when something is ongoing,
/// updated when what it shows changes, ended when nothing is. iOS lets an app start an activity only while it is in front; updates also come
/// from the background refresh (BackgroundRefresh.swift), which needs the context saved here. Off with the "live activities" switch in more.
@MainActor
final class LiveActivityController {
    static let shared = LiveActivityController()
    static let enabledKey = "liveActivities"

    private typealias Live = Activity<CommishActivityAttributes>

    var enabled: Bool {
        get { UserDefaults.standard.object(forKey: Self.enabledKey) as? Bool ?? true }
        set {
            UserDefaults.standard.set(newValue, forKey: Self.enabledKey)
            if !newValue { endAll() }
        }
    }

    private var current: Live? { Live.activities.first { $0.activityState == .active || $0.activityState == .stale } }

    func sync(_ snap: Snapshot) {
        if snap.status == .signedOut { return endAll() }
        guard snap.status == .ready, !snap.previewing else { return }
        guard enabled, ActivityAuthorizationInfo().areActivitiesEnabled, let team = snap.team, let activity = snap.activity else {
            RefreshStore.clear()
            return endAll()
        }
        let attributes = CommishActivityAttributes(teamName: team.name, leagueName: team.league)
        let state = CommishActivityAttributes.ContentState(activity)
        RefreshStore.save(activity: activity, state: state)

        if let live = current, live.attributes.teamName == attributes.teamName, live.attributes.leagueName == attributes.leagueName {
            guard !live.content.state.looksLike(state) else { return }
            Task { await live.update(ActivityContent(state: state, staleDate: state.staleDate)) }
        } else {
            endAll()
            _ = try? Live.request(attributes: attributes, content: ActivityContent(state: state, staleDate: state.staleDate), pushType: nil)
        }
    }

    func endAll() {
        for live in Live.activities {
            let state = live.content.state
            // a result stays on the lock screen for a while (iOS keeps an ended activity up to four hours); anything else goes at once
            let policy: ActivityUIDismissalPolicy = state.kind == "recap" ? .default : .immediate
            Task { await live.end(live.content, dismissalPolicy: policy) }
        }
    }
}

extension CommishActivityAttributes.ContentState {
    init(_ a: NativeActivity) {
        self.init(
            kind: a.kind, title: a.title, compact: a.compact, urgency: a.urgency, live: a.live, to: a.to, action: a.action,
            countdownLabel: a.countdown?.label, countdownAt: a.countdown.map { Date(timeIntervalSince1970: $0.at / 1000) },
            matchup: a.matchup.map {
                .init(week: $0.week, me: .init(name: $0.me.name, score: $0.me.score, projected: $0.me.projected),
                      opp: .init(name: $0.opp.name, score: $0.opp.score, projected: $0.opp.projected),
                      winP: $0.winP, progress: $0.progress, final: $0.final, nowPlaying: Array($0.nowPlaying.prefix(3)), lastPlay: $0.lastPlay)
            },
            headline: a.headline, lines: Array(a.lines.prefix(3)), updatedAt: Date(timeIntervalSince1970: a.updatedAt / 1000)
        )
    }

    /// The same on screen, the time aside (and a countdown's own text, which iOS ticks).
    func looksLike(_ other: Self) -> Bool {
        var a = self, b = other
        a.updatedAt = .distantPast; b.updatedAt = .distantPast
        if a.isCountdown { a.compact = ""; a.headline = "" }
        if b.isCountdown { b.compact = ""; b.headline = "" }
        return a == b
    }

    /// When iOS should dim the activity as out of date if nothing has updated it.
    var staleDate: Date {
        if let at = countdownAt, at > .now { return at.addingTimeInterval(5 * 60) }
        switch kind {
        case "matchup": return (matchup?.final ?? false) ? .now.addingTimeInterval(12 * 3600) : .now.addingTimeInterval(20 * 60)
        case "recap": return .now.addingTimeInterval(12 * 3600)
        default: return .now.addingTimeInterval(3600)
        }
    }
}

/// What the background refresh needs between launches: how to fetch the score, and the last state it showed.
struct RefreshContext: Codable {
    var refresh: NativeActivity.Refresh
    var state: CommishActivityAttributes.ContentState
    var savedAt: Date
}

enum RefreshStore {
    private static let key = "liveRefreshContext"

    static func save(activity: NativeActivity, state: CommishActivityAttributes.ContentState) {
        guard let m = activity.matchup, let r = m.refresh, !m.final else { return clear() }
        if let data = try? JSONEncoder().encode(RefreshContext(refresh: r, state: state, savedAt: .now)) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }

    static func load() -> RefreshContext? {
        UserDefaults.standard.data(forKey: key).flatMap { try? JSONDecoder().decode(RefreshContext.self, from: $0) }
    }

    static func update(_ ctx: RefreshContext) {
        if let data = try? JSONEncoder().encode(ctx) { UserDefaults.standard.set(data, forKey: key) }
    }

    static func clear() { UserDefaults.standard.removeObject(forKey: key) }
}
