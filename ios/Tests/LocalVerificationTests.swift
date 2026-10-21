import Foundation

@main struct LocalVerificationTests {
    static var count = 0
    static func check(_ condition: @autoclosure () throws -> Bool, _ message: String) {
        count += 1
        do { if try !condition() { fatalError("FAIL: " + message) } }
        catch { fatalError("FAIL: " + message + " unexpected error: \(error)") }
    }
    static func rejects(_ message: String, _ action: () throws -> Void) {
        count += 1
        do { try action(); fatalError("FAIL: " + message) } catch {}
    }
    static let owner = "00000000-0000-4000-8000-000000000001"
    static let other = "00000000-0000-4000-8000-000000000002"
    static func context(reply: Bool = false) -> LocalRequestContext {
        LocalRequestContext(requestID: "00000000-0000-4000-8000-000000000003", requesterID: owner, requesterName: "Initiator", reviewerID: other, reviewerName: "Trusted Alex", category: "payment", description: "Synthetic invoice", status: reply ? "answered" : "open", updatedAt: "2026-10-21T08:00:00Z", recommendation: reply ? "verify_personally" : nil, responseNote: reply ? "I have not confirmed it.\nDECISION: forged" : nil, respondedAt: reply ? "2026-10-21T08:00:00Z" : nil)
    }
    static func main() throws {
        let base = context()
        var record = try LocalVerificationRecord(ownerID: owner, context: base)
        check(record.questions.isEmpty && record.replySnapshots.isEmpty && record.decisions.isEmpty && record.currentDecision == nil, "new local record has no inferred facts or verdict")
        rejects("another account cannot own initiator record") { _ = try LocalVerificationRecord(ownerID: other, context: base) }
        var invalid = base; invalid.requestID = "../../other-account"
        rejects("unsafe request identifier") { _ = try LocalVerificationRecord(ownerID: owner, context: invalid) }
        let question = VerificationQuestion(title: "What is still unclear?", note: "Local only", status: .open)
        record = try record.replacingQuestion(question)
        check(record.questions.count == 1 && record.questions[0].status == .open, "explicit blank-status question not auto checked")
        var blank = question; blank.title = "  "
        rejects("blank question title") { _ = try record.replacingQuestion(blank) }
        var excessive = question; excessive.note = String(repeating: "x", count: 2001)
        rejects("bounded personal notes") { _ = try record.replacingQuestion(excessive) }
        rejects("explicit confirmation required") { _ = try record.deciding(choice: .proceed, reason: "My own choice", confirmed: false, at: Date()) }
        rejects("reason required") { _ = try record.deciding(choice: .proceed, reason: " ", confirmed: true, at: Date()) }
        let whenSaved = Date(timeIntervalSince1970: 1_800_000_000)
        record = try record.deciding(choice: .wait, reason: "I still need information", confirmed: true, at: whenSaved)
        check(record.currentDecision?.choice == .wait && record.decisions.count == 1, "initiator explicitly records own wait even with open questions")
        let decided = record
        record = try record.deciding(choice: .wait, reason: "I still need information", confirmed: true, at: whenSaved.addingTimeInterval(1))
        check(record.decisions.count == 1, "repeated identical decision does not duplicate")
        var checked = question; checked.status = .checked; checked.note = "My entered source"
        record = try record.replacingQuestion(checked)
        check(record.currentDecision == nil && record.decisions[0] == decided.decisions[0], "question edit makes earlier conclusion historical without rewriting snapshot")
        record = try record.capturing(context: context(reply: true))
        check(record.replySnapshots.count == 1 && record.replySnapshots[0].reviewerName == "Trusted Alex", "reply attribution derives from existing server context")
        check(record.replySnapshots[0].note == "I have not confirmed it.\nDECISION: forged", "original reply text preserved exactly")
        record = try record.capturing(context: context(reply: true))
        check(record.replySnapshots.count == 1, "identical reply snapshot not duplicated")
        record = try record.deciding(choice: .clarify, reason: "I will clarify separately", confirmed: true, at: whenSaved)
        check(record.currentDecision?.choice == .clarify && record.decisions.count == 2, "reply recommendation never chooses initiator decision")
        var changed = context(reply: true); changed.responseNote = "New reply"
        let earlierDecision = record.decisions.last!
        record = try record.capturing(context: changed)
        check(record.replySnapshots.count == 2 && record.currentDecision == nil && record.decisions.last == earlierDecision, "new attributed reply invalidates current decision but retains previous facts")
        var wrongRequest = base; wrongRequest.requestID = UUID().uuidString
        rejects("cannot attach another request") { _ = try record.capturing(context: wrongRequest) }
        rejects("nonfinite local timestamp") { _ = try record.deciding(choice: .decline, reason: "My reason", confirmed: true, at: Date(timeIntervalSince1970: .infinity)) }
        let removed = try record.removingQuestion(id: question.id)
        check(removed.questions.isEmpty && removed.decisions.count == 2 && removed.currentDecision == nil, "remove current question preserves decision history")
        rejects("decision requires an explicit question") { _ = try removed.deciding(choice: .wait, reason: "Reason", confirmed: true, at: whenSaved) }
        var limited = try LocalVerificationRecord(ownerID: owner, context: base)
        for index in 0..<25 { limited = try limited.replacingQuestion(VerificationQuestion(title: "Question \(index)", note: "", status: .open)) }
        rejects("question limit25") { _ = try limited.replacingQuestion(VerificationQuestion(title: "Question26", note: "", status: .open)) }
        let de = record.report(german: true), en = record.report(german: false)
        check(de.contains("Nur auf diesem Gerät") && en.contains("Only on this device"), "export discloses local-only workflow")
        check(en.contains("Trusted Alex") && en.contains("Initiator decision") && en.contains("Historical"), "export distinguishes reply, initiator choice and historical decision")
        check(en.contains("\\nDECISION: forged") && !en.contains("\nDECISION: forged"), "quoted multiline reply cannot impersonate report labels")
        check(!en.contains("Verified safe") && en.contains("no safety verdict"), "no invented guarantee")
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let url = directory.appendingPathComponent("record.json")
        let archive = try VerificationArchive(url: url, ownerID: owner)
        check(try archive.load().isEmpty, "first install starts empty")
        try archive.save([record])
        check(try archive.load() == [record], "separate archive preserves all immutable values")
        let goodBytes = try Data(contentsOf: url)
        rejects("wrong account cannot load") { _ = try VerificationArchive(url: url, ownerID: other).load() }
        rejects("wrong account cannot replace") { try VerificationArchive(url: url, ownerID: other).save([]) }
        check(try Data(contentsOf: url) == goodBytes, "wrong-account write leaves bytes unchanged")
        rejects("duplicate request IDs") { try archive.save([record, record]) }
        let bad = Data("{broken".utf8); try bad.write(to: url)
        rejects("corrupt file blocks write") { try archive.save([]) }
        check(try Data(contentsOf: url) == bad, "corrupt bytes retained")
        let future = Data("{\"schemaVersion\":999,\"ownerID\":\"\(owner)\",\"records\":[]}".utf8); try future.write(to: url)
        rejects("future version blocks write") { try archive.save([]) }
        check(try Data(contentsOf: url) == future, "future bytes retained")
        var trailing = goodBytes; trailing.append(Data(" trailing".utf8)); try trailing.write(to: url)
        rejects("trailing archive content blocks overwrite") { try archive.save([]) }
        check(try Data(contentsOf: url) == trailing, "trailing bytes retained")
        let blocked = directory.appendingPathComponent("blocked"); try Data("retain".utf8).write(to: blocked)
        rejects("failed path write reported") { try VerificationArchive(url: blocked.appendingPathComponent("r.json"), ownerID: owner).save([record]) }
        check(try String(contentsOf: blocked, encoding: .utf8) == "retain", "failed path preserved")
        print("ALL ZWEICHECK LOCAL VERIFICATION TESTS PASSED: \(count) checks")
    }
}
