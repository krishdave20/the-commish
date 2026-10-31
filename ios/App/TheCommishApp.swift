import SwiftUI

@main
struct TheCommishApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @State private var model = AppModel()
    @Environment(\.scenePhase) private var phase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                // thecommish://open?to=/gameday: a tap on the Live Activity or the Dynamic Island
                .onOpenURL { url in
                    guard url.scheme == "thecommish", let to = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "to" })?.value else { return }
                    model.open(to)
                }
                .onAppear { Notifications.shared.onOpen = { model.open($0) } }
        }
        .onChange(of: phase) { _, now in
            switch now {
            case .background: BackgroundRefresh.schedule()
            case .active:
                // back in front: the engine's live poll catches up at once, and the lock screen gets the engine's own numbers again
                Task { await model.refresh() }
                Task { await Notifications.shared.readPermission() }
            default: break
            }
        }
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        BackgroundRefresh.register()
        MainActor.assumeIsolated { Notifications.shared.start() }
        return true
    }
}
