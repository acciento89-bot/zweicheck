import Foundation

enum LocalVerificationError: Error { case invalidInput, invalidArchive, unsupportedVersion, limitReached, conflictingHistory }
private func localID(_ value: String) throws -> String {
    guard let id = UUID(uuidString: value), id.uuidString.lowercased() == value.lowercased() else { throw LocalVerificationError.invalidInput }
    return id.uuidString.lowercased()
}
private func bounded(_ value: String, _ count: Int, required: Bool = false) -> Bool {
    value.unicodeScalars.count <= count && (!required || !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
}

struct LocalRequestContext: Codable, Equatable {
    var requestID: String
    var requesterID: String
    var requesterName: String
    var reviewerID: String
    var reviewerName: String
    var category: String
    var description: String
    var status: String
    var updatedAt: String
    var recommendation: String?
    var responseNote: String?
    var respondedAt: String?
    func normalized() throws -> Self {
        var result = self
        result.requestID = try localID(requestID); result.requesterID = try localID(requesterID); result.reviewerID = try localID(reviewerID)
        guard bounded(requesterName, 200, required: true), bounded(reviewerName, 200, required: true), bounded(category, 100, required: true), bounded(description, 10000), bounded(status, 100, required: true), bounded(updatedAt, 100, required: true), responseNote.map({ bounded($0, 10000) }) ?? true, respondedAt.map({ bounded($0, 100, required: true) }) ?? true else { throw LocalVerificationError.invalidInput }
        if let recommendation {
            guard ["do_not_act", "verify_personally", "plausible", "call_me"].contains(recommendation), respondedAt != nil else { throw LocalVerificationError.invalidInput }
        } else if responseNote != nil || respondedAt != nil { throw LocalVerificationError.invalidInput }
        return result
    }
}

enum QuestionStatus: String, Codable, CaseIterable { case open, checked, notApplicable }
enum DecisionChoice: String, Codable, CaseIterable { case wait, decline, clarify, proceed }
struct VerificationQuestion: Codable, Equatable, Identifiable {
    var id = UUID().uuidString.lowercased()
    var title: String
    var note: String
    var status: QuestionStatus
    func normalized() throws -> Self {
        var result = self; result.id = try localID(id)
        result.title = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard bounded(result.title, 300, required: true), bounded(note, 2000) else { throw LocalVerificationError.invalidInput }
        return result
    }
}
struct VerificationReply: Codable, Equatable {
    let requestID: String
    let requesterID: String
    let reviewerID: String
    let reviewerName: String
    let recommendation: String
    let note: String
    let respondedAt: String
    init?(context: LocalRequestContext) {
        guard let recommendation = context.recommendation, let respondedAt = context.respondedAt else { return nil }
        requestID = context.requestID; requesterID = context.requesterID; reviewerID = context.reviewerID
        reviewerName = context.reviewerName; self.recommendation = recommendation; note = context.responseNote ?? ""; self.respondedAt = respondedAt
    }
    func validate(ownerID: String, requestID: String) throws {
        guard self.requestID == requestID, requesterID == ownerID, try localID(reviewerID) == reviewerID, bounded(reviewerName, 200, required: true), bounded(note, 10000), bounded(respondedAt, 100, required: true), ["do_not_act", "verify_personally", "plausible", "call_me"].contains(recommendation) else { throw LocalVerificationError.invalidArchive }
    }
}
struct VerificationDecision: Codable, Equatable, Identifiable {
    let id: String
    let number: Int
    let choice: DecisionChoice
    let reason: String
    let at: Date
    let context: LocalRequestContext
    let questions: [VerificationQuestion]
}
struct LocalVerificationRecord: Codable, Equatable, Identifiable {
    let ownerID: String
    private(set) var context: LocalRequestContext
    private(set) var questions: [VerificationQuestion] = []
    private(set) var replySnapshots: [VerificationReply] = []
    private(set) var decisions: [VerificationDecision] = []
    var id: String { context.requestID }
    var currentDecision: VerificationDecision? { decisions.last.flatMap { $0.context == context && $0.questions == questions ? $0 : nil } }
    init(ownerID: String, context: LocalRequestContext) throws {
        self.ownerID = try localID(ownerID); self.context = try context.normalized()
        guard self.context.requesterID == self.ownerID else { throw LocalVerificationError.invalidInput }
        if let reply = VerificationReply(context: self.context) { replySnapshots = [reply] }
    }
    private func validateQuestions(_ questions: [VerificationQuestion]) throws {
        guard questions.count <= 25, Set(questions.map(\.id)).count == questions.count else { throw LocalVerificationError.invalidArchive }
        for question in questions { guard try question.normalized() == question else { throw LocalVerificationError.invalidArchive } }
    }
    func validate() throws {
        guard try localID(ownerID) == ownerID, try context.normalized() == context, context.requesterID == ownerID, replySnapshots.count <= 20, decisions.count <= 20, Set(decisions.map(\.id)).count == decisions.count else { throw LocalVerificationError.invalidArchive }
        try validateQuestions(questions)
        for reply in replySnapshots { try reply.validate(ownerID: ownerID, requestID: id) }
        for (index, decision) in decisions.enumerated() {
            guard try localID(decision.id) == decision.id, decision.number == index + 1, decision.at.timeIntervalSince1970.isFinite, bounded(decision.reason, 2000, required: true), try decision.context.normalized() == decision.context, decision.context.requesterID == ownerID, decision.context.requestID == id, !decision.questions.isEmpty else { throw LocalVerificationError.invalidArchive }
            try validateQuestions(decision.questions)
        }
    }
    func replacingQuestion(_ question: VerificationQuestion) throws -> Self {
        try validate(); let question = try question.normalized()
        var result = self
        if let index = questions.firstIndex(where: { $0.id == question.id }) { result.questions[index] = question }
        else { guard questions.count < 25 else { throw LocalVerificationError.limitReached }; result.questions.append(question) }
        return result
    }
    func removingQuestion(id: String) throws -> Self {
        try validate(); let id = try localID(id)
        var result = self; result.questions.removeAll { $0.id == id }; return result
    }
    func capturing(context: LocalRequestContext) throws -> Self {
        try validate(); let context = try context.normalized()
        guard context.requestID == id, context.requesterID == ownerID else { throw LocalVerificationError.invalidInput }
        var result = self; result.context = context
        if let reply = VerificationReply(context: context), replySnapshots.last != reply {
            guard replySnapshots.count < 20 else { throw LocalVerificationError.limitReached }; result.replySnapshots.append(reply)
        }
        return result
    }
    func deciding(choice: DecisionChoice, reason: String, confirmed: Bool, at: Date) throws -> Self {
        try validate(); let reason = reason.trimmingCharacters(in: .whitespacesAndNewlines)
        guard confirmed, !questions.isEmpty, bounded(reason, 2000, required: true), at.timeIntervalSince1970.isFinite else { throw LocalVerificationError.invalidInput }
        if let last = currentDecision, last.choice == choice, last.reason == reason { return self }
        guard decisions.count < 20 else { throw LocalVerificationError.limitReached }
        var result = self
        result.decisions.append(VerificationDecision(id: UUID().uuidString.lowercased(), number: decisions.count + 1, choice: choice, reason: reason, at: at, context: context, questions: questions))
        return result
    }
    func report(german: Bool) -> String {
        func l(_ de: String, _ en: String) -> String { german ? de : en }
        func quote(_ text: String) -> String { (try? String(data: JSONEncoder().encode(text), encoding: .utf8)) ?? "\"\"" }
        func questionLines(_ values: [VerificationQuestion]) -> [String] {
            values.enumerated().map { index, item in "\(index + 1). [\(item.status.rawValue)] \(quote(item.title)) · \(quote(item.note))" }
        }
        func sourceLines(_ value: LocalRequestContext) -> [String] {
            [l("Anfrage: ", "Request: ") + value.requestID, l("Anfragende Person: ", "Requester: ") + quote(value.requesterName), l("Beschreibung: ", "Description: ") + quote(value.description), l("Anfragestatus: ", "Request status: ") + quote(value.status), l("Gemeldete Aktualisierung: ", "Reported update: ") + quote(value.updatedAt)]
        }
        var lines = [l("LOKALE PRÜFNOTIZEN", "LOCAL VERIFICATION NOTES"), l("Nur auf diesem Gerät. Prüfpunkte und Entscheidungen wurden nicht gesendet. Keine Sicherheitsbewertung oder Identitätsprüfung.", "Only on this device. Questions and decisions were not sent. This is no safety verdict or identity verification."), l("Konto: ", "Account: ") + ownerID]
        lines += sourceLines(context)
        lines += ["", l("MEINE PRÜFPUNKTE", "MY QUESTIONS")]; lines += questionLines(questions)
        lines += ["", l("GELADENE RÜCKMELDUNGEN (LOKALE KOPIEN)", "LOADED REPLIES (LOCAL COPIES)")]
        for reply in replySnapshots {
            lines += [l("Antwort von: ", "Reply from: ") + quote(reply.reviewerName) + " [\(reply.reviewerID)]", l("Empfehlung: ", "Recommendation: ") + quote(reply.recommendation), l("Originalnotiz: ", "Original note: ") + quote(reply.note), l("Gemeldete Antwortzeit: ", "Reported reply time: ") + quote(reply.respondedAt)]
        }
        lines += ["", l("MEINE ENTSCHEIDUNGEN", "INITIATOR DECISIONS"), currentDecision == nil ? l("Aktueller Inhalt ohne zugeordnete eigene Entscheidung.", "Current content has no associated initiator decision.") : l("Eigene Entscheidung zum aktuellen lokalen Inhalt vorhanden.", "Initiator decision for current local content is recorded.")]
        for decision in decisions {
            let current = currentDecision?.id == decision.id
            lines += ["", "\(l("Entscheidung", "Initiator decision")) \(decision.number) · \(current ? l("Aktuell", "Current") : l("Historisch", "Historical"))", quote(decision.choice.rawValue), quote(decision.reason), l("Lokale Gerätezeit: ", "Local device time: ") + ISO8601DateFormatter().string(from: decision.at)]
            lines += sourceLines(decision.context); lines += questionLines(decision.questions)
            if let reply = VerificationReply(context: decision.context) { lines += [l("Zugehörige Rückmeldung von: ", "Associated reply from: ") + quote(reply.reviewerName), quote(reply.recommendation), quote(reply.note), quote(reply.respondedAt)] }
        }
        return lines.joined(separator: "\n")
    }
}

struct VerificationArchive {
    let url: URL
    let ownerID: String
    private struct Document: Codable { let schemaVersion: Int; let ownerID: String; let records: [LocalVerificationRecord] }
    init(url: URL, ownerID: String) throws { self.url = url; self.ownerID = try localID(ownerID) }
    func load() throws -> [LocalVerificationRecord] {
        guard FileManager.default.fileExists(atPath: url.path) else { return [] }
        let size = try FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber
        guard let size, size.int64Value <= 10 * 1024 * 1024 else { throw LocalVerificationError.invalidArchive }
        let data = try Data(contentsOf: url)
        guard data.count <= 10 * 1024 * 1024 else { throw LocalVerificationError.invalidArchive }
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .secondsSince1970
        struct Header: Decodable { let schemaVersion: Int }
        guard try decoder.decode(Header.self, from: data).schemaVersion == 1 else { throw LocalVerificationError.unsupportedVersion }
        let document = try decoder.decode(Document.self, from: data)
        guard document.ownerID == ownerID else { throw LocalVerificationError.invalidArchive }
        try validate(document.records); return document.records
    }
    func save(_ records: [LocalVerificationRecord]) throws {
        _ = try load(); try validate(records)
        let encoder = JSONEncoder(); encoder.dateEncodingStrategy = .secondsSince1970
        let data = try encoder.encode(Document(schemaVersion: 1, ownerID: ownerID, records: records))
        guard data.count <= 10 * 1024 * 1024 else { throw LocalVerificationError.limitReached }
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: url, options: .atomic)
    }
    /// Merge only this request into the latest account snapshot. A stale editor
    /// may not erase or rewrite history recorded by another local view.
    @discardableResult func upsert(_ record: LocalVerificationRecord) throws -> [LocalVerificationRecord] {
        let current = try load()
        guard record.ownerID == ownerID else { throw LocalVerificationError.invalidArchive }
        try record.validate()
        if let stored = current.first(where: { $0.id == record.id }) {
            guard Array(record.decisions.prefix(stored.decisions.count)) == stored.decisions,
                  Array(record.replySnapshots.prefix(stored.replySnapshots.count)) == stored.replySnapshots else { throw LocalVerificationError.conflictingHistory }
        }
        let next = current.filter { $0.id != record.id } + [record]
        try save(next); return next
    }
    @discardableResult func removeRecord(requestID: String) throws -> [LocalVerificationRecord] {
        let requestID = try localID(requestID)
        let next = try load().filter { $0.id != requestID }
        try save(next); return next
    }
    private func validate(_ records: [LocalVerificationRecord]) throws {
        guard records.count <= 100, Set(records.map(\.id)).count == records.count else { throw LocalVerificationError.invalidArchive }
        for record in records { guard record.ownerID == ownerID else { throw LocalVerificationError.invalidArchive }; try record.validate() }
    }
}
