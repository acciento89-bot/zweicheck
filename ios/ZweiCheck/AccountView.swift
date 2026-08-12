import SwiftUI

struct AccountView: View {
    let model: AppModel
    @AppStorage("zweicheck.onboarding.completed") private var onboardingCompleted = false
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
                LabeledContent("Tarif", value: model.premium.isPremiumFamily ? "Premium Familie" : "Kostenlos")
                if model.user?.emailVerified == false {
                    Button("Bestätigungs-E-Mail erneut senden") {
                        Task { await model.resendVerification() }
                    }
                    .buttonStyle(SeniorSecondaryButtonStyle())
                }
            }

            Section {
                VStack(alignment: .leading, spacing: 16) {
                    HStack(alignment: .top, spacing: 14) {
                        Image(systemName: "person.3.fill")
                            .font(.title2)
                            .foregroundStyle(.white)
                            .frame(width: 48, height: 48)
                            .background(AppTheme.navy, in: RoundedRectangle(cornerRadius: 14))

                        VStack(alignment: .leading, spacing: 4) {
                            Text("ZweiCheck Premium Familie")
                                .font(.title3.bold())
                                .foregroundStyle(AppTheme.navy)
                            Text("Mehr automatische Sicherheit für die Familie")
                                .foregroundStyle(.secondary)
                        }
                    }

                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(model.premium.annualPriceText)
                            .font(.system(size: 34, weight: .bold, design: .rounded))
                            .foregroundStyle(AppTheme.navy)
                        Text("/ Jahr")
                            .font(.headline)
                            .foregroundStyle(.secondary)
                    }

                    Text("entspricht nur \(PremiumStore.familyMonthlyEquivalent) pro Monat")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(AppTheme.teal)

                    VStack(alignment: .leading, spacing: 9) {
                        premiumFeature("Bis zu 3 Bilder pro Prüfung statt 1", symbol: "photo.on.rectangle.angled")
                        premiumFeature("Automatische Erinnerung nach 5–120 Minuten", symbol: "bell.badge")
                        premiumFeature("Automatisch eine zweite Vertrauensperson fragen", symbol: "person.2.badge.gearshape")
                        premiumFeature("Für Apple Familienfreigabe vorbereitet", symbol: "person.3")
                    }

                    if model.premium.isPremiumFamily {
                        Label("Premium Familie aktiv", systemImage: "checkmark.seal.fill")
                            .font(.headline)
                            .foregroundStyle(AppTheme.green)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(14)
                            .background(AppTheme.green.opacity(0.10), in: RoundedRectangle(cornerRadius: 14))
                    } else {
                        Button {
                            Task {
                                await model.premium.purchaseFamilyYearly()
                                forwardPremiumMessage()
                            }
                        } label: {
                            Label("Premium Familie für \(model.premium.annualPriceText) / Jahr", systemImage: "sparkles")
                        }
                        .buttonStyle(SeniorPrimaryButtonStyle())
                        .disabled(model.premium.isLoading)
                    }

                    Button("Käufe wiederherstellen") {
                        Task {
                            await model.premium.restorePurchases()
                            forwardPremiumMessage()
                        }
                    }
                    .buttonStyle(SeniorSecondaryButtonStyle())
                    .disabled(model.premium.isLoading)
                }
                .padding(.vertical, 6)
            } header: {
                Text("Premium")
            } footer: {
                Text("Kostenlos bleiben Prüfanfragen, Antworten, Push-Benachrichtigungen und ein Bild pro Prüfung. Premium ergänzt die erweiterten Familien- und Automatikfunktionen.")
            }

            Section("So funktioniert ZweiCheck") {
                Button {
                    onboardingCompleted = false
                } label: {
                    Label("Einführung noch einmal ansehen", systemImage: "graduationcap.fill")
                }
                .buttonStyle(SeniorSecondaryButtonStyle())
            }

            Section("Benachrichtigungen") {
                Text("ZweiCheck informiert dich bei Prüfanfragen, Antworten und Erinnerungen.")
                    .foregroundStyle(.secondary)
                if model.nativePushRegistered {
                    Label("Push-Benachrichtigungen sind eingerichtet", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(AppTheme.green)
                } else {
                    Button("Push-Benachrichtigungen aktivieren") {
                        Task { await model.enableNativePush() }
                    }
                    .buttonStyle(SeniorPrimaryButtonStyle())
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
                .buttonStyle(SeniorSecondaryButtonStyle())
                .disabled(exporting || model.isBusy)
            }

            Section("Datenschutz und Hilfe") {
                Link("Datenschutz", destination: URL(string: "https://zweicheck.kamilunavo.com/privacy")!)
                Link("Datenschutz-Einstellungen", destination: URL(string: "https://zweicheck.kamilunavo.com/privacy-choices")!)
                Link("Hilfe & Support", destination: URL(string: "https://zweicheck.kamilunavo.com/support")!)
            }

            Section {
                Button("Abmelden") { Task { await model.logout() } }
                    .buttonStyle(ZweiCheckActionButtonStyle(tone: .navy))
            }

            Section("Konto löschen") {
                Text("Das kann nicht rückgängig gemacht werden. Deine Verbindungen, beteiligten Prüfungen und hochgeladenen Dateien werden entfernt.")
                    .foregroundStyle(.secondary)
                SecureField("Aktuelles Passwort", text: $password)
                Toggle("Ich habe verstanden, dass mein Konto dauerhaft gelöscht wird.", isOn: $understandsDeletion)
                Button("Konto dauerhaft löschen", role: .destructive) { confirmDelete = true }
                    .buttonStyle(ZweiCheckActionButtonStyle(tone: .danger))
                    .disabled(password.isEmpty || !understandsDeletion || model.isBusy)
            }

            Section {
                Text(versionText)
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

    private func premiumFeature(_ text: String, symbol: String) -> some View {
        Label(text, systemImage: symbol)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(AppTheme.navy)
    }

    private var versionText: String {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "–"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "–"
        return "ZweiCheck \(version) · Build \(build)"
    }

    @MainActor
    private func forwardPremiumMessage() {
        if let premiumMessage = model.premium.message {
            model.message = premiumMessage
            model.premium.message = nil
        }
    }
}
