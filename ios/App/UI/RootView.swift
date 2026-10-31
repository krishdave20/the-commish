import SwiftUI
import WebKit

/// The app: five native tabs over the hidden engine page. Signed out, check in covers everything; while the very first model builds, a quiet
/// loading screen says which step it is on. Each tab has its own navigation stack, so a pushed site page keeps its place when you switch away.
struct RootView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        ZStack {
            // the engine page has to be in the window, or WebKit pauses it: tucked behind everything, too small to see
            EngineView().frame(width: 2, height: 2).allowsHitTesting(false).accessibilityHidden(true)
            Theme.paper.ignoresSafeArea()
            content
        }
        .tint(Theme.green)
        .fullScreenCover(isPresented: .constant(model.signedOut)) { CheckInView() }
        .onAppear { model.start() }
    }

    @ViewBuilder private var content: some View {
        let snap = model.snapshot
        if let snap, snap.v > Snapshot.supportedVersion {
            EmptyNote(title: "update the app", detail: "this build of the commish is older than its engine.", symbol: "arrow.down.app")
        } else if snap == nil || snap?.status == .loading {
            LoadingView(message: snap?.message)
        } else if snap?.status == .error, model.snapshot?.team == nil {
            VStack(spacing: 16) {
                EmptyNote(title: "couldn't load your league", detail: snap?.message, symbol: "wifi.exclamationmark")
                Button("try again") { Task { await model.refresh() } }.buttonStyle(.borderedProminent)
            }
        } else {
            Tabs()
        }
    }
}

private struct Tabs: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        TabView(selection: $model.tab) {
            Tab("huddle", systemImage: "house", value: AppModel.Tab.huddle) { stack(.huddle) { HuddleView() } }
            Tab("game day", systemImage: "sportscourt", value: AppModel.Tab.live) { stack(.live) { GameDayView() } }
                .badge(model.snapshot?.live == true ? Text("live") : nil)
            Tab("lineup", systemImage: "person.3", value: AppModel.Tab.lineup) { stack(.lineup) { LineupView() } }
            Tab("league", systemImage: "trophy", value: AppModel.Tab.league) { stack(.league) { LeagueView() } }
            Tab("more", systemImage: "ellipsis.circle", value: AppModel.Tab.more) { stack(.more) { MoreView() } }
        }
        .sensoryFeedback(.selection, trigger: model.tab)
    }

    private func stack<V: View>(_ tab: AppModel.Tab, @ViewBuilder root: () -> V) -> some View {
        NavigationStack(path: model.path(for: tab)) {
            root()
                .navigationDestination(for: WebRoute.self) { WebPageView(route: $0) }
                .toolbarBackground(Theme.paper, for: .navigationBar)
        }
    }
}

private struct LoadingView: View {
    var message: String?
    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: "football.fill").font(.system(size: 44)).foregroundStyle(Theme.green)
                .symbolEffect(.pulse, options: .repeating)
            Text("the commish").font(Theme.display(34))
            Text(message?.lowercased() ?? "warming up…").font(.subheadline).foregroundStyle(Theme.ink2).contentTransition(.opacity)
                .animation(.easeInOut, value: message)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.paper)
    }
}

/// Hosts the engine page's web view (owned by the model, so it outlives any view).
private struct EngineView: UIViewRepresentable {
    @Environment(AppModel.self) private var model
    func makeUIView(context: Context) -> WKWebView { model.engine }
    func updateUIView(_ view: WKWebView, context: Context) {}
}
