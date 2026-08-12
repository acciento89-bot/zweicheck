import Foundation
import UIKit
import UserNotifications

enum NativePushManager {
    static let tokenDefaultsKey = "zweicheck.apns.token"

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
}

extension Notification.Name {
    static let zweiCheckDidReceiveAPNSToken = Notification.Name("ZweiCheckDidReceiveAPNSToken")
    static let zweiCheckOpenNotificationURL = Notification.Name("ZweiCheckOpenNotificationURL")
}
