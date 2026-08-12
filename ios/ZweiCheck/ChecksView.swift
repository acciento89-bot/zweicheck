import SwiftUI

struct ChecksView: View {
    let model: AppModel
    @State private var linkedCheck: CheckItem?

    var body: some View {
        Group {
            if model.checks.isEmpty {
                ContentUnavailableView(
                    "Noch keine Prüfungen",
                    systemImage: "checkmark.shield",
                    description: Text("Deine gesendeten und erhaltenen Prüfanfragen erscheinen hier.")
                )
            } else {
                List(model.checks) { check in
                    NavigationLink {
                        CheckDetailView(model: model, initialCheck: check)
                    } label: {
                        VStack(alignment: .leading, spacing: 7) {
                            HStack {
                                Text(check.categoryLabel).font(.headline)
                                Spacer()
                                Text(check.status == "open" ? "Offen" : "Beantwortet")
                                    .font(.subheadline.bold())
                                    .foregroundStyle(check.status == "open" ? AppTheme.orange : AppTheme.teal)
                            }
                            Text(check.description).lineLimit(2).foregroundStyle(.secondary)
                            Text(check.requesterId == model.user?.id ? "Bei \(check.reviewerName)" : "Von \(check.requesterName)")
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 6)
                    }
                }
            }
        }
        .navigationTitle("Prüfungen")
        .refreshable { await model.refreshChecks() }
        .task(id: model.pendingCheckID) { await openPendingCheck() }
        .sheet(item: $linkedCheck) { check in
            NavigationStack {
                CheckDetailView(model: model, initialCheck: check)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Schließen") { linkedCheck = nil }
                        }
                    }
            }
        }
    }

    @MainActor
    private func openPendingCheck() async {
        guard let id = model.pendingCheckID else { return }
        if !model.checks.contains(where: { $0.id == id }) { await model.refreshChecks() }
        linkedCheck = model.checks.first(where: { $0.id == id })
        if linkedCheck == nil { model.message = "Diese Prüfung ist nicht mehr verfügbar." }
        model.pendingCheckID = nil
    }
}

struct CheckDetailView: View {
    let model: AppModel
    @State private var check: CheckItem
    @State private var note = ""

    init(model: AppModel, initialCheck: CheckItem) {
        self.model = model
        _check = State(initialValue: initialCheck)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text(check.categoryLabel).font(.largeTitle.bold()).foregroundStyle(AppTheme.navy)
                Text(check.description).font(.title3)
                if let cents = check.amountCents { Text(String(format: "%.2f €", Double(cents) / 100)).font(.title2.bold()) }
                if let attachmentCount = check.attachmentCount, attachmentCount > 0 {
                    Label("\(attachmentCount) Bild\(attachmentCount == 1 ? "" : "er") angehängt", systemImage: "photo.on.rectangle")
                        .foregroundStyle(.secondary)
                }
                if let recommendation = check.recommendationLabel { responseCard(recommendation) }
                if canRespond { responseControls }
                if canClose {
                    Button("Prüfung abschließen") { closeCurrentCheck() }
                        .buttonStyle(SeniorSecondaryButtonStyle())
                }
            }.padding(20)
        }
        .navigationTitle("Prüfung")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var canRespond: Bool { check.status == "open" && check.reviewerId == model.user?.id }
    private var canClose: Bool { check.requesterId == model.user?.id && check.status != "closed" }

    @ViewBuilder private func responseCard(_ recommendation: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Rückmeldung").font(.headline)
            Text(recommendation).font(.title2.bold()).foregroundStyle(AppTheme.teal)
            if let response = check.responseNote, !response.isEmpty { Text(response) }
        }
        .padding(18).frame(maxWidth: .infinity, alignment: .leading).background(AppTheme.card, in: RoundedRectangle(cornerRadius: 18))
    }

    private var responseControls: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Was empfiehlst du?").font(.title2.bold())
            TextField("Kurze Notiz – optional", text: $note, axis: .vertical).lineLimit(2...5).textFieldStyle(.roundedBorder)
            ForEach(Recommendation.allCases) { recommendation in
                Button(recommendation.label) { submit(recommendation) }
                    .buttonStyle(SeniorSecondaryButtonStyle())
            }
        }
    }

    private func submit(_ recommendation: Recommendation) {
        let currentCheck = check
        let currentNote = note
        Task {
            let updated = await model.respond(currentCheck, recommendation: recommendation, note: currentNote)
            if let updated { check = updated }
        }
    }

    private func closeCurrentCheck() {
        let currentCheck = check
        let currentID = check.id
        Task {
            await model.close(currentCheck)
            if let updated = model.checks.first(where: { $0.id == currentID }) { check = updated }
        }
    }
}
