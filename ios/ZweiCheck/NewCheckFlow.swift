import SwiftUI

struct NewCheckFlow: View {
    let model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var step = 1
    @State private var reviewerID = ""
    @State private var category: CheckCategory = .message
    @State private var description = ""
    @State private var amount = ""

    private var connections: [TrustConnection] { model.routing?.connections ?? [] }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    ProgressView(value: Double(step), total: 4)
                    Text("Schritt \(step) von 4").font(.headline).foregroundStyle(AppTheme.teal)
                    content
                    HStack(spacing: 12) {
                        if step > 1 { Button("Zurück") { step -= 1 }.buttonStyle(SeniorSecondaryButtonStyle()) }
                        if step < 4 {
                            Button("Weiter") { step += 1 }.buttonStyle(SeniorPrimaryButtonStyle()).disabled(!canContinue)
                        } else {
                            Button("Jetzt prüfen lassen") { Task { if await model.createCheck(reviewerID: reviewerID, category: category, description: description, amount: amount) { dismiss() } } }
                                .buttonStyle(SeniorPrimaryButtonStyle()).disabled(model.isBusy)
                        }
                    }
                }.padding(20)
            }
            .navigationTitle("Prüfen lassen")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Schließen") { dismiss() } } }
            .onAppear { if reviewerID.isEmpty { reviewerID = connections.first?.person.id ?? "" } }
        }
    }

    @ViewBuilder private var content: some View {
        switch step {
        case 1:
            VStack(alignment: .leading, spacing: 14) {
                Text("Wer soll dir helfen?").font(.title.bold())
                ForEach(connections) { connection in
                    Button {
                        reviewerID = connection.person.id
                    } label: {
                        HStack {
                            VStack(alignment: .leading) { Text(connection.person.name).font(.title3.bold()); Text(connection.presence.label).font(.subheadline).foregroundStyle(.secondary) }
                            Spacer(); Image(systemName: reviewerID == connection.person.id ? "checkmark.circle.fill" : "circle").font(.title2)
                        }.padding(18).background(AppTheme.card, in: RoundedRectangle(cornerRadius: 16))
                    }.buttonStyle(.plain).foregroundStyle(AppTheme.navy)
                }
            }
        case 2:
            VStack(alignment: .leading, spacing: 14) {
                Text("Worum geht es?").font(.title.bold())
                ForEach(CheckCategory.allCases) { item in
                    Button { category = item } label: {
                        HStack { Image(systemName: item.symbol).frame(width: 28); Text(item.label).font(.title3.bold()); Spacer(); Image(systemName: category == item ? "checkmark.circle.fill" : "circle") }
                            .padding(18).background(AppTheme.card, in: RoundedRectangle(cornerRadius: 16))
                    }.buttonStyle(.plain).foregroundStyle(AppTheme.navy)
                }
            }
        case 3:
            VStack(alignment: .leading, spacing: 14) {
                Text("Was ist passiert?").font(.title.bold())
                Text("Beschreibe kurz, warum du unsicher bist. Keine Passwörter oder TANs eingeben.").foregroundStyle(.secondary)
                TextEditor(text: $description).frame(minHeight: 170).padding(10).background(AppTheme.card, in: RoundedRectangle(cornerRadius: 14))
                TextField("Betrag – optional, z. B. 49,90", text: $amount).keyboardType(.decimalPad).textFieldStyle(.roundedBorder).font(.title3)
            }
        default:
            VStack(alignment: .leading, spacing: 14) {
                Text("Alles richtig?").font(.title.bold())
                summary("Vertrauensperson", connections.first(where: { $0.person.id == reviewerID })?.person.name ?? "–")
                summary("Thema", category.label)
                summary("Beschreibung", description)
                if !amount.isEmpty { summary("Betrag", amount + " €") }
                Text("Sende die Anfrage erst ab, wenn alles stimmt.").foregroundStyle(.secondary)
            }
        }
    }

    private var canContinue: Bool {
        switch step { case 1: !reviewerID.isEmpty; case 2: true; case 3: description.trimmingCharacters(in: .whitespacesAndNewlines).count >= 5; default: true }
    }

    private func summary(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) { Text(title).font(.caption.bold()).foregroundStyle(.secondary); Text(value).font(.body) }
            .padding(16).frame(maxWidth: .infinity, alignment: .leading).background(AppTheme.card, in: RoundedRectangle(cornerRadius: 14))
    }
}
