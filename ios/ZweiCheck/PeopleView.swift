import SwiftUI

struct PeopleView: View {
    let model: AppModel
    @State private var inviteEmail = ""
    @State private var inviteCode = ""
    @State private var lastCreatedCode: String?
    @State private var presenceDuration = 0

    var body: some View {
        List {
            Section("Wann kannst du helfen?") {
                Picker("Wie lange soll das gelten?", selection: $presenceDuration) {
                    Text("Bis ich es ändere").tag(0)
                    Text("1 Stunde").tag(60)
                    Text("4 Stunden").tag(240)
                    Text("8 Stunden").tag(480)
                    Text("12 Stunden").tag(720)
                    Text("24 Stunden").tag(1440)
                }
                presenceButton("Ja, ich kann helfen", status: "available", symbol: "checkmark.circle.fill")
                presenceButton("Nur wenn es dringend ist", status: "urgent_only", symbol: "exclamationmark.circle.fill")
                presenceButton("Gerade nicht", status: "unavailable", symbol: "minus.circle.fill")
                presenceButton("Keine Angabe", status: "neutral", symbol: "circle")
            }

            if !model.pendingInvitations.isEmpty {
                Section("Einladungen für dich") {
                    ForEach(model.pendingInvitations) { invitation in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(invitation.creatorName).font(.headline)
                            Text(invitation.creatorEmail).font(.footnote).foregroundStyle(.secondary)
                            HStack {
                                Button("Code eingeben") {
                                    model.pendingInviteCode = nil
                                    inviteCode = ""
                                    model.message = "Öffne den Einladungslink aus der E-Mail oder gib den darin enthaltenen Code unten ein."
                                }
                                .buttonStyle(.borderless)
                                Spacer()
                                Button("Ablehnen", role: .destructive) {
                                    Task { await model.declineInvitation(invitation) }
                                }
                                .buttonStyle(.borderless)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
            }

            Section("Deine Vertrauenspersonen") {
                if model.routing?.connections.isEmpty != false {
                    Text("Noch niemand verbunden.").foregroundStyle(.secondary)
                }
                ForEach(model.routing?.connections ?? []) { item in
                    VStack(alignment: .leading, spacing: 5) {
                        Text(item.person.name).font(.headline)
                        Text(item.presence.label).foregroundStyle(.secondary)
                        Text(item.person.email).font(.footnote).foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 4)
                    .swipeActions {
                        Button("Entfernen", role: .destructive) {
                            Task { await model.removeConnection(item) }
                        }
                    }
                }
            }

            Section("Person einladen") {
                if model.user?.emailVerified != true {
                    Label("E-Mail-Adresse noch nicht bestätigt", systemImage: "envelope.badge")
                        .font(.headline)
                    Text("Bestätige zuerst deine E-Mail-Adresse. Danach kannst du Vertrauenspersonen einladen oder Einladungscodes annehmen.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Button("Bestätigungs-E-Mail erneut senden") {
                        Task { await model.resendVerification() }
                    }
                    .buttonStyle(.borderless)
                    .disabled(model.isBusy)
                }

                TextField("E-Mail optional", text: $inviteEmail)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .disabled(model.isBusy)
                Text("Ohne E-Mail erzeugt ZweiCheck einen Code, den du selbst teilen kannst.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Button("Einladung erstellen") {
                    guard model.user?.emailVerified == true else {
                        model.message = "Bitte bestätige zuerst deine E-Mail-Adresse. Danach kannst du die Einladung direkt erstellen."
                        return
                    }
                    Task {
                        lastCreatedCode = await model.invite(email: inviteEmail.isEmpty ? nil : inviteEmail)
                        inviteEmail = ""
                    }
                }
                .disabled(model.isBusy)

                if let lastCreatedCode {
                    LabeledContent("Einladungscode", value: lastCreatedCode)
                    ShareLink(
                        item: "Ich möchte dich bei ZweiCheck als Vertrauensperson verbinden. Einladungscode: \(lastCreatedCode)\nhttps://zweicheck.kamilunavo.com/#invite=\(lastCreatedCode)",
                        subject: Text("ZweiCheck-Einladung")
                    ) {
                        Label("Einladung teilen", systemImage: "square.and.arrow.up")
                    }
                }
            }

            Section("Einladungscode eingeben") {
                TextField("Code", text: $inviteCode)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .disabled(model.isBusy)
                Button("Code annehmen") {
                    guard model.user?.emailVerified == true else {
                        model.message = "Bitte bestätige zuerst deine E-Mail-Adresse. Danach kannst du Einladungscodes annehmen."
                        return
                    }
                    let code = inviteCode
                    Task {
                        await model.accept(code: code)
                        inviteCode = ""
                    }
                }
                .disabled(inviteCode.count < 6 || model.isBusy)
            }
        }
        .navigationTitle("Personen")
        .refreshable { await model.refreshPeople() }
        .task(id: model.pendingInviteCode) {
            guard let code = model.pendingInviteCode else { return }
            model.pendingInviteCode = nil
            inviteCode = code

            guard model.user?.emailVerified == true else {
                model.message = "Bestätige zuerst deine E-Mail-Adresse. Der Einladungscode ist bereits übernommen und kann danach angenommen werden."
                return
            }

            await model.accept(code: code)
            inviteCode = ""
        }
    }

    private func presenceButton(_ title: String, status: String, symbol: String) -> some View {
        Button {
            Task {
                await model.setPresence(status, durationMinutes: presenceDuration == 0 ? nil : presenceDuration)
            }
        } label: {
            HStack {
                Label(title, systemImage: symbol)
                Spacer()
                if model.routing?.selfPresence.status == status || (status == "neutral" && model.routing?.selfPresence.status == "neutral") {
                    Image(systemName: "checkmark").foregroundStyle(AppTheme.teal)
                }
            }
            .frame(minHeight: 44)
        }
    }
}
