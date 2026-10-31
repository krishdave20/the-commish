import ActivityKit
import Foundation

/// The Live Activity on the lock screen and in the Dynamic Island. Shared by the app (which starts and updates it) and the widget extension
/// (which draws it). One activity at a time: the top one the web pill would show. Its kind can change while it runs (kickoff → live matchup →
/// final), so the kind lives in the content state; the attributes only name the team and league, and a league switch starts a new activity.
struct CommishActivityAttributes: ActivityAttributes {
    struct Side: Codable, Hashable { var name: String; var score: Double; var projected: Double }

    struct Matchup: Codable, Hashable {
        var week: Int
        var me: Side
        var opp: Side
        /// my chance to win, 0 to 1
        var winP: Double
        /// share of starter-minutes played, 0 to 1
        var progress: Double
        var final: Bool
        var nowPlaying: [String]
        var lastPlay: String?
    }

    struct ContentState: Codable, Hashable {
        /// matchup, kickoff, waivers, draft, recap or generic
        var kind: String
        /// "live matchup", "kickoff"
        var title: String
        /// the pill's line: "icemen 95.0 · 58.8 · 80%"
        var compact: String
        /// urgent, soon or calm
        var urgency: String
        var live: Bool
        /// the in-app path a tap opens ("/gameday") and its label
        var to: String
        var action: String
        /// a countdown's label and end: drawn with a self-updating timer, so no update is needed while it runs
        var countdownLabel: String?
        var countdownAt: Date?
        var matchup: Matchup?
        var headline: String
        var lines: [String]
        var updatedAt: Date
        /// the score came from a background refresh (the win chance is the app's estimate until it opens again)
        var background: Bool = false
    }

    var teamName: String
    var leagueName: String
}

extension CommishActivityAttributes.ContentState {
    /// The link a tap on the activity opens: `thecommish://open?to=/gameday`.
    var url: URL {
        var c = URLComponents()
        c.scheme = "thecommish"
        c.host = "open"
        c.queryItems = [URLQueryItem(name: "to", value: to)]
        return c.url ?? URL(string: "thecommish://open")!
    }

    var isCountdown: Bool { countdownAt.map { $0 > .now } ?? false }
}
