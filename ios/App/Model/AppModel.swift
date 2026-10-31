import Observation
import SwiftUI
import WebKit

/// A site page pushed inside one of the tabs.
struct WebRoute: Hashable, Identifiable {
    var path: String
    var title: String
    var id: String { path }

    init(_ path: String) {
        self.path = path
        self.title = Pages.title(for: path)
    }
}

/// The site's pages by path, lowercase as the site names them (src/app/names.ts).
enum Pages {
    static let names: [String: String] = [
        "/": "huddle", "/gameday": "game day", "/nfl": "nfl", "/takes": "hot takes", "/players": "scouting report", "/team": "locker room",
        "/race": "playoff picture", "/league": "around the league", "/waivers": "waiver wire", "/trades": "trade block", "/draft": "draft room",
        "/almanac": "record book", "/leagues": "all leagues", "/settings": "front office", "/method": "under the hood",
    ]

    static func title(for path: String) -> String {
        let base = String(path.split(separator: "?", maxSplits: 1).first ?? "")
        if base.hasPrefix("/players/") { return "player" }
        return names[base] ?? "the commish"
    }
}

/// Everything the screens read and every action they take. The numbers come from the hidden engine page (EngineView); this model decodes
/// its snapshots, keeps the last one on disk so the app opens on real data while the engine starts, routes links to the right tab, and hands
/// the top activity to the Live Activity controller.
@MainActor @Observable
final class AppModel {
    enum Tab: Hashable { case huddle, live, lineup, league, more }

    private(set) var snapshot: Snapshot?
    /// the snapshot on screen came from disk; the engine has not answered yet
    private(set) var fromDisk = false
    var tab: Tab = .huddle
    var paths: [Tab: [WebRoute]] = [:]
    /// a big jump in my live score, for a moment (the live tab flashes it)
    private(set) var bigMoment: String?

    @ObservationIgnored private(set) lazy var engine: WKWebView = WebViews.make(embedded: false, handler: bridge)
    @ObservationIgnored private lazy var bridge = MessageRouter(model: self)
    @ObservationIgnored private var started = false
    /// a league switch is under way: show its loading screen. Otherwise a ready screen stays up while the engine boots or reloads.
    @ObservationIgnored private var switching = false
    @ObservationIgnored private var pageRefreshes: [ObjectIdentifier: CheckedContinuation<Void, Never>] = [:]

    init() {
        if let data = try? Data(contentsOf: Self.cacheURL), let snap = try? Snapshot.decode(data), snap.status == .ready {
            snapshot = snap
            fromDisk = true
        }
    }

    /// Loads the engine page once. Its web view must be on screen (behind the tabs) or WebKit pauses its timers.
    func start() {
        guard !started else { return }
        started = true
        engine.load(URLRequest(url: AppSchemeHandler.url(for: "/native-feed")))
    }

    var signedOut: Bool { snapshot?.status == .signedOut }

    // MARK: - from the pages

    func receive(_ message: PageMessage, from view: WKWebView?) {
        switch message {
        case .snapshot(let data):
            guard view === engine else { return }
            accept(data)
        case .haptic(let style):
            Haptics.play(style)
        case .notify(let title, let body, let tag, let to):
            Notifications.shared.deliver(title: title, body: body, tag: tag, to: to)
        case .refreshed:
            if let view, let c = pageRefreshes.removeValue(forKey: ObjectIdentifier(view)) { c.resume() }
        case .notifyRequest(let id):
            Task {
                let p = await Notifications.shared.request()
                WebViews.reply(view, id: id, value: p)
                WebViews.publish(permission: p, to: engine)
            }
        }
    }

    private func accept(_ data: Data) {
        guard let snap = try? Snapshot.decode(data) else { return }
        if snap.status == .loading, !switching, snapshot?.status == .ready { return }
        if snap.status == .ready { switching = false }
        let before = snapshot?.matchup
        snapshot = snap
        fromDisk = false
        if snap.status == .ready { try? data.write(to: Self.cacheURL, options: .atomic) }
        if snap.status == .signedOut { try? FileManager.default.removeItem(at: Self.cacheURL) }
        noticeBigMoment(from: before, to: snap.matchup)
        LiveActivityController.shared.sync(snap)
    }

    /// My score rose by 6 or more between two polls (the web pill's rule, src/engine/moments/activity.ts BIG_MOMENT).
    private func noticeBigMoment(from old: LiveMatchup?, to new: LiveMatchup?) {
        guard let old, let new, old.id == new.id else { return }
        let delta = new.a.score - old.a.score
        guard delta >= 6 else { return }
        let top = new.a.starters.max { a, b in
            (a.points - (old.a.starters.first { $0.pid == a.pid }?.points ?? a.points)) < (b.points - (old.a.starters.first { $0.pid == b.pid }?.points ?? b.points))
        }
        bigMoment = "+\(Format.pts(delta))" + (top.map { " · \(Names.short($0.name, pos: $0.pos))" } ?? "")
        Haptics.play("success")
        Task { try? await Task.sleep(for: .seconds(4.5)); bigMoment = nil }
    }

    // MARK: - actions

    /// Pulls everything again (the engine's model, the league, a live poll).
    func refresh() async {
        _ = try? await engine.callAsyncJavaScript("await window.commishFeed?.refresh()", contentWorld: .page)
    }

    /// A pushed page's pull to refresh: the page refreshes itself and says when it is done.
    func refresh(page: WKWebView) async {
        await withCheckedContinuation { c in
            pageRefreshes[ObjectIdentifier(page)] = c
            page.evaluateJavaScript("window.dispatchEvent(new CustomEvent('commish:refresh'))")
            Task { try? await Task.sleep(for: .seconds(20)); pageRefreshes.removeValue(forKey: ObjectIdentifier(page))?.resume() }
        }
    }

    func lookup(_ username: String) async throws -> Lookup {
        let raw = try await engine.callAsyncJavaScript("return await window.commishFeed.lookup(name)", arguments: ["name": username], contentWorld: .page)
        guard let raw, let data = try? JSONSerialization.data(withJSONObject: raw) else { throw URLError(.cannotParseResponse) }
        return try JSONDecoder().decode(Lookup.self, from: data)
    }

    func link(_ username: String, leagues: [String]) async -> Bool {
        let ok = try? await engine.callAsyncJavaScript("return await window.commishFeed.link(name, ids)", arguments: ["name": username, "ids": leagues], contentWorld: .page)
        return (ok as? Bool) ?? false
    }

    func follow(league id: String) {
        switching = true
        Task { _ = try? await engine.callAsyncJavaScript("window.commishFeed?.setLeague(id)", arguments: ["id": id], contentWorld: .page) }
        Haptics.play("light")
    }

    func signOut() {
        Task { _ = try? await engine.callAsyncJavaScript("window.commishFeed?.signOut()", contentWorld: .page) }
        LiveActivityController.shared.endAll()
        paths = [:]
        tab = .huddle
    }

    /// Opens an in-app path: the four native screens by tab, anything else as a site page pushed on the tab in front.
    func open(_ path: String) {
        let base = String(path.split(separator: "?", maxSplits: 1).first ?? "")
        switch base {
        case "", "/": tab = .huddle
        case "/gameday" where !path.contains("week="): tab = .live
        case "/team": tab = .lineup
        case "/race": tab = .league
        default: paths[tab, default: []].append(WebRoute(path))
        }
    }

    func path(for tab: Tab) -> Binding<[WebRoute]> {
        Binding(get: { self.paths[tab] ?? [] }, set: { self.paths[tab] = $0 })
    }

    private static var cacheURL: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("snapshot.json")
    }
}

/// Check in's answer (`commishFeed.lookup`).
struct Lookup: Decodable {
    struct League: Decodable, Identifiable, Equatable { var id: String; var name: String; var season: String; var detail: String; var picked: Bool }
    var found: Bool
    var userId: String?
    var username: String?
    var displayName: String?
    var avatar: String?
    var leagues: [League]?
}

/// Receives every page's messages and hands them to the model (WKScriptMessageHandler needs an NSObject).
@MainActor
final class MessageRouter: NSObject, WKScriptMessageHandler {
    private weak var model: AppModel?
    init(model: AppModel) { self.model = model }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let parsed = PageMessage(message.body) else { return }
        model?.receive(parsed, from: message.webView)
    }
}

enum Names {
    private static let suffixes: Set<String> = ["jr", "jr.", "sr", "sr.", "ii", "iii", "iv", "v"]

    /// "ja'marr chase" → "chase"; "kenneth walker iii" → "walker"; a team defense keeps its name. (activity.ts `shortName`)
    static func short(_ name: String, pos: String? = nil) -> String {
        if pos == "DEF" { return name.lowercased() }
        var words = name.split(separator: " ").map(String.init)
        while words.count > 1, let last = words.last, suffixes.contains(last.lowercased()) { words.removeLast() }
        return (words.last ?? name).lowercased()
    }

    /// "CM" for a monogram.
    static func initials(_ name: String) -> String {
        let parts = name.split(separator: " ").prefix(2)
        return parts.compactMap { $0.first.map(String.init) }.joined().uppercased()
    }
}
