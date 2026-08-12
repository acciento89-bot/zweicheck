import SwiftUI

struct PeopleView: View {
    let model: AppModel
    @State private var inviteEmail = ""
    @State private var inviteCode = ""

    var body: some View {
        List {
            Section("Wann kannst du helfen?") {
                presenceButton("Ja, ich kann helfen", status: "available", symbol: "checkmark.circle.fill")
                presenceButton("Nur wenn es dringend ist", status: "urgent_only", symbol: "exclamationmark.circle.fill")
                presenceButton("Gerade nicht", status: "unavailable", symbol: "minus.circle.fill")
                presenceButton("Keine Angabe", status: "neutral", symbol: "circle")
            }

            Section("Deine Vertrauenspersonen") {
                if model.routing?.connections.isEmpty != false { Text("Noch niemand verbunden.").foregroundStyle(.secondary) }
                ForEach(model.routing?.connections ?? []) { item in
                    VStack(alignment: .leading, spacing: 5) { Text(item.person.name).font(.headline); Text(item.presence.label).foregroundStyle(.secondary); Text(item.person.email).font(.footnote).foregroundStyle(.secondary) }.padding(.vertical, 4)
                }
            }

            Section("Person einladen") {
                TextField("E-Mail-Adresse", text: $inviteEmail).keyboardType(.emailAddress).textInputAutocapitalization(.never)
                Button("Einladung senden") { Task { _ = await model.invite(email: inviteEmail); inviteEmail = "" } }.disabled(inviteEmail.isEmpty || model.user?.emailVerified != true)
            }

            Section("Einladungscode eingeben") {
                TextField("Code", text: $inviteCode).textInputAutocapitalization(.characters)
                Button("Code annehmen") { Task { await model.accept(code: inviteCode); inviteCode = "" } }.disabled(inviteCode.count < 6 || model.user?.emailVerified != true)
            }
        }
        .navigationTitle("Personen")
        .refreshable { await model.refreshPeople() }
    }

    private func presenceButton(_ title: String, status: String, symbol: String) -> some View {
        Button { Task { await model.setPresence(status) } } label: {
            HStack { Label(title, systemImage: symbol); Spacer(); if model.routing?.selfPresence.status == status || (status == "neutral" && model.routing?.selfPresence.status == "neutral") { Image(systemName: "checkmark").foregroundStyle(AppTheme.teal) } }
                .frame(minHeight: 44)
        }
    }
}
