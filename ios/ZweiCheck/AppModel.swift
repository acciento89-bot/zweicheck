import Foundation
import Observation
import UserNotifications

@Observable
@MainActor
final class AppModel {
    enum SessionState { case checking, signedOut, signedIn }
    enum Destination: Equatable { case checks, people }

    private let api = APIClient()
    private var didBootstrap = false

    let premium = PremiumStore()

    var sessionState: SessionState = .checking
    var user: APIUser?
    var checks: [CheckItem] = []
    var routing: TrustRoutingEnvelope?
    var pendingInvitations: [PendingInvitation] = []
    var activities: [ActivityItem] = []
    var unreadActivityCount = 0
    var activityUnreadOnly = false
    var isBusy = false
    var message: String?
    var destination: Destination?
    var pendingCheckID: String?
    var pendingInviteCode: String?
    var pendingResetToken: String?
    var pendingSharedDraft: SharedDraft?
    var nativePushRegistered = false

    func bootstrap() async {
        guard !didBootstrap else { return }
        didBootstrap = true
        refreshSharedDraft()
        await premium.start()
        do {
            user = try await api.me()
            sessionState = .signedIn
            await refreshAll()
            guard sessionState == .signedIn else { return }
            await ensureNativePushReady()
        } catch {
            clearSignedInData()
            sessionState = .signedOut
        }
    }

    func refreshSessionAndData() async {
        guard sessionState == .signedIn else { return }
        do {
            user = try await api.me()
            await refreshAll()
            guard sessionState == .signedIn else { return }
            await ensureNativePushReady()
        } catch {
            handle(error)
        }
    }

    func login(email: String, password: String) async {
        await runBusy {
            user = try await api.login(email: email, password: password)
            sessionState = .signedIn
            refreshSharedDraft()
            await refreshAll()
            guard sessionState == .signedIn else { return }
            await ensureNativePushReady()
        }
    }

    func register(name: String, email: String, password: String) async {
        await runBusy {
            user = try await api.register(name: name, email: email, password: password)
            sessionState = .signedIn
            refreshSharedDraft()
            await refreshAll()
            guard sessionState == .signedIn else { return }
            if user?.emailVerified == true { await ensureNativePushReady() }
            if user?.emailVerified == false {
                message = "Bitte bestätige jetzt deine E-Mail-Adresse. Wir haben dir eine Nachricht geschickt."
            }
        }
    }

    func logout() async {
        if let token = NativePushManager.storedToken, user?.emailVerified == true {
            try? await api.unregisterNativePush(token: token, environment: NativePushManager.environment)
        }
        await api.logout()
        clearSignedInData()
        sessionState = .signedOut
    }

    func refreshAll() async {
        guard sessionState == .signedIn else { return }
        do {
            async let checksTask = api.checks()
            async let routingTask = api.trustRouting()
            async let activitiesTask = api.activities(filter: activityUnreadOnly ? "unread" : "all")
            async let invitationsTask = api.pendingInvitations()
            checks = try await checksTask
            routing = try await routingTask
            pendingInvitations = try await invitationsTask
            let activityResult = try await activitiesTask
            activities = activityResult.activities
            unreadActivityCount = activityResult.unreadCount
        } catch {
            handle(error)
        }
    }

    func refreshChecks() async {
        do { checks = try await api.checks() }
        catch { handle(error) }
    }

    func refreshPeople() async {
        do {
            async let routingTask = api.trustRouting()
            async let invitationsTask = api.pendingInvitations()
            routing = try await routingTask
            pendingInvitations = try await invitationsTask
        } catch { handle(error) }
    }

    func refreshActivities(unreadOnly: Bool? = nil) async {
        if let unreadOnly { activityUnreadOnly = unreadOnly }
        do {
            let result = try await api.activities(filter: activityUnreadOnly ? "unread" : "all")
            activities = result.activities
            unreadActivityCount = result.unreadCount
        } catch { handle(error) }
    }

    func refreshSharedDraft() {
        pendingSharedDraft = SharedDraftStore.load()
    }

    func consumeSharedDraft() {
        SharedDraftStore.consume()
        pendingSharedDraft = nil
    }

    func markActivityRead(_ activity: ActivityItem) async {
        guard activity.isUnread else { return }
        do {
            _ = try await api.markActivityRead(id: activity.id)
            await refreshActivities()
        } catch { handle(error) }
    }

    func markAllActivitiesRead() async {
        await runBusy {
            try await api.markAllActivitiesRead()
            await refreshActivities()
        }
    }

    func archiveActivity(_ activity: ActivityItem) async {
        await runBusy {
            try await api.archiveActivity(id: activity.id)
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
        } else if let resetToken = values["reset"], !resetToken.isEmpty {
            pendingResetToken = resetToken
            if sessionState == .signedIn {
                Task { await logout() }
            }
        }
    }

    func enableNativePush(showFeedback: Bool = true) async {
        do {
            let granted = try await NativePushManager.requestAuthorization()
            guard granted else {
                if showFeedback {
                    message = "Benachrichtigungen sind ausgeschaltet. Du kannst sie später in den iPhone-Einstellungen erlauben."
                }
                return
            }
            if let token = NativePushManager.storedToken {
                await syncNativePushToken(token)
            } else if showFeedback {
                message = "Benachrichtigungen werden eingerichtet."
            }
        } catch {
            if showFeedback {
                message = "Benachrichtigungen konnten nicht eingerichtet werden. Bitte versuche es später erneut."
            }
        }
    }

    func syncNativePushToken(_ token: String) async {
        guard sessionState == .signedIn, user?.emailVerified == true else { return }
        do {
            try await api.registerNativePush(token: token, environment: NativePushManager.environment)
            nativePushRegistered = true
        } catch {
            if let apiError = error as? APIClientError, apiError.isUnauthorized {
                handle(error)
            } else {
                nativePushRegistered = false
            }
        }
    }

    func resendVerification() async {
        await runBusy {
            try await api.resendVerification()
            message = "Bestätigungs-E-Mail wurde erneut gesendet."
        }
    }

    func requestPasswordReset(email: String) async {
        await runBusy {
            try await api.requestPasswordReset(email: email)
            message = "Wenn für diese E-Mail ein Konto existiert, wurde ein Link zum Zurücksetzen gesendet."
        }
    }

    func resetPassword(token: String, password: String) async -> Bool {
        var success = false
        await runBusy {
            try await api.resetPassword(token: token, password: password)
            pendingResetToken = nil
            success = true
            message = "Passwort geändert. Du kannst dich jetzt anmelden."
        }
        return success
    }

    func setPresence(_ status: String, durationMinutes: Int?) async {
        await runBusy {
            try await api.updatePresence(status: status, durationMinutes: status == "neutral" ? nil : durationMinutes)
            routing = try await api.trustRouting()
        }
    }

    func invite(email: String?) async -> String? {
        var code: String?
        await runBusy {
            code = try await api.invite(email: email).code
            await refreshPeople()
            message = "Einladung wurde erstellt. Code: \(code ?? "")"
        }
        return code
    }

    func accept(code: String) async {
        await runBusy {
            try await api.acceptInvitation(code: code)
            await refreshPeople()
            message = "Vertrauensperson wurde verbunden."
        }
    }

    func declineInvitation(_ invitation: PendingInvitation) async {
        await runBusy {
            try await api.declineInvitation(id: invitation.id)
            await refreshPeople()
        }
    }

    func removeConnection(_ connection: TrustConnection) async {
        await runBusy {
            try await api.removeConnection(id: connection.connectionId)
            await refreshPeople()
            await refreshChecks()
            message = "Vertrauensverbindung wurde beendet."
        }
    }

    func createCheck(
        reviewerID: String,
        fallbackReviewerID: String?,
        category: CheckCategory,
        description: String,
        amount: String?,
        urgency: String,
        reminderMinutes: Int?,
        autoReroute: Bool,
        images: [UploadImage]
    ) async -> Bool {
        var success = false
        await runBusy {
            let created = try await api.createCheck(
                reviewerID: reviewerID,
                fallbackReviewerID: fallbackReviewerID,
                category: category,
                description: description,
                amount: amount,
                urgency: urgency,
                reminderMinutes: reminderMinutes,
                autoReroute: autoReroute,
                images: images
            )
            checks.insert(created, at: 0)
            await refreshActivities()
            success = true
        }
        return success
    }

    func respond(_ check: CheckItem, recommendation: Recommendation, note: String) async -> CheckItem? {
        var updated: CheckItem?
        await runBusy {
            updated = try await api.respond(checkID: check.id, recommendation: recommendation, note: note)
            await refreshChecks()
            await refreshActivities()
        }
        return updated
    }

    func close(_ check: CheckItem) async {
        await runBusy {
            try await api.close(checkID: check.id)
            await refreshChecks()
            await refreshActivities()
        }
    }

    func checkDetails(id: String) async -> CheckItem? {
        do { return try await api.check(id: id) }
        catch { handle(error); return nil }
    }

    func checkRouting(id: String) async -> CheckRouting? {
        do { return try await api.routing(checkID: id) }
        catch { handle(error); return nil }
    }

    func checkEscalation(id: String) async -> EscalationPlan? {
        do { return try await api.escalation(checkID: id) }
        catch { handle(error); return nil }
    }

    func reroute(checkID: String, reviewerID: String) async -> Bool {
        var success = false
        await runBusy {
            try await api.reroute(checkID: checkID, reviewerID: reviewerID)
            await refreshChecks()
            await refreshActivities()
            success = true
        }
        return success
    }

    func updateEscalation(checkID: String, enabled: Bool, reminderMinutes: Int?, autoReroute: Bool) async -> EscalationPlan? {
        var result: EscalationPlan?
        await runBusy {
            result = try await api.updateEscalation(
                checkID: checkID,
                enabled: enabled,
                reminderMinutes: reminderMinutes,
                autoReroute: autoReroute
            )
        }
        return result
    }

    func attachmentData(id: String) async -> Data? {
        do { return try await api.attachmentData(id: id) }
        catch { handle(error); return nil }
    }

    func prepareAccountExport() async -> URL? {
        do {
            let data = try await api.accountExport()
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd"
            let file = FileManager.default.temporaryDirectory
                .appendingPathComponent("zweicheck-meine-daten-\(formatter.string(from: Date())).json")
            try data.write(to: file, options: .atomic)
            return file
        } catch {
            handle(error)
            return nil
        }
    }

    func deleteAccount(password: String) async {
        await runBusy {
            try await api.deleteAccount(password: password)
            clearSignedInData()
            sessionState = .signedOut
            message = "Dein ZweiCheck-Konto wurde gelöscht."
        }
    }

    private func ensureNativePushReady() async {
        guard sessionState == .signedIn, user?.emailVerified == true else { return }
        let status = await NativePushManager.authorizationStatus()
        switch status {
        case .authorized, .provisional, .ephemeral:
            await NativePushManager.registerForRemoteNotifications()
            if let token = NativePushManager.storedToken { await syncNativePushToken(token) }
        case .notDetermined:
            await enableNativePush(showFeedback: false)
        case .denied:
            nativePushRegistered = false
        @unknown default:
            nativePushRegistered = false
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
        do { try await work() }
        catch { handle(error) }
    }

    private func handle(_ error: Error) {
        if let apiError = error as? APIClientError, apiError.isUnauthorized {
            clearSignedInData()
            sessionState = .signedOut
            message = "Deine Anmeldung ist nicht mehr gültig. Bitte melde dich erneut an."
            return
        }
        message = error.localizedDescription
    }

    private func clearSignedInData() {
        user = nil
        checks = []
        routing = nil
        pendingInvitations = []
        activities = []
        unreadActivityCount = 0
        nativePushRegistered = false
    }
}
