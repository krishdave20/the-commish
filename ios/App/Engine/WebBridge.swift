import UIKit
import WebKit

/// Builds the app's web views and carries messages between them and the app (src/app/native/bridge.ts is the other end).
/// Every web view gets `window.commishNative` before any script runs and a `commish` message handler; pushed pages are `embedded`.
@MainActor
enum WebViews {
    private static let schemeHandler = AppSchemeHandler()

    static func make(embedded: Bool, handler: WKScriptMessageHandler) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.setURLSchemeHandler(schemeHandler, forURLScheme: AppSchemeHandler.scheme)
        config.allowsInlineMediaPlayback = true
        let content = WKUserContentController()
        content.addUserScript(WKUserScript(source: infoScript(embedded: embedded), injectionTime: .atDocumentStart, forMainFrameOnly: true))
        content.add(WeakMessageHandler(handler), name: "commish")
        config.userContentController = content

        let view = WKWebView(frame: .zero, configuration: config)
        view.isOpaque = false
        view.backgroundColor = UIColor(Theme.paper)
        view.scrollView.backgroundColor = UIColor(Theme.paper)
        view.allowsBackForwardNavigationGestures = false
        view.allowsLinkPreview = false
        #if DEBUG
        view.isInspectable = true // Safari → Develop → Simulator
        #endif
        return view
    }

    private static func infoScript(embedded: Bool) -> String {
        let info: [String: Any] = [
            "platform": "ios",
            "version": Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0",
            "build": Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0",
            "notify": Notifications.shared.permission,
            "embedded": embedded,
        ]
        let json = (try? JSONSerialization.data(withJSONObject: info)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
        return "window.commishNative = \(json);"
    }

    /// Tells every page the new notification permission (pwa/notify.ts reads `commishNative.notify`).
    static func publish(permission: String, to view: WKWebView) {
        view.evaluateJavaScript("window.commishNative && (window.commishNative.notify = '\(permission)');")
    }

    /// Answers an `askNative` question.
    static func reply(_ view: WKWebView?, id: Int, value: String) {
        view?.evaluateJavaScript("window.commishNativeReply && window.commishNativeReply(\(id), '\(value)');")
    }
}

/// A message from a page, decoded.
enum PageMessage {
    case snapshot(Data)
    case haptic(String)
    case notify(title: String, body: String, tag: String, to: String)
    case refreshed
    case notifyRequest(id: Int)

    init?(_ body: Any) {
        guard let dict = body as? [String: Any], let type = dict["type"] as? String else { return nil }
        switch type {
        case "snapshot":
            guard let snap = dict["snapshot"], let data = try? JSONSerialization.data(withJSONObject: snap) else { return nil }
            self = .snapshot(data)
        case "haptic": self = .haptic(dict["style"] as? String ?? "medium")
        case "notify":
            guard let n = dict["notice"] as? [String: Any] else { return nil }
            self = .notify(title: n["title"] as? String ?? "", body: n["body"] as? String ?? "", tag: n["tag"] as? String ?? "", to: n["to"] as? String ?? "/")
        case "refreshed": self = .refreshed
        case "notify-request": self = .notifyRequest(id: dict["id"] as? Int ?? 0)
        default: return nil
        }
    }
}

/// WKUserContentController keeps its handlers strongly; this keeps the real handler weakly so a closed page can go.
@MainActor
final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
    private weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}

enum Haptics {
    @MainActor static func play(_ style: String) {
        switch style {
        case "success": UINotificationFeedbackGenerator().notificationOccurred(.success)
        case "warning": UINotificationFeedbackGenerator().notificationOccurred(.warning)
        case "light": UIImpactFeedbackGenerator(style: .light).impactOccurred()
        case "heavy": UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
        default: UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        }
    }
}
