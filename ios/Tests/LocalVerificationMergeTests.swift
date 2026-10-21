import Foundation

@main struct LocalVerificationMergeTests {
    static func main() throws {
        let owner = "00000000-0000-4000-8000-000000000001"
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: folder) }
        let path = folder.appendingPathComponent("records.json")
        let firstEditorArchive = try VerificationArchive(url: path, ownerID: owner)
        let secondEditorArchive = try VerificationArchive(url: path, ownerID: owner)
        var context = LocalRequestContext(requestID: "00000000-0000-4000-8000-000000000003", requesterID: owner, requesterName: "Initiator", reviewerID: "00000000-0000-4000-8000-000000000002", reviewerName: "Alex", category: "message", description: "A", status: "open", updatedAt: "2026-10-21T08:00:00Z", recommendation: nil, responseNote: nil, respondedAt: nil)
        var a = try LocalVerificationRecord(ownerID: owner, context: context)
        context.requestID = "00000000-0000-4000-8000-000000000004"; context.description = "B"
        let b = try LocalVerificationRecord(ownerID: owner, context: context)
        // Independent editors may have loaded their UI state before either saved.
        _ = try firstEditorArchive.load(); _ = try secondEditorArchive.load()
        _ = try firstEditorArchive.upsert(a)
        _ = try secondEditorArchive.upsert(b)
        a = try a.replacingQuestion(VerificationQuestion(title: "A edited", note: "", status: .open))
        let merged = try firstEditorArchive.upsert(a)
        precondition(merged.count == 2 && merged.contains(b) && merged.contains(a), "stale request editor must not erase another request")
        let removed = try secondEditorArchive.removeRecord(requestID: b.id)
        precondition(removed == [a], "deletion merges fresh file and preserves another edited request")
        let historical = try a.deciding(choice: .wait, reason: "Another editor recorded this", confirmed: true, at: Date(timeIntervalSince1970: 1000))
        _ = try secondEditorArchive.upsert(historical)
        let historyBytes = try Data(contentsOf: path)
        do { _ = try firstEditorArchive.upsert(a); fatalError("stale same-request editor cannot erase recorded decisions") } catch {}
        let historyRetained = try Data(contentsOf: path)
        precondition(historyRetained == historyBytes, "stale decision history is fail-closed")
        let file = try Data(contentsOf: path)
        do {
            _ = try VerificationArchive(url: path, ownerID: "00000000-0000-4000-8000-000000000005").upsert(a)
            fatalError("wrong owner must reject targeted update")
        } catch {}
        let retained = try Data(contentsOf: path)
        precondition(retained == file, "wrong owner merge leaves bytes unchanged")
        print("ALL ZWEICHECK REQUEST MERGE TESTS PASSED")
    }
}
