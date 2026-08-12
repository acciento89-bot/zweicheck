import SwiftUI

struct ChecksView: View {
    let model: AppModel

    var body: some View {
        Group {
            if model.checks.isEmpty {
                ContentUnavailableView("Noch keine Prüfungen", systemImage: "checkmark.shield", description: Text("Deine gesendeten und erhaltenen Prüfanfragen erscheinen hier."))
            } else {
                List(model.checks) { check in
                    NavigationLink { CheckDetailView(model: model, initialCheck: check) } label: {
                        VStack(alignment: .leading, spacing: 7) {
                            HStack { Text(check.categoryLabel).font(.headline); Spacer(); Text(check.status == "open" ? "Offen" : "Beantwortet").font(.subheadline.bold()).foregroundStyle(check.status == "open" ? AppTheme.orange : AppTheme.teal) }
                            Text(check.description).lineLimit(2).foregroundStyle(.secondary)
                            Text(check.requesterId == model.user?.id ? "Bei \(check.reviewerName)" : "Von \(check.requesterName)").font(.footnote).foregroundStyle(.secondary)
                        }.padding(.vertical, 6)
                    }
                }
            }
        }
        .navigationTitle("Prüfungen")
        .refreshable { await model.refreshChecks() }
    }
}

struct CheckDetailView: View {
    let model: AppModel
    @State private var check: CheckItem
    @State private var note = ""

    init(model: AppModel, initialCheck: CheckItem) { self.model = model; _check = State(initialValue: initialCheck) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text(check.categoryLabel).font(.largeTitle.bold()).foregroundStyle(AppTheme.navy)
                Text(check.description).font(.title3)
                if let cents = check.amountCents { Text(String(format: "%.2f €", Double(cents) / 100)).font(.title2.bold()) }

                if let recommendation = check.recommendationLabel {
                    VStack(alignment: .leading, spacing: 8) { Text("Rückmeldung").font(.headline); Text(recommendation).font(.title2.bold()).foregroundStyle(AppTheme.teal); if let response = check.responseNote, !response.isEmpty { Text(response) } }
                        .padding(18).frame(maxWidth: .infinity, alignment: .leading).background(AppTheme.card, in: RoundedRectangle(cornerRadius: 18))
                }

                if check.status == "open", check.reviewerId == model.user?.id {
                    Text("Was empfiehlst du?").font(.title2.bold())
                    TextField("Kurze Notiz – optional", text: $note, axis: .vertical).lineLimit(2...5).textFieldStyle(.roundedBorder)
                    ForEach(Recommendation.allCases) { recommendation in
                        Button(recommendation.label) {
                            Task { if let updated = await model.respond(check, recommendation: recommendation, note: note) { check = updated } }
                        }.buttonStyle(recommendation == .doNotAct ? SeniorPrimaryButtonStyle() : SeniorSecondaryButtonStyle())
                    }
                }

                if check.requesterId == model.user?.id, check.status != "closed" {
                    Button("Prüfung abschließen") { Task { await model.close(check); if let updated = model.checks.first(where: { $0.id == check.id }) { check = updated } } }
                        .buttonStyle(SeniorSecondaryButtonStyle())
                }
            }.padding(20)
        }
        .navigationTitle("Prüfung")
        .navigationBarTitleDisplayMode(.inline)
    }
}
