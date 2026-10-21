import SwiftUI

extension LocalRequestContext {
    init(check: CheckItem) {
        self.init(requestID: check.id, requesterID: check.requesterId, requesterName: check.requesterName, reviewerID: check.reviewerId, reviewerName: check.reviewerName, category: check.category, description: check.description, status: check.status, updatedAt: check.updatedAt, recommendation: check.recommendation, responseNote: check.responseNote, respondedAt: check.respondedAt)
    }
}

struct LocalVerificationView: View {
    let model: AppModel
    let ownerID: String
    @StateObject private var store: LocalVerificationStore
    @Environment(\.locale) private var locale
    @Environment(\.dismiss) private var dismiss
    @State private var editing: VerificationQuestion?
    @State private var deciding = false
    @State private var deletingQuestion: String?
    @State private var deletingRecord = false
    @State private var refreshing = false
    @State private var accessFailed = false
    init(model: AppModel, ownerID: String, check: CheckItem) {
        self.model = model; self.ownerID = ownerID
        _store = StateObject(wrappedValue: LocalVerificationStore(ownerID: ownerID, context: LocalRequestContext(check: check)))
    }
    private var de: Bool { locale.language.languageCode?.identifier == "de" }
    private func l(_ german: String, _ english: String) -> String { de ? german : english }
    private var allowed: Bool { model.user?.id == ownerID && model.sessionState == .signedIn && !accessFailed }
    var body: some View {
        Group {
            if !allowed {
                ContentUnavailableView(l("Nicht verfügbar", "Unavailable"), systemImage: "person.crop.circle.badge.exclamationmark", description: Text(l("Die aktuelle Anmeldung oder Anfrage ist nicht mehr verfügbar.", "The current account or request is no longer available.")))
            } else {
                List {
                    Section {
                        Text(l("Nur auf diesem Gerät. Deine Prüfpunkte und Entscheidungen werden nicht gesendet. Rückmeldungen sind lokale Kopien bereits geladener Antworten.", "Only on this device. Your questions and decisions are not sent. Replies are local copies of answers already loaded."))
                        Text(l("Du entscheidest selbst. Keine Sicherheitsbewertung oder Identitätsprüfung durch diese Notizen.", "You decide for yourself. These notes provide no safety verdict or identity verification.")).font(.footnote).foregroundStyle(.secondary)
                    }
                    if store.loadFailed {
                        Section {
                            Text(l("Lokale Notizen konnten nicht geladen werden. Die Datei bleibt erhalten; Speichern ist gesperrt.", "Local notes could not be loaded. The file is preserved; saving is blocked.")).foregroundStyle(.red)
                            Button(l("Erneut laden", "Retry loading")) { store.reload() }
                        }
                    }
                    if let record = store.draft {
                        Section(l("Geladene Anfrage", "Loaded request")) {
                            Text(record.context.description).textSelection(.enabled)
                            Text(l("Anfragende Person: ", "Requester: ") + record.context.requesterName)
                            Text(l("Zuständig: ", "Assigned reviewer: ") + record.context.reviewerName)
                            Text(l("Gemeldete Aktualisierung: ", "Reported update: ") + record.context.updatedAt).font(.footnote)
                            Button(l("Aktuelle Anfrage lokal übernehmen", "Capture current request locally")) { refresh(record.id) }.disabled(refreshing)
                            if refreshing { ProgressView() }
                        }
                        Section(l("Meine Prüfpunkte", "My questions")) {
                            ForEach(record.questions) { question in
                                Button { editing = question } label: {
                                    VStack(alignment: .leading, spacing: 6) {
                                        Text(question.title).font(.headline)
                                        Text(status(question.status)).font(.subheadline)
                                        if !question.note.isEmpty { Text(question.note).font(.footnote).foregroundStyle(.secondary) }
                                    }.foregroundStyle(.primary)
                                }.swipeActions { Button(l("Entfernen", "Remove"), role: .destructive) { deletingQuestion = question.id } }
                            }
                            Button(l("Prüfpunkt hinzufügen", "Add question"), systemImage: "plus.circle") { editing = VerificationQuestion(title: "", note: "", status: .open) }.disabled(record.questions.count >= 25 || store.loadFailed)
                            Text(l("Bis zu 25 persönliche Prüfpunkte. „Von mir geprüft“ beschreibt nur deine eigene Eingabe.", "Up to 25 personal questions. ‘Checked by me’ describes only your own entry.")).font(.footnote)
                        }
                        Section(l("Geladene Rückmeldungen · lokale Kopien", "Loaded replies · local copies")) {
                            if record.replySnapshots.isEmpty { Text(l("Noch keine Antwort übernommen.", "No reply captured yet.")) }
                            ForEach(Array(record.replySnapshots.enumerated()), id: \.offset) { _, reply in
                                VStack(alignment: .leading, spacing: 6) {
                                    Text(reply.reviewerName).font(.headline)
                                    Text(recommendation(reply.recommendation))
                                    Text(reply.note).textSelection(.enabled)
                                    Text(reply.respondedAt).font(.footnote).foregroundStyle(.secondary)
                                }
                            }
                            Text(l("Antworten werden hier nicht bearbeitet oder als neue Nachricht versendet.", "Replies are not edited here or sent as a new message.")).font(.footnote)
                        }
                        Section(l("Meine Entscheidung", "My decision")) {
                            if let decision = record.currentDecision {
                                Text(choice(decision.choice)).font(.headline); Text(decision.reason)
                            } else {
                                Text(l("Zum aktuellen Inhalt ist keine eigene Entscheidung festgehalten. Frühere Entscheidungen bleiben im Verlauf.", "No decision is recorded for the current content. Earlier decisions remain in the history."))
                            }
                            Text(l("Offene Prüfpunkte: ", "Open questions: ") + String(record.questions.filter { $0.status == .open }.count))
                            Button(l("Eigene Entscheidung festhalten", "Record my decision")) { deciding = true }.disabled(record.questions.isEmpty || record.decisions.count >= 20 || store.loadFailed)
                            Text(l("Bis zu 20 Einträge. Änderungen übernehmen keine frühere Entscheidung automatisch.", "Up to 20 entries. Changes never inherit an earlier decision automatically.")).font(.footnote)
                        }
                        Section(l("Entscheidungsverlauf", "Decision history")) {
                            ForEach(record.decisions.reversed()) { decision in
                                DisclosureGroup("\(decision.number). \(choice(decision.choice)) · \(record.currentDecision?.id == decision.id ? l("Aktuell", "Current") : l("Historisch", "Historical"))") {
                                    Text(decision.reason)
                                    Text(decision.at, format: .dateTime.year().month().day().hour().minute())
                                    Text(decision.context.description)
                                    ForEach(decision.questions) { question in Text(question.title + " · " + status(question.status) + "\n" + question.note) }
                                    if let reply = VerificationReply(context: decision.context) { Text(reply.reviewerName + " · " + recommendation(reply.recommendation)); Text(reply.note) }
                                }
                            }
                        }
                        Section {
                            Button(l("Lokal speichern", "Save locally")) { if allowed { _ = store.save() } }.disabled(store.loadFailed)
                            Label(store.saved ? l("Lokal gespeichert", "Saved locally") : l("Aktueller Entwurf noch nicht gespeichert", "Current draft is not saved yet"), systemImage: store.saved ? "checkmark.circle" : "pencil")
                            ShareLink(item: record.report(german: de)) { Label(l("Sachliches Protokoll teilen", "Share factual record"), systemImage: "square.and.arrow.up") }.disabled(!store.saved || store.loadFailed)
                            Button(l("Nur diese lokalen Notizen löschen", "Delete only these local notes"), role: .destructive) { deletingRecord = true }.disabled(store.loadFailed)
                        }
                    }
                    if store.actionFailed { Text(failureText).foregroundStyle(.red) }
                }
            }
        }
        .navigationTitle(l("Lokale Prüfnotizen", "Local verification notes"))
        .sheet(item: $editing) { question in
            LocalQuestionEditor(question: question, german: de, error: store.actionFailed ? failureText : nil) { allowed && store.replace($0) }.presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $deciding) {
            LocalDecisionEditor(german: de, error: store.actionFailed ? failureText : nil) { allowed && store.decide($0, reason: $1, confirmed: $2) }
        }
        .confirmationDialog(l("Diesen Prüfpunkt aus dem aktuellen Entwurf entfernen?", "Remove this question from the current draft?"), isPresented: Binding(get: { deletingQuestion != nil }, set: { if !$0 { deletingQuestion = nil } }), titleVisibility: .visible) {
            Button(l("Entfernen", "Remove"), role: .destructive) { if allowed, let id = deletingQuestion { _ = store.removeQuestion(id) }; deletingQuestion = nil }
        }
        .confirmationDialog(l("Nur die lokalen Notizen löschen? Die ursprüngliche Anfrage bleibt bestehen.", "Delete only local notes? The original request is kept."), isPresented: $deletingRecord, titleVisibility: .visible) {
            Button(l("Lokale Notizen löschen", "Delete local notes"), role: .destructive) { if allowed && store.deleteLocalRecord() { dismiss() } }
        }
        .onChange(of: model.user?.id) { _, id in if id != ownerID { editing = nil; deciding = false; dismiss() } }
    }
    private var failureText: String { l("Nicht gespeichert. Prüfe Eingaben, Höchstgrenzen und lokalen Speicher. Dein Entwurf und bisher gespeicherte Daten bleiben erhalten. Falls eine andere Ansicht den Verlauf geändert hat, schließe diese Ansicht und öffne die Notizen erneut.", "Not saved. Check inputs, limits and local storage. Your draft and previously saved data are retained. If another view changed the history, close this view and reopen the notes.") }
    private func status(_ value: QuestionStatus) -> String {
        switch value { case .open: l("Offen", "Open"); case .checked: l("Von mir geprüft", "Checked by me"); case .notApplicable: l("Für mich nicht zutreffend", "Not applicable to me") }
    }
    private func choice(_ value: DecisionChoice) -> String {
        switch value { case .wait: l("Warten", "Wait"); case .decline: l("Nicht fortfahren", "Do not proceed"); case .clarify: l("Selbst weiter klären", "Clarify separately"); case .proceed: l("Fortfahren", "Proceed") }
    }
    private func recommendation(_ raw: String) -> String {
        if de { return Recommendation(rawValue: raw)?.label ?? raw }
        return ["do_not_act": "Do not act", "verify_personally": "Clarify personally first", "plausible": "Appears plausible", "call_me": "Call me now"][raw] ?? raw
    }
    private func refresh(_ id: String) {
        refreshing = true
        Task {
            let fresh = await model.checkDetails(id: id)
            guard model.user?.id == ownerID, let fresh, fresh.requesterId == ownerID else { accessFailed = true; refreshing = false; return }
            _ = store.capture(LocalRequestContext(check: fresh)); refreshing = false
        }
    }
}

private struct LocalQuestionEditor: View {
    let question: VerificationQuestion
    let german: Bool
    let error: String?
    let onSave: (VerificationQuestion) -> Bool
    @Environment(\.dismiss) private var dismiss
    @State private var title: String
    @State private var note: String
    @State private var status: QuestionStatus
    init(question: VerificationQuestion, german: Bool, error: String?, onSave: @escaping (VerificationQuestion) -> Bool) {
        self.question = question; self.german = german; self.error = error; self.onSave = onSave
        _title = State(initialValue: question.title); _note = State(initialValue: question.note); _status = State(initialValue: question.status)
    }
    private func l(_ de: String, _ en: String) -> String { german ? de : en }
    private var value: VerificationQuestion? { var value = question; value.title = title; value.note = note; value.status = status; return try? value.normalized() }
    var body: some View {
        NavigationStack {
            Form {
                TextField(l("Meine Frage", "My question"), text: $title, axis: .vertical)
                TextField(l("Meine Notiz / Quelle", "My note / source"), text: $note, axis: .vertical)
                Picker(l("Mein Bearbeitungsstand", "My progress"), selection: $status) {
                    Text(l("Offen", "Open")).tag(QuestionStatus.open)
                    Text(l("Von mir geprüft", "Checked by me")).tag(QuestionStatus.checked)
                    Text(l("Für mich nicht zutreffend", "Not applicable to me")).tag(QuestionStatus.notApplicable)
                }
                Text(l("Frage bis 300, Notiz bis 2.000 Zeichen. Nur lokal, wird nicht gesendet.", "Question up to 300, note up to 2,000 characters. Local only; not sent.")).font(.footnote)
                if let error { Text(error).foregroundStyle(.red) }
            }
            .navigationTitle(l("Prüfpunkt", "Question"))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(l("Abbrechen", "Cancel")) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button(l("Speichern", "Save")) { if let value, onSave(value) { dismiss() } }.disabled(value == nil) }
            }
        }
    }
}
private struct LocalDecisionEditor: View {
    let german: Bool
    let error: String?
    let onSave: (DecisionChoice, String, Bool) -> Bool
    @Environment(\.dismiss) private var dismiss
    @State private var choice = DecisionChoice.wait
    @State private var reason = ""
    @State private var confirmed = false
    private func l(_ de: String, _ en: String) -> String { german ? de : en }
    var body: some View {
        NavigationStack {
            Form {
                Picker(l("Meine Entscheidung", "My decision"), selection: $choice) {
                    Text(l("Warten", "Wait")).tag(DecisionChoice.wait); Text(l("Nicht fortfahren", "Do not proceed")).tag(DecisionChoice.decline)
                    Text(l("Selbst weiter klären", "Clarify separately")).tag(DecisionChoice.clarify); Text(l("Fortfahren", "Proceed")).tag(DecisionChoice.proceed)
                }
                TextField(l("Meine Begründung", "My reason"), text: $reason, axis: .vertical)
                Toggle(l("Das ist meine eigene Entscheidung. Die App gibt keine Sicherheitsbewertung ab.", "This is my own decision. The app gives no safety verdict."), isOn: $confirmed)
                Text(l("Auch offene Prüfpunkte bleiben offen. Frühere Einträge werden nicht verändert. Zeitangabe von diesem Gerät.", "Open questions stay open. Earlier entries are not changed. Time comes from this device.")).font(.footnote)
                if let error { Text(error).foregroundStyle(.red) }
            }
            .navigationTitle(l("Entscheidung festhalten", "Record decision"))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(l("Abbrechen", "Cancel")) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button(l("Speichern", "Save")) { if onSave(choice, reason, confirmed) { dismiss() } }.disabled(!confirmed || reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || reason.unicodeScalars.count > 2000) }
            }
        }
    }
}
