import SwiftUI
import UIKit

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
                                Text(statusLabel(check.status))
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

    private func statusLabel(_ status: String) -> String {
        switch status {
        case "open": "Offen"
        case "answered": "Beantwortet"
        case "closed": "Abgeschlossen"
        default: status
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
    @State private var routing: CheckRouting?
    @State private var escalation: EscalationPlan?
    @State private var rerouteTargetID = ""
    @State private var reminderMinutes = 15
    @State private var autoReroute = false
    @State private var loadingDetails = true

    init(model: AppModel, initialCheck: CheckItem) {
        self.model = model
        _check = State(initialValue: initialCheck)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text(check.categoryLabel).font(.largeTitle.bold()).foregroundStyle(AppTheme.navy)
                statusCard
                Text(check.description).font(.title3)
                if let cents = check.amountCents {
                    Text(String(format: "%.2f €", Double(cents) / 100)).font(.title2.bold())
                }

                if let attachments = check.attachments, !attachments.isEmpty {
                    attachmentSection(attachments)
                } else if let attachmentCount = check.attachmentCount, attachmentCount > 0 {
                    Label("\(attachmentCount) Bild\(attachmentCount == 1 ? "" : "er") angehängt", systemImage: "photo.on.rectangle")
                        .foregroundStyle(.secondary)
                }

                if let recommendation = check.recommendationLabel { responseCard(recommendation) }
                if let routing { routingCard(routing) }
                if let escalation, escalation.role == "requester" || escalation.exists { escalationCard(escalation) }
                if canRespond { responseControls }
                if canClose {
                    Button("Prüfung abschließen") { closeCurrentCheck() }
                        .buttonStyle(SeniorSecondaryButtonStyle())
                }
                if loadingDetails { ProgressView("Prüfung wird aktualisiert …") }
            }
            .padding(20)
        }
        .navigationTitle("Prüfung")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadFullState() }
        .refreshable { await loadFullState() }
    }

    private var canRespond: Bool { check.status == "open" && check.reviewerId == model.user?.id }
    private var canClose: Bool { check.requesterId == model.user?.id && check.status != "closed" }

    private var statusCard: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(check.requesterId == model.user?.id ? "Du fragst \(check.reviewerName)" : "\(check.requesterName) fragt dich")
                    .font(.headline)
                Text(statusText).foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: check.status == "open" ? "clock.fill" : "checkmark.circle.fill")
                .foregroundStyle(check.status == "open" ? AppTheme.orange : AppTheme.teal)
        }
        .padding(16)
        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 16))
    }

    private var statusText: String {
        switch check.status {
        case "open": "Wartet auf Rückmeldung"
        case "answered": "Rückmeldung erhalten"
        case "closed": "Abgeschlossen"
        default: check.status
        }
    }

    @ViewBuilder private func attachmentSection(_ attachments: [AttachmentItem]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Bilder").font(.headline)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(attachments) { attachment in
                        AttachmentPreview(model: model, attachment: attachment)
                    }
                }
            }
        }
    }

    @ViewBuilder private func responseCard(_ recommendation: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Rückmeldung").font(.headline)
            Text(recommendation).font(.title2.bold()).foregroundStyle(AppTheme.teal)
            if let response = check.responseNote, !response.isEmpty { Text(response) }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 18))
    }

    @ViewBuilder private func routingCard(_ value: CheckRouting) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Wer hilft gerade?").font(.title2.bold())
            LabeledContent("Aktuell zuständig", value: value.currentReviewer.name)
            Text(value.currentReviewer.presence.label).foregroundStyle(.secondary)
            if let fallback = value.fallbackReviewer {
                LabeledContent("Zweite Person", value: fallback.name)
            }
            if !value.history.isEmpty {
                VStack(alignment: .leading, spacing: 5) {
                    Text("Weiterleitungsverlauf").font(.headline)
                    ForEach(value.history) { item in
                        Text("\(item.from.name) → \(item.to.name)").foregroundStyle(.secondary)
                    }
                }
            }
            if value.canReroute && !value.targets.isEmpty {
                Picker("Andere Person fragen", selection: $rerouteTargetID) {
                    ForEach(value.targets) { target in
                        Text("\(target.person.name) · \(target.presence.label)").tag(target.person.id)
                    }
                }
                .pickerStyle(.menu)
                Button("Offene Anfrage weitergeben") {
                    rerouteCurrentCheck()
                }
                .buttonStyle(SeniorSecondaryButtonStyle())
                .disabled(rerouteTargetID.isEmpty || model.isBusy)
            } else if value.reassignedAt != nil {
                Text("Diese Prüfung wurde bereits einmal weitergegeben.").font(.footnote).foregroundStyle(.secondary)
            }
        }
        .padding(18)
        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 18))
    }

    @ViewBuilder private func escalationCard(_ value: EscalationPlan) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Wenn niemand antwortet").font(.title2.bold())
            Label(value.stateLabel, systemImage: value.enabled ? "bell.badge.fill" : "bell.slash")
                .foregroundStyle(value.enabled ? AppTheme.orange : .secondary)
            if let minutes = value.reminderMinutes {
                Text("Erinnerung nach \(minutes) Minuten").foregroundStyle(.secondary)
            }
            if value.autoReroute, let fallback = value.fallbackReviewer {
                Text("Danach wird automatisch \(fallback.name) gefragt.").foregroundStyle(.secondary)
            }
            if let error = value.lastError, !error.isEmpty {
                Text(error).font(.footnote).foregroundStyle(.red)
            }

            if value.canConfigure && !value.enabled {
                Picker("Erinnerung", selection: $reminderMinutes) {
                    Text("5 Minuten").tag(5)
                    Text("15 Minuten").tag(15)
                    Text("30 Minuten").tag(30)
                    Text("1 Stunde").tag(60)
                    Text("2 Stunden").tag(120)
                }
                .pickerStyle(.menu)
                Toggle("Danach zweite Person fragen", isOn: $autoReroute)
                    .disabled(value.fallbackReviewer == nil)
                Button("Erinnerung einschalten") { updateReminder(enabled: true) }
                    .buttonStyle(SeniorSecondaryButtonStyle())
                    .disabled(model.isBusy)
            } else if value.enabled && value.canManage {
                Button("Erinnerung stoppen") { updateReminder(enabled: false) }
                    .buttonStyle(SeniorSecondaryButtonStyle())
                    .disabled(model.isBusy)
            }
        }
        .padding(18)
        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 18))
    }

    private var responseControls: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Was empfiehlst du?").font(.title2.bold())
            TextField("Kurze Notiz – optional", text: $note, axis: .vertical)
                .lineLimit(2...5)
                .textFieldStyle(.roundedBorder)
            ForEach(Recommendation.allCases) { recommendation in
                Button(recommendation.label) { submit(recommendation) }
                    .buttonStyle(SeniorSecondaryButtonStyle())
            }
        }
    }

    @MainActor
    private func loadFullState() async {
        loadingDetails = true
        defer { loadingDetails = false }
        async let detailTask = model.checkDetails(id: check.id)
        async let routingTask = model.checkRouting(id: check.id)
        async let escalationTask = model.checkEscalation(id: check.id)
        if let detail = await detailTask { check = detail }
        routing = await routingTask
        escalation = await escalationTask
        if let first = routing?.targets.first, rerouteTargetID.isEmpty { rerouteTargetID = first.person.id }
        if let value = escalation {
            reminderMinutes = value.reminderMinutes ?? 15
            autoReroute = value.autoReroute
        }
    }

    private func submit(_ recommendation: Recommendation) {
        let currentCheck = check
        let currentNote = note
        Task {
            _ = await model.respond(currentCheck, recommendation: recommendation, note: currentNote)
            note = ""
            await loadFullState()
        }
    }

    private func closeCurrentCheck() {
        let currentCheck = check
        Task {
            await model.close(currentCheck)
            await loadFullState()
        }
    }

    private func rerouteCurrentCheck() {
        let id = check.id
        let target = rerouteTargetID
        Task {
            if await model.reroute(checkID: id, reviewerID: target) {
                await loadFullState()
            }
        }
    }

    private func updateReminder(enabled: Bool) {
        let id = check.id
        Task {
            escalation = await model.updateEscalation(
                checkID: id,
                enabled: enabled,
                reminderMinutes: enabled ? reminderMinutes : nil,
                autoReroute: enabled && autoReroute
            )
            await model.refreshActivities()
        }
    }
}

private struct AttachmentPreview: View {
    let model: AppModel
    let attachment: AttachmentItem
    @State private var image: UIImage?
    @State private var loading = true

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else if loading {
                ProgressView()
            } else {
                Image(systemName: "photo")
                    .font(.largeTitle)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(width: 160, height: 160)
        .background(AppTheme.card)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .accessibilityLabel(attachment.originalName)
        .task {
            if let data = await model.attachmentData(id: attachment.id) {
                image = UIImage(data: data)
            }
            loading = false
        }
    }
}
