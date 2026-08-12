import PhotosUI
import SwiftUI
import UIKit

struct NewCheckFlow: View {
    let model: AppModel
    private let sharedDraftID: String?
    @Environment(\.dismiss) private var dismiss
    @State private var step = 1
    @State private var reviewerID = ""
    @State private var fallbackReviewerID = ""
    @State private var category: CheckCategory
    @State private var description: String
    @State private var amount = ""
    @State private var urgency = "none"
    @State private var reminderMinutes = 0
    @State private var autoReroute = false
    @State private var showAdvanced = false
    @State private var pickerItems: [PhotosPickerItem] = []
    @State private var images: [UploadImage]
    @State private var imageError: String?
    @State private var preparingImages = false

    init(model: AppModel) {
        self.model = model
        let draft = model.pendingSharedDraft
        sharedDraftID = draft?.id
        _category = State(initialValue: draft?.category ?? .message)
        _description = State(initialValue: draft?.description ?? "")
        _images = State(initialValue: draft?.images ?? [])
    }

    private var connections: [TrustConnection] { model.routing?.connections ?? [] }
    private var fallbackCandidates: [TrustConnection] { connections.filter { $0.person.id != reviewerID } }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    ProgressView(value: Double(step), total: 4)
                    Text("Schritt \(step) von 4").font(.headline).foregroundStyle(AppTheme.teal)
                    content
                    HStack(spacing: 12) {
                        if step > 1 {
                            Button("Zurück") { step -= 1 }
                                .buttonStyle(SeniorSecondaryButtonStyle())
                        }
                        if step < 4 {
                            Button("Weiter") { step += 1 }
                                .buttonStyle(SeniorPrimaryButtonStyle())
                                .disabled(!canContinue)
                        } else {
                            Button("Jetzt sicher prüfen lassen") { submit() }
                                .buttonStyle(SeniorPrimaryButtonStyle())
                                .disabled(model.isBusy || preparingImages)
                        }
                    }
                }
                .padding(20)
            }
            .navigationTitle("Prüfen lassen")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Schließen") { dismiss() }
                }
            }
            .onAppear {
                if reviewerID.isEmpty { reviewerID = connections.first?.person.id ?? "" }
            }
            .onChange(of: reviewerID) { _, _ in
                if fallbackReviewerID == reviewerID { fallbackReviewerID = "" }
            }
            .onChange(of: fallbackReviewerID) { _, value in
                if value.isEmpty { autoReroute = false }
            }
            .onChange(of: reminderMinutes) { _, value in
                if value == 0 { autoReroute = false }
            }
            .onChange(of: pickerItems) { _, items in
                Task { await loadImages(items) }
            }
        }
    }

    @ViewBuilder private var content: some View {
        switch step {
        case 1:
            VStack(alignment: .leading, spacing: 14) {
                Text("Wer soll dir helfen?").font(.title.bold())
                Text("Wähle eine Person, die du kennst und der du vertraust.").foregroundStyle(.secondary)
                ForEach(connections) { connection in
                    Button {
                        reviewerID = connection.person.id
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(connection.person.name).font(.title3.bold())
                                Text(connection.presence.label).font(.subheadline).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Image(systemName: reviewerID == connection.person.id ? "checkmark.circle.fill" : "circle").font(.title2)
                        }
                        .padding(18)
                        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 16))
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(AppTheme.navy)
                }
            }
        case 2:
            VStack(alignment: .leading, spacing: 14) {
                Text("Worum geht es?").font(.title.bold())
                ForEach(CheckCategory.allCases) { item in
                    Button { category = item } label: {
                        HStack {
                            Image(systemName: item.symbol).frame(width: 28)
                            Text(item.label).font(.title3.bold())
                            Spacer()
                            Image(systemName: category == item ? "checkmark.circle.fill" : "circle")
                        }
                        .padding(18)
                        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 16))
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(AppTheme.navy)
                }
            }
        case 3:
            VStack(alignment: .leading, spacing: 14) {
                Text("Was ist passiert?").font(.title.bold())
                if sharedDraftID != nil {
                    Label("Aus dem Teilen-Menü übernommen", systemImage: "square.and.arrow.down")
                        .font(.headline)
                        .foregroundStyle(AppTheme.teal)
                }
                Text("Beschreibe kurz, warum du unsicher bist. Keine Passwörter oder TANs eingeben.").foregroundStyle(.secondary)
                TextEditor(text: $description)
                    .frame(minHeight: 170)
                    .padding(10)
                    .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 14))
                TextField("Betrag – optional, z. B. 49,90", text: $amount)
                    .keyboardType(.decimalPad)
                    .textFieldStyle(.roundedBorder)
                    .font(.title3)

                PhotosPicker(selection: $pickerItems, maxSelectionCount: 3, matching: .images) {
                    Label(images.isEmpty ? "Bilder auswählen – optional" : "Bilder ändern (\(images.count)/3)", systemImage: "photo.on.rectangle.angled")
                }
                .buttonStyle(SeniorSecondaryButtonStyle())

                if preparingImages {
                    HStack { ProgressView(); Text("Bilder werden vorbereitet …") }.foregroundStyle(.secondary)
                }
                if let imageError { Text(imageError).foregroundStyle(.red).font(.subheadline) }

                if !images.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 12) {
                            ForEach(images) { image in
                                if let uiImage = UIImage(data: image.data) {
                                    Image(uiImage: uiImage)
                                        .resizable()
                                        .scaledToFill()
                                        .frame(width: 96, height: 96)
                                        .clipShape(RoundedRectangle(cornerRadius: 14))
                                        .accessibilityLabel("Ausgewähltes Bild")
                                }
                            }
                        }
                    }
                    Button("Alle Bilder entfernen") {
                        pickerItems = []
                        images = []
                    }
                    .font(.body.weight(.semibold))
                }
            }
        default:
            VStack(alignment: .leading, spacing: 14) {
                Text("Alles richtig?").font(.title.bold())
                summary("Vertrauensperson", connections.first(where: { $0.person.id == reviewerID })?.person.name ?? "–")
                summary("Thema", category.label)
                summary("Beschreibung", description)
                if !amount.isEmpty { summary("Betrag", amount + " €") }
                if !images.isEmpty { summary("Bilder", "\(images.count) ausgewählt") }

                Picker("Wie dringend ist es?", selection: $urgency) {
                    Text("Nicht dringend").tag("none")
                    Text("Etwas dringend").tag("low")
                    Text("Dringend").tag("high")
                    Text("Sehr dringend – ich soll sofort handeln").tag("very_high")
                }
                .pickerStyle(.menu)
                .padding(14)
                .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 14))

                DisclosureGroup("Mehr Möglichkeiten", isExpanded: $showAdvanced) {
                    VStack(alignment: .leading, spacing: 16) {
                        Picker("Wer soll sonst helfen?", selection: $fallbackReviewerID) {
                            Text("Keine zweite Person").tag("")
                            ForEach(fallbackCandidates) { connection in
                                Text("\(connection.person.name) · \(connection.presence.label)").tag(connection.person.id)
                            }
                        }
                        .pickerStyle(.menu)

                        Picker("Soll ZweiCheck erinnern?", selection: $reminderMinutes) {
                            Text("Nein, nicht erinnern").tag(0)
                            Text("Nach 5 Minuten").tag(5)
                            Text("Nach 15 Minuten").tag(15)
                            Text("Nach 30 Minuten").tag(30)
                            Text("Nach 60 Minuten").tag(60)
                            Text("Nach 120 Minuten").tag(120)
                        }
                        .pickerStyle(.menu)

                        Toggle("Danach automatisch die zweite Person fragen", isOn: $autoReroute)
                            .disabled(reminderMinutes == 0 || fallbackReviewerID.isEmpty)

                        Text("Sobald jemand antwortet oder du die Prüfung beendest, hört die Erinnerung automatisch auf.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.top, 12)
                }
                .padding(16)
                .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 14))

                Text("Sende die Anfrage erst ab, wenn alles stimmt.").foregroundStyle(.secondary)
            }
        }
    }

    private var canContinue: Bool {
        switch step {
        case 1: !reviewerID.isEmpty
        case 2: true
        case 3: description.trimmingCharacters(in: .whitespacesAndNewlines).count >= 5 && !preparingImages
        default: true
        }
    }

    private func summary(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.caption.bold()).foregroundStyle(.secondary)
            Text(value).font(.body)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.card, in: RoundedRectangle(cornerRadius: 14))
    }

    private func submit() {
        let draftID = sharedDraftID
        Task {
            let success = await model.createCheck(
                reviewerID: reviewerID,
                fallbackReviewerID: fallbackReviewerID.isEmpty ? nil : fallbackReviewerID,
                category: category,
                description: description,
                amount: amount,
                urgency: urgency,
                reminderMinutes: reminderMinutes == 0 ? nil : reminderMinutes,
                autoReroute: autoReroute,
                images: images
            )
            if success {
                if draftID != nil { model.consumeSharedDraft() }
                dismiss()
            }
        }
    }

    @MainActor
    private func loadImages(_ items: [PhotosPickerItem]) async {
        preparingImages = true
        imageError = nil
        var prepared: [UploadImage] = []
        for (index, item) in items.prefix(3).enumerated() {
            do {
                guard let data = try await item.loadTransferable(type: Data.self) else { continue }
                prepared.append(try ImagePreparation.jpeg(from: data, index: index))
            } catch {
                imageError = error.localizedDescription
            }
        }
        images = prepared
        preparingImages = false
    }
}
