import Foundation
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
                .onOpenURL { url in routeIncomingURL(url) }
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    if let url = activity.webpageURL { routeIncomingURL(url) }
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

    private func routeIncomingURL(_ url: URL) {
        guard let token = verificationToken(from: url) else {
            model.handleIncomingURL(url)
            return
        }

        Task {
            do {
                try await verifyEmail(token: token)

                if model.sessionState == .signedIn {
                    await model.refreshSessionAndData()
                    if model.sessionState == .signedIn {
                        model.message = "E-Mail-Adresse bestätigt. Du kannst jetzt Vertrauenspersonen einladen."
                    } else {
                        model.message = "E-Mail-Adresse bestätigt. Bitte melde dich jetzt erneut an."
                    }
                } else {
                    model.message = "E-Mail-Adresse bestätigt. Bitte melde dich jetzt an."
                }
            } catch {
                model.message = error.localizedDescription
            }
        }
    }

    private func verificationToken(from url: URL) -> String? {
        guard url.host?.lowercased() == "zweicheck.kamilunavo.com",
              let fragment = url.fragment else { return nil }

        for part in fragment.split(separator: "&") {
            let pair = part.split(separator: "=", maxSplits: 1).map(String.init)
            guard pair.count == 2, pair[0] == "verify" else { continue }
            let token = pair[1].removingPercentEncoding ?? pair[1]
            return token.isEmpty ? nil : token
        }
        return nil
    }

    private func verifyEmail(token: String) async throws {
        guard let url = URL(string: "https://zweicheck.kamilunavo.com/api/auth/verify-email") else {
            throw EmailVerificationError("Die Bestätigungsadresse ist ungültig.")
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["token": token])

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw EmailVerificationError("Keine gültige Serverantwort bei der E-Mail-Bestätigung.")
        }
        guard (200..<300).contains(http.statusCode) else {
            let serverMessage = ((try? JSONSerialization.jsonObject(with: data)) as? [String: Any])?["error"] as? String
            throw EmailVerificationError(serverMessage ?? "Die E-Mail-Adresse konnte nicht bestätigt werden. Bitte fordere einen neuen Link an.")
        }
    }
}

private struct EmailVerificationError: LocalizedError {
    let message: String

    init(_ message: String) {
        self.message = message
    }

    var errorDescription: String? { message }
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
