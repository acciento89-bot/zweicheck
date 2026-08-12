import Foundation
import UIKit
import UserNotifications

enum NativePushManager {
    static let tokenDefaultsKey = "zweicheck.apns.token"
    static let pendingURLDefaultsKey = "zweicheck.apns.pending-url"

    static var environment: String {
        #if DEBUG
        return "sandbox"
        #else
        return "production"
        #endif
    }

    static var storedToken: String? {
        UserDefaults.standard.string(forKey: tokenDefaultsKey)
    }

    static func authorizationStatus() async -> UNAuthorizationStatus {
        await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
    }

    static func requestAuthorization() async throws -> Bool {
        let center = UNUserNotificationCenter.current()
        let granted = try await center.requestAuthorization(options: [.alert, .sound, .badge])
        if granted { await registerForRemoteNotifications() }
        return granted
    }

    static func registerForRemoteNotifications() async {
        await MainActor.run {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    static func storePendingNotificationURL(_ url: URL) {
        UserDefaults.standard.set(url.absoluteString, forKey: pendingURLDefaultsKey)
    }

    static func consumePendingNotificationURL() -> URL? {
        guard let value = UserDefaults.standard.string(forKey: pendingURLDefaultsKey),
              let url = URL(string: value) else { return nil }
        UserDefaults.standard.removeObject(forKey: pendingURLDefaultsKey)
        return url
    }
}

extension Notification.Name {
    static let zweiCheckDidReceiveAPNSToken = Notification.Name("ZweiCheckDidReceiveAPNSToken")
    static let zweiCheckOpenNotificationURL = Notification.Name("ZweiCheckOpenNotificationURL")
}
