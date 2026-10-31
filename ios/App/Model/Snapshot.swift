import Foundation

/// What the native screens draw: the web engine's own numbers, decoded from the hidden feed page's JSON
/// (src/app/native/snapshot.ts, `NativeSnapshot`; keep the two in step). Times are epoch milliseconds, as JavaScript sends them.
struct Snapshot: Decodable, Equatable {
    static let supportedVersion = 1

    enum Status: String, Decodable { case signedOut = "signed-out", loading, ready, error }

    var v: Int
    var status: Status
    var message: String?
    var account: Account?
    var leagues: [LeagueRef]
    var team: Team?
    var hero: Hero?
    var plan: [PlanItem]
    var activity: NativeActivity?
    var matchup: LiveMatchup?
    var scoreboard: [LiveMatchup]
    var standings: [Standing]
    var lineup: Lineup?
    var live: Bool
    var asOf: Double?
    var previewing: Bool

    struct Account: Decodable, Equatable { var userId: String; var username: String; var displayName: String; var avatar: String? }
    struct LeagueRef: Decodable, Equatable, Identifiable { var id: String; var name: String; var active: Bool }
    struct Team: Decodable, Equatable {
        var rid: Int; var name: String; var league: String; var season: String; var week: Int; var record: String; var place: Int?; var teams: Int
    }
    struct Hero: Decodable, Equatable { var kind: String; var sentence: String; var odds: String? }
    struct PlanItem: Decodable, Equatable, Identifiable {
        var id: String; var title: String; var detail: String; var to: String; var action: String; var live: Bool; var countdownTo: Double?
        var countdown: Date? { countdownTo.map { Date(timeIntervalSince1970: $0 / 1000) } }
    }
}

/// A player drawn with a headshot on his team's colours.
protocol PlayerLike {
    var pid: String { get }
    var name: String { get }
    var pos: String { get }
    var team: String? { get }
    var colors: [String]? { get }
}

struct Starter: Decodable, Equatable, Identifiable, PlayerLike {
    enum State: String, Decodable { case pre, live, final, idle }
    var pid: String; var name: String; var pos: String; var team: String?; var colors: [String]?
    var slot: String; var points: Double; var projected: Double; var state: State; var game: String
    var id: String { pid }
}

struct TeamLive: Decodable, Equatable { var rid: Int; var name: String; var manager: String; var score: Double; var projected: Double; var starters: [Starter] }

/// A matchup with my team as `a` when it is mine.
struct LiveMatchup: Decodable, Equatable, Identifiable {
    var id: Int; var a: TeamLive; var b: TeamLive; var winA: Double; var preWinA: Double; var final: Bool; var tags: [String]
}

struct Standing: Decodable, Equatable, Identifiable {
    var rid: Int; var team: String; var manager: String; var wins: Int; var losses: Int; var ties: Int; var pf: Double
    /// chances, 0 to 1
    var playoff: Double; var title: Double
    var mark: String; var clinch: Bool; var elim: Bool; var isMe: Bool; var place: Int
    var id: Int { rid }
    var record: String { ties > 0 ? "\(wins)–\(losses)–\(ties)" : "\(wins)–\(losses)" }
}

struct LineupRow: Decodable, Equatable, Identifiable, PlayerLike {
    var pid: String; var name: String; var pos: String; var team: String?; var colors: [String]?
    var slot: String; var starting: Bool; var exp: Double; var floor: Double; var ceiling: Double; var injury: String; var played: Bool; var points: Double?
    var id: String { pid }
}

struct Lineup: Decodable, Equatable { var week: Int; var total: Double; var best: Double; var floor: Double; var ceiling: Double; var rows: [LineupRow] }

/// The top live activity, as the web pill shows it (src/app/native/activityPayload.ts, `NativeActivity`).
struct NativeActivity: Decodable, Equatable {
    struct Side: Decodable, Equatable { var name: String; var score: Double; var projected: Double }
    struct Refresh: Codable, Equatable { var leagueId: String; var week: Int; var rid: Int; var oppRid: Int; var sd: Double; var remMe: Double; var remOpp: Double }
    struct Matchup: Decodable, Equatable {
        var week: Int; var me: Side; var opp: Side; var winP: Double; var progress: Double; var final: Bool
        var nowPlaying: [String]; var lastPlay: String?; var refresh: Refresh?
    }
    struct Countdown: Decodable, Equatable { var label: String; var at: Double }

    var kind: String; var title: String; var compact: String; var urgency: String; var live: Bool
    var to: String; var action: String
    var countdown: Countdown?
    var matchup: Matchup?
    var headline: String; var lines: [String]
    var updatedAt: Double
}

extension Snapshot {
    static func decode(_ data: Data) throws -> Snapshot { try JSONDecoder().decode(Snapshot.self, from: data) }

    var me: Standing? { standings.first { $0.isMe } }
    var asOfDate: Date? { asOf.map { Date(timeIntervalSince1970: $0 / 1000) } }
}
