import SwiftUI

/// Everything else: the site's deeper tools as pushed pages, the league picker, the Live Activity switch, and the account.
struct MoreView: View {
    @Environment(AppModel.self) private var model
    @State private var liveActivities = LiveActivityController.shared.enabled
    @State private var confirmSignOut = false

    private let tools: [(path: String, symbol: String)] = [
        ("/takes", "flame"), ("/players", "magnifyingglass"), ("/waivers", "arrow.triangle.2.circlepath"), ("/trades", "arrow.left.arrow.right"),
        ("/draft", "list.bullet.rectangle"), ("/league", "chart.bar.xaxis"), ("/nfl", "sportscourt"), ("/almanac", "book.closed"), ("/leagues", "square.stack"),
    ]

    var body: some View {
        let snap = model.snapshot
        List {
            Section("tools") {
                ForEach(tools, id: \.path) { t in
                    NavigationLink(value: WebRoute(t.path)) { Label(Pages.title(for: t.path), systemImage: t.symbol) }
                }
            }
            .listRowBackground(Theme.sheet)

            if let leagues = snap?.leagues, leagues.count > 1 {
                Section("league") {
                    Picker("following", selection: Binding(get: { leagues.first(where: \.active)?.id ?? "" }, set: { model.follow(league: $0) })) {
                        ForEach(leagues) { Text($0.name.lowercased()).tag($0.id) }
                    }
                }
                .listRowBackground(Theme.sheet)
            }

            Section {
                Toggle(isOn: $liveActivities) { Label("live activities", systemImage: "rectangle.inset.topright.filled") }
                    .onChange(of: liveActivities) { _, on in
                        LiveActivityController.shared.enabled = on
                        if on, let snap = model.snapshot { LiveActivityController.shared.sync(snap) }
                    }
            } header: {
                Text("lock screen")
            } footer: {
                Text("your live score, kickoff and waiver countdowns and the draft clock on the lock screen and in the dynamic island. with the app closed, the score updates when iOS lets the app refresh (about every 15 minutes at best).")
            }
            .tint(Theme.green)
            .listRowBackground(Theme.sheet)

            Section("app") {
                NavigationLink(value: WebRoute("/settings")) { Label("front office", systemImage: "gearshape") }
                NavigationLink(value: WebRoute("/method")) { Label("under the hood", systemImage: "function") }
            }
            .listRowBackground(Theme.sheet)

            if let account = snap?.account {
                Section {
                    Button("sign out @\(account.username)", role: .destructive) { confirmSignOut = true }
                } footer: {
                    Text("the commish \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "") · data from sleeper, nflverse and fantasycalc")
                }
                .listRowBackground(Theme.sheet)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Theme.paper)
        .navigationTitle("more")
        .confirmationDialog("stop following these leagues on this phone?", isPresented: $confirmSignOut, titleVisibility: .visible) {
            Button("sign out", role: .destructive) { model.signOut() }
        }
    }
}
