import Foundation
import SwiftUI

enum VerificationLocalFiles {
    static func url(ownerID: String) throws -> URL {
        guard let owner = UUID(uuidString: ownerID), owner.uuidString.lowercased() == ownerID.lowercased() else { throw LocalVerificationError.invalidInput }
        return FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("ZweiCheck/LocalVerification", isDirectory: true)
            .appendingPathComponent(owner.uuidString.lowercased() + ".json")
    }
    static func purge(ownerID: String) throws {
        let target = try url(ownerID: ownerID)
        if FileManager.default.fileExists(atPath: target.path) { try FileManager.default.removeItem(at: target) }
    }
}

@MainActor final class LocalVerificationStore: ObservableObject {
    @Published private(set) var draft: LocalVerificationRecord?
    @Published private(set) var loadFailed = false
    @Published private(set) var actionFailed = false
    @Published private(set) var saved = false
    @Published private(set) var deleted = false
    private var archive: VerificationArchive?
    private var latestContext: LocalRequestContext
    let ownerID: String
    init(ownerID: String, context: LocalRequestContext) {
        self.ownerID = ownerID; latestContext = context
        do { archive = try VerificationArchive(url: VerificationLocalFiles.url(ownerID: ownerID), ownerID: ownerID) }
        catch { loadFailed = true }
        reload()
    }
    func reload() {
        guard let archive else { loadFailed = true; return }
        do {
            let loaded = try archive.load()
            let old = loaded.first { $0.id == latestContext.requestID }
            let next = try (old ?? LocalVerificationRecord(ownerID: ownerID, context: latestContext)).capturing(context: latestContext)
            draft = next; saved = old == next; deleted = false; loadFailed = false; actionFailed = false
        } catch { loadFailed = true }
    }
    func save() -> Bool {
        guard !loadFailed, let archive, let draft else { actionFailed = true; return false }
        do { try archive.upsert(draft); saved = true; actionFailed = false; return true }
        catch { actionFailed = true; saved = false; return false }
    }
    func replace(_ question: VerificationQuestion) -> Bool { apply { try $0.replacingQuestion(question) } }
    func removeQuestion(_ id: String) -> Bool { apply { try $0.removingQuestion(id: id) } }
    func decide(_ choice: DecisionChoice, reason: String, confirmed: Bool) -> Bool {
        apply { try $0.deciding(choice: choice, reason: reason, confirmed: confirmed, at: Date()) }
    }
    func capture(_ context: LocalRequestContext) -> Bool {
        let succeeded = apply { try $0.capturing(context: context) }
        // Even a failed disk save retains the newly authorized visible context for retry.
        if draft?.context == (try? context.normalized()) { latestContext = context }
        return succeeded
    }
    private func apply(_ action: (LocalVerificationRecord) throws -> LocalVerificationRecord) -> Bool {
        guard !loadFailed, let draft else { actionFailed = true; return false }
        do { self.draft = try action(draft); saved = false; return save() }
        catch { actionFailed = true; return false }
    }
    func deleteLocalRecord() -> Bool {
        guard !loadFailed, let archive, let draft else { actionFailed = true; return false }
        do { try archive.removeRecord(requestID: draft.id); self.draft = nil; deleted = true; actionFailed = false; return true }
        catch { actionFailed = true; return false }
    }
}
