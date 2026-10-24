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
        // Native Date() uses the 2001 reference epoch. Conversion to Unix JSON
        // seconds can round by one ULP; a saved decision must remain editable.
        var fractional = try LocalVerificationRecord(ownerID: owner, context: context)
        fractional = try fractional.replacingQuestion(VerificationQuestion(title: "Native input", note: "", status: .open))
        fractional = try fractional.deciding(choice: .wait, reason: "Own decision", confirmed: true,
            at: Date(timeIntervalSinceReferenceDate: 814_531_930.246405))
        let fractionalArchive = try VerificationArchive(url: folder.appendingPathComponent("fractional.json"), ownerID: owner)
        _ = try fractionalArchive.upsert(fractional)
        do { _ = try fractionalArchive.upsert(fractional) }
        catch { fatalError("unchanged native fractional-date history must save again: \(error)") }
        var edited = fractional.questions[0]; edited.note = "Further local work"
        fractional = try fractional.replacingQuestion(edited)
        _ = try fractionalArchive.upsert(fractional)
        let fractionalReloaded = try fractionalArchive.load()
        precondition(fractionalReloaded[0].questions[0].note == edited.note)
        // Persisted timestamp changes still constitute rewritten history.
        let keptBytes = try Data(contentsOf: fractionalArchive.url)
        var tamperedJSON = try JSONSerialization.jsonObject(with: keptBytes) as! [String: Any]
        var tamperedRecords = tamperedJSON["records"] as! [[String: Any]]
        var tamperedDecisions = tamperedRecords[0]["decisions"] as! [[String: Any]]
        tamperedDecisions[0]["at"] = (tamperedDecisions[0]["at"] as! Double) + 1
        tamperedRecords[0]["decisions"] = tamperedDecisions
        tamperedJSON["records"] = tamperedRecords
        // Decode only the record, leaving the real archive untouched.
        let tamperedDecoder = JSONDecoder(); tamperedDecoder.dateDecodingStrategy = .secondsSince1970
        let tampered = try tamperedDecoder.decode(LocalVerificationRecord.self, from: JSONSerialization.data(withJSONObject: tamperedRecords[0]))
        do { _ = try fractionalArchive.upsert(tampered); fatalError("changed persisted timestamp must reject") } catch {}
        let bytesAfterRejectedRewrite = try Data(contentsOf: fractionalArchive.url)
        precondition(bytesAfterRejectedRewrite == keptBytes, "rejected history rewrite preserves exact file")
        print("ALL ZWEICHECK REQUEST MERGE TESTS PASSED")
    }
}
