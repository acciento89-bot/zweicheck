import Foundation
import Observation

@Observable
@MainActor
final class AppModel {
    enum SessionState { case checking, signedOut, signedIn }

    private let api = APIClient()
    private var didBootstrap = false

    var sessionState: SessionState = .checking
    var user: APIUser?
    var checks: [CheckItem] = []
    var routing: TrustRoutingEnvelope?
    var isBusy = false
    var message: String?

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
        user = nil; checks = []; routing = nil; sessionState = .signedOut
    }

    func refreshAll() async {
        guard sessionState == .signedIn else { return }
        do {
            async let checksTask = api.checks()
            async let routingTask = api.trustRouting()
            checks = try await checksTask
            routing = try await routingTask
        } catch { message = error.localizedDescription }
    }

    func refreshChecks() async { do { checks = try await api.checks() } catch { message = error.localizedDescription } }
    func refreshPeople() async { do { routing = try await api.trustRouting() } catch { message = error.localizedDescription } }

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

    func createCheck(reviewerID: String, category: CheckCategory, description: String, amount: String?) async -> Bool {
        var success = false
        await runBusy {
            let created = try await api.createCheck(reviewerID: reviewerID, category: category, description: description, amount: amount)
            checks.insert(created, at: 0)
            success = true
        }
        return success
    }

    func respond(_ check: CheckItem, recommendation: Recommendation, note: String) async -> CheckItem? {
        var updated: CheckItem?
        await runBusy { updated = try await api.respond(checkID: check.id, recommendation: recommendation, note: note); await refreshChecks() }
        return updated
    }

    func close(_ check: CheckItem) async {
        await runBusy { try await api.close(checkID: check.id); await refreshChecks() }
    }

    func deleteAccount(password: String) async {
        await runBusy {
            try await api.deleteAccount(password: password)
            user = nil; checks = []; routing = nil; sessionState = .signedOut
            message = "Dein ZweiCheck-Konto wurde gelöscht."
        }
    }

    private func runBusy(_ work: () async throws -> Void) async {
        guard !isBusy else { return }
        isBusy = true
        defer { isBusy = false }
        do { try await work() } catch { message = error.localizedDescription }
    }
}
