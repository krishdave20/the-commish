import SwiftUI
import WebKit

/// A site page pushed inside a tab's navigation: the page with none of its own bars (it knows it is `embedded`), under the app's navigation
/// bar, with the native back swipe and pull to refresh. Links inside it stay inside it.
struct WebPageView: View {
    var route: WebRoute
    @State private var loading = true

    var body: some View {
        WebPage(path: route.path, loading: $loading)
            .ignoresSafeArea(edges: .bottom)
            .overlay { if loading { ProgressView().controlSize(.large).tint(Theme.ink3) } }
            .background(Theme.paper)
            .navigationTitle(route.title)
            .navigationBarTitleDisplayMode(.inline)
    }
}

private struct WebPage: UIViewRepresentable {
    var path: String
    @Binding var loading: Bool
    @Environment(AppModel.self) private var model

    func makeCoordinator() -> Coordinator { Coordinator(model: model, loading: $loading) }

    func makeUIView(context: Context) -> WKWebView {
        let view = WebViews.make(embedded: true, handler: context.coordinator.router)
        view.navigationDelegate = context.coordinator
        let refresh = UIRefreshControl()
        refresh.addTarget(context.coordinator, action: #selector(Coordinator.pulled(_:)), for: .valueChanged)
        view.scrollView.refreshControl = refresh
        context.coordinator.view = view
        view.load(URLRequest(url: AppSchemeHandler.url(for: path)))
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {}

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate {
        let model: AppModel
        let router: MessageRouter
        var loading: Binding<Bool>
        weak var view: WKWebView?

        init(model: AppModel, loading: Binding<Bool>) {
            self.model = model
            self.router = MessageRouter(model: model)
            self.loading = loading
        }

        @objc func pulled(_ control: UIRefreshControl) {
            guard let view else { return control.endRefreshing() }
            Task {
                await model.refresh(page: view)
                control.endRefreshing()
            }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            // the first paint comes from the app's own JS after load; give it a beat so the spinner does not flash off over an empty page
            Task { try? await Task.sleep(for: .milliseconds(150)); loading.wrappedValue = false }
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { loading.wrappedValue = false }

        /// Our own pages stay here; a link out (Sleeper, nflverse credits) opens in Safari.
        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
            guard let url = action.request.url else { return .cancel }
            let ours = url.scheme == AppSchemeHandler.scheme || url.host == AppSchemeHandler.devURL?.host
            if ours || action.targetFrame?.isMainFrame == false { return .allow }
            await UIApplication.shared.open(url)
            return .cancel
        }
    }
}
