import Foundation
import UniformTypeIdentifiers
import WebKit

/// Serves the built site (copied into the app as `web/` by the "Copy web app" build phase) at `commish://app/…`. A custom scheme rather than
/// `file://`, because module scripts, IndexedDB and localStorage need a real origin; every web view in the app shares this one, so the hidden
/// feed page and the pages pushed on screen see the same accounts and cache.
///
/// The nightly nflverse JSON (`data/nflverse/*.json`) is not in the build: it is fetched from the live site, so the app reads the same
/// numbers the site does without a new build each night.
@MainActor
final class AppSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "commish"
    static let host = "app"
    static let liveSite = URL(string: "https://krishdave20.github.io/the-commish/")!

    /// A development build can load from `npm run dev` instead (scheme environment variable COMMISH_DEV_URL, e.g. http://192.168.1.20:5173/).
    static var devURL: URL? {
        #if DEBUG
        ProcessInfo.processInfo.environment["COMMISH_DEV_URL"].flatMap(URL.init(string:))
        #else
        nil
        #endif
    }

    /// The page for an in-app path ("/gameday" → commish://app/index.html#/gameday).
    static func url(for path: String) -> URL {
        let hash = path.hasPrefix("/") ? path : "/" + path
        if let dev = devURL { return URL(string: "#\(hash)", relativeTo: dev)!.absoluteURL }
        return URL(string: "\(scheme)://\(host)/index.html#\(hash)")!
    }

    private let root: URL? = Bundle.main.url(forResource: "web", withExtension: nil)
    /// tasks WebKit has cancelled: answering one would crash
    private var stopped = Set<ObjectIdentifier>()

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return fail(task, URLError(.badURL)) }
        var path = url.path
        if path.isEmpty || path == "/" { path = "/index.html" }

        if path.hasPrefix("/data/"), let file = root?.appendingPathComponent(String(path.dropFirst())), !FileManager.default.fileExists(atPath: file.path) {
            return proxy(task, to: URL(string: String(path.dropFirst()), relativeTo: Self.liveSite)!)
        }
        let notFound = { self.respond(task, url: url, status: 404, type: "text/plain", data: Data("not found".utf8)) }
        guard let root else { return notFound() }
        let file = root.appendingPathComponent(String(path.dropFirst())).standardizedFileURL
        // nothing outside web/ (a "../" in a path)
        guard file.path.hasPrefix(root.standardizedFileURL.path), let data = try? Data(contentsOf: file) else { return notFound() }
        respond(task, url: url, status: 200, type: Self.mimeType(for: file), data: data)
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {
        stopped.insert(ObjectIdentifier(task))
    }

    // MARK: - helpers

    private func proxy(_ task: WKURLSchemeTask, to remote: URL) {
        Task {
            do {
                let (data, response) = try await URLSession.shared.data(from: remote)
                let http = response as? HTTPURLResponse
                respond(task, url: task.request.url ?? remote, status: http?.statusCode ?? 200, type: http?.mimeType ?? "application/json", data: data)
            } catch {
                fail(task, error)
            }
        }
    }

    private func isStopped(_ task: WKURLSchemeTask) -> Bool {
        stopped.remove(ObjectIdentifier(task)) != nil
    }

    private func respond(_ task: WKURLSchemeTask, url: URL, status: Int, type: String, data: Data) {
        guard !isStopped(task) else { return }
        let headers = [
            "Content-Type": type,
            "Content-Length": String(data.count),
            // the built assets have content hashes in their names; index.html must always be fresh after an app update
            "Cache-Control": url.path.hasPrefix("/assets/") ? "max-age=31536000, immutable" : "no-cache",
        ]
        let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    private func fail(_ task: WKURLSchemeTask, _ error: Error) {
        guard !isStopped(task) else { return }
        task.didFailWithError(error)
    }

    static func mimeType(for file: URL) -> String {
        switch file.pathExtension.lowercased() {
        case "html": return "text/html; charset=utf-8"
        case "js", "mjs": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json", "webmanifest": return "application/json"
        case "svg": return "image/svg+xml"
        case "woff2": return "font/woff2"
        case "woff": return "font/woff"
        default: return UTType(filenameExtension: file.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        }
    }
}
