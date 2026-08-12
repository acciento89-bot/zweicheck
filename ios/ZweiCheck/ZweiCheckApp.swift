import SwiftUI

@main
@MainActor
struct ZweiCheckApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @Environment(\.scenePhase) private var scenePhase
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
                .onReceive(NotificationCenter.default.publisher(for: .zweiCheckDidReceiveAPNSToken)) { notification in
                    guard let token = notification.object as? String else { return }
                    Task { await model.syncNativePushToken(token) }
                }
                .onReceive(NotificationCenter.default.publisher(for: .zweiCheckOpenNotificationURL)) { notification in
                    guard let url = notification.object as? URL else { return }
                    model.handleIncomingURL(url)
                    _ = NativePushManager.consumePendingNotificationURL()
                }
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            model.refreshSharedDraft()
            if model.sessionState == .signedIn {
                Task { await model.refreshSessionAndData() }
            }
        }
    }
}

private struct RootView: View {
    let model: AppModel
    @AppStorage("zweicheck.onboarding.completed") private var onboardingCompleted = false

    var body: some View {
        Group {
            if !onboardingCompleted {
                OnboardingView(completed: $onboardingCompleted)
            } else {
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
