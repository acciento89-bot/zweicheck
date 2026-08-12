import SwiftUI

struct AccountView: View {
    let model: AppModel
    @State private var password = ""
    @State private var understandsDeletion = false
    @State private var confirmDelete = false
    @State private var exportURL: URL?
    @State private var exporting = false

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

            Section("ZweiCheck Premium Familie") {
                if model.premium.isPremiumFamily {
                    Label("Premium Familie aktiv", systemImage: "checkmark.seal.fill")
                        .font(.headline)
                        .foregroundStyle(AppTheme.teal)
                    Text("Dein Jahresabo ist aktiv. Wenn Familienfreigabe für das Abo aktiviert ist, kann Apple den Zugang mit deiner Familie teilen.")
                        .foregroundStyle(.secondary)
                } else if let product = model.premium.product {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(product.displayName).font(.headline)
                        Text(product.description).foregroundStyle(.secondary)
                        Text("\(product.displayPrice) pro Jahr").font(.title3.bold())
                    }
                    Button("Premium Familie jährlich abonnieren") {
                        Task {
                            await model.premium.purchaseFamilyYearly()
                            forwardPremiumMessage()
                        }
                    }
                    .disabled(model.premium.isLoading)
                } else {
                    Text("Premium Familie – Jahresabo")
                        .font(.headline)
                    Text("Das Abo wird über den App Store bereitgestellt und kann für Apple Familienfreigabe freigeschaltet werden.")
                        .foregroundStyle(.secondary)
                    Button("Abo wird im App Store vorbereitet") {}
                        .disabled(true)
                }

                Button("Käufe wiederherstellen") {
                    Task {
                        await model.premium.restorePurchases()
                        forwardPremiumMessage()
                    }
                }
                .disabled(model.premium.isLoading)
            }

            Section("Benachrichtigungen") {
                Text("ZweiCheck informiert dich bei Prüfanfragen, Antworten und Erinnerungen.")
                    .foregroundStyle(.secondary)
                if model.nativePushRegistered {
                    Label("Push-Benachrichtigungen sind eingerichtet", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(AppTheme.teal)
                } else {
                    Button("Push-Benachrichtigungen aktivieren") {
                        Task { await model.enableNativePush() }
                    }
                    .disabled(model.user?.emailVerified != true || model.isBusy)
                }
                Text("Nach einer bestätigten Anmeldung richtet ZweiCheck Push automatisch ein, sobald du die iOS-Freigabe erteilst.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Section("Deine Daten") {
                Text("Du kannst deine bei ZweiCheck gespeicherten Kontodaten als JSON-Datei exportieren.")
                    .foregroundStyle(.secondary)
                if let exportURL {
                    ShareLink(item: exportURL) {
                        Label("Datenexport teilen oder sichern", systemImage: "square.and.arrow.up")
                    }
                }
                Button(exporting ? "Export wird erstellt …" : "Datenexport erstellen") {
                    exporting = true
                    Task {
                        exportURL = await model.prepareAccountExport()
                        exporting = false
                    }
                }
                .disabled(exporting || model.isBusy)
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
                Text("ZweiCheck 1.0.0 · Build 2")
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .center)
            }
        }
        .navigationTitle("Konto")
        .task { await model.premium.start() }
        .confirmationDialog("Konto wirklich dauerhaft löschen?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Konto endgültig löschen", role: .destructive) {
                Task { await model.deleteAccount(password: password) }
            }
            Button("Abbrechen", role: .cancel) {}
        } message: {
            Text("Diese Aktion kann nicht rückgängig gemacht werden.")
        }
    }

    @MainActor
    private func forwardPremiumMessage() {
        if let premiumMessage = model.premium.message {
            model.message = premiumMessage
            model.premium.message = nil
        }
    }
}
