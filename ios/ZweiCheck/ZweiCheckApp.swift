import SwiftUI

@main
@MainActor
struct ZweiCheckApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView(model: model)
                .tint(AppTheme.teal)
                .task { await model.bootstrap() }
                .onOpenURL { url in model.handleIncomingURL(url) }
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    if let url = activity.webpageURL { model.handleIncomingURL(url) }
                }
        }
    }
}

private struct RootView: View {
    let model: AppModel

    var body: some View {
        Group {
            switch model.sessionState {
            case .checking:
                VStack(spacing: 18) {
                    ProgressView()
                    Text("ZweiCheck wird gestartet …")
                        .font(.headline)
                }
            case .signedOut:
                AuthView(model: model)
            case .signedIn:
                AppShellView(model: model)
            }
        }
        .background(AppTheme.background.ignoresSafeArea())
        .alert("Hinweis", isPresented: Binding(
            get: { model.message != nil },
            set: { if !$0 { model.message = nil } }
        )) {
            Button("OK", role: .cancel) { model.message = nil }
        } message: {
            Text(model.message ?? "")
        }
    }
}
