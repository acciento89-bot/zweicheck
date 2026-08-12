import SwiftUI

struct AccountView: View {
    let model: AppModel
    @State private var password = ""
    @State private var understandsDeletion = false
    @State private var confirmDelete = false

    var body: some View {
        Form {
            Section("Dein Konto") {
                LabeledContent("Name", value: model.user?.name ?? "–")
                LabeledContent("E-Mail", value: model.user?.email ?? "–")
                if model.user?.emailVerified == false {
                    Button("Bestätigungs-E-Mail erneut senden") {
                        Task { await model.resendVerification() }
                    }
                }
            }

            Section("Benachrichtigungen") {
                Text("ZweiCheck kann dich informieren, wenn eine Prüfanfrage oder eine Antwort angekommen ist.")
                    .foregroundStyle(.secondary)
                if model.nativePushRegistered {
                    Label("Benachrichtigungen sind eingerichtet", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(AppTheme.teal)
                } else {
                    Button("Benachrichtigungen aktivieren") {
                        Task { await model.enableNativePush() }
                    }
                    .disabled(model.user?.emailVerified != true || model.isBusy)
                }
                Text("Du kannst Benachrichtigungen jederzeit in den iPhone-Einstellungen wieder ausschalten.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Section("Datenschutz und Hilfe") {
                Link("Datenschutz", destination: URL(string: "https://zweicheck.kamilunavo.com/privacy")!)
                Link("Datenschutz-Einstellungen", destination: URL(string: "https://zweicheck.kamilunavo.com/privacy-choices")!)
                Link("Hilfe & Support", destination: URL(string: "https://zweicheck.kamilunavo.com/support")!)
            }

            Section {
                Button("Abmelden") { Task { await model.logout() } }
            }

            Section("Konto löschen") {
                Text("Das kann nicht rückgängig gemacht werden. Deine Verbindungen, beteiligten Prüfungen und hochgeladenen Dateien werden entfernt.")
                    .foregroundStyle(.secondary)
                SecureField("Aktuelles Passwort", text: $password)
                Toggle("Ich habe verstanden, dass mein Konto dauerhaft gelöscht wird.", isOn: $understandsDeletion)
                Button("Konto dauerhaft löschen", role: .destructive) { confirmDelete = true }
                    .disabled(password.isEmpty || !understandsDeletion || model.isBusy)
            }

            Section {
                Text("ZweiCheck 1.0.0")
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .center)
            }
        }
        .navigationTitle("Konto")
        .confirmationDialog("Konto wirklich dauerhaft löschen?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Konto endgültig löschen", role: .destructive) {
                Task { await model.deleteAccount(password: password) }
            }
            Button("Abbrechen", role: .cancel) {}
        } message: {
            Text("Diese Aktion kann nicht rückgängig gemacht werden.")
        }
    }
}
