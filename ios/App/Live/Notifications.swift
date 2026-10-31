import Foundation
import UserNotifications

/// The local alerts (src/app/pwa/alerts.ts: waivers in 1 hour, kickoff in 30 minutes, on the clock, the final, a big swing) raised as system
/// notifications. The engine page decides what to say and when; this only shows it, asks for permission when the person turns alerts on,
/// and opens the notice's page when it is tapped.
@MainActor
final class Notifications: NSObject, UNUserNotificationCenterDelegate {
    static let shared = Notifications()

    /// "default", "granted" or "denied", as the web's Notification.permission says it
    private(set) var permission = "default"
    /// opens an in-app path (set by the app)
    var onOpen: ((String) -> Void)?

    func start() {
        UNUserNotificationCenter.current().delegate = self
        Task { await readPermission() }
    }

    @discardableResult
    func readPermission() async -> String {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral: permission = "granted"
        case .denied: permission = "denied"
        default: permission = "default"
        }
        return permission
    }

    func request() async -> String {
        _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
        return await readPermission()
    }

    func deliver(title: String, body: String, tag: String, to: String) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.threadIdentifier = "commish"
        content.userInfo = ["to": to]
        // the tag dedupes: a newer notice with the same tag replaces the older one, as on the web
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: tag.isEmpty ? UUID().uuidString : tag, content: content, trigger: nil))
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let to = response.notification.request.content.userInfo["to"] as? String ?? "/"
        await MainActor.run { onOpen?(to) }
    }
}
