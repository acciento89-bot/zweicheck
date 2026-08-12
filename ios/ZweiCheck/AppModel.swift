import Foundation
import Observation

@Observable
@MainActor
final class AppModel {
    enum SessionState { case checking, signedOut, signedIn }
    enum Destination: Equatable { case checks, people }

    private let api = APIClient()
    private var didBootstrap = false

    var sessionState: SessionState = .checking
    var user: APIUser?
    var checks: [CheckItem] = []
    var routing: TrustRoutingEnvelope?
    var activities: [ActivityItem] = []
    var unreadActivityCount = 0
    var isBusy = false
    var message: String?
    var destination: Destination?
    var pendingCheckID: String?
    var pendingInviteCode: String?

    func bootstrap() async {
        guard !didBootstrap else { return }
        didBootstrap = true
        do {
            user = try await api.me()
            sessionState = .signedIn
            await refreshAll()
        } catch {
            sessionState = .signedOut
        }
    }

    func login(email: String, password: String) async {
        await runBusy {
            user = try await api.login(email: email, password: password)
            sessionState = .signedIn
            await refreshAll()
        }
    }

    func register(name: String, email: String, password: String) async {
        await runBusy {
            user = try await api.register(name: name, email: email, password: password)
            sessionState = .signedIn
            await refreshAll()
            if user?.emailVerified == false { message = "Bitte bestätige jetzt deine E-Mail-Adresse. Wir haben dir eine Nachricht geschickt." }
        }
    }

    func logout() async {
        await api.logout()
        user = nil
        checks = []
        routing = nil
        activities = []
        unreadActivityCount = 0
        sessionState = .signedOut
    }

    func refreshAll() async {
        guard sessionState == .signedIn else { return }
        do {
            async let checksTask = api.checks()
            async let routingTask = api.trustRouting()
            async let activitiesTask = api.activities()
            checks = try await checksTask
            routing = try await routingTask
            let activityResult = try await activitiesTask
            activities = activityResult.activities
            unreadActivityCount = activityResult.unreadCount
        } catch { message = error.localizedDescription }
    }

    func refreshChecks() async { do { checks = try await api.checks() } catch { message = error.localizedDescription } }
    func refreshPeople() async { do { routing = try await api.trustRouting() } catch { message = error.localizedDescription } }

    func refreshActivities() async {
        do {
            let result = try await api.activities()
            activities = result.activities
            unreadActivityCount = result.unreadCount
        } catch { message = error.localizedDescription }
    }

    func markActivityRead(_ activity: ActivityItem) async {
        guard activity.isUnread else { return }
        do {
            _ = try await api.markActivityRead(id: activity.id)
            await refreshActivities()
        } catch { message = error.localizedDescription }
    }

    func markAllActivitiesRead() async {
        await runBusy {
            try await api.markAllActivitiesRead()
            await refreshActivities()
        }
    }

    func openActivity(_ activity: ActivityItem) async {
        await markActivityRead(activity)
        if let checkID = activity.checkId {
            pendingCheckID = checkID
            destination = .checks
        } else {
            destination = .people
        }
    }

    func handleIncomingURL(_ url: URL) {
        guard url.host?.lowercased() == "zweicheck.kamilunavo.com" else { return }
        let values = fragmentValues(url.fragment)
        if let checkID = values["check"], !checkID.isEmpty {
            pendingCheckID = checkID
            destination = .checks
        } else if let inviteCode = values["invite"], !inviteCode.isEmpty {
            pendingInviteCode = inviteCode
            destination = .people
        }
    }

    func resendVerification() async {
        await runBusy { try await api.resendVerification(); message = "Bestätigungs-E-Mail wurde erneut gesendet." }
    }

    func setPresence(_ status: String) async {
        await runBusy { try await api.updatePresence(status: status, durationMinutes: status == "neutral" ? nil : 240); routing = try await api.trustRouting() }
    }

    func invite(email: String) async -> String? {
        var code: String?
        await runBusy { code = try await api.invite(email: email).code; message = "Einladung wurde erstellt. Code: \(code ?? "")" }
        return code
    }

    func accept(code: String) async {
        await runBusy { try await api.acceptInvitation(code: code); routing = try await api.trustRouting(); message = "Vertrauensperson wurde verbunden." }
    }

    func createCheck(
        reviewerID: String,
        category: CheckCategory,
        description: String,
        amount: String?,
        images: [UploadImage]
    ) async -> Bool {
        var success = false
        await runBusy {
            let created = try await api.createCheck(
                reviewerID: reviewerID,
                category: category,
                description: description,
                amount: amount,
                images: images
            )
            checks.insert(created, at: 0)
            success = true
        }
        return success
    }

    func respond(_ check: CheckItem, recommendation: Recommendation, note: String) async -> CheckItem? {
        var updated: CheckItem?
        await runBusy { updated = try await api.respond(checkID: check.id, recommendation: recommendation, note: note); await refreshChecks(); await refreshActivities() }
        return updated
    }

    func close(_ check: CheckItem) async {
        await runBusy { try await api.close(checkID: check.id); await refreshChecks(); await refreshActivities() }
    }

    func deleteAccount(password: String) async {
        await runBusy {
            try await api.deleteAccount(password: password)
            user = nil
            checks = []
            routing = nil
            activities = []
            unreadActivityCount = 0
            sessionState = .signedOut
            message = "Dein ZweiCheck-Konto wurde gelöscht."
        }
    }

    private func fragmentValues(_ fragment: String?) -> [String: String] {
        guard let fragment else { return [:] }
        var result: [String: String] = [:]
        for part in fragment.split(separator: "&") {
            let pair = part.split(separator: "=", maxSplits: 1).map(String.init)
            guard pair.count == 2 else { continue }
            result[pair[0]] = pair[1].removingPercentEncoding ?? pair[1]
        }
        return result
    }

    private func runBusy(_ work: () async throws -> Void) async {
        guard !isBusy else { return }
        isBusy = true
        defer { isBusy = false }
        do { try await work() } catch { message = error.localizedDescription }
    }
}
